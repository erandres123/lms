'use client';

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AuditEntry } from '@/lib/types';

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong';

interface Filters {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = {
  actorId: '',
  action: '',
  entity: '',
  entityId: '',
  from: '',
  to: '',
};

function formatWhen(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(iso));
}

function detailText(metadata: Record<string, unknown>) {
  const keys = Object.keys(metadata);
  if (keys.length === 0) return '—';
  return JSON.stringify(metadata);
}

export function AuditView({ token }: { token: string }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [timeZone, setTimeZone] = useState('Asia/Manila');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const page = await api.audit(token, {
          actorId: applied.actorId.trim() || undefined,
          action: applied.action.trim() || undefined,
          entity: applied.entity.trim() || undefined,
          entityId: applied.entityId.trim() || undefined,
          from: applied.from || undefined,
          to: applied.to || undefined,
          cursor: cursor ?? undefined,
          limit: 50,
        });
        setTimeZone(page.timeZone);
        setNextCursor(page.nextCursor);
        setEntries((current) => (append ? [...current, ...page.entries] : page.entries));
      } catch (err: unknown) {
        setError(messageOf(err));
      } finally {
        setLoading(false);
      }
    },
    [token, applied],
  );

  useEffect(() => {
    void fetchPage(null, false);
  }, [fetchPage]);

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ alignItems: { lg: 'center' } }}>
          <TextField
            size="small"
            label="Actor user ID"
            value={filters.actorId}
            onChange={(event) => setFilter('actorId', event.target.value)}
            sx={{ minWidth: 260 }}
          />
          <TextField
            size="small"
            label="Action"
            placeholder="attendance.saved"
            value={filters.action}
            onChange={(event) => setFilter('action', event.target.value)}
            sx={{ minWidth: 180 }}
          />
          <TextField
            size="small"
            label="Entity"
            placeholder="section"
            value={filters.entity}
            onChange={(event) => setFilter('entity', event.target.value)}
            sx={{ minWidth: 140 }}
          />
          <TextField
            size="small"
            label="Entity ID"
            value={filters.entityId}
            onChange={(event) => setFilter('entityId', event.target.value)}
            sx={{ minWidth: 220 }}
          />
          <TextField
            size="small"
            type="date"
            label="From"
            value={filters.from}
            onChange={(event) => setFilter('from', event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 170 }}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            value={filters.to}
            onChange={(event) => setFilter('to', event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 170 }}
          />
          <Box sx={{ flex: 1 }} />
          <Button
            variant="contained"
            onClick={() => setApplied({ ...filters })}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Apply filters'}
          </Button>
        </Stack>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && entries.length === 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && entries.length === 0 && !error && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            No audit entries match these filters.
          </Typography>
        </Paper>
      )}

      {entries.length > 0 && (
        <>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 170 }}>When</TableCell>
                  <TableCell sx={{ minWidth: 200 }}>Actor</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Entity</TableCell>
                  <TableCell>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id} hover>
                    <TableCell>{formatWhen(entry.createdAt, timeZone)}</TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {entry.actorName ?? entry.actorEmail ?? 'System'}
                      </Typography>
                      {entry.actorEmail && (
                        <Typography variant="caption" color="text.secondary">
                          {entry.actorEmail}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={entry.action} variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{entry.entity}</Typography>
                      {entry.entityId && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontFamily: 'monospace' }}
                        >
                          {entry.entityId}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 420 }}>
                      <Typography
                        variant="caption"
                        title={detailText(entry.metadata)}
                        sx={{ display: 'block', overflowWrap: 'anywhere' }}
                      >
                        {detailText(entry.metadata)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Stack direction="row" spacing={2} sx={{ mt: 1.5, alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} loaded · times in {timeZone}
            </Typography>
            <Box sx={{ flex: 1 }} />
            {nextCursor && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => void fetchPage(nextCursor, true)}
                disabled={loading}
              >
                Load older
              </Button>
            )}
          </Stack>
        </>
      )}
    </>
  );
}
