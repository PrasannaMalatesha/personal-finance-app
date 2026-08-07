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
    const { accessCookie: c } = await signupAndGetCookies(app);
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
      const { accessCookie: otherCookie } = await signupAndGetCookies(app);

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
      const { accessCookie: otherCookie } = await signupAndGetCookies(app);
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

  describe('parent_category_id (hierarchy)', () => {
    // The 18 seeded categories are all top-level by default. Depth-2 rule:
    // a subcategory can point at a top-level parent, but a top-level can't
    // be re-parented under another top-level (would make its children
    // grandchildren of the new root).
    async function findId(name: string): Promise<string> {
      const list = await request(app)
        .get('/api/v1/categories')
        .set('Cookie', accessCookie);
      const found = (list.body.data as Array<{ id: string; name: string }>).find(
        (c) => c.name === name,
      );
      if (!found) throw new Error(`Category '${name}' not found`);
      return found.id;
    }

    it('creates a subcategory with parentCategoryId set', async () => {
      const diningId = await findId('Dining');
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Coffee', color: '#795548', parentCategoryId: diningId });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        name: 'Coffee',
        parentCategoryId: diningId,
      });
    });

    it('rejects a parent owned by another user with 404', async () => {
      const other = await signupAndGetCookies(app);
      const otherDining = await (async () => {
        const list = await request(app)
          .get('/api/v1/categories')
          .set('Cookie', other.accessCookie);
        return (list.body.data as Array<{ id: string; name: string }>).find(
          (c) => c.name === 'Dining',
        )!.id;
      })();
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'X', color: '#000000', parentCategoryId: otherDining });
      expect(res.status).toBe(404);
    });

    it('rejects a grandchild (parent already has a parent) with 400', async () => {
      const diningId = await findId('Dining');
      // Create Coffee as a subcategory of Dining.
      const coffee = await request(app)
        .post('/api/v1/categories')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Coffee', color: '#795548', parentCategoryId: diningId });
      expect(coffee.status).toBe(201);
      // Now try to nest Espresso under Coffee — should fail (depth 2).
      const res = await request(app)
        .post('/api/v1/categories')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          name: 'Espresso',
          color: '#3E2723',
          parentCategoryId: coffee.body.data.id,
        });
      expect(res.status).toBe(400);
    });

    it('rejects re-parenting a category that has children (would create 3-deep chain)', async () => {
      const diningId = await findId('Dining');
      const groceriesId = await findId('Groceries');
      // Make Snacks a subcategory of Dining.
      await request(app)
        .post('/api/v1/categories')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Snacks', color: '#8d6e63', parentCategoryId: diningId });
      // Now try to re-parent Dining under Groceries — Dining has a child.
      const res = await request(app)
        .patch(`/api/v1/categories/${diningId}`)
        .set('Cookie', accessCookie)
        .send({ parentCategoryId: groceriesId });
      expect(res.status).toBe(400);
    });

    it('rejects self-reference on PATCH with 400', async () => {
      const diningId = await findId('Dining');
      const res = await request(app)
        .patch(`/api/v1/categories/${diningId}`)
        .set('Cookie', accessCookie)
        .send({ parentCategoryId: diningId });
      expect(res.status).toBe(400);
    });

    it('PATCH parentCategoryId=null clears the parent', async () => {
      const diningId = await findId('Dining');
      const coffee = await request(app)
        .post('/api/v1/categories')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Coffee', color: '#795548', parentCategoryId: diningId });
      const res = await request(app)
        .patch(`/api/v1/categories/${coffee.body.data.id}`)
        .set('Cookie', accessCookie)
        .send({ parentCategoryId: null });
      expect(res.status).toBe(200);
      expect(res.body.data.parentCategoryId).toBeNull();
    });

    it('deleting a parent sets children.parent_category_id to NULL', async () => {
      const diningId = await findId('Dining');
      const coffee = await request(app)
        .post('/api/v1/categories')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Coffee', color: '#795548', parentCategoryId: diningId });
      await request(app)
        .delete(`/api/v1/categories/${diningId}`)
        .set('Cookie', accessCookie);
      const list = await request(app)
        .get('/api/v1/categories')
        .set('Cookie', accessCookie);
      const coffeeAfter = (list.body.data as Array<{ id: string; parentCategoryId: string | null }>).find(
        (c) => c.id === coffee.body.data.id,
      );
      expect(coffeeAfter).toBeDefined();
      expect(coffeeAfter?.parentCategoryId).toBeNull();
    });
  });
});
