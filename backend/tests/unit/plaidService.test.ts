import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import type { Pool } from 'pg';
import { createPlaidService } from '../../src/services/plaid.service';
import type { PlaidAdapter, PlaidAccountRaw, PlaidTransactionRaw } from '../../src/lib/plaidAdapter';
import type { PlaidItemsRepo, PlaidItemRow } from '../../src/repositories/plaidItems.repo';
import type { AccountsRepo } from '../../src/repositories/accounts.repo';
import type { UsersRepo, UserRow } from '../../src/repositories/users.repo';
import type { CategorizationService } from '../../src/services/categorization.service';

const silentLogger = pino({ level: 'silent' });

/**
 * The service opens one DB transaction per sync page for INSERTing txns.
 * A fake pool that just runs the callback with a stub client is enough —
 * we're validating the sequence of adapter/repo/queries, not real SQL.
 */
function fakePool(inserted: string[]): Pool {
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (/INSERT INTO transactions/.test(sql)) {
        const plaidTxId = params?.[5] as string;
        if (inserted.includes(plaidTxId)) {
          // Simulate the partial-unique violation.
          const err: Error & { code?: string } = new Error('duplicate');
          err.code = '23505';
          throw err;
        }
        inserted.push(plaidTxId);
        return { rowCount: 1, rows: [] };
      }
      if (/UPDATE transactions/.test(sql)) return { rowCount: 1, rows: [] };
      if (/DELETE FROM transactions/.test(sql)) return { rowCount: 1, rows: [] };
      return { rowCount: 0, rows: [] };
    }),
    release: vi.fn(),
  };
  return {
    connect: async () => client,
    query: vi.fn(),
  } as unknown as Pool;
}

const userRow: UserRow = {
  id: 'user-1',
  email: 'u@example.com',
  password_hash: 'hash',
  base_currency: 'USD',
  google_sub: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const item: PlaidItemRow = {
  id: 'item-db-1',
  user_id: 'user-1',
  item_id: 'plaid-item-1',
  access_token: 'access-token-abc',
  institution_id: 'ins_1',
  institution_name: 'Test Bank',
  cursor: null,
  last_synced_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const plaidAccount: PlaidAccountRaw = {
  account_id: 'plaid-acct-1',
  name: 'Checking',
  official_name: 'Plaid Checking',
  type: 'depository',
  subtype: 'checking',
  balances: { available: 100, current: 110, iso_currency_code: 'USD' },
};

const plaidTx: PlaidTransactionRaw = {
  transaction_id: 'plaid-tx-1',
  account_id: 'plaid-acct-1',
  date: '2026-08-01',
  name: 'Coffee',
  amount: 4.5, // Plaid convention: outflow
  iso_currency_code: 'USD',
  pending: false,
};

function makeMocks(overrides: {
  adapter?: Partial<PlaidAdapter>;
  itemsRepo?: Partial<PlaidItemsRepo>;
  accountsRepo?: Partial<AccountsRepo>;
} = {}) {
  const adapter: PlaidAdapter = {
    createLinkToken: vi.fn(async () => ({ linkToken: 'link-abc', expiration: '2026-08-01' })),
    exchangePublicToken: vi.fn(async () => ({ itemId: 'plaid-item-1', accessToken: 'access-token-abc' })),
    getItem: vi.fn(async () => ({ institutionId: 'ins_1', institutionName: 'Test Bank' })),
    getAccounts: vi.fn(async () => [plaidAccount]),
    syncTransactions: vi.fn(async () => ({
      added: [plaidTx],
      modified: [],
      removed: [],
      nextCursor: 'cursor-2',
      hasMore: false,
    })),
    removeItem: vi.fn(async () => {}),
    ...overrides.adapter,
  };
  const itemsRepo: PlaidItemsRepo = {
    listByUser: vi.fn(async () => [item]),
    findByIdForUser: vi.fn(async () => item),
    upsertByItemId: vi.fn(async () => item),
    updateCursor: vi.fn(async () => {}),
    deleteById: vi.fn(async () => true),
    ...overrides.itemsRepo,
  };
  const accountsRepo: AccountsRepo = {
    listByUser: vi.fn(async () => []),
    findByIdForUser: vi.fn(),
    create: vi.fn(async (input) => ({
      id: 'local-acct-1',
      user_id: input.userId,
      name: input.name,
      type: input.type,
      currency: input.currency,
      opening_balance: input.openingBalance,
      plaid_account_id: input.plaidAccountId ?? null,
      plaid_item_id: input.plaidItemId ?? null,
      created_at: new Date(),
      updated_at: new Date(),
    })),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides.accountsRepo,
  };
  const usersRepo = {
    findById: vi.fn(async () => userRow),
    findByEmail: vi.fn(),
    create: vi.fn(),
    updatePasswordHash: vi.fn(),
  } as unknown as UsersRepo;
  const categorization = {
    loadRules: vi.fn(async () => []),
    categorize: vi.fn(),
  } as unknown as CategorizationService;
  return { adapter, itemsRepo, accountsRepo, usersRepo, categorization };
}

describe('PlaidService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createLinkToken delegates to the adapter', async () => {
    const { adapter, itemsRepo, accountsRepo, usersRepo, categorization } = makeMocks();
    const svc = createPlaidService({
      pool: fakePool([]),
      plaidAdapter: adapter,
      plaidItemsRepo: itemsRepo,
      accountsRepo,
      usersRepo,
      categorization,
      logger: silentLogger,
      clientName: 'PFA Test',
    });
    const res = await svc.createLinkToken('user-1');
    expect(res.linkToken).toBe('link-abc');
    expect(adapter.createLinkToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', clientName: 'PFA Test' }),
    );
  });

  it('exchangePublicToken: exchanges → looks up institution → upserts item → triggers sync', async () => {
    const inserted: string[] = [];
    const { adapter, itemsRepo, accountsRepo, usersRepo, categorization } = makeMocks();
    const svc = createPlaidService({
      pool: fakePool(inserted),
      plaidAdapter: adapter,
      plaidItemsRepo: itemsRepo,
      accountsRepo,
      usersRepo,
      categorization,
      logger: silentLogger,
      clientName: 'PFA Test',
    });

    await svc.exchangePublicToken('user-1', 'public-token-xyz');
    expect(adapter.exchangePublicToken).toHaveBeenCalledWith('public-token-xyz');
    expect(adapter.getItem).toHaveBeenCalled();
    expect(itemsRepo.upsertByItemId).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        itemId: 'plaid-item-1',
        accessToken: 'access-token-abc',
        institutionName: 'Test Bank',
      }),
    );
    // The follow-on sync should have inserted the Plaid transaction.
    expect(inserted).toContain('plaid-tx-1');
    expect(itemsRepo.updateCursor).toHaveBeenCalledWith('item-db-1', 'cursor-2');
  });

  it('syncItem creates a local account with correct type/currency/plaid_account_id mapping', async () => {
    const { adapter, itemsRepo, accountsRepo, usersRepo, categorization } = makeMocks();
    const svc = createPlaidService({
      pool: fakePool([]),
      plaidAdapter: adapter,
      plaidItemsRepo: itemsRepo,
      accountsRepo,
      usersRepo,
      categorization,
      logger: silentLogger,
      clientName: 'PFA Test',
    });
    await svc.syncItem('user-1', 'item-db-1');
    expect(accountsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'checking',
        currency: 'USD',
        plaidAccountId: 'plaid-acct-1',
        plaidItemId: 'item-db-1',
      }),
    );
  });

  it('negates Plaid amounts (outflow=+ becomes -) when inserting', async () => {
    const inserted: string[] = [];
    const pool = fakePool(inserted);
    let capturedAmount: string | null = null;
    const client = await pool.connect();
    // Wrap the client.query mock so we can peek at INSERT params.
    (client.query as ReturnType<typeof vi.fn>).mockImplementation(
      async (sql: string, params?: unknown[]) => {
        if (/INSERT INTO transactions/.test(sql)) {
          capturedAmount = params?.[3] as string;
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      },
    );
    const { adapter, itemsRepo, accountsRepo, usersRepo, categorization } = makeMocks();
    const svc = createPlaidService({
      pool,
      plaidAdapter: adapter,
      plaidItemsRepo: itemsRepo,
      accountsRepo,
      usersRepo,
      categorization,
      logger: silentLogger,
      clientName: 'PFA Test',
    });
    await svc.syncItem('user-1', 'item-db-1');
    expect(capturedAmount).toBe('-4.50');
  });

  it('re-sync is idempotent — duplicate plaid_transaction_ids do not throw', async () => {
    const inserted: string[] = ['plaid-tx-1']; // pretend already inserted
    const { adapter, itemsRepo, accountsRepo, usersRepo, categorization } = makeMocks();
    const svc = createPlaidService({
      pool: fakePool(inserted),
      plaidAdapter: adapter,
      plaidItemsRepo: itemsRepo,
      accountsRepo,
      usersRepo,
      categorization,
      logger: silentLogger,
      clientName: 'PFA Test',
    });
    const res = await svc.syncItem('user-1', 'item-db-1');
    // duplicate silently absorbed → count stays 0
    expect(res.added).toBe(0);
  });

  it('paginates via cursor until hasMore=false', async () => {
    const syncSpy = vi.fn(async (_: string, cursor: string | null) => {
      if (cursor === null) {
        return {
          added: [{ ...plaidTx, transaction_id: 'p1' }],
          modified: [],
          removed: [],
          nextCursor: 'cur-1',
          hasMore: true,
        };
      }
      return {
        added: [{ ...plaidTx, transaction_id: 'p2' }],
        modified: [],
        removed: [],
        nextCursor: 'cur-2',
        hasMore: false,
      };
    });
    const { adapter, itemsRepo, accountsRepo, usersRepo, categorization } = makeMocks({
      adapter: { syncTransactions: syncSpy },
    });
    const svc = createPlaidService({
      pool: fakePool([]),
      plaidAdapter: adapter,
      plaidItemsRepo: itemsRepo,
      accountsRepo,
      usersRepo,
      categorization,
      logger: silentLogger,
      clientName: 'PFA Test',
    });
    const res = await svc.syncItem('user-1', 'item-db-1');
    expect(syncSpy).toHaveBeenCalledTimes(2);
    expect(res.added).toBe(2);
    expect(itemsRepo.updateCursor).toHaveBeenLastCalledWith('item-db-1', 'cur-2');
  });
});
