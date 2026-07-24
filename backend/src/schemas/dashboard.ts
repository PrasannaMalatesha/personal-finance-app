import { z } from 'zod';

const MonthString = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Must be YYYY-MM');

export const SummaryQuery = z.object({
  month: MonthString,
});
export type SummaryQuery = z.infer<typeof SummaryQuery>;

export const ByCategoryQuery = z.object({
  month: MonthString,
});
export type ByCategoryQuery = z.infer<typeof ByCategoryQuery>;

export const TrendQuery = z.object({
  // Between 2 and 24 months — covers 6-month default + a full 2-year view later.
  months: z.coerce.number().int().min(2).max(24).default(6),
  endMonth: MonthString.optional(),
});
export type TrendQuery = z.infer<typeof TrendQuery>;

export interface DashboardSummary {
  month: string;
  income: string;
  expenses: string;
  net: string;
  budgetTotalLimit: string;
  budgetTotalSpent: string;
  budgetPercentUsed: number;
}

export interface DashboardCategorySlice {
  categoryId: string | null;
  categoryName: string;
  color: string;
  amount: string;
}

export interface DashboardTrendPoint {
  month: string;
  income: string;
  expenses: string;
}

/** YYYY-MM → first-of-month DATE string. */
export function monthToDate(month: string): string {
  return `${month}-01`;
}
