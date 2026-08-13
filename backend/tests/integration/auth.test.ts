import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { createApp } from '../../src/app';
import { buildContainer } from '../../src/container';
import logger from '../../src/logger';
import { createTestPool, truncateAll } from './helpers/testDb';

function findCookie(setCookie: string[] | undefined, name: string): string | undefined {
  return setCookie?.find((c) => c.startsWith(`${name}=`));
}

describe('Auth flow (integration)', () => {
  let pool: Pool;
  let app: Express;

  beforeAll(() => {
    pool = createTestPool();
    const container = buildContainer(pool, logger, {
      jwtAccessSecret: process.env.JWT_ACCESS_SECRET!,
      jwtRefreshSecret: process.env.JWT_REFRESH_SECRET!,
      frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    });
    app = createApp(container);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  describe('POST /api/v1/auth/signup', () => {
    it('creates a user and sets access + refresh cookies', async () => {
      const res = await request(app).post('/api/v1/auth/signup').send({
        email: 'alice@example.com',
        password: 'password123',
        baseCurrency: 'INR',
      });

      expect(res.status).toBe(201);
      expect(res.body.data.user).toMatchObject({
        email: 'alice@example.com',
        baseCurrency: 'INR',
      });
      expect(res.body.data.user.id).toMatch(/^[0-9a-f-]{36}$/);

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(findCookie(cookies, 'accessToken')).toBeDefined();
      expect(findCookie(cookies, 'refreshToken')).toBeDefined();
    });

    it('returns 409 on duplicate email (sequential)', async () => {
      const body = {
        email: 'alice@example.com',
        password: 'password123',
        baseCurrency: 'USD',
      };
      await request(app).post('/api/v1/auth/signup').send(body);
      const res = await request(app).post('/api/v1/auth/signup').send(body);

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('returns 409 (not 500) on concurrent duplicate signup', async () => {
      const body = {
        email: 'race@example.com',
        password: 'password123',
        baseCurrency: 'USD',
      };
      const [r1, r2] = await Promise.all([
        request(app).post('/api/v1/auth/signup').send(body),
        request(app).post('/api/v1/auth/signup').send(body),
      ]);

      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 409]);
    });

    it('returns 400 on invalid input', async () => {
      const res = await request(app).post('/api/v1/auth/signup').send({
        email: 'not-an-email',
        password: 'short',
        baseCurrency: 'XYZ',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('returns the user with a valid access cookie', async () => {
      const signup = await request(app).post('/api/v1/auth/signup').send({
        email: 'bob@example.com',
        password: 'password123',
        baseCurrency: 'EUR',
      });
      const cookies = signup.headers['set-cookie'] as unknown as string[];

      const res = await request(app).get('/api/v1/auth/me').set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe('bob@example.com');
      expect(res.body.data.baseCurrency).toBe('EUR');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/v1/auth/signup').send({
        email: 'carol@example.com',
        password: 'password123',
        baseCurrency: 'GBP',
      });
    });

    it('succeeds with correct credentials', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'carol@example.com',
        password: 'password123',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('carol@example.com');
    });

    it('returns 401 on wrong password (generic message)', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'carol@example.com',
        password: 'wrong-password',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('returns 401 on unknown email (same generic message)', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'nobody@example.com',
        password: 'password123',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('POST /api/v1/auth/refresh — rotation', () => {
    let refreshCookie: string;

    beforeEach(async () => {
      const signup = await request(app).post('/api/v1/auth/signup').send({
        email: `refresh-${Date.now()}@example.com`,
        password: 'password123',
        baseCurrency: 'USD',
      });
      const cookies = signup.headers['set-cookie'] as unknown as string[];
      refreshCookie = findCookie(cookies, 'refreshToken')!;
    });

    it('rotates the refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie);

      expect(res.status).toBe(200);
      const newCookies = res.headers['set-cookie'] as unknown as string[];
      const newRefresh = findCookie(newCookies, 'refreshToken');
      expect(newRefresh).toBeDefined();
      expect(newRefresh).not.toBe(refreshCookie);
    });

    it('detects reuse of a revoked token and revokes the whole session', async () => {
      // First refresh: succeeds and rotates
      const first = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie);
      expect(first.status).toBe(200);
      const newCookies = first.headers['set-cookie'] as unknown as string[];
      const newRefresh = findCookie(newCookies, 'refreshToken')!;

      // Second refresh with the OLD (now-revoked) cookie: 401 — session theft signal
      const second = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie);
      expect(second.status).toBe(401);

      // Third refresh with the NEW cookie also fails — reuse detection revoked ALL user tokens
      const third = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', newRefresh);
      expect(third.status).toBe(401);
    });

    it('returns 401 for an unknown refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', 'refreshToken=totally-not-a-real-token');
      expect(res.status).toBe(401);
    });

    it('returns 401 when no refresh cookie is present', async () => {
      const res = await request(app).post('/api/v1/auth/refresh');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('revokes the refresh token server-side so a subsequent refresh fails', async () => {
      const signup = await request(app).post('/api/v1/auth/signup').send({
        email: 'zoe@example.com',
        password: 'password123',
        baseCurrency: 'JPY',
      });
      const cookies = signup.headers['set-cookie'] as unknown as string[];
      const refreshCookie = findCookie(cookies, 'refreshToken')!;

      const logout = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', refreshCookie);
      expect(logout.status).toBe(204);

      const refresh = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie);
      expect(refresh.status).toBe(401);
    });

    it('is safe to call without a refresh cookie', async () => {
      const res = await request(app).post('/api/v1/auth/logout');
      expect(res.status).toBe(204);
    });
  });

  describe('account settings', () => {
    async function signupAndGetCookie(email: string): Promise<string> {
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send({ email, password: 'password123', baseCurrency: 'USD' });
      const cookies = res.headers['set-cookie'] as unknown as string[];
      return findCookie(cookies, 'accessToken')!;
    }

    it('PATCH /me updates base currency', async () => {
      const cookie = await signupAndGetCookie('settings1@example.com');
      const res = await request(app)
        .patch('/api/v1/auth/me')
        .set('Cookie', cookie)
        .send({ baseCurrency: 'EUR' });
      expect(res.status).toBe(200);
      expect(res.body.data.baseCurrency).toBe('EUR');
      expect(res.body.data.hasPassword).toBe(true);
      expect(res.body.data.hasGoogle).toBe(false);
    });

    it('POST /change-password: rejects wrong current password', async () => {
      const cookie = await signupAndGetCookie('settings2@example.com');
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: 'wrong-one', newPassword: 'newpassword123' });
      expect(res.status).toBe(401);
    });

    it('POST /change-password: rotates password, revokes sessions, logs in with new one', async () => {
      const email = 'settings3@example.com';
      const signup = await request(app)
        .post('/api/v1/auth/signup')
        .send({ email, password: 'oldpassword123', baseCurrency: 'USD' });
      const cookies = signup.headers['set-cookie'] as unknown as string[];
      const accessCookie = findCookie(cookies, 'accessToken')!;
      const refreshCookie = findCookie(cookies, 'refreshToken')!;

      const change = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Cookie', accessCookie)
        .send({ currentPassword: 'oldpassword123', newPassword: 'newpassword456' });
      expect(change.status).toBe(204);

      // Existing refresh token no longer works.
      const refresh = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie);
      expect(refresh.status).toBe(401);

      // Login with new password succeeds; old one fails.
      const badLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'oldpassword123' });
      expect(badLogin.status).toBe(401);
      const goodLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'newpassword456' });
      expect(goodLogin.status).toBe(200);
    });

    it('DELETE /me: rejects when confirmEmail does not match', async () => {
      const cookie = await signupAndGetCookie('settings4@example.com');
      const res = await request(app)
        .delete('/api/v1/auth/me')
        .set('Cookie', cookie)
        .send({ confirmEmail: 'someone-else@example.com' });
      expect(res.status).toBe(400);
    });

    it('DELETE /me: deletes the user and cascades their data', async () => {
      const email = 'settings5@example.com';
      const signup = await request(app)
        .post('/api/v1/auth/signup')
        .send({ email, password: 'password123', baseCurrency: 'USD' });
      const accessCookie = findCookie(
        signup.headers['set-cookie'] as unknown as string[],
        'accessToken',
      )!;
      const userId = signup.body.data.user.id as string;

      const del = await request(app)
        .delete('/api/v1/auth/me')
        .set('Cookie', accessCookie)
        .send({ confirmEmail: email });
      expect(del.status).toBe(204);

      // User row gone.
      const check = await pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
      expect(check.rowCount).toBe(0);
      // Seeded categories gone via cascade.
      const cats = await pool.query('SELECT 1 FROM categories WHERE user_id = $1', [userId]);
      expect(cats.rowCount).toBe(0);
    });

    it('DELETE /oauth/google/link: refuses to unlink when the user has no password', async () => {
      // Seed a user directly as OAuth-only (no password) so we can exercise
      // the lockout guard without spinning up the Google flow.
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, base_currency, google_sub)
         VALUES ('oauth-only@example.com', NULL, 'USD', 'google-sub-xyz')
         RETURNING id`,
      );
      const userId = rows[0]!.id;

      // Mint an access cookie for this user via the token signer directly.
      const { createTokenSigner, ACCESS_TTL_SEC } = await import('../../src/lib/tokens');
      const signer = createTokenSigner(
        process.env.JWT_ACCESS_SECRET!,
        process.env.JWT_REFRESH_SECRET!,
      );
      const { token } = signer.signAccess(userId);
      const cookie = `accessToken=${token}; Max-Age=${ACCESS_TTL_SEC}`;

      const res = await request(app)
        .delete('/api/v1/auth/oauth/google/link')
        .set('Cookie', cookie);
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/password/i);
    });
  });
});
