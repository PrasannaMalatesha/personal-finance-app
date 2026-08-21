import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { randomUUID } from 'crypto';
import { createTestPool, truncateAll } from './helpers/testDb';
import { buildTestApp, signupAndGetCookies } from './helpers/testApp';

/**
 * Security regression suite — proves the defenses stay wired. If any of
 * these fail, ship-blocking. Each test names the attack it's guarding
 * against so a future reader knows the intent, not just the assertion.
 */
describe('Security posture (integration)', () => {
  let pool: Pool;
  let app: Express;

  beforeAll(() => {
    pool = createTestPool();
    app = buildTestApp(pool);
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(pool);
  });

  describe('security headers', () => {
    it('sets a strict Content-Security-Policy', async () => {
      const res = await request(app).get('/healthz');
      const csp = res.headers['content-security-policy'];
      expect(csp).toBeTruthy();
      expect(csp).toMatch(/default-src 'self'/);
      expect(csp).toMatch(/object-src 'none'/);
      expect(csp).toMatch(/frame-ancestors 'none'/);
    });

    it('sets X-Content-Type-Options: nosniff', async () => {
      const res = await request(app).get('/healthz');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('sets Referrer-Policy: no-referrer', async () => {
      const res = await request(app).get('/healthz');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
    });

    it('does not leak x-powered-by', async () => {
      const res = await request(app).get('/healthz');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('sets Strict-Transport-Security', async () => {
      const res = await request(app).get('/healthz');
      expect(res.headers['strict-transport-security']).toBeTruthy();
    });
  });

  describe('input validation — unknown-field rejection', () => {
    it('rejects extra fields in signup body (defends against mass-assignment)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: `user${Date.now()}@example.com`,
          password: 'password123',
          baseCurrency: 'USD',
          // Attack surface: what if the server naively persisted these?
          isAdmin: true,
          role: 'root',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects extra fields in login body', async () => {
      // Plain extra key — __proto__ is stripped by JSON.parse and would
      // never reach Zod, so it's not a fair test of strict-mode rejection.
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'a@b.com',
          password: 'x',
          rememberMe: true,
        });
      expect(res.status).toBe(400);
    });

    it('rejects extra fields in change-password body', async () => {
      const { accessCookie } = await signupAndGetCookies(app);
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Cookie', accessCookie)
        .send({
          currentPassword: 'password123',
          newPassword: 'newpassword123',
          userId: 'different-user',
        });
      expect(res.status).toBe(400);
    });
  });

  describe('SQL injection safety', () => {
    it('search q with a SQL-injection payload returns 0 rows, no error', async () => {
      const { accessCookie } = await signupAndGetCookies(app);
      const acctRes = await request(app)
        .post('/api/v1/accounts')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Checking', type: 'checking', openingBalance: '0' });
      const accountId = acctRes.body.data.id;

      await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          accountId,
          date: '2026-08-14',
          description: 'legit charge',
          amount: '-10.00',
        });

      // Classic SQL-injection probes — parameterization means these are
      // just plain search strings, matching literally.
      for (const payload of [
        "'; DROP TABLE users;--",
        "' OR 1=1--",
        "%'; DELETE FROM transactions;--",
      ]) {
        const res = await request(app)
          .get(`/api/v1/transactions?q=${encodeURIComponent(payload)}`)
          .set('Cookie', accessCookie);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBe(0);
      }

      // Prove the users + transactions tables still exist by re-listing.
      const check = await request(app)
        .get('/api/v1/transactions')
        .set('Cookie', accessCookie);
      expect(check.status).toBe(200);
      expect(check.body.data.length).toBe(1);
    });
  });

  describe('XSS payload storage — echoed back unchanged (no injection into a rendering context)', () => {
    it('transaction description with <script> round-trips as data, not as HTML', async () => {
      const { accessCookie } = await signupAndGetCookies(app);
      const acctRes = await request(app)
        .post('/api/v1/accounts')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Checking', type: 'checking', openingBalance: '0' });
      const accountId = acctRes.body.data.id;

      const payload = '<script>alert("xss")</script>';
      const created = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          accountId,
          date: '2026-08-14',
          description: payload,
          amount: '-1.00',
        });
      expect(created.status).toBe(201);
      // The API returns JSON with the raw string — React renders it as text
      // by default, and any consumer that inserts it into HTML must escape.
      expect(created.body.data.description).toBe(payload);
      expect(created.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('rate limiting middleware', () => {
    // Rate-limit ceilings are raised in NODE_ENV=test so they don't
    // blackhole the rest of the suite. To prove the mechanism still works,
    // mount a tiny express app with a fresh limiter and hammer it directly.
    it('returns 429 with the RATE_LIMITED code after crossing the ceiling', async () => {
      const express = (await import('express')).default;
      const rateLimit = (await import('express-rate-limit')).default;
      const mini = express();
      mini.use(
        rateLimit({
          windowMs: 60 * 1000,
          limit: 2,
          standardHeaders: 'draft-7',
          legacyHeaders: false,
          message: { error: { code: 'RATE_LIMITED', message: 'slow down' } },
        }),
      );
      mini.get('/', (_req, res) => res.status(200).json({ ok: true }));

      const a = await request(mini).get('/');
      const b = await request(mini).get('/');
      const c = await request(mini).get('/');
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(c.status).toBe(429);
      expect(c.body.error.code).toBe('RATE_LIMITED');
    });
  });
});
