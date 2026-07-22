import { env } from './config/env';

export const flags = {
  plaid: env.FLAG_PLAID,
  recurringDetection: env.FLAG_RECURRING,
  multiCurrency: env.FLAG_MULTI_CURRENCY,
} as const;

export type Flag = keyof typeof flags;
