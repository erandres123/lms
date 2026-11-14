'use client';

import {
  Alert,
  Box,
  CircularProgress,
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
import type { CompetencyReport, Period, Section } from '@/lib/types';

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong';

export function CompetencyView({
  token,
  sections,
  periods,
}: {
  token: string;
  sections: Section[];
  periods: Period[];
}) {
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? '');
  const [periodId, setPeriodId] = useState(periods[0]?.id ?? '');
  const [report, setReport] = useState<CompetencyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sections.length > 0 && !sections.some((section) => section.id === sectionId)) {
      setSectionId(sections[0].id);
    }
  }, [sections, sectionId]);

  useEffect(() => {
    if (periods.length > 0 && !periods.some((period) => period.id === periodId)) {
      setPeriodId(periods[0].id);
    }
  }, [periods, periodId]);

  const load = useCallback(async () => {
    if (!sectionId || !periodId) return;
    setLoading(true);
    setError(null);

    try {
      setReport(await api.competencies(token, sectionId, periodId));
    } catch (err: unknown) {
      setReport(null);
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, [token, sectionId, periodId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ alignItems: { md: 'center' } }}
        >
          <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel id="competency-section-label">Section</InputLabel>
            <Select
              labelId="competency-section-label"
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
            <InputLabel id="competency-period-label">Period</InputLabel>
            <Select
              labelId="competency-period-label"
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
        </Stack>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && !report && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {report && report.competencies.length === 0 && (
        <Alert severity="info">
          No competency codes are attached to this period&apos;s grade items yet.
        </Alert>
      )}

      {report && report.competencies.length > 0 && (
        <>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 180 }}>Learner</TableCell>
                  {report.competencies.map((competency) => (
                    <TableCell key={competency.code} align="center">
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {competency.code}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {competency.items.length} item
                        {competency.items.length === 1 ? '' : 's'} · {competency.possible} pts
                      </Typography>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {report.students.map((student) => (
                  <TableRow key={student.studentId} hover>
                    <TableCell>
                      {student.lastName}, {student.firstName}
                    </TableCell>
                    {student.results.map((result) => (
                      <TableCell key={result.code} align="center">
                        <strong>
                          {result.percentage === null ? '—' : `${result.percentage.toFixed(1)}%`}
                        </strong>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block' }}
                        >
                          {result.earned} / {result.possible}
                        </Typography>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>            Raw percentage of possible points per competency ({report.policy}). No transmutation
            or mastery labels are applied.
          </Typography>
        </>
      )}
    </>
  );
}
