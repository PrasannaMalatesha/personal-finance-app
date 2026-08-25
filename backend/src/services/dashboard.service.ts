import Decimal from 'decimal.js';
import type { CategoriesRepo } from '../repositories/categories.repo';
import type { DashboardRepo } from '../repositories/dashboard.repo';
import type { UsersRepo } from '../repositories/users.repo';
import type { FxService } from './fx.service';
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

export interface DashboardServiceDeps {
  dashboardRepo: DashboardRepo;
  categoriesRepo: CategoriesRepo;
  usersRepo: UsersRepo;
  fxService: FxService;
}

// Month-anchor rate: convert each (currency, month) bucket at the first-of-
// month rate rather than per-txn-date. Documented simplification vs the PRD's
// "transaction-date rate" — a follow-up can move to per-day granularity by
// calling fxService.rateFor with each txn's date.
export function createDashboardService(deps: DashboardServiceDeps) {
  const { dashboardRepo, categoriesRepo, usersRepo, fxService } = deps;

  async function getBaseCurrency(userId: string): Promise<string> {
    const user = await usersRepo.findById(userId);
    if (!user) throw new Error(`Dashboard: user ${userId} not found`);
    return user.base_currency.trim();
  }

  async function summary(userId: string, month: string): Promise<DashboardSummary> {
    if (!flags.multiCurrency) {
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

    const monthAnchor = monthToDate(month);
    const [base, rowsByCcy, plain] = await Promise.all([
      getBaseCurrency(userId),
      dashboardRepo.summaryForMonthByCurrency(userId, monthAnchor),
      // Budget totals are already stored in the user's base currency, so
      // reuse the existing single-row query for those fields.
      dashboardRepo.summaryForMonth(userId, monthAnchor),
    ]);

    let income = new Decimal(0);
    let expenses = new Decimal(0);
    const cache = fxService.newCache();
    for (const r of rowsByCcy) {
      income = income.plus(
        await fxService.convert(r.income, r.currency, base, monthAnchor, cache),
      );
      expenses = expenses.plus(
        await fxService.convert(r.expenses, r.currency, base, monthAnchor, cache),
      );
    }
    return {
      month,
      income: income.toFixed(2),
      expenses: expenses.toFixed(2),
      net: income.minus(expenses).toFixed(2),
      budgetTotalLimit: plain.budget_total_limit,
      budgetTotalSpent: plain.budget_total_spent,
      budgetPercentUsed: plain.budget_percent_used,
    };
  }

  async function byCategory(
    userId: string,
    month: string,
  ): Promise<DashboardCategorySlice[]> {
    const monthAnchor = monthToDate(month);
    let slices: DashboardCategorySlice[];
    if (flags.multiCurrency) {
      const base = await getBaseCurrency(userId);
      const rows = await dashboardRepo.spendByCategoryForMonthByCurrency(
        userId,
        monthAnchor,
      );
      // Convert each (category, currency) row to base, then re-aggregate by
      // categoryId — a category may have transactions in multiple currencies.
      const cache = fxService.newCache();
      const agg = new Map<string, DashboardCategorySlice>();
      for (const r of rows) {
        const converted = await fxService.convert(
          r.amount,
          r.currency,
          base,
          monthAnchor,
          cache,
        );
        const key = r.category_id ?? '__uncat__';
        const existing = agg.get(key);
        if (existing) {
          existing.amount = new Decimal(existing.amount).plus(converted).toFixed(2);
        } else {
          agg.set(key, {
            categoryId: r.category_id,
            categoryName: r.category_name,
            color: r.color,
            amount: converted,
          });
        }
      }
      slices = Array.from(agg.values()).sort(
        (a, b) => Number(b.amount) - Number(a.amount),
      );
    } else {
      const rows = await dashboardRepo.spendByCategoryForMonth(userId, monthAnchor);
      slices = rows.map((r) => ({
        categoryId: r.category_id,
        categoryName: r.category_name,
        color: r.color,
        amount: r.amount,
      }));
    }
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
      { categoryId: string | null; name: string; color: string; amount: Decimal }
    >();
    for (const s of slices) {
      if (s.categoryId === null) {
        // Uncategorized stays its own slice — no parent to roll into.
        const existing = rollup.get('uncat');
        if (existing) existing.amount = existing.amount.plus(s.amount);
        else
          rollup.set('uncat', {
            categoryId: null,
            name: s.categoryName,
            color: s.color,
            amount: new Decimal(s.amount),
          });
        continue;
      }
      const rootId = rootIdOf(s.categoryId);
      const rootDisplay = display.get(rootId);
      const existing = rollup.get(rootId);
      if (existing) {
        existing.amount = existing.amount.plus(s.amount);
      } else {
        rollup.set(rootId, {
          categoryId: rootId,
          // If the root category was itself deleted after tx were assigned
          // to it, fall back to the slice's own label.
          name: rootDisplay?.name ?? s.categoryName,
          color: rootDisplay?.color ?? s.color,
          amount: new Decimal(s.amount),
        });
      }
    }

    return Array.from(rollup.values())
      .map((r) => ({
        categoryId: r.categoryId,
        categoryName: r.name,
        color: r.color,
        amount: r.amount.toFixed(2),
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
    if (!flags.multiCurrency) {
      const rows = await dashboardRepo.trend(userId, anchor, months);
      return rows.map((r) => ({
        month: r.month,
        income: r.income,
        expenses: r.expenses,
      }));
    }

    const base = await getBaseCurrency(userId);
    const rows = await dashboardRepo.trendByCurrency(userId, anchor, months);
    const cache = fxService.newCache();
    const byMonth = new Map<string, { income: Decimal; expenses: Decimal }>();
    for (const r of rows) {
      // Convert at the row's own month anchor, not the query's end anchor,
      // so historical months use their contemporaneous rate.
      const rowAnchor = monthToDate(r.month);
      const inc = await fxService.convert(r.income, r.currency, base, rowAnchor, cache);
      const exp = await fxService.convert(r.expenses, r.currency, base, rowAnchor, cache);
      const existing = byMonth.get(r.month);
      if (existing) {
        existing.income = existing.income.plus(inc);
        existing.expenses = existing.expenses.plus(exp);
      } else {
        byMonth.set(r.month, { income: new Decimal(inc), expenses: new Decimal(exp) });
      }
    }
    // Ensure we emit exactly `months` points even when some months had no
    // activity — walk the anchor backwards.
    const points: DashboardTrendPoint[] = [];
    const [ay, am] = anchor.split('-').map(Number) as [number, number];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(ay, am - 1 - i, 1));
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const key = `${yyyy}-${mm}`;
      const b = byMonth.get(key);
      points.push({
        month: key,
        income: (b?.income ?? new Decimal(0)).toFixed(2),
        expenses: (b?.expenses ?? new Decimal(0)).toFixed(2),
      });
    }
    return points;
  }

  async function netWorth(
    userId: string,
    months: number,
    endMonth?: string,
  ): Promise<DashboardNetWorthPoint[]> {
    const anchor = endMonth ? monthToDate(endMonth) : currentMonthAnchor();
    if (!flags.multiCurrency) {
      const rows = await dashboardRepo.netWorth(userId, anchor, months);
      return rows.map((r) => ({ month: r.month, netWorth: r.net_worth }));
    }

    const base = await getBaseCurrency(userId);
    const rows = await dashboardRepo.netWorthByCurrency(userId, anchor, months);
    const cache = fxService.newCache();
    const byMonth = new Map<string, Decimal>();
    for (const r of rows) {
      const rowAnchor = monthToDate(r.month);
      const converted = await fxService.convert(
        r.net_worth,
        r.currency,
        base,
        rowAnchor,
        cache,
      );
      const existing = byMonth.get(r.month);
      byMonth.set(r.month, (existing ?? new Decimal(0)).plus(converted));
    }
    const points: DashboardNetWorthPoint[] = [];
    const [ay, am] = anchor.split('-').map(Number) as [number, number];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(ay, am - 1 - i, 1));
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const key = `${yyyy}-${mm}`;
      points.push({
        month: key,
        netWorth: (byMonth.get(key) ?? new Decimal(0)).toFixed(2),
      });
    }
    return points;
  }

  return { summary, byCategory, trend, netWorth };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
