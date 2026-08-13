import type { Pool } from 'pg';
import type { Executor } from '../lib/tx';

export interface PlaidItemRow {
  id: string;
  user_id: string;
  item_id: string;
  access_token: string;
  institution_id: string | null;
  institution_name: string | null;
  cursor: string | null;
  last_synced_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PlaidItemsRepo {
  listByUser(userId: string, executor?: Executor): Promise<PlaidItemRow[]>;
  findByIdForUser(
    id: string,
    userId: string,
    executor?: Executor,
  ): Promise<PlaidItemRow | null>;
  upsertByItemId(
    input: {
      userId: string;
      itemId: string;
      accessToken: string;
      institutionId: string | null;
      institutionName: string | null;
    },
    executor?: Executor,
  ): Promise<PlaidItemRow>;
  updateCursor(id: string, cursor: string, executor?: Executor): Promise<void>;
}

export function createPlaidItemsRepo(pool: Pool): PlaidItemsRepo {
  return {
    async listByUser(userId, executor = pool) {
      const { rows } = await executor.query<PlaidItemRow>(
        `SELECT * FROM plaid_items WHERE user_id = $1 ORDER BY created_at ASC`,
        [userId],
      );
      return rows;
    },

    async findByIdForUser(id, userId, executor = pool) {
      const { rows } = await executor.query<PlaidItemRow>(
        `SELECT * FROM plaid_items WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      return rows[0] ?? null;
    },

    async upsertByItemId(
      { userId, itemId, accessToken, institutionId, institutionName },
      executor = pool,
    ) {
      const { rows } = await executor.query<PlaidItemRow>(
        `INSERT INTO plaid_items
           (user_id, item_id, access_token, institution_id, institution_name)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, item_id) DO UPDATE SET
           access_token = EXCLUDED.access_token,
           institution_id = EXCLUDED.institution_id,
           institution_name = EXCLUDED.institution_name,
           updated_at = NOW()
         RETURNING *`,
        [userId, itemId, accessToken, institutionId, institutionName],
      );
      const row = rows[0];
      if (!row) throw new Error('plaid_items.upsert: no row returned');
      return row;
    },

    async updateCursor(id, cursor, executor = pool) {
      await executor.query(
        `UPDATE plaid_items
            SET cursor = $2, last_synced_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [id, cursor],
      );
    },
  };
}
