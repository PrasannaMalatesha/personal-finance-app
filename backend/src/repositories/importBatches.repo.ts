import type { Pool } from 'pg';
import type { Executor } from '../lib/tx';

export interface ImportBatchRow {
  id: string;
  account_id: string;
  filename: string;
  row_count: number;
  imported_at: Date;
  undone_at: Date | null;
}

export interface ImportBatchesRepo {
  create(
    input: { accountId: string; filename: string; rowCount: number },
    executor: Executor,
  ): Promise<ImportBatchRow>;
  listForUser(
    userId: string,
    filter: { accountId?: string },
    executor?: Executor,
  ): Promise<ImportBatchRow[]>;
  findByIdForUser(
    id: string,
    userId: string,
    executor?: Executor,
  ): Promise<ImportBatchRow | null>;
  markUndone(id: string, executor: Executor): Promise<ImportBatchRow | null>;
}

export function createImportBatchesRepo(pool: Pool): ImportBatchesRepo {
  return {
    async create({ accountId, filename, rowCount }, executor) {
      const { rows } = await executor.query<ImportBatchRow>(
        `INSERT INTO import_batches (account_id, filename, row_count)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [accountId, filename, rowCount],
      );
      const row = rows[0];
      if (!row) throw new Error('import_batches.create: no row returned');
      return row;
    },

    async listForUser(userId, filter, executor = pool) {
      const values: unknown[] = [userId];
      let sql = `SELECT b.*
                 FROM import_batches b
                 JOIN accounts a ON a.id = b.account_id
                 WHERE a.user_id = $1`;
      if (filter.accountId) {
        values.push(filter.accountId);
        sql += ` AND b.account_id = $${values.length}`;
      }
      sql += ` ORDER BY b.imported_at DESC, b.id DESC`;
      const { rows } = await executor.query<ImportBatchRow>(sql, values);
      return rows;
    },

    async findByIdForUser(id, userId, executor = pool) {
      const { rows } = await executor.query<ImportBatchRow>(
        `SELECT b.*
         FROM import_batches b
         JOIN accounts a ON a.id = b.account_id
         WHERE b.id = $1 AND a.user_id = $2`,
        [id, userId],
      );
      return rows[0] ?? null;
    },

    async markUndone(id, executor) {
      const { rows } = await executor.query<ImportBatchRow>(
        `UPDATE import_batches
         SET undone_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id],
      );
      return rows[0] ?? null;
    },
  };
}
