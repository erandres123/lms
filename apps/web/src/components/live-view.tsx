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
  FormControl,
  InputLabel,
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
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type {
  JoinMeetingResult,
  Meeting,
  MeetingList,
  MeetingParticipant,
  Me,
  Section,
} from '@/lib/types';

const MeetingRoom = dynamic(() => import('@/components/meeting-room'), {
  ssr: false,
  loading: () => (
    <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
      <CircularProgress />
    </Box>
  ),
});

interface LiveViewProps {
  token: string;
  me: Me;
  sections: Section[];
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong';

const statusColor: Record<Meeting['status'], 'default' | 'info' | 'success' | 'warning'> = {
  scheduled: 'info',
  live: 'success',
  ended: 'default',
  cancelled: 'warning',
};

const formatWhen = (value: string) =>
  new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );

const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const defaultSlot = () => {
  const date = new Date(Date.now() + 30 * 60_000);
  date.setSeconds(0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
};

export function LiveView({ token, me, sections }: LiveViewProps) {
  const [sectionId, setSectionId] = useState('');
  const [data, setData] = useState<MeetingList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [scheduledFor, setScheduledFor] = useState(defaultSlot);
  const [durationMinutes, setDurationMinutes] = useState(60);

  const [joined, setJoined] = useState<JoinMeetingResult | null>(null);
  const [participants, setParticipants] = useState<{
    meeting: Meeting;
    rows: MeetingParticipant[];
  } | null>(null);

  const canWrite = me.role === 'school_admin' || me.role === 'teacher';

  useEffect(() => {
    setSectionId((current) => current || sections[0]?.id || '');
  }, [sections]);

  const load = useCallback(async () => {
    if (!sectionId) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.meetings(token, sectionId));
    } catch (err: unknown) {
      setData(null);
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, [token, sectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createMeeting = async () => {
    if (!sectionId) return;
    if (!title.trim()) {
      setError('Give the class a title');
      return;
    }
    setBusyId('create');
    setError(null);
    try {
      await api.createMeeting(token, sectionId, {
        title: title.trim(),
        scheduledFor: new Date(scheduledFor).toISOString(),
        durationMinutes,
      });
      setScheduleOpen(false);
      setTitle('');
      setToast('Class scheduled');
      await load();
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setBusyId(null);
    }
  };

  const startAndJoin = async (meeting: Meeting) => {
    setBusyId(meeting.id);
    setError(null);
    try {
      await api.startMeeting(token, meeting.id);
      const result = await api.joinMeeting(token, meeting.id);
      setJoined(result);
      await load();
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setBusyId(null);
    }
  };

  const join = async (meeting: Meeting) => {
    setBusyId(meeting.id);
    setError(null);
    try {
      setJoined(await api.joinMeeting(token, meeting.id));
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setBusyId(null);
    }
  };

  const end = async (meeting: Meeting) => {
    setBusyId(meeting.id);
    setError(null);
    try {
      await api.endMeeting(token, meeting.id);
      setToast('Class ended');
      await load();
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setBusyId(null);
    }
  };

  const openParticipants = async (meeting: Meeting) => {
    setBusyId(meeting.id);
    setError(null);
    try {
      const rows = await api.meetingParticipants(token, meeting.id);
      setParticipants({ meeting, rows });
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setBusyId(null);
    }
  };

  const leaveRoom = () => {
    setJoined(null);
  };

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {data && !data.providerConfigured && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Live classes are not configured yet. Add a LiveKit project URL, API key, and secret to
          the API environment to open rooms. Scheduling and rosters work without it.
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ alignItems: { md: 'center' } }}
        >
          <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel id="live-section-label">Section</InputLabel>
            <Select
              labelId="live-section-label"
              label="Section"
              value={sectionId}
              onChange={(event: SelectChangeEvent) => setSectionId(event.target.value)}
            >
              {sections.map((section) => (
                <MenuItem key={section.id} value={section.id}>
                  {section.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ flex: 1 }} />
          {canWrite && (
            <Button variant="contained" onClick={() => setScheduleOpen(true)}>
              Schedule class
            </Button>
          )}
        </Stack>
      </Paper>

      {loading && !data ? (
        <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Class</TableCell>
                <TableCell>When</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Duration</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(data?.meetings ?? []).map((meeting) => {
                const live = meeting.status === 'live';
                const busy = busyId === meeting.id;
                return (
                  <TableRow key={meeting.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {meeting.title}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatWhen(meeting.scheduledFor)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={statusColor[meeting.status]}
                        label={meeting.status}
                      />
                    </TableCell>
                    <TableCell align="right">{meeting.durationMinutes} min</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                        {canWrite && meeting.status === 'scheduled' && (
                          <Button
                            size="small"
                            variant="contained"
                            disabled={busy || !meeting.providerConfigured}
                            onClick={() => void startAndJoin(meeting)}
                          >
                            Start class
                          </Button>
                        )}
                        {live && (
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            disabled={busy || !meeting.providerConfigured}
                            onClick={() => void join(meeting)}
                          >
                            Join
                          </Button>
                        )}
                        {canWrite && live && (
                          <>
                            <Button
                              size="small"
                              disabled={busy}
                              onClick={() => void openParticipants(meeting)}
                            >
                              Attendance
                            </Button>
                            <Button
                              size="small"
                              color="warning"
                              disabled={busy}
                              onClick={() => void end(meeting)}
                            >
                              End
                            </Button>
                          </>
                        )}
                        {canWrite && meeting.status === 'ended' && (
                          <Button
                            size="small"
                            disabled={busy}
                            onClick={() => void openParticipants(meeting)}
                          >
                            Attendance
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
              {data && data.meetings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', py: 3 }}>
                      No classes scheduled for this section yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Schedule a live class</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Math 7 - Fractions review"
              fullWidth
            />
            <TextField
              label="Starts"
              type="datetime-local"
              value={scheduledFor}
              onChange={(event) => setScheduledFor(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <TextField
              label="Duration (minutes)"
              type="number"
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(Number(event.target.value))}
              slotProps={{ htmlInput: { min: 15, max: 240, step: 15 } }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScheduleOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void createMeeting()}
            disabled={busyId === 'create'}
          >
            Schedule
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={joined !== null} onClose={leaveRoom} fullScreen>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ flex: 1 }}>{joined?.meeting.title ?? 'Live class'}</Box>
          <Button variant="outlined" onClick={leaveRoom}>
            Leave
          </Button>
        </DialogTitle>
        <Box sx={{ height: 'calc(100vh - 64px)', bgcolor: 'black' }}>
          {joined && (
            <MeetingRoom
              serverUrl={joined.url}
              token={joined.token}
              onLeave={leaveRoom}
            />
          )}
        </Box>
      </Dialog>

      <Dialog
        open={participants !== null}
        onClose={() => setParticipants(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Live attendance · {participants?.meeting.title}</DialogTitle>
        <DialogContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Participant</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Joined</TableCell>
                <TableCell align="right">Time in class</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(participants?.rows ?? []).map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.studentName ?? row.displayName ?? row.identity.slice(0, 8)}
                  </TableCell>
                  <TableCell>{row.role}</TableCell>
                  <TableCell>{formatWhen(row.firstJoinedAt)}</TableCell>
                  <TableCell align="right">{formatDuration(row.totalSeconds)}</TableCell>
                </TableRow>
              ))}
              {participants && participants.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', py: 2 }}>
                      No join events yet. Webhook data appears after participants join.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setParticipants(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast !== null}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        message={toast}
      />
    </Box>
  );
}
