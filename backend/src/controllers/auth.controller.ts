import type { CookieOptions, NextFunction, Request, Response } from 'express';
import {
  SignupInput,
  LoginInput,
  UpdateProfileInput,
  ChangePasswordInput,
  DeleteAccountInput,
} from '../schemas/auth';
import type { AuthService } from '../services/auth.service';
import { ACCESS_TTL_SEC, REFRESH_TTL_SEC } from '../lib/tokens';
import { env } from '../config/env';
import type { AuthenticatedRequest } from '../middleware/auth';

const isProd = env.NODE_ENV === 'production';

const accessCookieOpts: CookieOptions = {
  httpOnly: true,
  // Prod is split-origin (frontend on Vercel, API on Render), so auth cookies
  // must be SameSite=None to be sent cross-site — which browsers only accept
  // with Secure. Dev is same-origin via the Vite proxy, so Lax is fine there.
  sameSite: isProd ? 'none' : 'lax',
  secure: isProd,
  domain: env.COOKIE_DOMAIN || undefined,
  path: '/',
  maxAge: ACCESS_TTL_SEC * 1000,
};

const refreshCookieOpts: CookieOptions = {
  ...accessCookieOpts,
  maxAge: REFRESH_TTL_SEC * 1000,
  // Sent to /refresh AND /logout — logout must be able to revoke the token
  // server-side. Any /api/v1/auth/* route sees it; that's the narrowest scope
  // that still allows revocation on logout.
  path: '/api/v1/auth',
};

function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie('accessToken', accessToken, accessCookieOpts);
  res.cookie('refreshToken', refreshToken, refreshCookieOpts);
}

function clearAuthCookies(res: Response): void {
  res.clearCookie('accessToken', { ...accessCookieOpts, maxAge: undefined });
  res.clearCookie('refreshToken', { ...refreshCookieOpts, maxAge: undefined });
}

export interface AuthController {
  signup(req: Request, res: Response, next: NextFunction): Promise<void>;
  login(req: Request, res: Response, next: NextFunction): Promise<void>;
  refresh(req: Request, res: Response, next: NextFunction): Promise<void>;
  logout(req: Request, res: Response, next: NextFunction): Promise<void>;
  me(req: Request, res: Response, next: NextFunction): Promise<void>;
  updateProfile(req: Request, res: Response, next: NextFunction): Promise<void>;
  changePassword(req: Request, res: Response, next: NextFunction): Promise<void>;
  unlinkGoogle(req: Request, res: Response, next: NextFunction): Promise<void>;
  deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createAuthController(authService: AuthService): AuthController {
  return {
    async signup(req, res, next) {
      try {
        const input = SignupInput.parse(req.body);
        const result = await authService.signup(input);
        setAuthCookies(res, result.accessToken, result.refreshToken);
        res.status(201).json({ data: { user: result.user } });
      } catch (err) {
        next(err);
      }
    },

    async login(req, res, next) {
      try {
        const input = LoginInput.parse(req.body);
        const result = await authService.login(input);
        setAuthCookies(res, result.accessToken, result.refreshToken);
        res.status(200).json({ data: { user: result.user } });
      } catch (err) {
        next(err);
      }
    },

    async refresh(req, res, next) {
      try {
        const refreshToken = req.cookies?.refreshToken as string | undefined;
        if (!refreshToken) {
          res.status(401).json({
            error: { code: 'UNAUTHENTICATED', message: 'No refresh token' },
          });
          return;
        }
        const result = await authService.refresh(refreshToken);
        setAuthCookies(res, result.accessToken, result.refreshToken);
        res.status(200).json({ data: { user: result.user } });
      } catch (err) {
        next(err);
      }
    },

    async logout(req, res, next) {
      try {
        const refreshToken = req.cookies?.refreshToken as string | undefined;
        await authService.logout(refreshToken);
        clearAuthCookies(res);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },

    async me(req, res, next) {
      try {
        const userId = (req as AuthenticatedRequest).user.id;
        const user = await authService.me(userId);
        res.status(200).json({ data: user });
      } catch (err) {
        next(err);
      }
    },

    async updateProfile(req, res, next) {
      try {
        const userId = (req as AuthenticatedRequest).user.id;
        const input = UpdateProfileInput.parse(req.body);
        const user = await authService.updateProfile(userId, input);
        res.status(200).json({ data: user });
      } catch (err) {
        next(err);
      }
    },

    async changePassword(req, res, next) {
      try {
        const userId = (req as AuthenticatedRequest).user.id;
        const input = ChangePasswordInput.parse(req.body);
        await authService.changePassword(userId, input);
        // Refresh sessions were revoked — clear cookies so the next request
        // forces a fresh login with the new password.
        clearAuthCookies(res);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },

    async unlinkGoogle(req, res, next) {
      try {
        const userId = (req as AuthenticatedRequest).user.id;
        await authService.unlinkGoogle(userId);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },

    async deleteAccount(req, res, next) {
      try {
        const userId = (req as AuthenticatedRequest).user.id;
        const input = DeleteAccountInput.parse(req.body);
        await authService.deleteAccount(userId, input);
        clearAuthCookies(res);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  };
}
