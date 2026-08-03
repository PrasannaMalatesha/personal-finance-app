import { Router, type RequestHandler } from 'express';
import type { RecurringController } from '../controllers/recurring.controller';
import { send } from '../lib/handler';

export function createRecurringRouter(
  controller: RecurringController,
  authMiddleware: RequestHandler,
): Router {
  const router = Router();
  router.use(authMiddleware);
  router.get('/', send(controller.list));
  router.post('/detect', send(controller.detect));
  router.post('/:id/dismiss', send(controller.dismiss));
  router.delete('/:id', send(controller.remove));
  return router;
}
