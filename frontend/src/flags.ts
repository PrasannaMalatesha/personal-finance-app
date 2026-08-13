export const flags = {
  plaid: import.meta.env.VITE_FLAG_PLAID === 'true',
  recurringDetection: import.meta.env.VITE_FLAG_RECURRING === 'true',
  multiCurrency: import.meta.env.VITE_FLAG_MULTI_CURRENCY === 'true',
  netWorth: import.meta.env.VITE_FLAG_NET_WORTH === 'true',
  hierarchicalCategories:
    import.meta.env.VITE_FLAG_HIERARCHICAL_CATEGORIES === 'true',
  passwordReset: import.meta.env.VITE_FLAG_PASSWORD_RESET === 'true',
  ruleLearning: import.meta.env.VITE_FLAG_RULE_LEARNING === 'true',
} as const;
