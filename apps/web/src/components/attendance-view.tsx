'use client';

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import {
  discardConflict,
  enqueueAttendance,
  flushOutbox,
  listConflicts,
  listPendingOps,
  readSyncTelemetry,
  type AttendanceOutboxEntry,
  type AttendanceOutboxOp,
  type OutboxConflict,
  type SyncTelemetry,
} from '@/lib/outbox';
import type {
  AttendanceSheet,
  AttendanceStatus,
  RosterStudent,
  Section,
  SectionRoster,
} from '@/lib/types';

const STATUS_OPTIONS: Array<{
  value: AttendanceStatus;
  label: string;
  color: 'success' | 'error' | 'warning' | 'info';
}> = [
  { value: 'present', label: 'Present', color: 'success' },
  { value: 'absent', label: 'Absent', color: 'error' },
  { value: 'late', label: 'Late', color: 'warning' },
  { value: 'excused', label: 'Excused', color: 'info' },
];

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
};

const todayInManila = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong';

const cacheKey = (sectionId: string, date: string) => `lms.attendance.${sectionId}.${date}`;

interface CachedSheet {
  roster: SectionRoster;
  sheet: AttendanceSheet;
  savedAt: string;
}

function readCachedSheet(sectionId: string, date: string): CachedSheet | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(sectionId, date));
    return raw ? (JSON.parse(raw) as CachedSheet) : null;
  } catch {
    return null;
  }
}

function writeCachedSheet(sectionId: string, date: string, value: CachedSheet) {
  try {
    window.localStorage.setItem(cacheKey(sectionId, date), JSON.stringify(value));
  } catch {
    // storage full or disabled; offline reload simply will not have a cache
  }
}

export function AttendanceView({ token, sections }: { token: string; sections: Section[] }) {
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? '');
  const [date, setDate] = useState(todayInManila);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingOps, setPendingOps] = useState<AttendanceOutboxOp[]>([]);
  const [conflicts, setConflicts] = useState<OutboxConflict[]>([]);
  const [telemetry, setTelemetry] = useState<SyncTelemetry>(() => readSyncTelemetry());
  const [conflictOpen, setConflictOpen] = useState(false);

  const refreshQueues = useCallback(async () => {
    const [ops, issues] = await Promise.all([listPendingOps(), listConflicts()]);
    setPendingOps(ops);
    setConflicts(issues);
    setTelemetry(readSyncTelemetry());
  }, []);

  const applySheet = useCallback(
    (roster: SectionRoster, sheet: AttendanceSheet, queued: AttendanceOutboxOp[]) => {
      const nextStatuses: Record<string, AttendanceStatus> = {};
      const nextVersions: Record<string, number> = {};
      const nextPending = new Set<string>();

      for (const student of roster.students) nextStatuses[student.id] = 'present';
      for (const record of sheet.records) {
        nextStatuses[record.studentId] = record.status;
        nextVersions[record.studentId] = record.version;
      }

      // Queued edits win over the last server state until they sync.
      for (const op of queued) {
        for (const entry of op.entries) {
          nextStatuses[entry.studentId] = entry.status;
          nextPending.add(entry.studentId);
        }
      }

      setStudents(roster.students);
      setStatuses(nextStatuses);
      setVersions(nextVersions);
      setPendingIds(nextPending);
      setDirty(sheet.records.length + queued.length < roster.students.length);
    },
    [],
  );

  const load = useCallback(async () => {
    if (!sectionId || !date) return;
    setLoading(true);
    setError(null);
    setStale(false);

    const queued = (await listPendingOps()).filter(
      (op) => op.sectionId === sectionId && op.date === date,
    );

    try {
      const [roster, sheet] = await Promise.all([
        api.roster(token, sectionId),
        api.attendance(token, sectionId, date),
      ]);
      applySheet(roster, sheet, queued);
      writeCachedSheet(sectionId, date, {
        roster,
        sheet,
        savedAt: new Date().toISOString(),
      });
      setBanner(null);
    } catch (err: unknown) {
      const cached = readCachedSheet(sectionId, date);
      if (cached) {
        applySheet(cached.roster, cached.sheet, queued);
        setBanner(
          `Showing the roster cached at ${new Date(cached.savedAt).toLocaleString()}. Changes will sync when you are back online.`,
        );
      } else {
        setError(messageOf(err));
      }
    } finally {
      setLoading(false);
    }
  }, [token, sectionId, date, applySheet]);

  useEffect(() => {
    if (sections.length === 0) return;
    if (!sections.some((section) => section.id === sectionId)) {
      setSectionId(sections[0].id);
    }
  }, [sections, sectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void refreshQueues();
  }, [refreshQueues]);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) {
      setBanner('Still offline. Queued sheets stay on this device.');
      return;
    }

    setSyncing(true);
    setBanner(null);
    try {
      const result = await flushOutbox(token);
      await refreshQueues();
      if (result.error) {
        setBanner(`Sync paused: ${result.error}. ${result.remaining} sheet(s) still queued.`);
      } else if (result.conflicts > 0) {
        setConflictOpen(true);
      } else if (result.applied > 0) {
        setToast(`${result.applied} queued sheet(s) synced`);
      }
      if (result.applied > 0) await load();
    } finally {
      setSyncing(false);
    }
  }, [token, refreshQueues, load]);

  useEffect(() => {
    const goOnline = () => {
      setOffline(false);
      void syncNow();
    };
    const goOffline = () => setOffline(true);

    setOffline(!navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [syncNow]);

  useEffect(() => {
    // Flush anything left from a previous session once the app opens online.
    void (async () => {
      const queued = await listPendingOps();
      if (queued.length > 0 && navigator.onLine) await syncNow();
    })();
  }, [syncNow]);

  const counts = useMemo(() => {
    const result: Record<AttendanceStatus, number> = {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    };
    for (const student of students) {
      result[statuses[student.id] ?? 'present'] += 1;
    }
    return result;
  }, [students, statuses]);

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setStatuses((current) => ({ ...current, [studentId]: status }));
    setDirty(true);
  };

  const markAllPresent = () => {
    const next: Record<string, AttendanceStatus> = {};
    for (const student of students) next[student.id] = 'present';
    setStatuses(next);
    setDirty(true);
  };

  const save = async () => {
    if (!sectionId || students.length === 0) return;
    setSaving(true);
    setError(null);

    const entries: AttendanceOutboxEntry[] = students.map((student) => ({
      studentId: student.id,
      status: statuses[student.id] ?? 'present',
      ...(versions[student.id] ? { baseVersion: versions[student.id] } : {}),
    }));

    const queue = async () => {
      await enqueueAttendance({ sectionId, date, entries });
      await refreshQueues();
      setPendingIds(new Set(students.map((student) => student.id)));
      setDirty(false);
      setToast('Saved on this device. It will sync when you are back online.');
    };

    try {
      if (!navigator.onLine) {
        await queue();
        return;
      }

      try {
        await api.saveAttendance(token, sectionId, { date, entries });
        await load();
        setToast(`Attendance saved for ${students.length} learners`);
      } catch (err: unknown) {
        if (err instanceof TypeError) {
          await queue();
          return;
        }
        if (err instanceof ApiError && err.status === 409) {
          setStale(true);
          return;
        }
        throw err;
      }
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const reloadConflict = async (conflict: OutboxConflict) => {
    await discardConflict(conflict.clientOpId);
    await refreshQueues();
    setConflictOpen(false);
    if (conflict.sectionId === sectionId && conflict.date === date) {
      await load();
      return;
    }
    setSectionId(conflict.sectionId);
    setDate(conflict.date);
  };

  const discard = async (conflict: OutboxConflict) => {
    await discardConflict(conflict.clientOpId);
    await refreshQueues();
  };

  return (
    <>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ alignItems: { md: 'center' } }}
        >
          <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel id="attendance-section-label">Section</InputLabel>
            <Select
              labelId="attendance-section-label"
              label="Section"
              value={sectionId}
              onChange={(event: SelectChangeEvent) => setSectionId(event.target.value)}
            >
              {sections.map((section) => (
                <MenuItem key={section.id} value={section.id}>
                  {section.name} · Grade {section.gradeLevel}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            type="date"
            label="Date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: { max: todayInManila() },
            }}
            sx={{ width: 190 }}
          />

          <Button size="small" onClick={markAllPresent} disabled={students.length === 0}>
            Mark all present
          </Button>

          <Box sx={{ flex: 1 }} />

          {offline && <Chip size="small" label="Offline" />}
          {pendingOps.length > 0 && (
            <Chip size="small" color="warning" label={`${pendingOps.length} pending`} />
          )}
          {pendingOps.length > 0 && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => void syncNow()}
              disabled={syncing || offline}
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </Button>
          )}
          {conflicts.length > 0 && (
            <Button
              size="small"
              color="warning"
              variant="outlined"
              onClick={() => setConflictOpen(true)}
            >
              Resolve conflicts ({conflicts.length})
            </Button>
          )}

          <Button variant="contained" onClick={save} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save attendance'}
          </Button>
        </Stack>
      </Paper>

      {banner && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setBanner(null)}>
          {banner}
        </Alert>
      )}

      {stale && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => void load()}>
              Reload sheet
            </Button>
          }
          onClose={() => setStale(false)}
        >
          Attendance changed on the server since this sheet was loaded. Reload to
          see the latest versions, then save again.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && students.length === 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {students.length > 0 && (
        <>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Learner</TableCell>
                  <TableCell>LRN</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Saved</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.id} hover>
                    <TableCell>
                      {student.lastName}, {student.firstName}
                    </TableCell>
                    <TableCell>{student.lrn ?? '—'}</TableCell>
                    <TableCell>
                      <ToggleButtonGroup
                        exclusive
                        size="small"
                        value={statuses[student.id] ?? 'present'}
                        onChange={(_event, value: AttendanceStatus | null) => {
                          if (value) setStatus(student.id, value);
                        }}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <ToggleButton
                            key={option.value}
                            value={option.value}
                            color={option.color}
                            sx={{ px: 1.5, py: 0.25, fontSize: 12, textTransform: 'none' }}
                          >
                            {option.label}
                          </ToggleButton>
                        ))}
                      </ToggleButtonGroup>
                    </TableCell>
                    <TableCell align="right">
                      {pendingIds.has(student.id) ? (
                        <Chip size="small" color="warning" label="pending" />
                      ) : versions[student.id] ? (
                        <Chip size="small" label={`v${versions[student.id]}`} variant="outlined" />
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          not recorded
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack direction="row" spacing={2} sx={{ mt: 1.5 }}>
            {STATUS_OPTIONS.map((option) => (
              <Typography key={option.value} variant="caption" color="text.secondary">
                {option.label}: {counts[option.value]}
              </Typography>
            ))}
            <Box sx={{ flex: 1 }} />
            {telemetry.lastSyncAt && (
              <Typography variant="caption" color="text.secondary">
                Last sync {new Date(telemetry.lastSyncAt).toLocaleTimeString()} ·{' '}
                {telemetry.applied} applied · {telemetry.conflicts} conflicts ·{' '}
                {telemetry.failures} failed
              </Typography>
            )}
          </Stack>
        </>
      )}

      <ConflictDialog
        open={conflictOpen}
        conflicts={conflicts}
        sections={sections}
        onClose={() => setConflictOpen(false)}
        onReload={(conflict) => void reloadConflict(conflict)}
        onDiscard={(conflict) => void discard(conflict)}
      />

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        message={toast ?? ''}
      />
    </>
  );
}

function ConflictDialog({
  open,
  conflicts,
  sections,
  onClose,
  onReload,
  onDiscard,
}: {
  open: boolean;
  conflicts: OutboxConflict[];
  sections: Section[];
  onClose: () => void;
  onReload: (conflict: OutboxConflict) => void;
  onDiscard: (conflict: OutboxConflict) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Attendance conflicts</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          These queued sheets were rejected because the server has a newer version.
          Reload the sheet to review the latest state, or discard the queued change.
        </Typography>
        <List dense>
          {conflicts.map((conflict) => {
            const sectionName =
              sections.find((section) => section.id === conflict.sectionId)?.name ??
              'Section';
            const current = conflict.current?.status
              ? ` Server now: ${STATUS_LABEL[conflict.current.status]}.`
              : '';

            return (
              <Box key={conflict.clientOpId}>
                <ListItem
                  secondaryAction={
                    <Stack direction="row" spacing={1}>
                      <Button size="small" onClick={() => onReload(conflict)}>
                        Reload
                      </Button>
                      <Button size="small" color="inherit" onClick={() => onDiscard(conflict)}>
                        Discard
                      </Button>
                    </Stack>
                  }
                >
                  <ListItemText
                    primary={`${sectionName} · ${conflict.date}`}
                    secondary={`${conflict.message}${current}`}
                  />
                </ListItem>
                <Divider component="li" />
              </Box>
            );
          })}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
