import { CsvParseError } from './types';

export type DateFormat = 'DMY' | 'MDY' | 'YMD';

/**
 * Turn a raw date cell into canonical YYYY-MM-DD.
 * Handles two-digit years (20xx), separators - / .
 * Never uses Date parsing — Date's format guessing is timezone-sensitive.
 */
export function normalizeDate(raw: string, format: DateFormat): string {
  const cleaned = raw.trim();
  const parts = cleaned.split(/[-/.]/);
  if (parts.length !== 3) throw new CsvParseError(`Bad date: ${raw}`);

  let day: string;
  let month: string;
  let year: string;
  if (format === 'DMY') {
    [day, month, year] = parts as [string, string, string];
  } else if (format === 'MDY') {
    [month, day, year] = parts as [string, string, string];
  } else {
    [year, month, day] = parts as [string, string, string];
  }

  if (year.length === 2) year = '20' + year;

  day = day.padStart(2, '0');
  month = month.padStart(2, '0');

  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (
    !Number.isInteger(y) ||
    y < 1900 ||
    y > 2999 ||
    !Number.isInteger(m) ||
    m < 1 ||
    m > 12 ||
    !Number.isInteger(d) ||
    d < 1 ||
    d > 31
  ) {
    throw new CsvParseError(`Bad date: ${raw}`);
  }
  return `${year}-${month}-${day}`;
}

/**
 * Normalize a signed money string to `-?\d+\.\d{2}`. Pure string math — no
 * floats — so we don't inherit IEEE-754 drift from Number parsing (TRD §7.4).
 * Accepts:  1,234.56  · (1,234.56)  · -1234.5  · +₹1,234  · ""
 */
export function normalizeAmount(raw: string): string {
  let s = raw.trim();
  if (s === '') return '0.00';

  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[,\s]/g, '').replace(/[₹$€£¥]/g, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) throw new CsvParseError(`Bad amount: ${raw}`);

  const [intPart, fracRaw = ''] = s.split('.') as [string, string];
  let frac = fracRaw;
  if (frac.length > 2) frac = frac.slice(0, 2);
  else frac = frac.padEnd(2, '0');

  const intClean = intPart.replace(/^0+(?=\d)/, '');
  const magnitude = `${intClean}.${frac}`;
  if (magnitude === '0.00') return '0.00';
  return negative ? `-${magnitude}` : magnitude;
}

/** Collapse internal whitespace and trim. */
export function normalizeDescription(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}
