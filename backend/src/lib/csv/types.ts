/**
 * Two supported amount encodings for v1:
 * - 'signed'        — single Amount column, negative = expense, positive = income.
 * - 'debit-credit'  — two columns (Withdrawal/Deposit); one is filled per row.
 *
 * 'expense-positive' (single unsigned column meaning "expense") is deliberately
 * out of scope for v1 to keep the surface small. Add when a preset needs it.
 */
export type AmountKind = 'signed' | 'debit-credit';

export interface DetectedColumns {
  presetName: string;
  date: string;
  description: string;
  amount: string | null;
  debit: string | null;
  credit: string | null;
  amountKind: AmountKind;
}

/**
 * A parsed, normalized row ready for downstream (categorization, dedup, DB).
 * amount is a signed decimal string with 2 fractional digits, e.g. "-450.00".
 */
export interface ParsedRow {
  index: number;
  date: string; // YYYY-MM-DD
  description: string;
  amount: string;
}

export interface ParseResult {
  detectedColumns: DetectedColumns;
  rows: ParsedRow[];
}

import { AppError } from '../../errors/AppError';

export class CsvParseError extends AppError {
  constructor(
    message: string,
    public readonly rowIndex?: number,
  ) {
    super(400, 'CSV_PARSE_ERROR', message, rowIndex !== undefined ? { rowIndex } : undefined);
  }
}
