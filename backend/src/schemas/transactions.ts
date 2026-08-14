import { z } from 'zod';

const DecimalString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal with up to 2 fractional digits');

const DateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

export const CreateTransactionInput = z.object({
  accountId: z.string().uuid(),
  date: DateString,
  description: z.string().min(1).max(500).trim(),
  amount: DecimalString,
  categoryId: z.string().uuid().nullable().optional(),
});
export type CreateTransactionInput = z.infer<typeof CreateTransactionInput>;

export const UpdateTransactionInput = z
  .object({
    accountId: z.string().uuid().optional(),
    date: DateString.optional(),
    description: z.string().min(1).max(500).trim().optional(),
    amount: DecimalString.optional(),
    categoryId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (data) =>
      data.accountId !== undefined ||
      data.date !== undefined ||
      data.description !== undefined ||
      data.amount !== undefined ||
      data.categoryId !== undefined,
    { message: 'At least one field must be provided' },
  );
export type UpdateTransactionInput = z.infer<typeof UpdateTransactionInput>;

export const ListTransactionsQuery = z.object({
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  from: DateString.optional(),
  to: DateString.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  // Free-text search on description. Case-insensitive substring match.
  // Blank → treated as absent so the filter drops out of the SQL.
  q: z
    .string()
    .trim()
    .max(120)
    .transform((s) => (s === '' ? undefined : s))
    .optional(),
});
export type ListTransactionsQuery = z.infer<typeof ListTransactionsQuery>;

// Export shares every filter with the list except paging.
export const ExportTransactionsQuery = ListTransactionsQuery.omit({
  cursor: true,
  limit: true,
});
export type ExportTransactionsQuery = z.infer<typeof ExportTransactionsQuery>;

export const TransactionPublic = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  date: z.string(),
  description: z.string(),
  amount: z.string(),
  categoryId: z.string().uuid().nullable(),
  importBatchId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type TransactionPublic = z.infer<typeof TransactionPublic>;
