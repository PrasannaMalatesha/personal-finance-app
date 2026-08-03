import type { Pool } from 'pg';
import type { Executor } from '../lib/tx';

export interface RecurringGroupRow {
  id: string;
  user_id: string;
  merchant_key: string;
  category_id: string | null;
  avg_amount: string;
  cadence_days: number;
  first_seen: Date;
  last_seen: Date;
  next_expected: Date | null;
  is_dismissed: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RecurringGroupWithMetaRow extends RecurringGroupRow {
  display_name: string;
  category_name: string | null;
  category_color: string | null;
  tx_count: number;
}

export interface TxForDetectionRow {
  id: string;
  account_id: string;
  date: Date;
  description: string;
  amount: string;
  category_id: string | null;
  recurring_group_id: string | null;
}

export interface RecurringRepo {
  listWithMeta(
    userId: string,
    executor?: Executor,
  ): Promise<RecurringGroupWithMetaRow[]>;
  findById(
    id: string,
    userId: string,
    executor?: Executor,
  ): Promise<RecurringGroupRow | null>;
  listUserExpenseTx(
    userId: string,
    executor?: Executor,
  ): Promise<TxForDetectionRow[]>;
  upsertGroup(
    input: {
      userId: string;
      merchantKey: string;
      categoryId: string | null;
      avgAmount: string;
      cadenceDays: number;
      firstSeen: string;
      lastSeen: string;
      nextExpected: string | null;
    },
    executor: Executor,
  ): Promise<{ id: string; wasInsert: boolean }>;
  assignTxToGroup(
    txIds: readonly string[],
    groupId: string,
    executor: Executor,
  ): Promise<number>;
  clearAllAssignments(userId: string, executor: Executor): Promise<void>;
  setDismissed(
    id: string,
    userId: string,
    dismissed: boolean,
  ): Promise<boolean>;
  delete(id: string, userId: string): Promise<boolean>;
  listDismissedMerchantKeys(
    userId: string,
    executor: Executor,
  ): Promise<Set<string>>;
}

export function createRecurringRepo(pool: Pool): RecurringRepo {
  return {
    async listWithMeta(userId, executor = pool) {
      // Join to the most recent transaction in each group for the display
      // name, and to categories for name/color. Includes dismissed rows so
      // the UI can render them under a separate section if desired.
      const { rows } = await executor.query<RecurringGroupWithMetaRow>(
        `SELECT
           g.*,
           c.name AS category_name,
           c.color AS category_color,
           latest.description AS display_name,
           COALESCE(counts.tx_count, 0)::int AS tx_count
         FROM recurring_groups g
         LEFT JOIN categories c ON c.id = g.category_id
         LEFT JOIN LATERAL (
           SELECT t.description
           FROM transactions t
           JOIN accounts a ON a.id = t.account_id
           WHERE a.user_id = g.user_id
             AND t.recurring_group_id = g.id
           ORDER BY t.date DESC
           LIMIT 1
         ) latest ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS tx_count
           FROM transactions t
           JOIN accounts a ON a.id = t.account_id
           WHERE a.user_id = g.user_id
             AND t.recurring_group_id = g.id
         ) counts ON TRUE
         WHERE g.user_id = $1
         ORDER BY g.is_dismissed ASC, g.last_seen DESC`,
        [userId],
      );
      return rows;
    },

    async findById(id, userId, executor = pool) {
      const { rows } = await executor.query<RecurringGroupRow>(
        `SELECT * FROM recurring_groups WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      return rows[0] ?? null;
    },

    async listUserExpenseTx(userId, executor = pool) {
      // Detection only looks at expenses (amount < 0). Salary and other
      // income use the same detection path only if we widen the filter here.
      const { rows } = await executor.query<TxForDetectionRow>(
        `SELECT t.id, t.account_id, t.date, t.description,
                t.amount, t.category_id, t.recurring_group_id
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         WHERE a.user_id = $1
           AND t.amount < 0
         ORDER BY t.date ASC`,
        [userId],
      );
      return rows;
    },

    async upsertGroup(input, executor) {
      // ON CONFLICT so re-running detection updates existing groups in place
      // rather than orphaning them.
      const { rows } = await executor.query<{ id: string; inserted: boolean }>(
        `INSERT INTO recurring_groups (
           user_id, merchant_key, category_id,
           avg_amount, cadence_days,
           first_seen, last_seen, next_expected
         ) VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8::date)
         ON CONFLICT (user_id, merchant_key)
         DO UPDATE SET
           category_id   = EXCLUDED.category_id,
           avg_amount    = EXCLUDED.avg_amount,
           cadence_days  = EXCLUDED.cadence_days,
           first_seen    = EXCLUDED.first_seen,
           last_seen     = EXCLUDED.last_seen,
           next_expected = EXCLUDED.next_expected,
           updated_at    = NOW()
         RETURNING id, (xmax = 0) AS inserted`,
        [
          input.userId,
          input.merchantKey,
          input.categoryId,
          input.avgAmount,
          input.cadenceDays,
          input.firstSeen,
          input.lastSeen,
          input.nextExpected,
        ],
      );
      const row = rows[0]!;
      return { id: row.id, wasInsert: row.inserted };
    },

    async assignTxToGroup(txIds, groupId, executor) {
      if (txIds.length === 0) return 0;
      const { rowCount } = await executor.query(
        `UPDATE transactions
         SET recurring_group_id = $1
         WHERE id = ANY($2::uuid[])`,
        [groupId, [...txIds]],
      );
      return rowCount ?? 0;
    },

    async clearAllAssignments(userId, executor) {
      // Wipe all recurring_group_id refs on the user's transactions before a
      // fresh detection run — keeps stale group memberships from surviving.
      await executor.query(
        `UPDATE transactions t
         SET recurring_group_id = NULL
         FROM accounts a
         WHERE a.id = t.account_id
           AND a.user_id = $1
           AND t.recurring_group_id IS NOT NULL`,
        [userId],
      );
    },

    async setDismissed(id, userId, dismissed) {
      const { rowCount } = await pool.query(
        `UPDATE recurring_groups
         SET is_dismissed = $1, updated_at = NOW()
         WHERE id = $2 AND user_id = $3`,
        [dismissed, id, userId],
      );
      return (rowCount ?? 0) > 0;
    },

    async delete(id, userId) {
      const { rowCount } = await pool.query(
        `DELETE FROM recurring_groups WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      return (rowCount ?? 0) > 0;
    },

    async listDismissedMerchantKeys(userId, executor) {
      const { rows } = await executor.query<{ merchant_key: string }>(
        `SELECT merchant_key FROM recurring_groups
         WHERE user_id = $1 AND is_dismissed = TRUE`,
        [userId],
      );
      return new Set(rows.map((r) => r.merchant_key));
    },
  };
}
