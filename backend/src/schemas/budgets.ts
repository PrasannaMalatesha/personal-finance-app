import { z } from 'zod';

const MonthString = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Must be YYYY-MM');

// Non-negative decimal string. The DB CHECK allows 0 (a "spend nothing"
// budget) — the API accepts it too, since it produces sensible responses
// (percentUsed=0 when spent=0, isOverBudget=true when spent>0).
const AmountLimitString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a non-negative decimal with up to 2 fractional digits');

export const UpsertBudgetInput = z.object({
  categoryId: z.string().uuid(),
  month: MonthString,
  amountLimit: AmountLimitString,
});
export type UpsertBudgetInput = z.infer<typeof UpsertBudgetInput>;

export const ListBudgetsQuery = z.object({
  month: MonthString,
});
export type ListBudgetsQuery = z.infer<typeof ListBudgetsQuery>;

export const BudgetPublic = z.object({
  budgetId: z.string().uuid(),
  categoryId: z.string().uuid(),
  categoryName: z.string(),
  color: z.string(),
  month: z.string(),
  amountLimit: z.string(),
  amountSpent: z.string(),
  amountRemaining: z.string(),
  percentUsed: z.number().int(),
  isOverBudget: z.boolean(),
});
export type BudgetPublic = z.infer<typeof BudgetPublic>;

/** Convert an already-validated YYYY-MM to a first-of-month date string. */
export function monthToDate(month: string): string {
  return `${month}-01`;
}
