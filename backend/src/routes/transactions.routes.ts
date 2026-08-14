import { Router, type RequestHandler } from 'express';
import type { TransactionsController } from '../controllers/transactions.controller';
import type { IdempotencyWrapper } from '../middleware/idempotency';
import { send } from '../lib/handler';

export function createTransactionsRouter(
  controller: TransactionsController,
  authMiddleware: RequestHandler,
  idempotent: IdempotencyWrapper,
): Router {
  const router = Router();
  router.use(authMiddleware);
  router.get('/', send(controller.list));
  // Export is above the :id delete route (Express matches in order); the
  // filename extension makes the intent obvious from the URL and helps
  // browsers save the file with the right suffix.
  router.get('/export.csv', controller.exportCsv);
  router.post('/', idempotent(controller.create));
  router.patch('/:id', send(controller.update));
  router.delete('/:id', send(controller.remove));
  return router;
}
