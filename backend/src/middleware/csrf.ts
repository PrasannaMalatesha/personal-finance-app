import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors/AppError';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// All /api/v1/auth/* routes are session bootstrap/management. CSRF isn't
// enforceable before login (signup/login/refresh) and SameSite=Lax on the
// refresh cookie is the actual browser-level defense against cross-site
// forgery for these endpoints.
const AUTH_PREFIX = '/api/v1/auth/';

export function csrfMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!UNSAFE_METHODS.has(req.method)) return next();
  if (req.path.startsWith(AUTH_PREFIX)) return next();

  const cookieToken = req.cookies?.csrf as string | undefined;
  const headerToken = req.get('X-CSRF-Token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return next(new ForbiddenError('CSRF token missing or invalid'));
  }
  return next();
}
