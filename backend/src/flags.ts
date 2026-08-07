import { env } from './config/env';

export const flags = {
  plaid: env.FLAG_PLAID,
  recurringDetection: env.FLAG_RECURRING,
  multiCurrency: env.FLAG_MULTI_CURRENCY,
  netWorth: env.FLAG_NET_WORTH,
  hierarchicalCategories: env.FLAG_HIERARCHICAL_CATEGORIES,
} as const;

export type Flag = keyof typeof flags;
