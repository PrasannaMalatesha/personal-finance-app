import { Router } from 'express';
import type { OAuthController } from '../controllers/oauth.controller';

export function createOAuthRouter(controller: OAuthController): Router {
  const router = Router();
  // No auth middleware — the whole point is to sign a user in.
  router.get('/google/start', controller.start);
  router.get('/google/callback', controller.callback);
  return router;
}
