import { z } from 'zod';

export const ACCOUNT_TYPES = ['checking', 'savings', 'credit_card'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Checking',
  savings: 'Savings',
  credit_card: 'Credit card',
};

// Wire form allows an unsigned decimal like "1000" or "1000.00". Empty
// input is coerced to "0" to match the backend default.
const DecimalString = z
  .string()
  .trim()
  .transform((s) => (s === '' ? '0' : s))
  .pipe(z.string().regex(/^-?\d+(\.\d{1,2})?$/, 'Enter a decimal amount'));

export const AccountFormSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(64, 'Too long'),
  type: z.enum(ACCOUNT_TYPES, {
    errorMap: () => ({ message: 'Pick an account type' }),
  }),
  openingBalance: DecimalString,
});
export type AccountFormInput = z.infer<typeof AccountFormSchema>;

export interface AccountPublic {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: string;
  currentBalance: string;
  createdAt: string;
}
