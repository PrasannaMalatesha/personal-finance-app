import { z } from 'zod';

export const CURRENCY_CODES = [
  'INR', 'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'SGD', 'AED', 'CHF',
] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const SignupInput = z.object({
  email: z.string().email().max(254).toLowerCase(),
  password: z.string().min(8).max(128),
  baseCurrency: z.enum(CURRENCY_CODES),
});
export type SignupInput = z.infer<typeof SignupInput>;

export const LoginInput = z.object({
  email: z.string().email().max(254).toLowerCase(),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const UserPublic = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  baseCurrency: z.enum(CURRENCY_CODES),
  createdAt: z.string(),
});
export type UserPublic = z.infer<typeof UserPublic>;
