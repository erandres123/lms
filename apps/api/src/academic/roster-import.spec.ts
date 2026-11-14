import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseRosterFile } from './roster-import';

const csv = (body: string) => Buffer.from(body, 'utf8');

describe('parseRosterFile', () => {
  it('parses a CSV with the standard headers', async () => {
    const result = await parseRosterFile(
      csv('Last Name,First Name,LRN\nSantos,Maria,123456789012\nReyes,Jose,123456789013\n'),
      'roster.csv',
    );

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { rowNumber: 2, firstName: 'Maria', lastName: 'Santos', lrn: '123456789012' },
      { rowNumber: 3, firstName: 'Jose', lastName: 'Reyes', lrn: '123456789013' },
    ]);
  });

  it('accepts header aliases and optional LRN', async () => {
    const result = await parseRosterFile(
      csv('SURNAME,Given Name\nCruz,Ana\n'),
      'aliases.csv',
    );

    expect(result.ok).toBe(true);
    expect(result.rows).toEqual([
      { rowNumber: 2, firstName: 'Ana', lastName: 'Cruz', lrn: null },
    ]);
  });

  it('reports a missing required column', async () => {
    const result = await parseRosterFile(csv('Last Name,LRN\nSantos,123456789012\n'), 'bad.csv');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/missing required columns/);
  });

  it('flags an invalid LRN', async () => {
    const result = await parseRosterFile(csv('Last Name,First Name,LRN\nSantos,Maria,123\n'), 'lrn.csv');

    expect(result.ok).toBe(true);
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([{ rowNumber: 2, message: 'LRN must be exactly 12 digits' }]);
  });

  it('flags duplicate LRNs inside one file', async () => {
    const result = await parseRosterFile(
      csv('Last Name,First Name,LRN\nSantos,Maria,123456789012\nSantos,Maria,123456789012\n'),
      'dupe.csv',
    );

    expect(result.errors).toEqual([
      { rowNumber: 3, message: 'duplicate LRN 123456789012 (already on row 2)' },
    ]);
  });

  it('flags duplicate names when LRNs are absent', async () => {
    const result = await parseRosterFile(
      csv('Last Name,First Name\nCruz,Ana\nCruz,Ana\n'),
      'names.csv',
    );

    expect(result.errors[0]?.message).toMatch(/duplicate learner name without LRN/);
  });

  it('reads XLSX workbooks', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Roster');
    sheet.addRow(['Last Name', 'First Name', 'LRN']);
    sheet.addRow(['Dela Cruz', 'Juan', '123456789015']);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const result = await parseRosterFile(buffer, 'roster.xlsx');

    expect(result.ok).toBe(true);
    expect(result.rows).toEqual([
      { rowNumber: 2, firstName: 'Juan', lastName: 'Dela Cruz', lrn: '123456789015' },
    ]);
  });

  it('rejects unsupported file types', async () => {
    const result = await parseRosterFile(csv('whatever'), 'roster.pdf');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unsupported file type/);
  });
});
