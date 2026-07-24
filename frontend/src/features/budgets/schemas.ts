import { z } from 'zod';

/** Wire shape returned by GET /budgets and PUT /budgets. */
export interface BudgetPublic {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  color: string;
  month: string;
  amountLimit: string;
  amountSpent: string;
  amountRemaining: string;
  percentUsed: number;
  isOverBudget: boolean;
}

// Non-negative decimal with up to 2 fractional digits — matches the backend
// AmountLimitString regex in backend/src/schemas/budgets.ts.
const AmountLimitString = z
  .string()
  .trim()
  .min(1, 'Required')
  .regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount like 500 or 500.00');

export const BudgetFormSchema = z.object({
  categoryId: z.string().uuid('Pick a category'),
  amountLimit: AmountLimitString,
});
export type BudgetFormInput = z.infer<typeof BudgetFormSchema>;

/** Current month in the browser's local timezone (TRD §15.4). */
export function currentMonth(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Shift a YYYY-MM by N months (positive = forward, negative = backward). */
export function shiftMonth(month: string, delta: number): string {
  const [yStr, mStr] = month.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return month;
  const base = new Date(Date.UTC(y, m - 1 + delta, 1));
  const ny = base.getUTCFullYear();
  const nm = String(base.getUTCMonth() + 1).padStart(2, '0');
  return `${ny}-${nm}`;
}

/** Human label for a YYYY-MM ("July 2026"). */
export function formatMonthLabel(month: string): string {
  const [yStr, mStr] = month.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}
