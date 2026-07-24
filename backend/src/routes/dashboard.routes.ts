import { Router, type RequestHandler } from 'express';
import type { DashboardController } from '../controllers/dashboard.controller';
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
  return router;
}
