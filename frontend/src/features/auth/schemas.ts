import { z } from 'zod';

// Match the backend's 10-currency list (PRD §11).
export const BASE_CURRENCIES = [
  'INR',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CAD',
  'AUD',
  'SGD',
  'AED',
  'CHF',
] as const;
export type BaseCurrency = (typeof BASE_CURRENCIES)[number];

export const LoginSchema = z.object({
  email: z.string().trim().min(1, 'Required').email('Enter a valid email'),
  password: z.string().min(1, 'Required'),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const SignupSchema = z.object({
  email: z.string().trim().min(1, 'Required').email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
  baseCurrency: z.enum(BASE_CURRENCIES, {
    errorMap: () => ({ message: 'Pick a currency' }),
  }),
});
export type SignupInput = z.infer<typeof SignupSchema>;

export interface AuthUser {
  id: string;
  email: string;
  baseCurrency: BaseCurrency;
  hasPassword?: boolean;
  hasGoogle?: boolean;
}

export const RequestResetSchema = z.object({
  email: z.string().trim().min(1, 'Required').email('Enter a valid email'),
});
export type RequestResetInput = z.infer<typeof RequestResetSchema>;

export const ResetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'At least 8 characters'),
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
