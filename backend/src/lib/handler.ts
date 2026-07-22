import type { NextFunction, Request, Response } from 'express';

export type AuthedRequest = Request & { user: { id: string } };

export type StatusBodyHandler = (
  req: AuthedRequest,
) => Promise<{ status: number; body: unknown }>;

/**
 * Adapter: turn a (req) => { status, body } handler into an Express handler.
 * Non-idempotent routes use this. Idempotent routes use idempotent() instead.
 */
export function send(handler: StatusBodyHandler) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await handler(req as AuthedRequest);
      res.status(result.status).json(result.body);
    } catch (err) {
      next(err);
    }
  };
}
