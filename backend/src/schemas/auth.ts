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
  /** True when the user has a password set — determines which change-password path applies. */
  hasPassword: z.boolean(),
  /** True when a Google identity is linked. */
  hasGoogle: z.boolean(),
});
export type UserPublic = z.infer<typeof UserPublic>;

export const UpdateProfileInput = z.object({
  baseCurrency: z.enum(CURRENCY_CODES).optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

// Two paths: existing password users must send currentPassword; OAuth-only
// users setting a password for the first time omit it. Service disambiguates
// by looking at the account's current password_hash.
export const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1).max(128).optional(),
  newPassword: z.string().min(8).max(128),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInput>;

// Delete confirmation — client sends the current email to prove intent.
export const DeleteAccountInput = z.object({
  confirmEmail: z.string().trim().toLowerCase().email(),
});
export type DeleteAccountInput = z.infer<typeof DeleteAccountInput>;
