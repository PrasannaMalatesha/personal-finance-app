import { z } from 'zod';

export const AccountType = z.enum(['checking', 'savings', 'credit_card']);
export type AccountType = z.infer<typeof AccountType>;

const DecimalString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/, 'Must be a decimal with up to 2 fractional digits');

export const CreateAccountInput = z.object({
  name: z.string().min(1).max(64).trim(),
  type: AccountType,
  openingBalance: DecimalString.default('0'),
});
export type CreateAccountInput = z.infer<typeof CreateAccountInput>;

export const UpdateAccountInput = z
  .object({
    name: z.string().min(1).max(64).trim().optional(),
    type: AccountType.optional(),
    openingBalance: DecimalString.optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.type !== undefined ||
      data.openingBalance !== undefined,
    { message: 'At least one field must be provided' },
  );
export type UpdateAccountInput = z.infer<typeof UpdateAccountInput>;

export const AccountPublic = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: AccountType,
  openingBalance: z.string(),
  currentBalance: z.string(),
  createdAt: z.string(),
});
export type AccountPublic = z.infer<typeof AccountPublic>;
