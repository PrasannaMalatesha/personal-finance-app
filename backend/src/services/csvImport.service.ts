import { parseCsvBuffer } from '../lib/csv';
import type { DetectedColumns, ParsedRow } from '../lib/csv';
import type { AccountsRepo } from '../repositories/accounts.repo';
import type { CategoriesRepo } from '../repositories/categories.repo';
import type { TransactionsRepo, DuplicateKey } from '../repositories/transactions.repo';
import type { CategorizationService } from './categorization.service';
import { matchRules } from './categorization.service';
import type { PreviewTokenSigner } from '../lib/previewToken';
import { NotFoundError } from '../errors/AppError';

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

export interface CsvImportServiceDeps {
  accountsRepo: AccountsRepo;
  categoriesRepo: CategoriesRepo;
  transactionsRepo: TransactionsRepo;
  categorization: CategorizationService;
  previewTokenSigner: PreviewTokenSigner;
}

export function createCsvImportService(deps: CsvImportServiceDeps) {
  const {
    accountsRepo,
    categoriesRepo,
    transactionsRepo,
    categorization,
    previewTokenSigner,
  } = deps;

  /**
   * Preview: parse the CSV, propose categories via the rule engine, flag
   * duplicates against existing transactions on the same account, and return
   * a signed previewToken so commit can round-trip without a re-upload.
   *
   * Never writes to the DB.
   */
  async function preview(
    userId: string,
    accountId: string,
    buffer: Buffer,
  ): Promise<PreviewResult> {
    const account = await accountsRepo.findByIdForUser(accountId, userId);
    if (!account) throw new NotFoundError('Account');

    const parsed = parseCsvBuffer(buffer);

    const [rules, categories] = await Promise.all([
      categorization.loadRules(userId),
      categoriesRepo.listByUser(userId),
    ]);
    const categoryNameById = new Map<string, string>(
      categories.map((c) => [c.id, c.name] as const),
    );

    const dedupKeys: DuplicateKey[] = parsed.rows.map((r) => ({
      date: r.date,
      amount: r.amount,
      description: r.description,
    }));
    const dupes = await transactionsRepo.findDuplicateKeys(accountId, dedupKeys);
    const dupeMap = new Map<string, string>();
    for (const d of dupes) {
      dupeMap.set(`${d.date}|${d.amount}|${d.description}`, d.id);
    }

    const rows: PreviewRow[] = parsed.rows.map((r: ParsedRow) => {
      const match = matchRules(rules, r.description);
      const dupeId = dupeMap.get(`${r.date}|${r.amount}|${r.description}`) ?? null;
      return {
        index: r.index,
        date: r.date,
        description: r.description,
        amount: r.amount,
        proposedCategoryId: match?.categoryId ?? null,
        proposedCategoryName: match ? categoryNameById.get(match.categoryId) ?? null : null,
        matchedRuleId: match?.ruleId ?? null,
        isDuplicate: dupeId !== null,
        duplicateOfTransactionId: dupeId,
      };
    });

    const signed = previewTokenSigner.sign({
      userId,
      accountId,
      rows: parsed.rows,
    });

    return {
      detectedColumns: parsed.detectedColumns,
      rows,
      previewToken: signed.token,
      expiresInSec: signed.expiresInSec,
    };
  }

  return { preview };
}

export type CsvImportService = ReturnType<typeof createCsvImportService>;
