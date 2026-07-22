import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { randomUUID } from 'crypto';
import { createTestPool, truncateAll } from './helpers/testDb';
import { buildTestApp, signupAndGetCookies } from './helpers/testApp';

describe('Accounts (integration)', () => {
  let pool: Pool;
  let app: Express;
  let accessCookie: string;

  beforeAll(() => {
    pool = createTestPool();
    app = buildTestApp(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    const { accessCookie: c } = await signupAndGetCookies(app);
    accessCookie = c;
  });

  describe('GET /api/v1/accounts', () => {
    it('returns [] for a new user', async () => {
      const res = await request(app)
        .get('/api/v1/accounts')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/v1/accounts');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/v1/accounts', () => {
    it('creates an account with valid input', async () => {
      const res = await request(app)
        .post('/api/v1/accounts')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Checking', type: 'checking', openingBalance: '1000.00' });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        name: 'Checking',
        type: 'checking',
        openingBalance: '1000.00',
        currentBalance: '1000.00',
      });
    });

    it('returns 400 when Idempotency-Key is missing', async () => {
      const res = await request(app)
        .post('/api/v1/accounts')
        .set('Cookie', accessCookie)
        .send({ name: 'Checking', type: 'checking', openingBalance: '0' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('returns 409 on duplicate name', async () => {
      const body = { name: 'Checking', type: 'checking', openingBalance: '0' };
      await request(app)
        .post('/api/v1/accounts')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send(body);

      const res = await request(app)
        .post('/api/v1/accounts')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send(body);
      expect(res.status).toBe(409);
    });

    it('returns 400 on invalid type', async () => {
      const res = await request(app)
        .post('/api/v1/accounts')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Weird', type: 'crypto', openingBalance: '0' });
      expect(res.status).toBe(400);
    });
  });

  describe('idempotency semantics', () => {
    const body = { name: 'CheckingIdem', type: 'checking' as const, openingBalance: '100.00' };

    it('replay: same key + same body returns the cached response, only one row', async () => {
      const key = randomUUID();
      const first = await request(app)
        .post('/api/v1/accounts')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', key)
        .send(body);
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/api/v1/accounts')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', key)
        .send(body);
      expect(second.status).toBe(201);
      expect(second.body.data.id).toBe(first.body.data.id);

      const list = await request(app)
        .get('/api/v1/accounts')
        .set('Cookie', accessCookie);
      expect(list.body.data).toHaveLength(1);
    });

    it('mismatch: same key + different body returns 422 IDEMPOTENCY_KEY_MISMATCH', async () => {
      const key = randomUUID();
      const first = await request(app)
        .post('/api/v1/accounts')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', key)
        .send(body);
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/api/v1/accounts')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', key)
        .send({ ...body, name: 'DifferentName' });
      expect(second.status).toBe(422);
      expect(second.body.error.code).toBe('IDEMPOTENCY_KEY_MISMATCH');
    });

    it('different keys + same body create separate rows (409 on unique name)', async () => {
      const first = await request(app)
        .post('/api/v1/accounts')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send(body);
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/api/v1/accounts')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send(body);
      // Different key means we skip replay and go to handler, which trips
      // the unique constraint on account name → 409.
      expect(second.status).toBe(409);
    });
  });

  describe('PATCH /api/v1/accounts/:id', () => {
    it('updates fields and returns fresh currentBalance', async () => {
      const created = await request(app)
        .post('/api/v1/accounts')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Savings', type: 'savings', openingBalance: '500.00' });

      const res = await request(app)
        .patch(`/api/v1/accounts/${created.body.data.id}`)
        .set('Cookie', accessCookie)
        .send({ name: 'HYSA', openingBalance: '700.00' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        name: 'HYSA',
        openingBalance: '700.00',
        currentBalance: '700.00',
      });
    });
  });

  describe('DELETE /api/v1/accounts/:id', () => {
    it('removes the account', async () => {
      const created = await request(app)
        .post('/api/v1/accounts')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'ToRemove', type: 'checking', openingBalance: '0' });

      const del = await request(app)
        .delete(`/api/v1/accounts/${created.body.data.id}`)
        .set('Cookie', accessCookie);
      expect(del.status).toBe(204);

      const list = await request(app)
        .get('/api/v1/accounts')
        .set('Cookie', accessCookie);
      expect(list.body.data).toHaveLength(0);
    });
  });

  describe('cross-user isolation', () => {
    it('user A cannot see, edit, or delete user B accounts', async () => {
      const created = await request(app)
        .post('/api/v1/accounts')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Private', type: 'checking', openingBalance: '99.99' });
      const accountId = created.body.data.id;

      const { accessCookie: other } = await signupAndGetCookies(app);

      const list = await request(app)
        .get('/api/v1/accounts')
        .set('Cookie', other);
      expect(list.body.data).toHaveLength(0);

      const patch = await request(app)
        .patch(`/api/v1/accounts/${accountId}`)
        .set('Cookie', other)
        .send({ name: 'Hijacked' });
      expect(patch.status).toBe(404);

      const del = await request(app)
        .delete(`/api/v1/accounts/${accountId}`)
        .set('Cookie', other);
      expect(del.status).toBe(404);
    });
  });
});
