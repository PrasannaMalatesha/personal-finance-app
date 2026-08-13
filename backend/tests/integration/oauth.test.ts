import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { createTestPool } from './helpers/testDb';
import { buildTestApp } from './helpers/testApp';

describe('OAuth routes (integration)', () => {
  let pool: Pool;
  let app: Express;

  beforeAll(() => {
    pool = createTestPool();
    app = buildTestApp(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  describe('GET /api/v1/auth/oauth/google/start', () => {
    it('302s to Google and sets an oauth_state cookie', async () => {
      const res = await request(app).get('/api/v1/auth/oauth/google/start');
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2/);
      const setCookie = res.headers['set-cookie'] as unknown as string[];
      const stateCookie = setCookie.find((c) => c.startsWith('oauth_state='));
      expect(stateCookie).toBeTruthy();
      expect(stateCookie).toContain('HttpOnly');
    });

    it('embeds the state value in the redirect URL', async () => {
      const res = await request(app).get('/api/v1/auth/oauth/google/start');
      const state = /oauth_state=([^;]+)/.exec(
        (res.headers['set-cookie'] as unknown as string[]).join(';'),
      )?.[1];
      expect(state).toBeTruthy();
      expect(res.headers.location).toContain(`state=${state}`);
    });
  });

  describe('GET /api/v1/auth/oauth/google/callback', () => {
    it('redirects to /login?error=oauth_cancelled when no ?code is present', async () => {
      const res = await request(app)
        .get('/api/v1/auth/oauth/google/callback')
        .set('Cookie', 'oauth_state=abc');
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/\/login\?error=oauth_cancelled/);
    });

    it('redirects to /login?error=oauth_failed on state mismatch', async () => {
      const res = await request(app)
        .get('/api/v1/auth/oauth/google/callback?code=abc&state=mismatched')
        .set('Cookie', 'oauth_state=other');
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/\/login\?error=oauth_failed/);
    });
  });
});
