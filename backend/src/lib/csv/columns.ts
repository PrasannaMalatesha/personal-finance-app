/**
 * Generic column-role detection for CSVs that don't match a known bank preset.
 * Header name → semantic role (date/description/amount/debit/credit) via a
 * case-insensitive alias table. Exact match wins over substring match.
 */
import type { DetectedColumns } from './types';
import { CsvParseError } from './types';

const DATE_ALIASES = [
  'date',
  'transaction date',
  'txn date',
  'posting date',
  'value date',
  'posted date',
];

const DESCRIPTION_ALIASES = [
  'description',
  'narration',
  'particulars',
  'details',
  'merchant',
  'payee',
  'memo',
];

const AMOUNT_ALIASES = ['amount', 'amt', 'value'];

const DEBIT_ALIASES = [
  'withdrawal',
  'withdrawal amt.',
  'withdrawal amount',
  'debit',
  'debit amount',
  'outflow',
];

const CREDIT_ALIASES = [
  'deposit',
  'deposit amt.',
  'deposit amount',
  'credit',
  'credit amount',
  'inflow',
];

function findHeader(headers: string[], aliases: string[]): string | null {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = lower.indexOf(alias);
    if (idx !== -1) return headers[idx]!;
  }
  for (const alias of aliases) {
    const idx = lower.findIndex((h) => h.includes(alias));
    if (idx !== -1) return headers[idx]!;
  }
  return null;
}

export function detectGenericColumns(headers: string[]): DetectedColumns {
  const date = findHeader(headers, DATE_ALIASES);
  const description = findHeader(headers, DESCRIPTION_ALIASES);
  const amount = findHeader(headers, AMOUNT_ALIASES);
  const debit = findHeader(headers, DEBIT_ALIASES);
  const credit = findHeader(headers, CREDIT_ALIASES);

  if (!date || !description) {
    throw new CsvParseError(
      `Could not detect required columns (date, description). Headers seen: ${headers.join(', ')}`,
    );
  }
  if (debit && credit) {
    return {
      presetName: 'generic',
      date,
      description,
      amount: null,
      debit,
      credit,
      amountKind: 'debit-credit',
    };
  }
  if (amount) {
    return {
      presetName: 'generic',
      date,
      description,
      amount,
      debit: null,
      credit: null,
      amountKind: 'signed',
    };
  }
  throw new CsvParseError(
    `Could not detect amount column (looked for Amount / Withdrawal + Deposit). Headers seen: ${headers.join(', ')}`,
  );
}
