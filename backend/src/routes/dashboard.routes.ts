import { Router, type RequestHandler } from 'express';
import type { DashboardController } from '../controllers/dashboard.controller';
import { flags } from '../flags';
import { send } from '../lib/handler';

export function createDashboardRouter(
  controller: DashboardController,
  authMiddleware: RequestHandler,
): Router {
  const router = Router();
  router.use(authMiddleware);
  router.get('/summary', send(controller.summary));
  router.get('/by-category', send(controller.byCategory));
  router.get('/trend', send(controller.trend));
  // v2 net-worth chart — route only registered when the flag is on so a
  // dashboard visit doesn't 500 on missing data before the feature ships.
  if (flags.netWorth) {
    router.get('/net-worth', send(controller.netWorth));
  }
  return router;
}
