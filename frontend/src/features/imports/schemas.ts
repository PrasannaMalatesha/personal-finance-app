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

export interface PreviewRow {
  index: number;
  date: string;
  description: string;
  amount: string;
  proposedCategoryId: string | null;
  proposedCategoryName: string | null;
  matchedRuleId: string | null;
  isDuplicate: boolean;
  duplicateOfTransactionId: string | null;
}

export interface PreviewResult {
  detectedColumns: DetectedColumns;
  rows: PreviewRow[];
  previewToken: string;
  expiresInSec: number;
}

export interface CommitRowEdit {
  index: number;
  categoryId?: string | null;
  skip?: boolean;
}

export interface CommitResult {
  importBatchId: string;
  inserted: number;
  skipped: number;
}

export interface ImportBatch {
  id: string;
  accountId: string;
  filename: string;
  rowCount: number;
  importedAt: string;
  undoneAt: string | null;
}

export interface UndoResult {
  batchId: string;
  deleted: number;
  alreadyUndone: boolean;
}
