import type { DashboardRepo } from '../repositories/dashboard.repo';
import type {
  DashboardCategorySlice,
  DashboardNetWorthPoint,
  DashboardSummary,
  DashboardTrendPoint,
} from '../schemas/dashboard';
import { monthToDate } from '../schemas/dashboard';

/** Current UTC month as YYYY-MM-01. Kept local so trend + netWorth agree. */
function currentMonthAnchor(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export interface DashboardServiceDeps {
  dashboardRepo: DashboardRepo;
}

export function createDashboardService(deps: DashboardServiceDeps) {
  const { dashboardRepo } = deps;

  async function summary(userId: string, month: string): Promise<DashboardSummary> {
    const row = await dashboardRepo.summaryForMonth(userId, monthToDate(month));
    return {
      month,
      income: row.income,
      expenses: row.expenses,
      net: row.net,
      budgetTotalLimit: row.budget_total_limit,
      budgetTotalSpent: row.budget_total_spent,
      budgetPercentUsed: row.budget_percent_used,
    };
  }

  async function byCategory(
    userId: string,
    month: string,
  ): Promise<DashboardCategorySlice[]> {
    const rows = await dashboardRepo.spendByCategoryForMonth(userId, monthToDate(month));
    return rows.map((r) => ({
      categoryId: r.category_id,
      categoryName: r.category_name,
      color: r.color,
      amount: r.amount,
    }));
  }

  async function trend(
    userId: string,
    months: number,
    endMonth?: string,
  ): Promise<DashboardTrendPoint[]> {
    // Default anchor is the current calendar month in the server's timezone.
    // Callers can pin it explicitly to keep tests deterministic.
    const anchor = endMonth ? monthToDate(endMonth) : currentMonthAnchor();
    const rows = await dashboardRepo.trend(userId, anchor, months);
    return rows.map((r) => ({
      month: r.month,
      income: r.income,
      expenses: r.expenses,
    }));
  }

  async function netWorth(
    userId: string,
    months: number,
    endMonth?: string,
  ): Promise<DashboardNetWorthPoint[]> {
    const anchor = endMonth ? monthToDate(endMonth) : currentMonthAnchor();
    const rows = await dashboardRepo.netWorth(userId, anchor, months);
    return rows.map((r) => ({ month: r.month, netWorth: r.net_worth }));
  }

  return { summary, byCategory, trend, netWorth };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
