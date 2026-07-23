import { Router, type RequestHandler } from 'express';
import type { BudgetsController } from '../controllers/budgets.controller';
import { send } from '../lib/handler';

export function createBudgetsRouter(
  controller: BudgetsController,
  authMiddleware: RequestHandler,
): Router {
  const router = Router();
  router.use(authMiddleware);
  router.get('/', send(controller.list));
  router.put('/', send(controller.upsert));
  router.delete('/:id', send(controller.remove));
  return router;
}
