import type { Executor } from '../lib/tx';
import type {
  TransactionsRepo,
  TransactionRow,
} from '../repositories/transactions.repo';
import type { AccountsRepo } from '../repositories/accounts.repo';
import type { CategoriesRepo } from '../repositories/categories.repo';
import type { CategorizationService } from './categorization.service';
import type {
  CreateTransactionInput,
  ListTransactionsQuery,
  TransactionPublic,
  UpdateTransactionInput,
} from '../schemas/transactions';
import { NotFoundError, ValidationError } from '../errors/AppError';

interface Cursor {
  d: string;
  i: string;
}

function encodeCursor(row: TransactionRow): string {
  const payload: Cursor = { d: row.date, i: row.id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(raw: string): { date: string; id: string } {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as Cursor;
    if (
      typeof parsed.d !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(parsed.d) ||
      typeof parsed.i !== 'string'
    ) {
      throw new Error('bad cursor');
    }
    return { date: parsed.d, id: parsed.i };
  } catch {
    throw new ValidationError('Invalid cursor');
  }
}

function toPublic(row: TransactionRow): TransactionPublic {
  return {
    id: row.id,
    accountId: row.account_id,
    date: row.date,
    description: row.description,
    amount: row.amount,
    categoryId: row.category_id,
    importBatchId: row.import_batch_id,
    createdAt: row.created_at.toISOString(),
  };
}

export interface TransactionsServiceDeps {
  transactionsRepo: TransactionsRepo;
  accountsRepo: AccountsRepo;
  categoriesRepo: CategoriesRepo;
  categorization: CategorizationService;
}

export function createTransactionsService(deps: TransactionsServiceDeps) {
  const { transactionsRepo, accountsRepo, categoriesRepo, categorization } = deps;

  async function assertAccountOwned(userId: string, accountId: string): Promise<void> {
    const acc = await accountsRepo.findByIdForUser(accountId, userId);
    if (!acc) throw new NotFoundError('Account');
  }

  async function assertCategoryOwned(
    userId: string,
    categoryId: string,
  ): Promise<void> {
    const cat = await categoriesRepo.findByIdForUser(categoryId, userId);
    if (!cat) throw new NotFoundError('Category');
  }

  async function list(
    userId: string,
    query: ListTransactionsQuery,
  ): Promise<{ items: TransactionPublic[]; nextCursor: string | null }> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    const rows = await transactionsRepo.listForUser({
      userId,
      accountId: query.accountId,
      categoryId: query.categoryId,
      from: query.from,
      to: query.to,
      cursor,
      limit: query.limit,
    });

    const nextCursor =
      rows.length === query.limit ? encodeCursor(rows[rows.length - 1]!) : null;

    return { items: rows.map(toPublic), nextCursor };
  }

  async function create(
    userId: string,
    input: CreateTransactionInput,
    executor?: Executor,
  ): Promise<TransactionPublic> {
    await assertAccountOwned(userId, input.accountId);

    let categoryId: string | null;
    if (input.categoryId === undefined) {
      // Not supplied — run rule engine.
      categoryId = await categorization.categorize(
        userId,
        input.description,
        executor,
      );
    } else if (input.categoryId === null) {
      categoryId = null;
    } else {
      await assertCategoryOwned(userId, input.categoryId);
      categoryId = input.categoryId;
    }

    const row = await transactionsRepo.create(
      {
        accountId: input.accountId,
        date: input.date,
        description: input.description,
        amount: input.amount,
        categoryId,
      },
      executor,
    );
    return toPublic(row);
  }

  async function update(
    userId: string,
    id: string,
    patch: UpdateTransactionInput,
  ): Promise<{ transaction: TransactionPublic; previousCategoryId: string | null }> {
    if (patch.accountId !== undefined) {
      await assertAccountOwned(userId, patch.accountId);
    }
    if (patch.categoryId !== undefined && patch.categoryId !== null) {
      await assertCategoryOwned(userId, patch.categoryId);
    }
    // Peek before the update so the controller can tell whether the user
    // just made a categorization decision worth learning from.
    const existing = await transactionsRepo.findByIdForUser(id, userId);
    if (!existing) throw new NotFoundError('Transaction');
    const row = await transactionsRepo.updateForUser(id, userId, patch);
    if (!row) throw new NotFoundError('Transaction');
    return { transaction: toPublic(row), previousCategoryId: existing.category_id };
  }

  async function remove(userId: string, id: string): Promise<void> {
    const deleted = await transactionsRepo.deleteForUser(id, userId);
    if (!deleted) throw new NotFoundError('Transaction');
  }

  return { list, create, update, remove };
}

export type TransactionsService = ReturnType<typeof createTransactionsService>;
