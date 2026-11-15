'use client';

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
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
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type {
  RetentionCategoryKey,
  RetentionPolicy,
  RetentionRun,
  RetentionSettings,
} from '@/lib/types';

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong';

const FIELDS: Array<{
  key: RetentionCategoryKey;
  label: string;
  helper: string;
}> = [
  {
    key: 'notificationsReadDays',
    label: 'Read notifications',
    helper: 'Delete in-app messages that were read more than N days ago.',
  },
  {
    key: 'staleDeviceDays',
    label: 'Stale push devices',
    helper: 'Forget devices not seen for N days so pushes stop retrying.',
  },
  {
    key: 'processedEventDays',
    label: 'Processed meeting events',
    helper: 'Prune webhook events that were already processed.',
  },
  {
    key: 'syncReceiptDays',
    label: 'Sync receipts',
    helper: 'Expire offline operation receipts older than N days.',
  },
];

const EMPTY_DAYS: Record<RetentionCategoryKey, string> = {
  notificationsReadDays: '',
  staleDeviceDays: '',
  processedEventDays: '',
  syncReceiptDays: '',
};

const daysFromPolicy = (policy: RetentionPolicy): Record<RetentionCategoryKey, string> => ({
  notificationsReadDays: policy.notificationsReadDays?.toString() ?? '',
  staleDeviceDays: policy.staleDeviceDays?.toString() ?? '',
  processedEventDays: policy.processedEventDays?.toString() ?? '',
  syncReceiptDays: policy.syncReceiptDays?.toString() ?? '',
});

const formatWhen = (value: string) => new Date(value).toLocaleString();

const formatCutoff = (value: string | null) => (value ? new Date(value).toLocaleDateString() : '—');

function parseDays(value: string): number | null | 'invalid' {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3650) return 'invalid';
  return parsed;
}

export function RetentionView({ token }: { token: string }) {
  const [settings, setSettings] = useState<RetentionSettings | null>(null);
  const [runs, setRuns] = useState<RetentionRun[]>([]);
  const [days, setDays] = useState<Record<RetentionCategoryKey, string>>(EMPTY_DAYS);
  const [runHour, setRunHour] = useState('2');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyOverview = (next: { settings: RetentionSettings; runs: RetentionRun[] }) => {
    setSettings(next.settings);
    setRuns(next.runs);
    setDays(daysFromPolicy(next.settings.policy));
    setRunHour(String(next.settings.policy.runHour));
  };

  useEffect(() => {
    let cancelled = false;
    api
      .retention(token)
      .then((overview) => {
        if (!cancelled) applyOverview(overview);
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

  const save = async () => {
    if (!settings) return;
    const policy: RetentionPolicy = {
      runHour: Number(runHour),
      notificationsReadDays: null,
      staleDeviceDays: null,
      processedEventDays: null,
      syncReceiptDays: null,
    };

    for (const field of FIELDS) {
      const parsed = parseDays(days[field.key]);
      if (parsed === 'invalid') {
        setError(
          `${field.label}: enter a whole number of days between 1 and 3650, or leave blank.`,
        );
        return;
      }
      policy[field.key] = parsed;
    }

    if (!Number.isInteger(policy.runHour) || policy.runHour < 0 || policy.runHour > 23) {
      setError('Run hour must be between 0 and 23.');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await api.saveRetention(token, policy, settings.version);
      setSettings(saved);
      setNotice(`Policy saved as version ${saved.version}.`);
    } catch (err: unknown) {
      setError(messageOf(err));
      if (err instanceof Error && err.message.includes('changed since')) {
        try {
          applyOverview(await api.retention(token));
        } catch {
          // keep the conflict message
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const dryRun = async () => {
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const run = await api.retentionDryRun(token);
      setRuns((current) => [run, ...current]);
      setNotice(`Dry run counted ${run.totalRows} row(s). Nothing was deleted.`);
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <CircularProgress size={20} />
        <Typography variant="body2">Loading retention policy…</Typography>
      </Stack>
    );
  }

  const latest = runs[0] ?? null;

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Pilot mode records dry runs only — no rows are deleted. Attendance, grades, enrollments, and
        other academic records are never touched by retention. Use Privacy → erasure for
        personal-data requests.
      </Alert>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{
            mb: 2,
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'center' },
          }}
        >
          <Box>
            <Typography variant="h6">Retention windows</Typography>
            <Typography variant="body2" color="text.secondary">
              Leave a field blank to keep that data indefinitely. Values are tenant-specific and
              versioned.
            </Typography>
          </Box>
          <Chip
            size="small"
            label={settings ? `Version ${settings.version}` : 'Not configured'}
            color={settings && settings.version > 0 ? 'primary' : 'default'}
            variant="outlined"
          />
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
            gap: 2,
          }}
        >
          {FIELDS.map((field) => (
            <TextField
              key={field.key}
              label={field.label}
              helperText={field.helper}
              type="number"
              value={days[field.key]}
              onChange={(event) =>
                setDays((current) => ({ ...current, [field.key]: event.target.value }))
              }
              slotProps={{ htmlInput: { min: 1, max: 3650 } }}
              placeholder="Keep indefinitely"
              fullWidth
            />
          ))}
          <TextField
            select
            label="Nightly run hour (tenant time)"
            helperText="The nightly pass runs once per local day, at or after this hour."
            value={runHour}
            onChange={(event) => setRunHour(event.target.value)}
            fullWidth
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <MenuItem key={hour} value={String(hour)}>
                {String(hour).padStart(2, '0')}:00
              </MenuItem>
            ))}
          </TextField>
        </Box>

        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button variant="contained" onClick={save} disabled={saving || !settings}>
            {saving ? 'Saving…' : 'Save policy'}
          </Button>
          <Button variant="outlined" onClick={dryRun} disabled={running}>
            {running ? 'Running…' : 'Run dry run now'}
          </Button>
        </Stack>
      </Paper>

      {latest && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 0.5 }}>
            Latest pass
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {latest.triggeredBy === 'schedule' ? 'Nightly' : 'Manual'} dry run on{' '}
            {formatWhen(latest.startedAt)} · {latest.totalRows} row(s) would be removed.
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Category</TableCell>
                  <TableCell>Table</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Cutoff</TableCell>
                  <TableCell align="right">Rows</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {latest.categories.map((category) => (
                  <TableRow key={category.key}>
                    <TableCell>{category.label}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{category.table}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={category.enabled ? 'Enabled' : 'Keep forever'}
                        color={category.enabled ? 'primary' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{formatCutoff(category.cutoff)}</TableCell>
                    <TableCell align="right">{category.rows}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Run history
        </Typography>
        {runs.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No retention passes yet. Save a policy and run a dry run, or wait for the nightly pass.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Trigger</TableCell>
                  <TableCell>Mode</TableCell>
                  <TableCell align="right">Rows</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>{formatWhen(run.startedAt)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={run.triggeredBy === 'schedule' ? 'Nightly' : 'Manual'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>Dry run</TableCell>
                    <TableCell align="right">{run.totalRows}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Stack>
  );
}
