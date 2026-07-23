import type { Pool } from 'pg';
import { parseCsvBuffer } from '../lib/csv';
import type { DetectedColumns, ParsedRow } from '../lib/csv';
import type { AccountsRepo } from '../repositories/accounts.repo';
import type { CategoriesRepo } from '../repositories/categories.repo';
import type { TransactionsRepo, DuplicateKey } from '../repositories/transactions.repo';
import type { ImportBatchesRepo, ImportBatchRow } from '../repositories/importBatches.repo';
import type { CategorizationService } from './categorization.service';
import { matchRules } from './categorization.service';
import type { PreviewTokenSigner } from '../lib/previewToken';
import type { Executor } from '../lib/tx';
import { withTransaction } from '../lib/tx';
import { NotFoundError, ValidationError } from '../errors/AppError';

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

export interface BatchPublic {
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

function toBatchPublic(row: ImportBatchRow): BatchPublic {
  return {
    id: row.id,
    accountId: row.account_id,
    filename: row.filename,
    rowCount: row.row_count,
    importedAt: row.imported_at.toISOString(),
    undoneAt: row.undone_at ? row.undone_at.toISOString() : null,
  };
}

export interface CsvImportServiceDeps {
  pool: Pool;
  accountsRepo: AccountsRepo;
  categoriesRepo: CategoriesRepo;
  transactionsRepo: TransactionsRepo;
  importBatchesRepo: ImportBatchesRepo;
  categorization: CategorizationService;
  previewTokenSigner: PreviewTokenSigner;
}

export function createCsvImportService(deps: CsvImportServiceDeps) {
  const {
    pool,
    accountsRepo,
    categoriesRepo,
    transactionsRepo,
    importBatchesRepo,
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

  /**
   * Commit: verify the previewToken (which binds the parsed rows to userId +
   * accountId), merge the user's per-row edits (categoryId + skip only —
   * date/description/amount always come from the token, so the client cannot
   * rewrite money mid-flight, TRD §7.1 I7), and INSERT the batch row + all
   * non-skipped transactions inside a single Postgres transaction (§7.5.8).
   *
   * `executor` is optional: when called from the idempotency middleware the
   * outer transaction already exists and we reuse it. When called directly
   * (e.g. tests), we open our own withTransaction.
   */
  async function commit(
    userId: string,
    input: { previewToken: string; filename: string; rows: CommitRowEdit[] },
    executor?: Executor,
  ): Promise<CommitResult> {
    const decoded = previewTokenSigner.verify(input.previewToken, { userId });

    // Client edits keyed by row index.
    const editByIndex = new Map<number, CommitRowEdit>();
    for (const e of input.rows) {
      if (editByIndex.has(e.index)) {
        throw new ValidationError(`Duplicate edit for row ${e.index}`);
      }
      editByIndex.set(e.index, e);
    }

    // Merge edits onto the server-parsed rows. Rows without a matching edit
    // are included with categoryId=null.
    const merged = decoded.rows
      .map((r: ParsedRow) => {
        const e = editByIndex.get(r.index);
        return {
          date: r.date,
          description: r.description,
          amount: r.amount,
          categoryId: e?.categoryId ?? null,
          skip: e?.skip === true,
        };
      })
      .filter((r) => !r.skip);
    const skipped = decoded.rows.length - merged.length;

    // Batch-verify category ownership for every unique categoryId cited.
    const uniqueCatIds = Array.from(
      new Set(merged.map((r) => r.categoryId).filter((v): v is string => v !== null)),
    );
    if (uniqueCatIds.length > 0) {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM categories
         WHERE user_id = $1 AND id = ANY($2::uuid[])`,
        [userId, uniqueCatIds],
      );
      if (Number(rows[0]?.count ?? '0') !== uniqueCatIds.length) {
        throw new NotFoundError('Category');
      }
    }

    // Verify the account still belongs to the user; between preview (5m TTL)
    // and commit it could have been deleted. Cleaner than trapping FK 23503.
    const account = await accountsRepo.findByIdForUser(decoded.accountId, userId);
    if (!account) throw new NotFoundError('Account');

    const runInTx = async (client: Executor): Promise<CommitResult> => {
      const batch = await importBatchesRepo.create(
        {
          accountId: decoded.accountId,
          filename: input.filename,
          rowCount: merged.length,
        },
        client,
      );
      await transactionsRepo.bulkCreate(
        {
          accountId: decoded.accountId,
          importBatchId: batch.id,
          rows: merged.map((m) => ({
            date: m.date,
            description: m.description,
            amount: m.amount,
            categoryId: m.categoryId,
          })),
        },
        client,
      );
      return { importBatchId: batch.id, inserted: merged.length, skipped };
    };

    return executor
      ? runInTx(executor)
      : withTransaction(pool, (client) => runInTx(client));
  }

  async function list(
    userId: string,
    filter: { accountId?: string },
  ): Promise<BatchPublic[]> {
    const rows = await importBatchesRepo.listForUser(userId, filter);
    return rows.map(toBatchPublic);
  }

  /**
   * Undo: DELETE all transactions belonging to the batch and set undone_at.
   * If already undone, short-circuit with a no-op — the endpoint is naturally
   * idempotent (TRD §7.3), so repeated calls after success are safe.
   */
  async function undo(userId: string, batchId: string): Promise<UndoResult> {
    const batch = await importBatchesRepo.findByIdForUser(batchId, userId);
    if (!batch) throw new NotFoundError('ImportBatch');
    if (batch.undone_at) {
      return { batchId: batch.id, deleted: 0, alreadyUndone: true };
    }
    return withTransaction(pool, async (client) => {
      const deleted = await transactionsRepo.deleteByBatchIdForUser(
        batch.id,
        userId,
        client,
      );
      await importBatchesRepo.markUndone(batch.id, client);
      return { batchId: batch.id, deleted, alreadyUndone: false };
    });
  }

  return { preview, commit, list, undo };
}

export type CsvImportService = ReturnType<typeof createCsvImportService>;
