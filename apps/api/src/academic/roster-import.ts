import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';

export interface RosterRowInput {
  rowNumber: number;
  firstName: string;
  lastName: string;
  lrn: string | null;
}

export interface RosterRowError {
  rowNumber: number;
  message: string;
}

export interface ParsedRoster {
  ok: boolean;
  error?: string;
  rows: RosterRowInput[];
  errors: RosterRowError[];
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const ALIASES = {
  firstName: new Set(['firstname', 'givenname', 'fname', 'given']),
  lastName: new Set(['lastname', 'surname', 'familyname', 'lname', 'family']),
  lrn: new Set(['lrn', 'learnerreferencenumber', 'learnerreference']),
};

const cellText = (row: ExcelJS.Row, column: number) => {
  const text = row.getCell(column).text;
  return typeof text === 'string' ? text.trim() : '';
};

/**
 * Reads the first worksheet of a CSV or XLSX roster. Required columns are
 * first name and last name; LRN is optional but makes re-imports exact.
 */
export async function parseRosterFile(
  buffer: Buffer,
  filename: string,
): Promise<ParsedRoster> {
  const extension = filename.toLowerCase().split('.').pop();
  const workbook = new ExcelJS.Workbook();

  try {
    if (extension === 'csv') {
      await workbook.csv.read(Readable.from([buffer]));
    } else if (extension === 'xlsx') {
      await workbook.xlsx.read(Readable.from([buffer]));
    } else {
      return { ok: false, error: 'unsupported file type; upload .csv or .xlsx', rows: [], errors: [] };
    }
  } catch {
    return { ok: false, error: 'the file could not be read as CSV or XLSX', rows: [], errors: [] };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) {
    return { ok: false, error: 'the file has no learner rows', rows: [], errors: [] };
  }

  const columns = { firstName: 0, lastName: 0, lrn: 0 };
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];

  headerRow.eachCell((cell, column) => {
    const normalized = normalize(cellText(headerRow, column));
    headers.push(normalized);
    if (ALIASES.firstName.has(normalized)) columns.firstName = column;
    if (ALIASES.lastName.has(normalized)) columns.lastName = column;
    if (ALIASES.lrn.has(normalized)) columns.lrn = column;
  });

  if (!columns.firstName || !columns.lastName) {
    return {
      ok: false,
      error: `missing required columns: First Name and Last Name (found: ${headers.filter(Boolean).join(', ') || 'none'})`,
      rows: [],
      errors: [],
    };
  }

  const rows: RosterRowInput[] = [];
  const errors: RosterRowError[] = [];
  const seenLrn = new Map<string, number>();
  const seenName = new Map<string, number>();

  for (let index = 2; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);
    const firstName = cellText(row, columns.firstName);
    const lastName = cellText(row, columns.lastName);
    const rawLrn = columns.lrn ? cellText(row, columns.lrn).replace(/\s+/g, '') : '';

    if (!firstName && !lastName && !rawLrn) continue;

    if (!firstName || !lastName) {
      errors.push({ rowNumber: index, message: 'first name and last name are required' });
      continue;
    }
    if (firstName.length > 80 || lastName.length > 80) {
      errors.push({ rowNumber: index, message: 'name exceeds 80 characters' });
      continue;
    }
    if (rawLrn && !/^\d{12}$/.test(rawLrn)) {
      errors.push({ rowNumber: index, message: 'LRN must be exactly 12 digits' });
      continue;
    }

    if (rawLrn) {
      const duplicate = seenLrn.get(rawLrn);
      if (duplicate) {
        errors.push({
          rowNumber: index,
          message: `duplicate LRN ${rawLrn} (already on row ${duplicate})`,
        });
        continue;
      }
      seenLrn.set(rawLrn, index);
    } else {
      const key = `${lastName.toLowerCase()}|${firstName.toLowerCase()}`;
      const duplicate = seenName.get(key);
      if (duplicate) {
        errors.push({
          rowNumber: index,
          message: `duplicate learner name without LRN (already on row ${duplicate}); add an LRN`,
        });
        continue;
      }
      seenName.set(key, index);
    }

    rows.push({ rowNumber: index, firstName, lastName, lrn: rawLrn || null });
  }

  if (rows.length === 0 && errors.length === 0) {
    return { ok: false, error: 'the file has no learner rows', rows: [], errors: [] };
  }

  return { ok: true, rows, errors };
}
