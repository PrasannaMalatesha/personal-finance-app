import Decimal from 'decimal.js';
import type { Pool } from 'pg';
import type { Logger } from 'pino';
import type { PlaidAdapter, PlaidAccountRaw } from '../lib/plaidAdapter';
import type { PlaidItemsRepo, PlaidItemRow } from '../repositories/plaidItems.repo';
import type { AccountsRepo, AccountType } from '../repositories/accounts.repo';
import type { UsersRepo } from '../repositories/users.repo';
import type { CategorizationService } from './categorization.service';
import { categorizeWithRules } from './categorization.service';
import { CURRENCY_CODES, type CurrencyCode } from '../schemas/auth';
import { withTransaction } from '../lib/tx';
import { NotFoundError } from '../errors/AppError';

export interface PlaidServiceDeps {
  pool: Pool;
  plaidAdapter: PlaidAdapter;
  plaidItemsRepo: PlaidItemsRepo;
  accountsRepo: AccountsRepo;
  usersRepo: UsersRepo;
  categorization: CategorizationService;
  logger: Logger;
  clientName: string;
}

export interface PlaidLinkTokenResult {
  linkToken: string;
  expiration: string;
}

export interface PlaidSyncResult {
  added: number;
  modified: number;
  removed: number;
  accountsUpserted: number;
}

// Plaid subtype → our fixed enum. Unknown types collapse to 'checking';
// depository-savings is 'savings'; credit lines are 'credit_card'.
function mapAccountType(type: string, subtype: string | null): AccountType {
  if (type === 'credit') return 'credit_card';
  if (type === 'depository' && subtype === 'savings') return 'savings';
  return 'checking';
}

function mapCurrency(iso: string | null, userBase: CurrencyCode, logger: Logger): CurrencyCode {
  if (!iso) return userBase;
  const upper = iso.toUpperCase();
  if ((CURRENCY_CODES as readonly string[]).includes(upper)) {
    return upper as CurrencyCode;
  }
  logger.warn(
    { plaidCurrency: iso, fallback: userBase },
    'Plaid returned an unsupported currency — using user base_currency',
  );
  return userBase;
}

// Plaid convention: amount > 0 is money leaving the account (expense);
// amount < 0 is money entering (income). Our convention is the opposite —
// income is positive, expenses are negative — so we negate the sign.
function toAppAmount(plaidAmount: number): string {
  return new Decimal(plaidAmount).neg().toFixed(2);
}

export function createPlaidService(deps: PlaidServiceDeps) {
  const {
    pool,
    plaidAdapter,
    plaidItemsRepo,
    accountsRepo,
    usersRepo,
    categorization,
    logger,
    clientName,
  } = deps;

  async function createLinkToken(userId: string): Promise<PlaidLinkTokenResult> {
    return plaidAdapter.createLinkToken({ userId, clientName });
  }

  async function exchangePublicToken(
    userId: string,
    publicToken: string,
  ): Promise<PlaidItemRow> {
    const { itemId, accessToken } = await plaidAdapter.exchangePublicToken(publicToken);
    const { institutionId, institutionName } = await plaidAdapter.getItem(accessToken);
    const item = await plaidItemsRepo.upsertByItemId({
      userId,
      itemId,
      accessToken,
      institutionId,
      institutionName,
    });
    // First-time sync populates accounts and pulls historical transactions.
    // Failure here is logged but not thrown — the item is linked; the user
    // can retry sync from the UI.
    try {
      await syncItem(userId, item.id);
    } catch (err) {
      logger.error({ err, itemId: item.id }, 'Initial Plaid sync failed');
    }
    return (await plaidItemsRepo.findByIdForUser(item.id, userId))!;
  }

  async function upsertAccountsFor(
    userId: string,
    itemDbId: string,
    plaidAccounts: PlaidAccountRaw[],
    userBase: CurrencyCode,
  ): Promise<Map<string, string>> {
    // plaid_account_id → our internal account id, needed to map transactions.
    const mapping = new Map<string, string>();
    const existing = await accountsRepo.listByUser(userId);
    const byPlaidId = new Map<string, string>();
    for (const a of existing) {
      if (a.plaid_account_id) byPlaidId.set(a.plaid_account_id, a.id);
    }

    for (const pa of plaidAccounts) {
      const already = byPlaidId.get(pa.account_id);
      if (already) {
        mapping.set(pa.account_id, already);
        continue;
      }
      // Fresh Plaid account — create locally. opening_balance stays 0; the
      // computed current_balance grows as transactions sync in. Slightly
      // divergent from Plaid's live figure until full history lands.
      const name = pa.official_name || pa.name;
      const created = await accountsRepo.create({
        userId,
        name: uniqueName(name, new Set(existing.map((e) => e.name))),
        type: mapAccountType(pa.type, pa.subtype),
        currency: mapCurrency(pa.balances.iso_currency_code, userBase, logger),
        openingBalance: '0',
        plaidAccountId: pa.account_id,
        plaidItemId: itemDbId,
      });
      mapping.set(pa.account_id, created.id);
      existing.push({ ...created, current_balance: created.opening_balance });
    }
    return mapping;
  }

  function uniqueName(base: string, taken: Set<string>): string {
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base} (${i})`)) i++;
    return `${base} (${i})`;
  }

  async function syncItem(userId: string, itemDbId: string): Promise<PlaidSyncResult> {
    const item = await plaidItemsRepo.findByIdForUser(itemDbId, userId);
    if (!item) throw new NotFoundError('PlaidItem');

    const user = await usersRepo.findById(userId);
    if (!user) throw new NotFoundError('User');
    const userBase = (user.base_currency.trim() as CurrencyCode) || 'USD';

    const plaidAccounts = await plaidAdapter.getAccounts(item.access_token);
    const idMap = await upsertAccountsFor(userId, item.id, plaidAccounts, userBase);
    const accountsUpserted = plaidAccounts.length;

    // Loop /transactions/sync until Plaid says no more pages.
    let cursor: string | null = item.cursor;
    let added = 0;
    let modified = 0;
    let removed = 0;
    // Load rules once — no point hitting the DB per transaction.
    const rules = await categorization.loadRules(userId);

    for (;;) {
      const page = await plaidAdapter.syncTransactions(item.access_token, cursor);

      await withTransaction(pool, async (client) => {
        // Additions — de-duped by the partial unique on plaid_transaction_id.
        for (const tx of page.added) {
          const localAccountId = idMap.get(tx.account_id);
          if (!localAccountId) continue; // account not tracked (shouldn't happen)
          const description = tx.merchant_name?.trim() || tx.name;
          const categoryId = categorizeWithRules(rules, description);
          try {
            await client.query(
              `INSERT INTO transactions
                 (account_id, date, description, amount, category_id, plaid_transaction_id)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                localAccountId,
                tx.date,
                description,
                toAppAmount(tx.amount),
                categoryId,
                tx.transaction_id,
              ],
            );
            added++;
          } catch (err: unknown) {
            // 23505 = unique violation on plaid_transaction_id — same txn
            // re-emitted by Plaid; silently skip so re-syncs are idempotent.
            const code = (err as { code?: string }).code;
            if (code !== '23505') throw err;
          }
        }
        // Modifications — update mutable fields on the matching row.
        for (const tx of page.modified) {
          const description = tx.merchant_name?.trim() || tx.name;
          const { rowCount } = await client.query(
            `UPDATE transactions
                SET date = $1, description = $2, amount = $3, updated_at = NOW()
              WHERE plaid_transaction_id = $4`,
            [tx.date, description, toAppAmount(tx.amount), tx.transaction_id],
          );
          if ((rowCount ?? 0) > 0) modified++;
        }
        // Removals — Plaid signalled the txn no longer exists.
        for (const rem of page.removed) {
          const { rowCount } = await client.query(
            `DELETE FROM transactions WHERE plaid_transaction_id = $1`,
            [rem.transaction_id],
          );
          if ((rowCount ?? 0) > 0) removed++;
        }
      });

      cursor = page.nextCursor;
      if (!page.hasMore) break;
    }

    if (cursor) await plaidItemsRepo.updateCursor(item.id, cursor);
    return { added, modified, removed, accountsUpserted };
  }

  async function listItems(userId: string): Promise<PlaidItemRow[]> {
    return plaidItemsRepo.listByUser(userId);
  }

  return { createLinkToken, exchangePublicToken, syncItem, listItems };
}

export type PlaidService = ReturnType<typeof createPlaidService>;
