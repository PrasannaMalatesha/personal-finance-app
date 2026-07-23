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

export const PRESETS: readonly BankPreset[] = [HDFC, CHASE];

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
