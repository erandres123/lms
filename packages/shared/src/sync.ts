import { z } from 'zod';
import { attendanceEntrySchema, isoDateSchema } from './academic';

export const syncPullQuerySchema = z.object({
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>;

export const syncAttendanceOpSchema = z.object({
  clientOpId: z.uuid(),
  kind: z.literal('attendance.save'),
  sectionId: z.uuid(),
  date: isoDateSchema,
  entries: z.array(attendanceEntrySchema).min(1).max(200),
});
export type SyncAttendanceOp = z.infer<typeof syncAttendanceOpSchema>;

export const syncPushSchema = z.object({
  operations: z.array(syncAttendanceOpSchema).min(1).max(50),
});
export type SyncPushInput = z.infer<typeof syncPushSchema>;

export interface SyncConflict {
  message: string;
  studentId?: string;
  current?: Record<string, unknown> | null;
}

export type SyncPushOutcome =
  | { clientOpId: string; status: 'applied' }
  | {
      clientOpId: string;
      status: 'duplicate';
      storedStatus: 'applied' | 'conflict';
      conflict?: SyncConflict;
    }
  | { clientOpId: string; status: 'conflict'; conflict: SyncConflict }
  | { clientOpId: string; status: 'rejected'; message: string };

export interface SyncPushResult {
  results: SyncPushOutcome[];
}

export interface SyncStats {
  applied: number;
  conflicts: number;
  total: number;
}
