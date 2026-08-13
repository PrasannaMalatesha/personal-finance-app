import type { Pool } from 'pg';
import type { Executor } from '../lib/tx';

export type AccountType = 'checking' | 'savings' | 'credit_card';

export interface AccountRow {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: string;
  opening_balance: string; // pg returns NUMERIC as string
  created_at: Date;
  updated_at: Date;
}

export interface AccountWithBalanceRow extends AccountRow {
  current_balance: string;
}

export interface AccountsRepo {
  listByUser(userId: string, executor?: Executor): Promise<AccountWithBalanceRow[]>;
  findByIdForUser(
    id: string,
    userId: string,
    executor?: Executor,
  ): Promise<AccountWithBalanceRow | null>;
  create(
    input: {
      userId: string;
      name: string;
      type: AccountType;
      currency: string;
      openingBalance: string;
    },
    executor?: Executor,
  ): Promise<AccountRow>;
  update(
    id: string,
    userId: string,
    patch: { name?: string; type?: AccountType; openingBalance?: string },
    executor?: Executor,
  ): Promise<AccountRow | null>;
  delete(id: string, userId: string, executor?: Executor): Promise<boolean>;
}

const BALANCE_SELECT = `
  a.*,
  (a.opening_balance + COALESCE(SUM(t.amount), 0))::text AS current_balance
`;

export function createAccountsRepo(pool: Pool): AccountsRepo {
  return {
    async listByUser(userId, executor = pool) {
      const { rows } = await executor.query<AccountWithBalanceRow>(
        `SELECT ${BALANCE_SELECT}
         FROM accounts a
         LEFT JOIN transactions t ON t.account_id = a.id
         WHERE a.user_id = $1
         GROUP BY a.id
         ORDER BY a.name ASC`,
        [userId],
      );
      return rows;
    },

    async findByIdForUser(id, userId, executor = pool) {
      const { rows } = await executor.query<AccountWithBalanceRow>(
        `SELECT ${BALANCE_SELECT}
         FROM accounts a
         LEFT JOIN transactions t ON t.account_id = a.id
         WHERE a.id = $1 AND a.user_id = $2
         GROUP BY a.id`,
        [id, userId],
      );
      return rows[0] ?? null;
    },

    async create({ userId, name, type, currency, openingBalance }, executor = pool) {
      const { rows } = await executor.query<AccountRow>(
        `INSERT INTO accounts (user_id, name, type, currency, opening_balance)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, name, type, currency, openingBalance],
      );
      const row = rows[0];
      if (!row) throw new Error('accounts.create: no row returned');
      return row;
    },

    async update(id, userId, patch, executor = pool) {
      const sets: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      if (patch.name !== undefined) {
        sets.push(`name = $${i++}`);
        values.push(patch.name);
      }
      if (patch.type !== undefined) {
        sets.push(`type = $${i++}`);
        values.push(patch.type);
      }
      if (patch.openingBalance !== undefined) {
        sets.push(`opening_balance = $${i++}`);
        values.push(patch.openingBalance);
      }
      if (sets.length === 0) {
        const { rows } = await executor.query<AccountRow>(
          `SELECT * FROM accounts WHERE id = $1 AND user_id = $2`,
          [id, userId],
        );
        return rows[0] ?? null;
      }
      sets.push(`updated_at = NOW()`);
      values.push(id, userId);
      const { rows } = await executor.query<AccountRow>(
        `UPDATE accounts SET ${sets.join(', ')}
         WHERE id = $${i++} AND user_id = $${i++}
         RETURNING *`,
        values,
      );
      return rows[0] ?? null;
    },

    async delete(id, userId, executor = pool) {
      const { rowCount } = await executor.query(
        `DELETE FROM accounts WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      return (rowCount ?? 0) > 0;
    },
  };
}
