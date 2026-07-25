import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { randomUUID } from 'crypto';
import { createTestPool, truncateAll } from './helpers/testDb';
import { buildTestApp, signupAndGetCookies } from './helpers/testApp';
import { DEFAULT_RULES } from '../../src/schemas/rules';

async function findCategoryId(
  app: Express,
  cookie: string,
  name: string,
): Promise<string> {
  const res = await request(app).get('/api/v1/categories').set('Cookie', cookie);
  const found = (res.body.data as Array<{ id: string; name: string }>).find(
    (c) => c.name === name,
  );
  if (!found) throw new Error(`category '${name}' not seeded`);
  return found.id;
}

async function createAccount(
  app: Express,
  cookie: string,
  name: string,
): Promise<string> {
  const res = await request(app)
    .post('/api/v1/accounts')
    .set('Cookie', cookie)
    .set('Idempotency-Key', randomUUID())
    .send({ name, type: 'checking', openingBalance: '0' });
  if (res.status !== 201) throw new Error(`createAccount: ${res.status}`);
  return res.body.data.id as string;
}

describe('Rules (integration)', () => {
  let pool: Pool;
  let app: Express;
  let accessCookie: string;
  let diningId: string;

  beforeAll(() => {
    pool = createTestPool();
    app = buildTestApp(pool);
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(pool);
    const s = await signupAndGetCookies(app);
    accessCookie = s.accessCookie;
    diningId = await findCategoryId(app, accessCookie, 'Dining');
  });

  describe('signup seed', () => {
    it('seeds the default rules on signup', async () => {
      const res = await request(app).get('/api/v1/rules').set('Cookie', accessCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(DEFAULT_RULES.length);
      // Every seeded rule joins to a real category.
      expect(res.body.data.every((r: { categoryName: string }) => r.categoryName)).toBe(true);
      const starbucks = res.body.data.find(
        (r: { matchValue: string }) => r.matchValue === 'STARBUCKS',
      );
      expect(starbucks).toBeDefined();
      expect(starbucks.categoryName).toBe('Dining');
    });
  });

  describe('GET /api/v1/rules', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/v1/rules');
      expect(res.status).toBe(401);
    });

    it('is user-scoped', async () => {
      const other = await signupAndGetCookies(app);
      const mine = await request(app).get('/api/v1/rules').set('Cookie', accessCookie);
      const theirs = await request(app).get('/api/v1/rules').set('Cookie', other.accessCookie);
      // Both are seeded with the same defaults, but the row ids differ.
      const myIds = new Set(mine.body.data.map((r: { id: string }) => r.id));
      const theirIds = new Set(theirs.body.data.map((r: { id: string }) => r.id));
      const overlap = [...myIds].filter((id) => theirIds.has(id));
      expect(overlap).toHaveLength(0);
    });
  });

  describe('POST /api/v1/rules', () => {
    it('returns 400 when Idempotency-Key is missing', async () => {
      const res = await request(app)
        .post('/api/v1/rules')
        .set('Cookie', accessCookie)
        .send({ matchType: 'substring', matchValue: 'AMAZON', categoryId: diningId });
      expect(res.status).toBe(400);
    });

    it('creates a rule with a required Idempotency-Key', async () => {
      const res = await request(app)
        .post('/api/v1/rules')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          matchType: 'substring',
          matchValue: 'AMAZON',
          categoryId: diningId,
          priority: 50,
        });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        matchType: 'substring',
        matchValue: 'AMAZON',
        categoryId: diningId,
        categoryName: 'Dining',
        priority: 50,
      });
    });

    it('returns 404 when categoryId is not owned by caller', async () => {
      const other = await signupAndGetCookies(app);
      const otherCat = await findCategoryId(app, other.accessCookie, 'Dining');
      const res = await request(app)
        .post('/api/v1/rules')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ matchType: 'substring', matchValue: 'X', categoryId: otherCat });
      expect(res.status).toBe(404);
    });

    it('returns 400 on invalid match_type', async () => {
      const res = await request(app)
        .post('/api/v1/rules')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ matchType: 'regex', matchValue: 'X', categoryId: diningId });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/v1/rules/:id', () => {
    it('updates a rule', async () => {
      const list = await request(app).get('/api/v1/rules').set('Cookie', accessCookie);
      const ruleId = list.body.data[0].id;
      const res = await request(app)
        .patch(`/api/v1/rules/${ruleId}`)
        .set('Cookie', accessCookie)
        .send({ priority: 10 });
      expect(res.status).toBe(200);
      expect(res.body.data.priority).toBe(10);
    });

    it('returns 404 for a rule owned by another user', async () => {
      const other = await signupAndGetCookies(app);
      const list = await request(app).get('/api/v1/rules').set('Cookie', other.accessCookie);
      const theirRule = list.body.data[0].id;
      const res = await request(app)
        .patch(`/api/v1/rules/${theirRule}`)
        .set('Cookie', accessCookie)
        .send({ priority: 5 });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/rules/:id', () => {
    it('deletes a rule', async () => {
      const list = await request(app).get('/api/v1/rules').set('Cookie', accessCookie);
      const ruleId = list.body.data[0].id;
      const res = await request(app)
        .delete(`/api/v1/rules/${ruleId}`)
        .set('Cookie', accessCookie);
      expect(res.status).toBe(204);
      const after = await request(app).get('/api/v1/rules').set('Cookie', accessCookie);
      expect(after.body.data.find((r: { id: string }) => r.id === ruleId)).toBeUndefined();
    });
  });

  describe('rules affect transaction categorization', () => {
    it('auto-categorizes a new transaction whose description matches a seed rule', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      const res = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          accountId,
          date: '2026-07-01',
          description: 'UPI-STARBUCKS BENGALURU',
          amount: '-450.00',
          // Deliberately omit categoryId — rules should fill it in.
        });
      expect(res.status).toBe(201);
      expect(res.body.data.categoryId).toBe(diningId);
    });
  });
});
