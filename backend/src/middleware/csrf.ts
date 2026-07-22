import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors/AppError';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Auth routes bootstrap cookies — CSRF is not enforceable before login.
// SameSite=Lax on the refresh cookie is the browser-level defense for /refresh.
const AUTH_BOOTSTRAP_PATHS = new Set([
  '/api/v1/auth/signup',
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
]);

export function csrfMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!UNSAFE_METHODS.has(req.method)) return next();
  if (AUTH_BOOTSTRAP_PATHS.has(req.path)) return next();

  const cookieToken = req.cookies?.csrf as string | undefined;
  const headerToken = req.get('X-CSRF-Token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return next(new ForbiddenError('CSRF token missing or invalid'));
  }
  return next();
}
