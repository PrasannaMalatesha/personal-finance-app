import { z } from 'zod';

// Amount form input: signed decimal string, up to 2 dp. "0" is not
// meaningful; require non-empty.
const AmountString = z
  .string()
  .trim()
  .min(1, 'Required')
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Enter an amount like -450.00 or 25.00');

const DateString = z
  .string()
  .trim()
  .min(1, 'Required')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date');

// Empty string for optional selects; converted to null before hitting the API.
const OptionalUuid = z.string().optional();

export const TransactionFormSchema = z.object({
  accountId: z.string().uuid('Pick an account'),
  date: DateString,
  description: z.string().trim().min(1, 'Required').max(500, 'Too long'),
  amount: AmountString,
  categoryId: OptionalUuid,
});
export type TransactionFormInput = z.infer<typeof TransactionFormSchema>;

export interface TransactionPublic {
  id: string;
  accountId: string;
  date: string;
  description: string;
  amount: string;
  categoryId: string | null;
  importBatchId: string | null;
  createdAt: string;
}

export interface TransactionsFilters {
  accountId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  /** Free-text search on description (ILIKE %q% server-side). */
  q?: string;
  limit?: number;
}
