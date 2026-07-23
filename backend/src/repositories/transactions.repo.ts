import type { Pool } from 'pg';
import type { Executor } from '../lib/tx';

export interface TransactionRow {
  id: string;
  account_id: string;
  date: string; // 'YYYY-MM-DD' via to_char
  description: string;
  amount: string; // NUMERIC via pg is string
  category_id: string | null;
  import_batch_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ListFilters {
  userId: string;
  accountId?: string;
  categoryId?: string;
  from?: string; // 'YYYY-MM-DD'
  to?: string;
  cursor?: { date: string; id: string };
  limit: number;
}

export interface CreateInput {
  accountId: string;
  date: string;
  description: string;
  amount: string;
  categoryId: string | null;
}

export interface UpdatePatch {
  accountId?: string;
  date?: string;
  description?: string;
  amount?: string;
  categoryId?: string | null;
}

export interface TransactionsRepo {
  listForUser(filters: ListFilters, executor?: Executor): Promise<TransactionRow[]>;
  findByIdForUser(
    id: string,
    userId: string,
    executor?: Executor,
  ): Promise<TransactionRow | null>;
  create(input: CreateInput, executor?: Executor): Promise<TransactionRow>;
  updateForUser(
    id: string,
    userId: string,
    patch: UpdatePatch,
    executor?: Executor,
  ): Promise<TransactionRow | null>;
  deleteForUser(
    id: string,
    userId: string,
    executor?: Executor,
  ): Promise<boolean>;
}

const SELECT_COLS = `
  t.id,
  t.account_id,
  to_char(t.date, 'YYYY-MM-DD') AS date,
  t.description,
  t.amount::text AS amount,
  t.category_id,
  t.import_batch_id,
  t.created_at,
  t.updated_at
`;

export function createTransactionsRepo(pool: Pool): TransactionsRepo {
  return {
    async listForUser(filters, executor = pool) {
      const conditions: string[] = ['a.user_id = $1'];
      const values: unknown[] = [filters.userId];
      let i = 2;

      if (filters.accountId) {
        conditions.push(`t.account_id = $${i++}`);
        values.push(filters.accountId);
      }
      if (filters.categoryId) {
        conditions.push(`t.category_id = $${i++}`);
        values.push(filters.categoryId);
      }
      if (filters.from) {
        conditions.push(`t.date >= $${i++}`);
        values.push(filters.from);
      }
      if (filters.to) {
        conditions.push(`t.date <= $${i++}`);
        values.push(filters.to);
      }
      if (filters.cursor) {
        conditions.push(`(t.date, t.id) < ($${i++}::date, $${i++}::uuid)`);
        values.push(filters.cursor.date, filters.cursor.id);
      }

      values.push(filters.limit);
      const limitIdx = i;

      const { rows } = await executor.query<TransactionRow>(
        `SELECT ${SELECT_COLS}
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY t.date DESC, t.id DESC
         LIMIT $${limitIdx}`,
        values,
      );
      return rows;
    },

    async findByIdForUser(id, userId, executor = pool) {
      const { rows } = await executor.query<TransactionRow>(
        `SELECT ${SELECT_COLS}
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         WHERE t.id = $1 AND a.user_id = $2`,
        [id, userId],
      );
      return rows[0] ?? null;
    },

    async create(input, executor = pool) {
      const { rows } = await executor.query<TransactionRow>(
        `WITH ins AS (
           INSERT INTO transactions (account_id, date, description, amount, category_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *
         )
         SELECT
           ins.id,
           ins.account_id,
           to_char(ins.date, 'YYYY-MM-DD') AS date,
           ins.description,
           ins.amount::text AS amount,
           ins.category_id,
           ins.import_batch_id,
           ins.created_at,
           ins.updated_at
         FROM ins`,
        [
          input.accountId,
          input.date,
          input.description,
          input.amount,
          input.categoryId,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error('transactions.create: no row returned');
      return row;
    },

    async updateForUser(id, userId, patch, executor = pool) {
      const sets: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      if (patch.accountId !== undefined) {
        sets.push(`account_id = $${i++}`);
        values.push(patch.accountId);
      }
      if (patch.date !== undefined) {
        sets.push(`date = $${i++}`);
        values.push(patch.date);
      }
      if (patch.description !== undefined) {
        sets.push(`description = $${i++}`);
        values.push(patch.description);
      }
      if (patch.amount !== undefined) {
        sets.push(`amount = $${i++}`);
        values.push(patch.amount);
      }
      if (patch.categoryId !== undefined) {
        sets.push(`category_id = $${i++}`);
        values.push(patch.categoryId);
      }
      if (sets.length === 0) {
        return this.findByIdForUser(id, userId, executor);
      }
      sets.push(`updated_at = NOW()`);
      values.push(id, userId);
      const idIdx = i++;
      const userIdx = i++;

      // Guard ownership via the account join. If the transaction's account
      // does not belong to $userId, UPDATE affects zero rows → returns null.
      const { rows } = await executor.query<TransactionRow>(
        `UPDATE transactions t
         SET ${sets.join(', ')}
         FROM accounts a
         WHERE t.id = $${idIdx}
           AND t.account_id = a.id
           AND a.user_id = $${userIdx}
         RETURNING
           t.id,
           t.account_id,
           to_char(t.date, 'YYYY-MM-DD') AS date,
           t.description,
           t.amount::text AS amount,
           t.category_id,
           t.import_batch_id,
           t.created_at,
           t.updated_at`,
        values,
      );
      return rows[0] ?? null;
    },

    async deleteForUser(id, userId, executor = pool) {
      const { rowCount } = await executor.query(
        `DELETE FROM transactions t
         USING accounts a
         WHERE t.id = $1
           AND t.account_id = a.id
           AND a.user_id = $2`,
        [id, userId],
      );
      return (rowCount ?? 0) > 0;
    },
  };
}
