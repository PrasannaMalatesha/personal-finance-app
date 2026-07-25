import { Router, type RequestHandler } from 'express';
import type { RulesController } from '../controllers/rules.controller';
import type { IdempotencyWrapper } from '../middleware/idempotency';
import { send } from '../lib/handler';

export function createRulesRouter(
  controller: RulesController,
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
