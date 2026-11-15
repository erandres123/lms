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
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import type { Session } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { AttendanceView } from '@/components/attendance-view';
import { AuditView } from '@/components/audit-view';
import { CompetencyView } from '@/components/competency-view';
import { LiveView } from '@/components/live-view';
import { LoginScreen } from '@/components/login-screen';
import { NotificationsView } from '@/components/notifications-view';
import { PrivacyView } from '@/components/privacy-view';
import { RetentionView } from '@/components/retention-view';
import { RosterView } from '@/components/roster-view';
import { api } from '@/lib/api';
import { syncWebPush } from '@/lib/push';
import { getSupabase } from '@/lib/supabase';
import type { Gradebook, Me, Period, Section, StudentRow } from '@/lib/types';

const TOKEN_KEY = 'lms.token';
const roleLabel: Record<Me['role'], string> = {
  school_admin: 'Admin',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent',
};

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong';

const formatNumber = (value: number | null) => (value === null ? '—' : value.toFixed(2));

export function GradebookApp() {
  const [token, setToken] = useState<string | null>(null);
  const [source, setSource] = useState<'supabase' | 'dev' | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState<
    | 'gradebook'
    | 'attendance'
    | 'roster'
    | 'competencies'
    | 'live'
    | 'inbox'
    | 'audit'
    | 'privacy'
    | 'retention'
  >('gradebook');
  const [me, setMe] = useState<Me | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [sectionId, setSectionId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [data, setData] = useState<Gradebook | null>(null);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [overrideStudent, setOverrideStudent] = useState<StudentRow | null>(null);
  const [overrideGrade, setOverrideGrade] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  useEffect(() => {
    const savedDevToken = window.localStorage.getItem(TOKEN_KEY);
    if (savedDevToken) {
      setToken(savedDevToken);
      setSource('dev');
    }

    const supabase = getSupabase();
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    let active = true;
    const applySession = (session: Session | null) => {
      if (!active) return;
      if (session) {
        setToken(session.access_token);
        setSource('supabase');
        return;
      }
      if (window.localStorage.getItem(TOKEN_KEY)) return;
      setToken(null);
      setSource(null);
    };

    supabase.auth.getSession().then(({ data }) => {
      applySession(data.session);
      if (active) setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    setLoading(true);
    setError(null);

    Promise.all([api.me(token), api.sections(token), api.periods(token)])
      .then(([profile, sectionList, periodList]) => {
        if (cancelled) return;
        setMe(profile);
        setSections(sectionList);
        setPeriods(periodList);
        setSectionId((current) => current || sectionList[0]?.id || '');
        setPeriodId((current) => current || periodList[0]?.id || '');
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(messageOf(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'inbox') setView('inbox');
  }, []);

  useEffect(() => {
    if (!token) return;
    // Register silently when the browser already allows notifications.
    void syncWebPush(token).catch(() => undefined);
  }, [token]);

  useEffect(() => {
    if (!token || !sectionId || !periodId) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setEdits({});

    api
      .gradebook(token, sectionId, periodId)
      .then((gradebook) => {
        if (!cancelled) setData(gradebook);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setData(null);
          setError(messageOf(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, sectionId, periodId]);

  const dirtyByItem = useMemo(() => {
    const result = new Map<
      string,
      Array<{ studentId: string; score: number; baseVersion?: number }>
    >();
    if (!data) return result;

    for (const [itemId, byStudent] of Object.entries(edits)) {
      const entries: Array<{ studentId: string; score: number; baseVersion?: number }> = [];
      for (const [studentId, raw] of Object.entries(byStudent)) {
        if (raw.trim() === '') continue;
        const score = Number(raw);
        if (!Number.isFinite(score)) continue;
        const existing = data.students.find((row) => row.studentId === studentId)?.scores[itemId];
        entries.push({
          studentId,
          score,
          ...(existing ? { baseVersion: existing.version } : {}),
        });
      }
      if (entries.length > 0) result.set(itemId, entries);
    }

    return result;
  }, [edits, data]);

  const dirtyCount = useMemo(
    () => [...dirtyByItem.values()].reduce((sum, entries) => sum + entries.length, 0),
    [dirtyByItem],
  );

  const canWrite = me?.role === 'school_admin' || me?.role === 'teacher';
  const canAdmin = me?.role === 'school_admin';

  const setEdit = (itemId: string, studentId: string, value: string) => {
    setEdits((current) => ({
      ...current,
      [itemId]: { ...(current[itemId] ?? {}), [studentId]: value },
    }));
  };

  const reload = async () => {
    if (!token || !sectionId || !periodId) return;
    const gradebook = await api.gradebook(token, sectionId, periodId);
    setData(gradebook);
  };

  const handleSave = async () => {
    if (!token || !data || dirtyByItem.size === 0) return;
    setSaving(true);
    setError(null);

    try {
      for (const [itemId, entries] of dirtyByItem) {
        await api.saveGrades(token, data.section.id, { itemId, entries });
      }
      setEdits({});
      await reload();
      setToast(`Saved ${dirtyCount} score${dirtyCount === 1 ? '' : 's'}`);
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSf9 = async () => {
    if (!token || !data) return;
    setError(null);
    try {
      await api.downloadSf9(token, data.section.id, data.period.id);
      setToast('SF9 draft downloaded');
    } catch (err: unknown) {
      setError(messageOf(err));
    }
  };

  const openOverride = (student: StudentRow) => {
    setOverrideStudent(student);
    setOverrideGrade(student.override ? String(student.override.grade) : '');
    setOverrideReason(student.override?.reason ?? '');
  };

  const submitOverride = async () => {
    if (!token || !data || !overrideStudent) return;
    setError(null);

    try {
      await api.setOverride(token, data.section.id, {
        periodId: data.period.id,
        studentId: overrideStudent.studentId,
        grade: Number(overrideGrade),
        reason: overrideReason,
        ...(overrideStudent.override ? { baseVersion: overrideStudent.override.version } : {}),
      });
      setOverrideStudent(null);
      await reload();
      setToast('Override saved');
    } catch (err: unknown) {
      setError(messageOf(err));
    }
  };

  const handleDevToken = (value: string) => {
    window.localStorage.setItem(TOKEN_KEY, value);
    setSource('dev');
    setToken(value);
  };

  const signOut = async () => {
    window.localStorage.removeItem(TOKEN_KEY);
    if (source === 'supabase') {
      await getSupabase()?.auth.signOut();
    }
    setSource(null);
    setToken(null);
    setMe(null);
    setSections([]);
    setPeriods([]);
    setData(null);
    setSectionId('');
    setPeriodId('');
    setEdits({});
    setError(null);
    setView('gradebook');
  };

  if (!authReady) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!token) {
    return <LoginScreen onDevToken={handleDevToken} />;
  }

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Box
        sx={{
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Stack
          direction="row"
          spacing={2}
          sx={{ px: 3, py: 1.5, maxWidth: 1500, mx: 'auto', alignItems: 'center' }}
        >
          <Typography variant="h6">LMS Gradebook</Typography>
          <Box sx={{ flex: 1 }} />
          {me && (
            <Chip
              size="small"
              color={me.role === 'school_admin' ? 'secondary' : 'default'}
              label={`${roleLabel[me.role]} · ${me.email ?? me.userId.slice(0, 8)}`}
            />
          )}
          <Button size="small" onClick={signOut}>
            Sign out
          </Button>
        </Stack>

        <Tabs
          value={view}
          onChange={(
            _event,
            value:
              | 'gradebook'
              | 'attendance'
              | 'roster'
              | 'competencies'
              | 'live'
              | 'inbox'
              | 'audit'
              | 'privacy'
              | 'retention',
          ) => setView(value)}
          sx={{
            px: 3,
            maxWidth: 1500,
            mx: 'auto',
            minHeight: 40,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Tab value="gradebook" label="Gradebook" sx={{ minHeight: 40 }} />
          {canWrite && <Tab value="attendance" label="Attendance" sx={{ minHeight: 40 }} />}
          {canWrite && <Tab value="roster" label="Roster" sx={{ minHeight: 40 }} />}
          {canWrite && <Tab value="competencies" label="Competencies" sx={{ minHeight: 40 }} />}
          <Tab value="live" label="Live" sx={{ minHeight: 40 }} />
          <Tab value="inbox" label="Inbox" sx={{ minHeight: 40 }} />
          {canAdmin && <Tab value="audit" label="Audit" sx={{ minHeight: 40 }} />}
          {canAdmin && <Tab value="privacy" label="Privacy" sx={{ minHeight: 40 }} />}
          {canAdmin && <Tab value="retention" label="Retention" sx={{ minHeight: 40 }} />}
        </Tabs>
      </Box>

      <Box sx={{ px: 3, py: 3, maxWidth: 1500, mx: 'auto' }}>
        {view === 'inbox' ? (
          <NotificationsView token={token} />
        ) : view === 'audit' && canAdmin ? (
          <AuditView token={token} />
        ) : view === 'privacy' && canAdmin ? (
          <PrivacyView token={token} />
        ) : view === 'retention' && canAdmin ? (
          <RetentionView token={token} />
        ) : view === 'live' && me ? (
          <LiveView token={token} me={me} sections={sections} />
        ) : view === 'attendance' && canWrite ? (
          <AttendanceView token={token} sections={sections} />
        ) : view === 'roster' && canWrite ? (
          <RosterView token={token} me={me} sections={sections} />
        ) : view === 'competencies' && canWrite ? (
          <CompetencyView token={token} sections={sections} periods={periods} />
        ) : (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {me?.role === 'student' && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Read-only view. Students can see only their own row.
              </Alert>
            )}

            <Paper sx={{ p: 2, mb: 2 }}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={2}
                sx={{ alignItems: { md: 'center' } }}
              >
                <FormControl size="small" sx={{ minWidth: 240 }}>
                  <InputLabel id="section-label">Section</InputLabel>
                  <Select
                    labelId="section-label"
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

                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel id="period-label">Period</InputLabel>
                  <Select
                    labelId="period-label"
                    label="Period"
                    value={periodId}
                    onChange={(event: SelectChangeEvent) => setPeriodId(event.target.value)}
                  >
                    {periods.map((period) => (
                      <MenuItem key={period.id} value={period.id}>
                        {period.name} · {period.schoolYear}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Box sx={{ flex: 1 }} />

                {canWrite && (
                  <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={saving || dirtyCount === 0}
                  >
                    {saving
                      ? 'Saving…'
                      : `Save${dirtyCount > 0 ? ` ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}` : ''}`}
                  </Button>
                )}
                {canWrite && (
                  <Button variant="outlined" onClick={handleSf9} disabled={!data}>
                    SF9 draft (XLSX)
                  </Button>
                )}
              </Stack>
            </Paper>

            {loading && !data && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress />
              </Box>
            )}

            {data && (
              <TableContainer component={Paper} sx={{ maxHeight: 'calc(100vh - 260px)' }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell rowSpan={2} sx={{ minWidth: 200 }}>
                        Learner
                      </TableCell>
                      {data.categories.map((category) => (
                        <TableCell
                          key={category.id}
                          colSpan={Math.max(1, category.items.length)}
                          align="center"
                        >
                          {category.name}
                          <Typography component="span" variant="caption" color="text.secondary">
                            {' '}
                            ({category.weight}%)
                          </Typography>
                        </TableCell>
                      ))}
                      <TableCell rowSpan={2} align="center">
                        Initial
                      </TableCell>
                      <TableCell rowSpan={2} align="center">
                        Transmuted
                      </TableCell>
                      <TableCell rowSpan={2} align="center">
                        Effective
                      </TableCell>
                      {canAdmin && (
                        <TableCell rowSpan={2} align="center">
                          Override
                        </TableCell>
                      )}
                    </TableRow>
                    <TableRow>
                      {data.categories.flatMap((category) =>
                        category.items.length > 0
                          ? category.items.map((item) => (
                              <TableCell key={item.id} align="center" sx={{ minWidth: 110 }}>
                                <Typography variant="caption">{item.title}</Typography>
                                <Typography
                                  component="div"
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  /{item.maxScore}
                                </Typography>
                              </TableCell>
                            ))
                          : [
                              <TableCell key={`${category.id}-empty`} align="center">
                                —
                              </TableCell>,
                            ],
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.students.map((student) => {
                      const categoryById = new Map(
                        student.categories.map((result) => [result.categoryId, result]),
                      );

                      return (
                        <TableRow key={student.studentId} hover>
                          <TableCell>
                            <Typography variant="body2">
                              {student.lastName}, {student.firstName}
                            </Typography>
                            {student.lrn && (
                              <Typography variant="caption" color="text.secondary">
                                LRN {student.lrn}
                              </Typography>
                            )}
                          </TableCell>

                          {data.categories.flatMap((category) =>
                            category.items.length > 0
                              ? category.items.map((item) => {
                                  const stored = student.scores[item.id]?.score;
                                  const value =
                                    edits[item.id]?.[student.studentId] ??
                                    (stored === undefined ? '' : String(stored));

                                  return (
                                    <TableCell key={item.id} align="center">
                                      <TextField
                                        size="small"
                                        type="number"
                                        value={value}
                                        disabled={!canWrite}
                                        onChange={(event) =>
                                          setEdit(item.id, student.studentId, event.target.value)
                                        }
                                        slotProps={{
                                          htmlInput: {
                                            min: 0,
                                            max: item.maxScore,
                                            step: '0.01',
                                            'aria-label': `${student.lastName} ${item.title}`,
                                          },
                                        }}
                                        sx={{ width: 92 }}
                                      />
                                    </TableCell>
                                  );
                                })
                              : [
                                  <TableCell key={`${student.studentId}-${category.id}-empty`}>
                                    —
                                  </TableCell>,
                                ],
                          )}

                          {data.categories.map((category) => (
                            <TableCell
                              key={`${student.studentId}-${category.id}-pct`}
                              align="center"
                            >
                              {formatNumber(categoryById.get(category.id)?.percentage ?? null)}
                            </TableCell>
                          ))}

                          <TableCell align="center">{formatNumber(student.percentage)}</TableCell>
                          <TableCell align="center">
                            {formatNumber(student.transmutedGrade)}
                          </TableCell>
                          <TableCell align="center">
                            <strong>{formatNumber(student.effectiveGrade)}</strong>
                          </TableCell>
                          {canAdmin && (
                            <TableCell align="center">
                              <Button size="small" onClick={() => openOverride(student)}>
                                {student.override ? 'Edit' : 'Set'}
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {data && (
              <Stack direction="row" spacing={2} sx={{ mt: 1.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Weights total: {data.weightsTotal}%
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Transmutation: {data.transmutationPolicy}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Ungraded items count as zero.
                </Typography>
              </Stack>
            )}
          </>
        )}
      </Box>

      <Dialog
        open={Boolean(overrideStudent)}
        onClose={() => setOverrideStudent(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Override final grade</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {overrideStudent ? `${overrideStudent.lastName}, ${overrideStudent.firstName}` : ''}
          </Typography>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Final grade"
              type="number"
              value={overrideGrade}
              onChange={(event) => setOverrideGrade(event.target.value)}
              slotProps={{ htmlInput: { min: 0, max: 100, step: '0.01' } }}
              fullWidth
            />
            <TextField
              label="Reason"
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              multiline
              minRows={2}
              fullWidth
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOverrideStudent(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={submitOverride}
            disabled={!overrideReason.trim() || overrideGrade === ''}
          >
            Save override
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        message={toast ?? ''}
      />
    </Box>
  );
}
