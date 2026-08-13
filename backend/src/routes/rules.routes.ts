import { Router, type RequestHandler } from 'express';
import type { RulesController } from '../controllers/rules.controller';
import type { IdempotencyWrapper } from '../middleware/idempotency';
import { send } from '../lib/handler';
import { flags } from '../flags';

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
  // Rule-learning endpoint mounted only when the flag is on so it 404s
  // cleanly in environments where the feature isn't enabled.
  if (flags.ruleLearning) {
    router.post('/learned', send(controller.learn));
  }
  return router;
}
