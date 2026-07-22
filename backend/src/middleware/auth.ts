import type { Request, Response, NextFunction } from 'express';
import { UnauthenticatedError } from '../errors/AppError';
import type { TokenSigner } from '../lib/tokens';

export interface AuthenticatedRequest extends Request {
  user: { id: string };
}

export function createAuthMiddleware(tokenSigner: TokenSigner) {
  return function authMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): void {
    const accessToken = req.cookies?.accessToken as string | undefined;
    if (!accessToken) {
      return next(new UnauthenticatedError());
    }
    try {
      const payload = tokenSigner.verifyAccess(accessToken);
      (req as AuthenticatedRequest).user = { id: payload.sub };
      return next();
    } catch {
      return next(new UnauthenticatedError());
    }
  };
}
