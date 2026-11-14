import { api } from './api';
import type { AttendanceStatus } from './types';

export interface AttendanceOutboxEntry {
  studentId: string;
  status: AttendanceStatus;
  note?: string;
  baseVersion?: number;
}

export interface AttendanceOutboxOp {
  clientOpId: string;
  kind: 'attendance.save';
  sectionId: string;
  date: string;
  entries: AttendanceOutboxEntry[];
  createdAt: string;
}

export interface OutboxConflict extends AttendanceOutboxOp {
  message: string;
  studentId?: string;
  current?: { status?: AttendanceStatus; version?: number } | null;
}

export interface FlushResult {
  applied: number;
  conflicts: number;
  remaining: number;
  error?: string;
}

export interface SyncTelemetry {
  attempts: number;
  applied: number;
  conflicts: number;
  failures: number;
  lastSyncAt: string | null;
  lastError: string | null;
  queueDepth: number;
}

const DB_NAME = 'lms-outbox';
const DB_VERSION = 1;
const OPERATIONS = 'operations';
const CONFLICTS = 'conflicts';
const BATCH_SIZE = 20;
const TELEMETRY_KEY = 'lms.sync.telemetry';

let flushInFlight: Promise<FlushResult> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OPERATIONS)) {
        db.createObjectStore(OPERATIONS, { keyPath: 'clientOpId' });
      }
      if (!db.objectStoreNames.contains(CONFLICTS)) {
        db.createObjectStore(CONFLICTS, { keyPath: 'clientOpId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('could not open offline queue'));
  });
}

function asPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('offline queue failed'));
  });
}

async function readAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  try {
    return await asPromise(db.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>);
  } finally {
    db.close();
  }
}

async function put<T>(store: string, value: T): Promise<void> {
  const db = await openDb();
  try {
    await asPromise(db.transaction(store, 'readwrite').objectStore(store).put(value));
  } finally {
    db.close();
  }
}

async function remove(store: string, key: string): Promise<void> {
  const db = await openDb();
  try {
    await asPromise(db.transaction(store, 'readwrite').objectStore(store).delete(key));
  } finally {
    db.close();
  }
}

export function listPendingOps(): Promise<AttendanceOutboxOp[]> {
  return readAll<AttendanceOutboxOp>(OPERATIONS);
}

export function listConflicts(): Promise<OutboxConflict[]> {
  return readAll<OutboxConflict>(CONFLICTS);
}

export function discardConflict(clientOpId: string): Promise<void> {
  return remove(CONFLICTS, clientOpId);
}

export function enqueueAttendance(
  op: Omit<AttendanceOutboxOp, 'clientOpId' | 'kind' | 'createdAt'> & {
    clientOpId?: string;
  },
): Promise<AttendanceOutboxOp> {
  const queued: AttendanceOutboxOp = {
    clientOpId: op.clientOpId ?? crypto.randomUUID(),
    kind: 'attendance.save',
    sectionId: op.sectionId,
    date: op.date,
    entries: op.entries,
    createdAt: new Date().toISOString(),
  };
  return put(OPERATIONS, queued).then(() => queued);
}

function toWire(op: AttendanceOutboxOp) {
  return {
    clientOpId: op.clientOpId,
    kind: op.kind,
    sectionId: op.sectionId,
    date: op.date,
    entries: op.entries,
  };
}

/**
 * Pushes queued saves in order. Network failures stop the run and keep the
 * queue; logical rejections move the operation to the conflict store.
 */
export function flushOutbox(token: string): Promise<FlushResult> {
  flushInFlight ??= runFlush(token)
    .then((result) => {
      recordTelemetry(result);
      return result;
    })
    .finally(() => {
      flushInFlight = null;
    });
  return flushInFlight;
}

export function readSyncTelemetry(): SyncTelemetry {
  const empty: SyncTelemetry = {
    attempts: 0,
    applied: 0,
    conflicts: 0,
    failures: 0,
    lastSyncAt: null,
    lastError: null,
    queueDepth: 0,
  };
  try {
    const raw = window.localStorage.getItem(TELEMETRY_KEY);
    return raw ? { ...empty, ...(JSON.parse(raw) as Partial<SyncTelemetry>) } : empty;
  } catch {
    return empty;
  }
}

function recordTelemetry(result: FlushResult) {
  const current = readSyncTelemetry();
  const next: SyncTelemetry = {
    attempts: current.attempts + 1,
    applied: current.applied + result.applied,
    conflicts: current.conflicts + result.conflicts,
    failures: current.failures + (result.error ? 1 : 0),
    lastSyncAt: new Date().toISOString(),
    lastError: result.error ?? null,
    queueDepth: result.remaining,
  };
  try {
    window.localStorage.setItem(TELEMETRY_KEY, JSON.stringify(next));
  } catch {
    // telemetry is best-effort; the queue itself lives in IndexedDB
  }
}

async function runFlush(token: string): Promise<FlushResult> {
  let applied = 0;
  let conflicts = 0;

  for (;;) {
    const pending = (await listPendingOps()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    if (pending.length === 0) {
      return { applied, conflicts, remaining: 0 };
    }

    const batch = pending.slice(0, BATCH_SIZE);
    let response;
    try {
      response = await api.syncPush(token, {
        operations: batch.map(toWire),
      });
    } catch (error: unknown) {
      return {
        applied,
        conflicts,
        remaining: pending.length,
        error: error instanceof Error ? error.message : 'sync failed',
      };
    }

    for (const result of response.results) {
      const op = batch.find((candidate) => candidate.clientOpId === result.clientOpId);
      if (!op) continue;

      if (result.status === 'applied') {
        await remove(OPERATIONS, op.clientOpId);
        applied += 1;
        continue;
      }

      if (result.status === 'duplicate') {
        await remove(OPERATIONS, op.clientOpId);
        if (result.storedStatus === 'applied') {
          applied += 1;
        } else {
          await put(CONFLICTS, {
            ...op,
            message: result.conflict?.message ?? 'the server kept a newer version',
            studentId: result.conflict?.studentId,
            current: result.conflict?.current ?? null,
          });
          conflicts += 1;
        }
        continue;
      }

      if (result.status === 'conflict') {
        await put(CONFLICTS, {
          ...op,
          message: result.conflict.message,
          studentId: result.conflict.studentId,
          current: result.conflict.current ?? null,
        });
        await remove(OPERATIONS, op.clientOpId);
        conflicts += 1;
        continue;
      }

      await put(CONFLICTS, { ...op, message: result.message });
      await remove(OPERATIONS, op.clientOpId);
      conflicts += 1;
    }
  }
}
