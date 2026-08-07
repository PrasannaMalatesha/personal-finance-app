import type { Pool } from 'pg';
import type { Executor } from '../lib/tx';

export interface SummaryRow {
  income: string;
  expenses: string;
  net: string;
  budget_total_limit: string;
  budget_total_spent: string;
  budget_percent_used: number;
}

export interface CategorySliceRow {
  category_id: string | null;
  category_name: string;
  color: string;
  amount: string;
}

export interface TrendRow {
  month: string; // 'YYYY-MM'
  income: string;
  expenses: string;
}

export interface NetWorthRow {
  month: string; // 'YYYY-MM'
  net_worth: string;
}

export interface DashboardRepo {
  summaryForMonth(
    userId: string,
    month: string,
    executor?: Executor,
  ): Promise<SummaryRow>;
  spendByCategoryForMonth(
    userId: string,
    month: string,
    executor?: Executor,
  ): Promise<CategorySliceRow[]>;
  trend(
    userId: string,
    endMonth: string,
    months: number,
    executor?: Executor,
  ): Promise<TrendRow[]>;
  netWorth(
    userId: string,
    endMonth: string,
    months: number,
    executor?: Executor,
  ): Promise<NetWorthRow[]>;
}

export function createDashboardRepo(pool: Pool): DashboardRepo {
  return {
    /**
     * One row summarizing money in/out this month + how the user's total
     * budgeted spend tracks against total budgeted limit.
     *
     * "income"   — sum of positive transaction amounts on user's accounts
     * "expenses" — sum of |negative amounts|
     * budget totals only consider categories with a budget set for `month`.
     */
    async summaryForMonth(userId, month, executor = pool) {
      const { rows } = await executor.query<SummaryRow>(
        `WITH tx AS (
           SELECT
             SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) AS income,
             SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END) AS expenses
           FROM transactions t
           JOIN accounts a ON a.id = t.account_id
           WHERE a.user_id = $1
             AND t.date >= $2::date
             AND t.date < ($2::date + INTERVAL '1 month')::date
         ),
         budget AS (
           SELECT
             COALESCE(SUM(b.amount_limit), 0) AS total_limit,
             COALESCE(SUM(spend.amt), 0) AS total_spent
           FROM budgets b
           LEFT JOIN LATERAL (
             SELECT SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END) AS amt
             FROM transactions t
             JOIN accounts a ON a.id = t.account_id
             WHERE a.user_id = $1
               AND t.category_id = b.category_id
               AND t.date >= b.month
               AND t.date < (b.month + INTERVAL '1 month')::date
           ) spend ON TRUE
           WHERE b.user_id = $1 AND b.month = $2::date
         )
         SELECT
           COALESCE(tx.income, 0)::numeric(14,2)::text AS income,
           COALESCE(tx.expenses, 0)::numeric(14,2)::text AS expenses,
           (COALESCE(tx.income, 0) - COALESCE(tx.expenses, 0))::numeric(14,2)::text AS net,
           budget.total_limit::numeric(14,2)::text AS budget_total_limit,
           budget.total_spent::numeric(14,2)::text AS budget_total_spent,
           COALESCE(
             ROUND((budget.total_spent / NULLIF(budget.total_limit, 0)) * 100)::int,
             0
           ) AS budget_percent_used
         FROM tx CROSS JOIN budget`,
        [userId, month],
      );
      // The CTE always yields exactly one row.
      return rows[0]!;
    },

    /**
     * Expense magnitudes grouped by category for the given month. Uncategorized
     * transactions collapse to a single synthetic slice with a neutral color.
     * Zero-expense categories are omitted (pie slices need something to draw).
     */
    async spendByCategoryForMonth(userId, month, executor = pool) {
      const { rows } = await executor.query<CategorySliceRow>(
        `SELECT
           c.id AS category_id,
           COALESCE(c.name, 'Uncategorized') AS category_name,
           COALESCE(c.color, '#94a3b8') AS color,
           SUM(-t.amount)::numeric(14,2)::text AS amount
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE a.user_id = $1
           AND t.amount < 0
           AND t.date >= $2::date
           AND t.date < ($2::date + INTERVAL '1 month')::date
         GROUP BY c.id, c.name, c.color
         HAVING SUM(-t.amount) > 0
         ORDER BY SUM(-t.amount) DESC`,
        [userId, month],
      );
      return rows;
    },

    /**
     * Generate exactly `months` rows anchored at `endMonth` (inclusive),
     * emitting zeros for months with no data so the chart never has gaps.
     */
    async trend(userId, endMonth, months, executor = pool) {
      const { rows } = await executor.query<TrendRow>(
        `WITH months AS (
           SELECT generate_series(
             ($1::date - ($2::int - 1) * INTERVAL '1 month')::date,
             $1::date,
             INTERVAL '1 month'
           )::date AS month
         )
         SELECT
           to_char(m.month, 'YYYY-MM') AS month,
           COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0)::numeric(14,2)::text AS income,
           COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0)::numeric(14,2)::text AS expenses
         FROM months m
         LEFT JOIN transactions t
           ON t.date >= m.month
          AND t.date < (m.month + INTERVAL '1 month')::date
         LEFT JOIN accounts a
           ON a.id = t.account_id AND a.user_id = $3
         WHERE t.id IS NULL OR a.user_id = $3
         GROUP BY m.month
         ORDER BY m.month ASC`,
        [endMonth, months, userId],
      );
      return rows;
    },

    /**
     * Net worth = sum(account.opening_balance) + cumulative transaction flow
     * up to and including each month. Computed from source data every call
     * (I3: no derived money is cached). One month-end value per generated
     * month, no gaps.
     *
     * For a user with N accounts and T transactions, this runs one subquery
     * per generated month — O(N + T) per row, O(months × T) total. Fine at
     * the sizes v1 targets (~5k tx demo dataset in <500ms).
     */
    async netWorth(userId, endMonth, months, executor = pool) {
      const { rows } = await executor.query<NetWorthRow>(
        `WITH months AS (
           SELECT generate_series(
             ($1::date - ($2::int - 1) * INTERVAL '1 month')::date,
             $1::date,
             INTERVAL '1 month'
           )::date AS month
         ),
         opening_total AS (
           SELECT COALESCE(SUM(opening_balance), 0) AS total
           FROM accounts
           WHERE user_id = $3
         )
         SELECT
           to_char(m.month, 'YYYY-MM') AS month,
           (opening_total.total + COALESCE(
             (SELECT SUM(t.amount)
              FROM transactions t
              JOIN accounts a ON a.id = t.account_id
              WHERE a.user_id = $3
                AND t.date < (m.month + INTERVAL '1 month')::date), 0
           ))::numeric(14,2)::text AS net_worth
         FROM months m CROSS JOIN opening_total
         ORDER BY m.month ASC`,
        [endMonth, months, userId],
      );
      return rows;
    },
  };
}
