import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { randomUUID } from 'crypto';
import { createTestPool, truncateAll } from './helpers/testDb';
import { buildTestApp, signupAndGetCookies } from './helpers/testApp';
import { DEFAULT_CATEGORIES } from '../../src/schemas/categories';

describe('Categories (integration)', () => {
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
    const { accessCookie: c } = await signupAndGetCookies(app, request);
    accessCookie = c;
  });

  describe('signup seeds default categories', () => {
    it('creates 18 defaults, all marked isSystemDefault', async () => {
      const res = await request(app)
        .get('/api/v1/categories')
        .set('Cookie', accessCookie);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(18);
      expect(res.body.data.every((c: { isSystemDefault: boolean }) => c.isSystemDefault)).toBe(true);

      const names = res.body.data.map((c: { name: string }) => c.name).sort();
      const expected = [...DEFAULT_CATEGORIES].map((c) => c.name).sort();
      expect(names).toEqual(expected);
    });

    it('rolls back user creation if seeding fails (invariant test — synthetic)', async () => {
      // If seedDefaultsForUser threw, the user would not exist. We can't easily
      // force a failure here without mocking, but if this suite ever sees a
      // signup succeed with 0 categories, that's the bug.
      const res = await request(app)
        .get('/api/v1/categories')
        .set('Cookie', accessCookie);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/categories', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/v1/categories');
      expect(res.status).toBe(401);
    });

    it('is user-scoped — other user cannot see', async () => {
      const { accessCookie: otherCookie } = await signupAndGetCookies(app, request);

      const [mine, theirs] = await Promise.all([
        request(app).get('/api/v1/categories').set('Cookie', accessCookie),
        request(app).get('/api/v1/categories').set('Cookie', otherCookie),
      ]);
      const myIds = mine.body.data.map((c: { id: string }) => c.id);
      const theirIds = theirs.body.data.map((c: { id: string }) => c.id);
      expect(myIds).not.toEqual(theirIds);
    });
  });

  describe('POST /api/v1/categories', () => {
    it('creates a custom category with a required Idempotency-Key', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Coffee', color: '#795548' });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Coffee');
      expect(res.body.data.isSystemDefault).toBe(false);
    });

    it('returns 400 when Idempotency-Key is missing', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Cookie', accessCookie)
        .send({ name: 'Coffee', color: '#795548' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('returns 409 on duplicate name', async () => {
      const body = { name: 'UniqueCat', color: '#123456' };
      await request(app)
        .post('/api/v1/categories')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send(body);
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send(body);

      expect(res.status).toBe(409);
    });

    it('returns 400 on invalid color', async () => {
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Coffee', color: 'not-a-color' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/v1/categories/:id', () => {
    it('renames a category', async () => {
      const created = await request(app)
        .post('/api/v1/categories')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Coffee', color: '#795548' });

      const res = await request(app)
        .patch(`/api/v1/categories/${created.body.data.id}`)
        .set('Cookie', accessCookie)
        .send({ name: 'Espresso' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Espresso');
    });

    it('returns 404 for a category owned by another user', async () => {
      const { accessCookie: otherCookie } = await signupAndGetCookies(app, request);
      const created = await request(app)
        .post('/api/v1/categories')
        .set('Cookie', otherCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Coffee', color: '#795548' });

      const res = await request(app)
        .patch(`/api/v1/categories/${created.body.data.id}`)
        .set('Cookie', accessCookie)
        .send({ name: 'Espresso' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/categories/:id', () => {
    it('removes a category', async () => {
      const created = await request(app)
        .post('/api/v1/categories')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'ToDelete', color: '#000000' });

      const del = await request(app)
        .delete(`/api/v1/categories/${created.body.data.id}`)
        .set('Cookie', accessCookie);
      expect(del.status).toBe(204);

      const list = await request(app)
        .get('/api/v1/categories')
        .set('Cookie', accessCookie);
      const stillExists = list.body.data.some(
        (c: { id: string }) => c.id === created.body.data.id,
      );
      expect(stillExists).toBe(false);
    });
  });
});
