import type { Executor } from '../lib/tx';
import type {
  AccountsRepo,
  AccountRow,
  AccountWithBalanceRow,
} from '../repositories/accounts.repo';
import type { UsersRepo } from '../repositories/users.repo';
import type {
  AccountPublic,
  CreateAccountInput,
  UpdateAccountInput,
} from '../schemas/accounts';
import { CURRENCY_CODES, type CurrencyCode } from '../schemas/auth';
import { ConflictError, NotFoundError } from '../errors/AppError';

function asCurrencyCode(raw: string): CurrencyCode {
  const trimmed = raw.trim();
  if (!(CURRENCY_CODES as readonly string[]).includes(trimmed)) {
    throw new Error(`Unexpected currency in DB: ${raw}`);
  }
  return trimmed as CurrencyCode;
}

function toAccountPublic(row: AccountWithBalanceRow): AccountPublic {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: asCurrencyCode(row.currency),
    openingBalance: row.opening_balance,
    currentBalance: row.current_balance,
    createdAt: row.created_at.toISOString(),
  };
}

function toAccountPublicFromRow(row: AccountRow): AccountPublic {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    currency: asCurrencyCode(row.currency),
    openingBalance: row.opening_balance,
    currentBalance: row.opening_balance, // no transactions yet on create
    createdAt: row.created_at.toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

export interface AccountsServiceDeps {
  accountsRepo: AccountsRepo;
  usersRepo: UsersRepo;
}

export function createAccountsService(deps: AccountsServiceDeps) {
  const { accountsRepo, usersRepo } = deps;

  async function list(userId: string): Promise<AccountPublic[]> {
    const rows = await accountsRepo.listByUser(userId);
    return rows.map(toAccountPublic);
  }

  async function create(
    userId: string,
    input: CreateAccountInput,
    executor?: Executor,
  ): Promise<AccountPublic> {
    let currency = input.currency;
    if (!currency) {
      const user = await usersRepo.findById(userId);
      if (!user) throw new NotFoundError('User');
      currency = asCurrencyCode(user.base_currency);
    }
    try {
      const row = await accountsRepo.create(
        {
          userId,
          name: input.name,
          type: input.type,
          currency,
          openingBalance: input.openingBalance,
        },
        executor,
      );
      return toAccountPublicFromRow(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(`Account '${input.name}' already exists`);
      }
      throw err;
    }
  }

  async function update(
    userId: string,
    id: string,
    patch: UpdateAccountInput,
  ): Promise<AccountPublic> {
    try {
      const row = await accountsRepo.update(id, userId, patch);
      if (!row) throw new NotFoundError('Account');
      // Fetch with balance
      const withBalance = await accountsRepo.findByIdForUser(id, userId);
      if (!withBalance) throw new NotFoundError('Account');
      return toAccountPublic(withBalance);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('Account name already exists');
      }
      throw err;
    }
  }

  async function remove(userId: string, id: string): Promise<void> {
    const deleted = await accountsRepo.delete(id, userId);
    if (!deleted) throw new NotFoundError('Account');
  }

  return { list, create, update, remove };
}

export type AccountsService = ReturnType<typeof createAccountsService>;
