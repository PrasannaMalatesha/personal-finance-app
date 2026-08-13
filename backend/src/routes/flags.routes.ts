import { Router } from 'express';
import { flags } from '../flags';
import { env } from '../config/env';

export const flagsRouter = Router();

// Frontend reads this once at boot to render environment-aware UI (e.g.
// the Plaid environment badge). Kept separate from the process env so we
// only expose values that are safe for a public client.
flagsRouter.get('/', (_req, res) => {
  res.json({
    data: {
      ...flags,
      plaidEnv: env.PLAID_ENV,
    },
  });
});
