import type { CategoriesRepo } from '../repositories/categories.repo';
import type { DashboardRepo } from '../repositories/dashboard.repo';
import type {
  DashboardCategorySlice,
  DashboardNetWorthPoint,
  DashboardSummary,
  DashboardTrendPoint,
} from '../schemas/dashboard';
import { monthToDate } from '../schemas/dashboard';
import { flags } from '../flags';

/** Current UTC month as YYYY-MM-01. Kept local so trend + netWorth agree. */
function currentMonthAnchor(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/**
 * Sum money strings by going through integer cents — avoids IEEE-754 drift
 * when combining ~10 category slices into rollup buckets. Values in this app
 * are at demo-scale (<$10k), well within safe integer range even at cents.
 */
function toCents(s: string): number {
  return Math.round(Number(s) * 100);
}
function fromCents(c: number): string {
  const sign = c < 0 ? '-' : '';
  const abs = Math.abs(c);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export interface DashboardServiceDeps {
  dashboardRepo: DashboardRepo;
  categoriesRepo: CategoriesRepo;
}

export function createDashboardService(deps: DashboardServiceDeps) {
  const { dashboardRepo, categoriesRepo } = deps;

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
    const rows = await dashboardRepo.spendByCategoryForMonth(
      userId,
      monthToDate(month),
    );
    const slices: DashboardCategorySlice[] = rows.map((r) => ({
      categoryId: r.category_id,
      categoryName: r.category_name,
      color: r.color,
      amount: r.amount,
    }));
    if (!flags.hierarchicalCategories) return slices;

    // Roll children into their root parent. Walk parent_category_id up to
    // find each slice's root; group amounts by root.
    const categories = await categoriesRepo.listByUser(userId);
    const parentOf = new Map<string, string | null>();
    const display = new Map<string, { name: string; color: string }>();
    for (const c of categories) {
      parentOf.set(c.id, c.parent_category_id);
      display.set(c.id, { name: c.name, color: c.color });
    }

    function rootIdOf(id: string): string {
      let cur: string = id;
      // Guard: depth-2 hierarchy means at most one hop, but loop just in
      // case future migrations introduce deeper trees.
      let hops = 0;
      while (hops < 8) {
        const p = parentOf.get(cur);
        if (!p) return cur;
        cur = p;
        hops++;
      }
      return cur;
    }

    // key = categoryId OR "uncat" sentinel for null-category slices
    const rollup = new Map<
      string,
      { categoryId: string | null; name: string; color: string; cents: number }
    >();
    for (const s of slices) {
      if (s.categoryId === null) {
        // Uncategorized stays its own slice — no parent to roll into.
        const existing = rollup.get('uncat');
        if (existing) existing.cents += toCents(s.amount);
        else
          rollup.set('uncat', {
            categoryId: null,
            name: s.categoryName,
            color: s.color,
            cents: toCents(s.amount),
          });
        continue;
      }
      const rootId = rootIdOf(s.categoryId);
      const rootDisplay = display.get(rootId);
      const existing = rollup.get(rootId);
      if (existing) {
        existing.cents += toCents(s.amount);
      } else {
        rollup.set(rootId, {
          categoryId: rootId,
          // If the root category was itself deleted after tx were assigned
          // to it, fall back to the slice's own label.
          name: rootDisplay?.name ?? s.categoryName,
          color: rootDisplay?.color ?? s.color,
          cents: toCents(s.amount),
        });
      }
    }

    return Array.from(rollup.values())
      .map((r) => ({
        categoryId: r.categoryId,
        categoryName: r.name,
        color: r.color,
        amount: fromCents(r.cents),
      }))
      .sort((a, b) => Number(b.amount) - Number(a.amount));
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
