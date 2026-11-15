'use client';

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
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
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type {
  ConsentRecord,
  ConsentStatus,
  ErasurePlan,
  GuardianAccessMode,
  GuardianAccessSettings,
  GuardianAccountResult,
  GuardianLink,
  PrivacyNotice,
  PrivacyNoticeSettings,
  StudentOption,
} from '@/lib/types';

const GUARDIAN_MODE_COPY: Record<GuardianAccessMode, string> = {
  admin_created: 'Admin creates the account and hands over a one-time password.',
  email_invite: 'Supabase emails an invite; the guardian sets their own password.',
  magic_link: 'No password; the guardian signs in with an emailed magic link.',
};

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong';

const ACTION_COLOR: Record<
  ErasurePlan['categories'][number]['action'],
  'warning' | 'error' | 'default'
> = {
  anonymize: 'warning',
  delete: 'error',
  retain: 'default',
};

const DRAFT_NOTICE: PrivacyNotice = {
  title: 'DRAFT privacy notice — replace before launch',
  body: `DRAFT TEMPLATE. This text is not legal advice. Replace every section with the school's official privacy notice before any real student data is collected.

1. Who we are
[School name, address, and privacy contact]

2. What we collect
Student name, learner reference number, attendance, grades, class participation, school email, and push-device tokens.

3. Why we process it
[Purpose of processing and the legal basis the school relies on]

4. Who can see it
[School staff roles with access, plus any processors such as hosting and video providers]

5. How long we keep it
[Retention schedule per record type]

6. Your rights
[Access, correction, erasure, objection, and how to exercise them]

7. Contact and complaints
[Data protection officer and the regulator to complain to]`,
};

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PrivacyView({ token }: { token: string }) {
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<
    'export' | 'plan' | 'notice' | 'consent' | 'guardian' | 'guardian-mode' | null
  >(null);
  const [plan, setPlan] = useState<ErasurePlan | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [noticeSettings, setNoticeSettings] = useState<PrivacyNoticeSettings | null>(null);
  const [noticeDraft, setNoticeDraft] = useState<PrivacyNotice>(DRAFT_NOTICE);
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState('Parent');
  const [guardianContact, setGuardianContact] = useState('');
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>('granted');
  const [consentNote, setConsentNote] = useState('');

  const [guardianAccess, setGuardianAccess] = useState<GuardianAccessSettings | null>(null);
  const [guardianMode, setGuardianMode] = useState<GuardianAccessMode>('admin_created');
  const [guardians, setGuardians] = useState<GuardianLink[]>([]);
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianDisplayName, setGuardianDisplayName] = useState('');
  const [guardianLinkRelationship, setGuardianLinkRelationship] = useState('Parent');
  const [guardianStudentId, setGuardianStudentId] = useState('');
  const [createdGuardian, setCreatedGuardian] = useState<GuardianAccountResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.students(token),
      api.privacyConsents(token),
      api.guardianAccess(token),
      api.guardians(token),
    ])
      .then(([rows, overview, access, links]) => {
        if (cancelled) return;
        setStudents(rows);
        setStudentId((current) => current || rows[0]?.id || '');
        setGuardianStudentId((current) => current || rows[0]?.id || '');
        setNoticeSettings(overview.notice);
        setNoticeDraft(overview.notice.notice ?? DRAFT_NOTICE);
        setConsents(overview.consents);
        setGuardianAccess(access);
        setGuardianMode(access.mode);
        setGuardians(links);
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

  const student = students.find((row) => row.id === studentId);
  const noticeSaved = Boolean(noticeSettings?.notice);

  const saveNotice = async () => {
    if (!noticeDraft.title.trim() || !noticeDraft.body.trim()) {
      setError('A title and body are required.');
      return;
    }
    setWorking('notice');
    setError(null);
    setNotice(null);
    try {
      const saved = await api.savePrivacyNotice(
        token,
        { title: noticeDraft.title.trim(), body: noticeDraft.body.trim() },
        noticeSettings?.version ?? 0,
      );
      setNoticeSettings(saved);
      setNoticeDraft(saved.notice ?? DRAFT_NOTICE);
      setNotice(`Privacy notice saved as version ${saved.version}.`);
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setWorking(null);
    }
  };

  const captureConsent = async () => {
    if (!student) return;
    if (!noticeSaved) {
      setError('Save the privacy notice before capturing consent.');
      return;
    }
    if (!guardianName.trim() || !guardianRelationship.trim()) {
      setError('Guardian name and relationship are required.');
      return;
    }
    setWorking('consent');
    setError(null);
    setNotice(null);
    try {
      const record = await api.captureConsent(token, student.id, {
        guardianName: guardianName.trim(),
        guardianRelationship: guardianRelationship.trim(),
        guardianContact: guardianContact.trim() || null,
        status: consentStatus,
        note: consentNote.trim() || null,
      });
      setConsents((rows) => [record, ...rows]);
      setGuardianName('');
      setGuardianContact('');
      setConsentNote('');
      setNotice(
        `Consent (${consentStatus}) recorded for ${record.studentName} against notice version ${record.noticeVersion}.`,
      );
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setWorking(null);
    }
  };

  const saveGuardianMode = async () => {
    setWorking('guardian-mode');
    setError(null);
    setNotice(null);
    try {
      const saved = await api.saveGuardianAccess(
        token,
        guardianMode,
        guardianAccess?.version ?? 0,
      );
      setGuardianAccess(saved);
      setGuardianMode(saved.mode);
      setNotice(`Guardian account mode saved as ${saved.mode} (version ${saved.version}).`);
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setWorking(null);
    }
  };

  const createGuardian = async () => {
    if (!guardianStudentId || !guardianEmail.trim() || !guardianDisplayName.trim()) {
      setError('Student, guardian email, and display name are required.');
      return;
    }
    setWorking('guardian');
    setError(null);
    setNotice(null);
    setCreatedGuardian(null);
    try {
      const result = await api.createGuardian(token, {
        studentId: guardianStudentId,
        email: guardianEmail.trim(),
        displayName: guardianDisplayName.trim(),
        relationship: guardianLinkRelationship.trim() || 'Parent',
      });
      setCreatedGuardian(result);
      setGuardians(await api.guardians(token));
      setGuardianEmail('');
      setGuardianDisplayName('');
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setWorking(null);
    }
  };

  const exportStudent = async () => {
    if (!student) return;
    setWorking('export');
    setError(null);
    setNotice(null);
    try {
      const data = await api.dsarExport(token, student.id);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(`dsar-${student.lastName}-${stamp}.json`, data);
      setNotice(
        `Export downloaded: ${data.attendance.length} attendance, ${data.grades.length} grade entries, ${data.enrollments.length} enrollment(s).`,
      );
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setWorking(null);
    }
  };

  const runDryRun = async () => {
    if (!student) return;
    setWorking('plan');
    setError(null);
    setNotice(null);
    setPlan(null);
    try {
      setPlan(await api.erasureDryRun(token, student.id));
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setWorking(null);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
          <Typography variant="subtitle1">Privacy notice</Typography>
          <Chip
            size="small"
            variant="outlined"
            label={noticeSettings?.version ? `version ${noticeSettings.version}` : 'not saved'}
          />
          {!noticeSaved && (
            <Chip size="small" color="warning" label="draft only — not shown to users" />
          )}
        </Stack>
        <Stack spacing={2}>
          <TextField
            size="small"
            label="Title"
            value={noticeDraft.title}
            onChange={(event) => setNoticeDraft((d) => ({ ...d, title: event.target.value }))}
          />
          <TextField
            label="Notice text"
            multiline
            minRows={10}
            value={noticeDraft.body}
            onChange={(event) => setNoticeDraft((d) => ({ ...d, body: event.target.value }))}
          />
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Button
              variant="contained"
              onClick={() => void saveNotice()}
              disabled={working !== null}
            >
              {working === 'notice' ? 'Saving…' : 'Save notice'}
            </Button>
            <Typography variant="caption" color="text.secondary">
              Saving creates a new version. Consent records stay pinned to the version the guardian
              was given.
            </Typography>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
          <Typography variant="subtitle1">Guardian accounts</Typography>
          <Chip
            size="small"
            variant="outlined"
            label={`version ${guardianAccess?.version ?? 0}`}
          />
        </Stack>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ alignItems: { md: 'center' } }}
        >
          <FormControl size="small" sx={{ minWidth: 260 }}>
            <InputLabel id="guardian-mode-label">Account creation</InputLabel>
            <Select
              labelId="guardian-mode-label"
              label="Account creation"
              value={guardianMode}
              onChange={(event: SelectChangeEvent) =>
                setGuardianMode(event.target.value as GuardianAccessMode)
              }
            >
              <MenuItem value="admin_created">Admin-created (default)</MenuItem>
              <MenuItem value="email_invite">Email invite</MenuItem>
              <MenuItem value="magic_link">Magic link</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="contained"
            onClick={() => void saveGuardianMode()}
            disabled={working !== null || guardianMode === guardianAccess?.mode}
          >
            {working === 'guardian-mode' ? 'Saving…' : 'Save mode'}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            {GUARDIAN_MODE_COPY[guardianMode]} The school decides; changing the mode affects new
            accounts only.
          </Typography>
        </Stack>

        <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
          Create or invite a guardian
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="guardian-student-label">Student</InputLabel>
            <Select
              labelId="guardian-student-label"
              label="Student"
              value={guardianStudentId}
              onChange={(event: SelectChangeEvent) => setGuardianStudentId(event.target.value)}
            >
              {students.map((row) => (
                <MenuItem key={row.id} value={row.id}>
                  {row.lastName}, {row.firstName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Guardian email"
            type="email"
            value={guardianEmail}
            onChange={(event) => setGuardianEmail(event.target.value)}
            sx={{ minWidth: 240 }}
          />
          <TextField
            size="small"
            label="Display name"
            value={guardianDisplayName}
            onChange={(event) => setGuardianDisplayName(event.target.value)}
            sx={{ minWidth: 200 }}
          />
          <TextField
            size="small"
            label="Relationship"
            value={guardianLinkRelationship}
            onChange={(event) => setGuardianLinkRelationship(event.target.value)}
            sx={{ minWidth: 160 }}
          />
          <Button
            variant="contained"
            onClick={() => void createGuardian()}
            disabled={
              working !== null ||
              !guardianStudentId ||
              !guardianEmail.trim() ||
              !guardianDisplayName.trim()
            }
          >
            {working === 'guardian'
              ? 'Working…'
              : guardianMode === 'email_invite'
                ? 'Send invite'
                : guardianMode === 'magic_link'
                  ? 'Create magic-link account'
                  : 'Create account'}
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          The account gets the parent role in this school and may sign in to consent for the linked
          student. Linking an email that already belongs to another role is refused.
        </Typography>

        {createdGuardian && (
          <Alert
            severity="info"
            sx={{ mt: 2 }}
            onClose={() => setCreatedGuardian(null)}
          >
            {createdGuardian.invited ? (
              <>Invite sent to {createdGuardian.email}.</>
            ) : createdGuardian.temporaryPassword ? (
              <>
                <Typography variant="subtitle2">
                  One-time password for {createdGuardian.email}
                </Typography>
                <Typography sx={{ fontFamily: 'monospace', my: 1, fontSize: '1.05rem' }}>
                  {createdGuardian.temporaryPassword}
                </Typography>
                Share it securely. It is shown once and is not stored.
              </>
            ) : createdGuardian.mode === 'magic_link' ? (
              <>
                Account created for {createdGuardian.email}. The guardian signs in with an emailed
                magic link.
              </>
            ) : (
              <>
                Existing account linked for {createdGuardian.email}. The guardian keeps their
                current sign-in method.
              </>
            )}
          </Alert>
        )}

        {guardians.length > 0 && (
          <TableContainer sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Guardian</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Student</TableCell>
                  <TableCell>Relationship</TableCell>
                  <TableCell>Linked</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {guardians.map((link) => (
                  <TableRow key={link.id} hover>
                    <TableCell>{link.displayName ?? '—'}</TableCell>
                    <TableCell>{link.email}</TableCell>
                    <TableCell>{link.studentName}</TableCell>
                    <TableCell>{link.relationship}</TableCell>
                    <TableCell>{new Date(link.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
          Guardian consent
        </Typography>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <FormControl size="small" sx={{ minWidth: 240 }}>
              <InputLabel id="consent-student-label">Student</InputLabel>
              <Select
                labelId="consent-student-label"
                label="Student"
                value={studentId}
                onChange={(event: SelectChangeEvent) => setStudentId(event.target.value)}
              >
                {students.map((row) => (
                  <MenuItem key={row.id} value={row.id}>
                    {row.lastName}, {row.firstName}
                    {row.lrn ? ` · LRN ${row.lrn}` : ''}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Guardian name"
              value={guardianName}
              onChange={(event) => setGuardianName(event.target.value)}
              sx={{ minWidth: 220 }}
            />
            <TextField
              size="small"
              label="Relationship"
              value={guardianRelationship}
              onChange={(event) => setGuardianRelationship(event.target.value)}
              sx={{ minWidth: 160 }}
            />
            <TextField
              size="small"
              label="Contact (optional)"
              value={guardianContact}
              onChange={(event) => setGuardianContact(event.target.value)}
              sx={{ minWidth: 200 }}
            />
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={consentStatus}
              onChange={(_event, value: ConsentStatus | null) => {
                if (value) setConsentStatus(value);
              }}
            >
              <ToggleButton value="granted">Granted</ToggleButton>
              <ToggleButton value="withdrawn">Withdrawn</ToggleButton>
            </ToggleButtonGroup>
            <TextField
              size="small"
              label="Note (optional)"
              value={consentNote}
              onChange={(event) => setConsentNote(event.target.value)}
              fullWidth
            />
            <Button
              variant="contained"
              onClick={() => void captureConsent()}
              disabled={!student || working !== null || !noticeSaved}
            >
              {working === 'consent' ? 'Recording…' : 'Record consent'}
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Captures are append-only and recorded in the audit log. Each record stores the notice
            version the guardian was given.
          </Typography>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
          Consent history
        </Typography>
        {consents.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No consent captured yet.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Captured</TableCell>
                  <TableCell>Student</TableCell>
                  <TableCell>Guardian</TableCell>
                  <TableCell>Relationship</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Notice</TableCell>
                  <TableCell>Recorded by</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {consents.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>{new Date(row.capturedAt).toLocaleString()}</TableCell>
                    <TableCell>{row.studentName}</TableCell>
                    <TableCell>{row.guardianName}</TableCell>
                    <TableCell>{row.guardianRelationship}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={row.status === 'granted' ? 'success' : 'warning'}
                        label={row.status}
                      />
                    </TableCell>
                    <TableCell align="right">v{row.noticeVersion}</TableCell>
                    <TableCell>{row.capturedByName ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ alignItems: { md: 'center' } }}
        >
          <FormControl size="small" sx={{ minWidth: 300 }}>
            <InputLabel id="dsar-student-label">Student</InputLabel>
            <Select
              labelId="dsar-student-label"
              label="Student"
              value={studentId}
              onChange={(event: SelectChangeEvent) => {
                setStudentId(event.target.value);
                setPlan(null);
                setNotice(null);
              }}
            >
              {students.map((row) => (
                <MenuItem key={row.id} value={row.id}>
                  {row.lastName}, {row.firstName}
                  {row.lrn ? ` · LRN ${row.lrn}` : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ flex: 1 }} />

          <Button
            variant="contained"
            onClick={() => void exportStudent()}
            disabled={!student || working !== null}
          >
            {working === 'export' ? 'Exporting…' : 'Download DSAR JSON'}
          </Button>
          <Button
            variant="outlined"
            onClick={() => void runDryRun()}
            disabled={!student || working !== null}
          >
            {working === 'plan' ? 'Checking…' : 'Erasure dry-run'}
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          Both actions are recorded in the audit log. The dry-run never changes data.
        </Typography>
      </Paper>

      {students.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            No students in this tenant yet.
          </Typography>
        </Paper>
      )}

      {plan && (
        <>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Erasure dry-run · {student?.lastName}, {student?.firstName}
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Data</TableCell>
                    <TableCell>Table</TableCell>
                    <TableCell align="right">Rows</TableCell>
                    <TableCell>Proposed</TableCell>
                    <TableCell>Reason</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {plan.categories.map((category) => (
                    <TableRow key={category.table} hover>
                      <TableCell>{category.label}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{category.table}</TableCell>
                      <TableCell align="right">{category.rows}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={category.action}
                          color={ACTION_COLOR[category.action]}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">{category.reason}</Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Alert severity="warning">
            <Typography variant="subtitle2">Nothing was changed</Typography>
            <List dense disablePadding>
              {plan.warnings.map((warning) => (
                <ListItem key={warning} disableGutters>
                  <ListItemText primary={warning} slotProps={{ primary: { variant: 'body2' } }} />
                </ListItem>
              ))}
            </List>
          </Alert>
        </>
      )}
    </>
  );
}
