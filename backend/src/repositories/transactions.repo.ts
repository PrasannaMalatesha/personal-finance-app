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

export interface ExportRow {
  date: string;
  account_name: string;
  description: string;
  amount: string;
  category_name: string | null;
}

export interface ListFilters {
  userId: string;
  accountId?: string;
  categoryId?: string;
  from?: string; // 'YYYY-MM-DD'
  to?: string;
  /** Case-insensitive substring on description. */
  q?: string;
  cursor?: { date: string; id: string };
  limit: number;
}

export interface ExportFilters {
  userId: string;
  accountId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  q?: string;
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

export interface DuplicateKey {
  date: string; // YYYY-MM-DD
  amount: string; // signed decimal, matches NUMERIC canonical form
  description: string;
}

export interface DuplicateMatch extends DuplicateKey {
  id: string;
}

export interface BulkCreateInput {
  accountId: string;
  importBatchId: string | null;
  rows: ReadonlyArray<{
    date: string;
    description: string;
    amount: string;
    categoryId: string | null;
  }>;
}

export interface TransactionsRepo {
  listForUser(filters: ListFilters, executor?: Executor): Promise<TransactionRow[]>;
  /**
   * Returns matching rows for CSV export. Joins accounts + categories so
   * the caller can render human-readable names without an N+1 lookup.
   *
   * Set `limit` to cap the result — the caller can fetch `limit + 1` to
   * detect "there's more" and fail cleanly rather than silently returning
   * a truncated file.
   */
  listAllForExport(
    filters: ExportFilters,
    limit?: number,
    executor?: Executor,
  ): Promise<ExportRow[]>;
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
  findDuplicateKeys(
    accountId: string,
    keys: readonly DuplicateKey[],
    executor?: Executor,
  ): Promise<DuplicateMatch[]>;
  bulkCreate(input: BulkCreateInput, executor: Executor): Promise<number>;
  deleteByBatchIdForUser(
    batchId: string,
    userId: string,
    executor: Executor,
  ): Promise<number>;
  /**
   * Rule-learning: how many of this user's transactions have a description
   * containing `pattern` AND are either uncategorized or in a different
   * category than the target. Excludes the transaction the user just edited.
   */
  countRuleLearningMatches(
    input: {
      userId: string;
      pattern: string;
      targetCategoryId: string;
      excludeTransactionId: string;
    },
    executor?: Executor,
  ): Promise<number>;
  /**
   * Rule-learning back-apply: set category_id on all matching transactions
   * for this user (same match criteria as countRuleLearningMatches). Returns
   * the number of rows updated.
   */
  applyRuleLearning(
    input: {
      userId: string;
      pattern: string;
      targetCategoryId: string;
    },
    executor?: Executor,
  ): Promise<number>;
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
      if (filters.q) {
        conditions.push(`t.description ILIKE '%' || $${i++} || '%'`);
        values.push(filters.q);
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

    async listAllForExport(filters, limit, executor = pool) {
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
      if (filters.q) {
        conditions.push(`t.description ILIKE '%' || $${i++} || '%'`);
        values.push(filters.q);
      }

      let limitClause = '';
      if (limit !== undefined) {
        limitClause = `LIMIT $${i++}`;
        values.push(limit);
      }

      const { rows } = await executor.query<ExportRow>(
        `SELECT
           to_char(t.date, 'YYYY-MM-DD') AS date,
           a.name AS account_name,
           t.description,
           t.amount::text AS amount,
           c.name AS category_name
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY t.date ASC, t.id ASC
         ${limitClause}`,
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

    async bulkCreate({ accountId, importBatchId, rows }, executor) {
      if (rows.length === 0) return 0;
      const dates = rows.map((r) => r.date);
      const descriptions = rows.map((r) => r.description);
      const amounts = rows.map((r) => r.amount);
      const categoryIds = rows.map((r) => r.categoryId);
      const { rowCount } = await executor.query(
        `INSERT INTO transactions (account_id, date, description, amount, category_id, import_batch_id)
         SELECT $1, u.date, u.description, u.amount, u.category_id, $2
         FROM unnest($3::date[], $4::text[], $5::numeric[], $6::uuid[])
              AS u(date, description, amount, category_id)`,
        [accountId, importBatchId, dates, descriptions, amounts, categoryIds],
      );
      return rowCount ?? 0;
    },

    async deleteByBatchIdForUser(batchId, userId, executor) {
      const { rowCount } = await executor.query(
        `DELETE FROM transactions t
         USING accounts a
         WHERE t.import_batch_id = $1
           AND t.account_id = a.id
           AND a.user_id = $2`,
        [batchId, userId],
      );
      return rowCount ?? 0;
    },

    async findDuplicateKeys(accountId, keys, executor = pool) {
      if (keys.length === 0) return [];
      const dates = keys.map((k) => k.date);
      const amounts = keys.map((k) => k.amount);
      const descriptions = keys.map((k) => k.description);
      // DISTINCT ON collapses multiple existing rows matching the same key
      // to one representative — client just needs the "is duplicate" flag.
      const { rows } = await executor.query<{
        id: string;
        date: string;
        amount: string;
        description: string;
      }>(
        `WITH keys AS (
           SELECT * FROM unnest($2::date[], $3::numeric[], $4::text[])
             AS k(date, amount, description)
         )
         SELECT DISTINCT ON (k.date, k.amount, k.description)
           t.id,
           to_char(k.date, 'YYYY-MM-DD') AS date,
           k.amount::text AS amount,
           k.description
         FROM keys k
         JOIN transactions t
           ON t.account_id = $1
          AND t.date = k.date
          AND t.amount = k.amount
          AND t.description = k.description
         ORDER BY k.date, k.amount, k.description, t.id`,
        [accountId, dates, amounts, descriptions],
      );
      return rows;
    },

    async countRuleLearningMatches(
      { userId, pattern, targetCategoryId, excludeTransactionId },
      executor = pool,
    ) {
      const { rows } = await executor.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM transactions t
           JOIN accounts a ON a.id = t.account_id
          WHERE a.user_id = $1
            AND LOWER(t.description) LIKE '%' || LOWER($2) || '%'
            AND (t.category_id IS DISTINCT FROM $3)
            AND t.id <> $4`,
        [userId, pattern, targetCategoryId, excludeTransactionId],
      );
      return Number(rows[0]?.count ?? 0);
    },

    async applyRuleLearning({ userId, pattern, targetCategoryId }, executor = pool) {
      const { rowCount } = await executor.query(
        `UPDATE transactions t
            SET category_id = $3, updated_at = NOW()
           FROM accounts a
          WHERE t.account_id = a.id
            AND a.user_id = $1
            AND LOWER(t.description) LIKE '%' || LOWER($2) || '%'
            AND t.category_id IS DISTINCT FROM $3`,
        [userId, pattern, targetCategoryId],
      );
      return rowCount ?? 0;
    },
  };
}
