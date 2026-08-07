import { Router } from 'express';
import type { PasswordResetController } from '../controllers/passwordReset.controller';
import { send } from '../lib/handler';
import { passwordResetRateLimit } from '../middleware/rateLimit';

export function createPasswordResetRouter(
  controller: PasswordResetController,
): Router {
  const router = Router();
  // Request-reset triggers an email + is a target for enumeration/mail-bomb
  // scans; keep it rate-limited. reset-password itself is protected by the
  // token being single-use + short-lived, so it doesn't need the same
  // aggressive gate.
  router.post('/request-reset', passwordResetRateLimit, send(controller.requestReset));
  router.post('/reset-password', send(controller.resetPassword));
  return router;
}
