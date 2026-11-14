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
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Me, RosterImportReport, Section, RosterStudent } from '@/lib/types';

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong';

export function RosterView({
  token,
  me,
  sections,
}: {
  token: string;
  me: Me | null;
  sections: Section[];
}) {
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? '');
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [report, setReport] = useState<RosterImportReport | null>(null);

  const isAdmin = me?.role === 'school_admin';

  const load = useCallback(async () => {
    if (!sectionId) return;
    setLoading(true);
    setError(null);

    try {
      const roster = await api.roster(token, sectionId);
      setStudents(roster.students);
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, [token, sectionId]);

  useEffect(() => {
    if (sections.length === 0) return;
    if (!sections.some((section) => section.id === sectionId)) {
      setSectionId(sections[0].id);
    }
  }, [sections, sectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeDialog = () => {
    setDialogOpen(false);
    setFile(null);
    setReport(null);
  };

  const submit = async () => {
    if (!file || !sectionId) return;
    setUploading(true);
    setError(null);
    setReport(null);

    try {
      const result = await api.importRoster(token, sectionId, file);
      setReport(result);
      if (result.ok) await load();
    } catch (err: unknown) {
      setError(messageOf(err));
    } finally {
      setUploading(false);
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
          <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel id="roster-section-label">Section</InputLabel>
            <Select
              labelId="roster-section-label"
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

          <Typography variant="body2" color="text.secondary">
            {students.length} learner{students.length === 1 ? '' : 's'}
          </Typography>

          <Box sx={{ flex: 1 }} />

          {isAdmin && (
            <Button variant="contained" onClick={() => setDialogOpen(true)}>
              Import roster
            </Button>
          )}
        </Stack>
      </Paper>

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
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Learner</TableCell>
                <TableCell>LRN</TableCell>
                <TableCell>Enrollment</TableCell>
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
                    <Chip
                      size="small"
                      variant="outlined"
                      color={student.enrollmentStatus === 'active' ? 'success' : 'default'}
                      label={student.enrollmentStatus}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>Import roster</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Upload a .csv or .xlsx file with <strong>First Name</strong> and{' '}
              <strong>Last Name</strong> columns. LRN is optional but makes re-imports exact.
              Re-importing the same file updates names and never duplicates learners.
            </Typography>

            <Button component="label" variant="outlined">
              Choose file
              <input
                type="file"
                accept=".csv,.xlsx"
                hidden
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setReport(null);
                }}
              />
            </Button>

            <Typography variant="body2">
              {file ? `${file.name} · ${Math.ceil(file.size / 1024)} KB` : 'No file selected'}
            </Typography>

            {report && !report.ok && (
              <Alert severity="error">
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Nothing was imported. Fix these rows and upload again:
                </Typography>
                {report.errors.map((rowError) => (
                  <Typography key={rowError.rowNumber} variant="body2">
                    Row {rowError.rowNumber}: {rowError.message}
                  </Typography>
                ))}
              </Alert>
            )}

            {report?.ok && report.summary && (
              <>
                <Alert severity="success">
                  {report.summary.created} created · {report.summary.updated} updated ·{' '}
                  {report.summary.unchanged} unchanged · {report.summary.enrolled} newly enrolled ·{' '}
                  {report.summary.alreadyEnrolled} already enrolled
                </Alert>
                <TableContainer sx={{ maxHeight: 260 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Row</TableCell>
                        <TableCell>Learner</TableCell>
                        <TableCell>Result</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {report.results.map((row) => (
                        <TableRow key={row.rowNumber}>
                          <TableCell>{row.rowNumber}</TableCell>
                          <TableCell>
                            {row.lastName}, {row.firstName}
                          </TableCell>
                          <TableCell>
                            {row.status}
                            {row.enrolled ? ' · enrolled' : ''}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>{report?.ok ? 'Close' : 'Cancel'}</Button>
          <Button variant="contained" onClick={submit} disabled={!file || uploading}>
            {uploading ? 'Importing…' : 'Import'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
