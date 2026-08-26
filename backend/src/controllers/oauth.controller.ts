import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { ACCESS_TTL_SEC, REFRESH_TTL_SEC } from '../lib/tokens';
import type { OAuthService } from '../services/oauth.service';

const isProd = env.NODE_ENV === 'production';

const accessCookieOpts: CookieOptions = {
  httpOnly: true,
  // Split-origin in prod (frontend Vercel, API Render): the auth tokens are
  // read by frontend XHR cross-site, so SameSite=None (with Secure) is required.
  // Dev stays Lax (same-origin via the Vite proxy). The state cookie below is
  // deliberately left Lax — it's read on a top-level redirect, not XHR.
  sameSite: isProd ? 'none' : 'lax',
  secure: isProd,
  domain: env.COOKIE_DOMAIN || undefined,
  path: '/',
  maxAge: ACCESS_TTL_SEC * 1000,
};
const refreshCookieOpts: CookieOptions = {
  ...accessCookieOpts,
  maxAge: REFRESH_TTL_SEC * 1000,
  path: '/api/v1/auth',
};

// Short-lived cookie carrying the OAuth state — set on /start, read + cleared
// on /callback. Same-site 'lax' works because Google's callback is a top-level
// navigation (browser sends the cookie).
const stateCookieOpts: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProd,
  domain: env.COOKIE_DOMAIN || undefined,
  path: '/api/v1/auth',
  maxAge: 10 * 60 * 1000, // 10 min — user finishes Google flow in seconds
};
const STATE_COOKIE = 'oauth_state';

function safeFrontendRedirect(path: string): string {
  const base = env.FRONTEND_ORIGIN.replace(/\/$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${base}${clean}`;
}

export interface OAuthController {
  start(req: Request, res: Response, next: NextFunction): Promise<void>;
  callback(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createOAuthController(service: OAuthService): OAuthController {
  return {
    async start(_req, res, next) {
      try {
        const { authorizeUrl, state } = service.startFlow();
        res.cookie(STATE_COOKIE, state, stateCookieOpts);
        res.redirect(authorizeUrl);
      } catch (err) {
        next(err);
      }
    },

    async callback(req, res, next) {
      try {
        const code = typeof req.query.code === 'string' ? req.query.code : '';
        const stateFromQuery =
          typeof req.query.state === 'string' ? req.query.state : '';
        const stateFromCookie = (req.cookies?.[STATE_COOKIE] as string) ?? '';
        res.clearCookie(STATE_COOKIE, { ...stateCookieOpts, maxAge: undefined });

        if (!code) {
          // User cancelled at Google's consent screen, or an error came back.
          res.redirect(safeFrontendRedirect('/login?error=oauth_cancelled'));
          return;
        }

        try {
          const result = await service.completeFlow({
            code,
            stateFromQuery,
            stateFromCookie,
          });
          res.cookie('accessToken', result.accessToken, accessCookieOpts);
          res.cookie('refreshToken', result.refreshToken, refreshCookieOpts);
          res.redirect(safeFrontendRedirect('/'));
        } catch {
          res.redirect(safeFrontendRedirect('/login?error=oauth_failed'));
        }
      } catch (err) {
        next(err);
      }
    },
  };
}
