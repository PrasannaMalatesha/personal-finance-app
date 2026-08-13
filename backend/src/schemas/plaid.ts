import { z } from 'zod';

export const ExchangeInput = z.object({
  publicToken: z.string().min(1),
});
export type ExchangeInput = z.infer<typeof ExchangeInput>;

export const PlaidItemPublic = z.object({
  id: z.string().uuid(),
  institutionName: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type PlaidItemPublic = z.infer<typeof PlaidItemPublic>;

export const LinkTokenResponse = z.object({
  linkToken: z.string(),
  expiration: z.string(),
});
export type LinkTokenResponse = z.infer<typeof LinkTokenResponse>;

export const SyncResponse = z.object({
  added: z.number().int().nonnegative(),
  modified: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  accountsUpserted: z.number().int().nonnegative(),
});
export type SyncResponse = z.infer<typeof SyncResponse>;
