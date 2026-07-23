import type { DetectedColumns } from './types';
import type { DateFormat } from './normalize';

export interface BankPreset {
  name: string;
  /**
   * Every listed header (case-insensitive) must appear in the file's header row
   * for the preset to match. Distinct enough to avoid confusion with generic.
   */
  signature: string[];
  columns: DetectedColumns;
  dateFormat: DateFormat;
}

export const HDFC: BankPreset = {
  name: 'HDFC',
  signature: ['Narration', 'Withdrawal Amt.', 'Deposit Amt.'],
  columns: {
    presetName: 'HDFC',
    date: 'Date',
    description: 'Narration',
    amount: null,
    debit: 'Withdrawal Amt.',
    credit: 'Deposit Amt.',
    amountKind: 'debit-credit',
  },
  dateFormat: 'DMY',
};

export const CHASE: BankPreset = {
  name: 'Chase',
  signature: ['Posting Date', 'Description', 'Amount', 'Type'],
  columns: {
    presetName: 'Chase',
    date: 'Posting Date',
    description: 'Description',
    amount: 'Amount',
    debit: null,
    credit: null,
    amountKind: 'signed',
  },
  dateFormat: 'MDY',
};

// Column names below reflect the most common export layouts seen in the wild.
// Real files vary — signature matching is generous (exact case-insensitive
// match on all listed headers). If a preset misses, we fall back to generic
// column detection.

export const ICICI: BankPreset = {
  name: 'ICICI',
  signature: ['Transaction Date', 'Transaction Remarks', 'Withdrawal Amount', 'Deposit Amount'],
  columns: {
    presetName: 'ICICI',
    date: 'Transaction Date',
    description: 'Transaction Remarks',
    amount: null,
    debit: 'Withdrawal Amount',
    credit: 'Deposit Amount',
    amountKind: 'debit-credit',
  },
  dateFormat: 'DMY',
};

export const SBI: BankPreset = {
  name: 'SBI',
  signature: ['Txn Date', 'Ref No./Cheque No.', 'Debit', 'Credit'],
  columns: {
    presetName: 'SBI',
    date: 'Txn Date',
    description: 'Description',
    amount: null,
    debit: 'Debit',
    credit: 'Credit',
    amountKind: 'debit-credit',
  },
  dateFormat: 'DMY',
};

export const BOFA: BankPreset = {
  name: 'BankOfAmerica',
  signature: ['Date', 'Description', 'Amount', 'Running Bal.'],
  columns: {
    presetName: 'BankOfAmerica',
    date: 'Date',
    description: 'Description',
    amount: 'Amount',
    debit: null,
    credit: null,
    amountKind: 'signed',
  },
  dateFormat: 'MDY',
};

export const WELLS_FARGO: BankPreset = {
  name: 'WellsFargo',
  signature: ['Trans Date', 'Post Date', 'Amount', 'Description'],
  columns: {
    presetName: 'WellsFargo',
    date: 'Post Date',
    description: 'Description',
    amount: 'Amount',
    debit: null,
    credit: null,
    amountKind: 'signed',
  },
  dateFormat: 'MDY',
};

export const PRESETS: readonly BankPreset[] = [HDFC, ICICI, SBI, CHASE, BOFA, WELLS_FARGO];

export function detectPreset(headers: string[]): BankPreset | null {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const preset of PRESETS) {
    const ok = preset.signature.every((sig) =>
      lower.includes(sig.trim().toLowerCase()),
    );
    if (ok) return preset;
  }
  return null;
}
