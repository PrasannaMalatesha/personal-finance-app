import { Router } from 'express';
import type { PlaidController } from '../controllers/plaid.controller';
import { send } from '../lib/handler';
import type { createAuthMiddleware } from '../middleware/auth';

export function createPlaidRouter(
  controller: PlaidController,
  authMiddleware: ReturnType<typeof createAuthMiddleware>,
): Router {
  const router = Router();
  router.use(authMiddleware);
  // Link token — safe to call repeatedly (Plaid mints a fresh token each
  // time; short-lived). No idempotency wrapper needed.
  router.post('/link_token', send(controller.createLinkToken));
  // Exchange is inherently one-shot per Plaid public_token (Plaid returns
  // an error if reused), so we don't need our own idempotency layer here.
  router.post('/exchange', send(controller.exchange));
  router.get('/items', send(controller.listItems));
  router.post('/items/:id/sync', send(controller.syncItem));
  router.delete('/items/:id', send(controller.removeItem));
  return router;
}
