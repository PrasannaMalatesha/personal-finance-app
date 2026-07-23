import { Router, type Request, type RequestHandler, type Response, type NextFunction } from 'express';
import type { ImportsController } from '../controllers/imports.controller';
import type { IdempotencyWrapper } from '../middleware/idempotency';
import { uploadSingleCsv } from '../middleware/upload';
import { send } from '../lib/handler';

/**
 * `send()` from lib/handler.ts assumes the request is already fully parsed —
 * /preview goes through multer *before* the controller runs, so we inline
 * the try/catch here rather than reuse send() for that route.
 */
function toExpress(
  handler: (req: Request) => Promise<{ status: number; body: unknown }>,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await handler(req);
      res.status(result.status).json(result.body);
    } catch (err) {
      next(err);
    }
  };
}

export function createImportsRouter(
  controller: ImportsController,
  authMiddleware: RequestHandler,
  idempotent: IdempotencyWrapper,
): Router {
  const router = Router();
  router.use(authMiddleware);
  router.post('/preview', uploadSingleCsv('file'), toExpress(controller.preview));
  router.post('/commit', idempotent(controller.commit));
  router.get('/', send(controller.list));
  router.post('/:id/undo', send(controller.undo));
  return router;
}
