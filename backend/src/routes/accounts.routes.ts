import { Router, type RequestHandler } from 'express';
import type { AccountsController } from '../controllers/accounts.controller';
import type { IdempotencyWrapper } from '../middleware/idempotency';
import { send } from '../lib/handler';

export function createAccountsRouter(
  controller: AccountsController,
  authMiddleware: RequestHandler,
  idempotent: IdempotencyWrapper,
): Router {
  const router = Router();
  router.use(authMiddleware);
  router.get('/', send(controller.list));
  router.post('/', idempotent(controller.create));
  router.patch('/:id', send(controller.update));
  router.delete('/:id', send(controller.remove));
  return router;
}
