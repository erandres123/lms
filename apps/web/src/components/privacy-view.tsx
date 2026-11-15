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
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { ErasurePlan, StudentOption } from '@/lib/types';

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
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [working, setWorking] = useState<'export' | 'plan' | null>(null);
  const [plan, setPlan] = useState<ErasurePlan | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .students(token)
      .then((rows) => {
        if (cancelled) return;
        setStudents(rows);
        setStudentId((current) => current || rows[0]?.id || '');
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(messageOf(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingStudents(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const student = students.find((row) => row.id === studentId);

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

  return (
    <>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ alignItems: { md: 'center' } }}
        >
          <FormControl size="small" sx={{ minWidth: 300 }} disabled={loadingStudents}>
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

      {loadingStudents && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

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

      {!loadingStudents && students.length === 0 && (
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
