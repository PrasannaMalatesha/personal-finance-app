import { env } from './config/env';

export const flags = {
  plaid: env.FLAG_PLAID,
  recurringDetection: env.FLAG_RECURRING,
  multiCurrency: env.FLAG_MULTI_CURRENCY,
  netWorth: env.FLAG_NET_WORTH,
  hierarchicalCategories: env.FLAG_HIERARCHICAL_CATEGORIES,
  passwordReset: env.FLAG_PASSWORD_RESET,
  ruleLearning: env.FLAG_RULE_LEARNING,
} as const;

export type Flag = keyof typeof flags;
