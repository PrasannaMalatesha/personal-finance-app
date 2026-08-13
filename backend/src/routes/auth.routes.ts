import { Router, type RequestHandler } from 'express';
import type { AuthController } from '../controllers/auth.controller';
import { loginRateLimit } from '../middleware/rateLimit';

export function createAuthRouter(
  controller: AuthController,
  authMiddleware: RequestHandler,
): Router {
  const router = Router();
  router.post('/signup', controller.signup);
  router.post('/login', loginRateLimit, controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  router.get('/me', authMiddleware, controller.me);
  router.patch('/me', authMiddleware, controller.updateProfile);
  router.post('/change-password', authMiddleware, controller.changePassword);
  router.delete('/oauth/google/link', authMiddleware, controller.unlinkGoogle);
  router.delete('/me', authMiddleware, controller.deleteAccount);
  return router;
}
