import type { Pool } from 'pg';
import type { Executor } from '../lib/tx';

export interface BudgetRow {
  id: string;
  user_id: string;
  category_id: string;
  month: Date; // pg returns DATE as Date
  amount_limit: string;
  created_at: Date;
  updated_at: Date;
}

export interface BudgetWithSpendRow {
  budget_id: string;
  category_id: string;
  category_name: string;
  color: string;
  month: string; // 'YYYY-MM' via to_char
  amount_limit: string;
  amount_spent: string;
  amount_remaining: string;
  percent_used: number;
  is_over_budget: boolean;
}

export interface BudgetsRepo {
  upsert(
    input: {
      userId: string;
      categoryId: string;
      month: string; // 'YYYY-MM-01'
      amountLimit: string;
    },
    executor?: Executor,
  ): Promise<BudgetRow>;
  listWithSpendForMonth(
    userId: string,
    month: string,
    executor?: Executor,
  ): Promise<BudgetWithSpendRow[]>;
  findByIdForUser(
    id: string,
    userId: string,
    executor?: Executor,
  ): Promise<BudgetRow | null>;
  deleteForUser(
    id: string,
    userId: string,
    executor?: Executor,
  ): Promise<boolean>;
}

export function createBudgetsRepo(pool: Pool): BudgetsRepo {
  return {
    async upsert({ userId, categoryId, month, amountLimit }, executor = pool) {
      // Naturally idempotent (TRD §7.3): PUT semantics + UNIQUE (user_id,
      // category_id, month) → ON CONFLICT DO UPDATE. Re-issuing the same
      // request produces the same row with fresh updated_at.
      const { rows } = await executor.query<BudgetRow>(
        `INSERT INTO budgets (user_id, category_id, month, amount_limit)
         VALUES ($1, $2, $3::date, $4)
         ON CONFLICT (user_id, category_id, month)
         DO UPDATE SET amount_limit = EXCLUDED.amount_limit, updated_at = NOW()
         RETURNING *`,
        [userId, categoryId, month, amountLimit],
      );
      const row = rows[0];
      if (!row) throw new Error('budgets.upsert: no row returned');
      return row;
    },

    async listWithSpendForMonth(userId, month, executor = pool) {
      // LATERAL keeps the spend aggregate scoped per-budget and per-user.
      // Only user-owned accounts contribute (join on accounts.user_id).
      // "Spend" is the sum of expense magnitudes (negative amounts flipped);
      // income (positive amounts) is ignored so a paycheck credited to a
      // category doesn't zero out the budget.
      const { rows } = await executor.query<BudgetWithSpendRow>(
        `SELECT
           b.id AS budget_id,
           b.category_id,
           c.name AS category_name,
           c.color,
           to_char(b.month, 'YYYY-MM') AS month,
           b.amount_limit::text AS amount_limit,
           -- Cast through NUMERIC(14,2) so a 0 spend renders as "0.00", not "0"
           COALESCE(spend.amt, 0)::numeric(14,2)::text AS amount_spent,
           (b.amount_limit - COALESCE(spend.amt, 0))::numeric(14,2)::text AS amount_remaining,
           COALESCE(ROUND((spend.amt / NULLIF(b.amount_limit, 0)) * 100)::int, 0)
             AS percent_used,
           COALESCE(spend.amt > b.amount_limit, FALSE) AS is_over_budget
         FROM budgets b
         JOIN categories c ON c.id = b.category_id
         LEFT JOIN LATERAL (
           SELECT SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END) AS amt
           FROM transactions t
           JOIN accounts a ON a.id = t.account_id
           WHERE a.user_id = $1
             AND t.category_id = b.category_id
             AND t.date >= b.month
             AND t.date < (b.month + INTERVAL '1 month')::date
         ) spend ON TRUE
         WHERE b.user_id = $1
           AND b.month = $2::date
         ORDER BY c.name ASC`,
        [userId, month],
      );
      return rows;
    },

    async findByIdForUser(id, userId, executor = pool) {
      const { rows } = await executor.query<BudgetRow>(
        `SELECT * FROM budgets WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      return rows[0] ?? null;
    },

    async deleteForUser(id, userId, executor = pool) {
      const { rowCount } = await executor.query(
        `DELETE FROM budgets WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      return (rowCount ?? 0) > 0;
    },
  };
}
