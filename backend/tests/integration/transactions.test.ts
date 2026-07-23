import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { randomUUID } from 'crypto';
import { createTestPool, truncateAll } from './helpers/testDb';
import { buildTestApp, signupAndGetCookies } from './helpers/testApp';

async function createAccount(
  app: Express,
  cookie: string,
  name: string,
  opening = '0',
): Promise<string> {
  const res = await request(app)
    .post('/api/v1/accounts')
    .set('Cookie', cookie)
    .set('Idempotency-Key', randomUUID())
    .send({ name, type: 'checking', openingBalance: opening });
  if (res.status !== 201) {
    throw new Error(`createAccount failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.id as string;
}

async function getOrCreateCategory(
  app: Express,
  cookie: string,
  name: string,
): Promise<string> {
  // Signup pre-seeds 18 default categories; try to reuse if the name collides.
  const list = await request(app)
    .get('/api/v1/categories')
    .set('Cookie', cookie);
  if (list.status !== 200) {
    throw new Error(`list categories failed: ${list.status}`);
  }
  const existing = (list.body.data as Array<{ id: string; name: string }>).find(
    (c) => c.name === name,
  );
  if (existing) return existing.id;

  const res = await request(app)
    .post('/api/v1/categories')
    .set('Cookie', cookie)
    .set('Idempotency-Key', randomUUID())
    .send({ name, color: '#ff0000' });
  if (res.status !== 201) {
    throw new Error(`createCategory failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.id as string;
}

async function insertRule(
  pool: Pool,
  userId: string,
  matchValue: string,
  categoryId: string,
  priority = 100,
  matchType: 'substring' | 'exact' = 'substring',
): Promise<void> {
  await pool.query(
    `INSERT INTO rules (user_id, match_type, match_value, category_id, priority)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, matchType, matchValue, categoryId, priority],
  );
}

describe('Transactions (integration)', () => {
  let pool: Pool;
  let app: Express;
  let accessCookie: string;
  let userId: string;

  beforeAll(() => {
    pool = createTestPool();
    app = buildTestApp(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAll(pool);
    const signup = await signupAndGetCookies(app);
    accessCookie = signup.accessCookie;
    userId = signup.userId;
  });

  describe('GET /api/v1/transactions', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/v1/transactions');
      expect(res.status).toBe(401);
    });

    it('returns empty list for a new user', async () => {
      const res = await request(app)
        .get('/api/v1/transactions')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.nextCursor).toBeNull();
    });
  });

  describe('POST /api/v1/transactions', () => {
    it('creates a transaction with valid input', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      const categoryId = await getOrCreateCategory(app, accessCookie, 'Dining');

      const res = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          accountId,
          date: '2026-07-15',
          description: 'Starbucks',
          amount: '-450.00',
          categoryId,
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        accountId,
        date: '2026-07-15',
        description: 'Starbucks',
        amount: '-450.00',
        categoryId,
        importBatchId: null,
      });
      expect(res.body.data.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('returns 400 when Idempotency-Key is missing', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      const res = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .send({
          accountId,
          date: '2026-07-15',
          description: 'x',
          amount: '-1.00',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('returns 400 on invalid amount format', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      const res = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          accountId,
          date: '2026-07-15',
          description: 'x',
          amount: '1.234',
        });
      expect(res.status).toBe(400);
    });

    it('returns 400 on invalid date format', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      const res = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          accountId,
          date: '15/07/2026',
          description: 'x',
          amount: '-1.00',
        });
      expect(res.status).toBe(400);
    });

    it("returns 404 when accountId doesn't belong to caller", async () => {
      const other = await signupAndGetCookies(app);
      const otherAccountId = await createAccount(app, other.accessCookie, 'Foreign');

      const res = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          accountId: otherAccountId,
          date: '2026-07-15',
          description: 'x',
          amount: '-1.00',
        });
      expect(res.status).toBe(404);
    });

    it("returns 404 when categoryId doesn't belong to caller", async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      const other = await signupAndGetCookies(app);
      const otherCatId = await getOrCreateCategory(app, other.accessCookie, 'ForeignCat');

      const res = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          accountId,
          date: '2026-07-15',
          description: 'x',
          amount: '-1.00',
          categoryId: otherCatId,
        });
      expect(res.status).toBe(404);
    });

    it('auto-categorizes via rule engine when categoryId is omitted', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      const diningId = await getOrCreateCategory(app, accessCookie, 'Dining');
      await insertRule(pool, userId, 'STARBUCKS', diningId);

      const res = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          accountId,
          date: '2026-07-15',
          description: 'starbucks bengaluru',
          amount: '-450.00',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.categoryId).toBe(diningId);
    });

    it('rule priority: lower priority runs first, first match wins', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      const dining = await getOrCreateCategory(app, accessCookie, 'Dining');
      const coffee = await getOrCreateCategory(app, accessCookie, 'Coffee');
      // Both match "STARBUCKS COFFEE". Coffee has lower priority → wins.
      await insertRule(pool, userId, 'STARBUCKS', dining, 200);
      await insertRule(pool, userId, 'COFFEE', coffee, 100);

      const res = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          accountId,
          date: '2026-07-15',
          description: 'Starbucks Coffee',
          amount: '-300',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.categoryId).toBe(coffee);
    });

    it('leaves categoryId null when no rule matches and none supplied', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');

      const res = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          accountId,
          date: '2026-07-15',
          description: 'Unknown merchant',
          amount: '-10.00',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.categoryId).toBeNull();
    });

    it('honors explicit null categoryId (skips rule engine)', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      const dining = await getOrCreateCategory(app, accessCookie, 'Dining');
      await insertRule(pool, userId, 'STARBUCKS', dining);

      const res = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          accountId,
          date: '2026-07-15',
          description: 'Starbucks',
          amount: '-1.00',
          categoryId: null,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.categoryId).toBeNull();
    });
  });

  describe('idempotency semantics', () => {
    it('replay: same key + same body returns the cached response, only one row', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      const key = randomUUID();
      const body = {
        accountId,
        date: '2026-07-15',
        description: 'Same tx',
        amount: '-10.00',
      };

      const first = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', key)
        .send(body);
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', key)
        .send(body);
      expect(second.status).toBe(201);
      expect(second.body.data.id).toBe(first.body.data.id);

      const list = await request(app)
        .get('/api/v1/transactions')
        .set('Cookie', accessCookie);
      expect(list.body.data).toHaveLength(1);
    });

    it('mismatch: same key + different body returns 422', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      const key = randomUUID();
      const body = {
        accountId,
        date: '2026-07-15',
        description: 'A',
        amount: '-10.00',
      };

      const first = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', key)
        .send(body);
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', key)
        .send({ ...body, description: 'B' });
      expect(second.status).toBe(422);
      expect(second.body.error.code).toBe('IDEMPOTENCY_KEY_MISMATCH');
    });
  });

  describe('filters and pagination', () => {
    it('filters by accountId', async () => {
      const a1 = await createAccount(app, accessCookie, 'A1');
      const a2 = await createAccount(app, accessCookie, 'A2');
      for (const acc of [a1, a1, a2]) {
        await request(app)
          .post('/api/v1/transactions')
          .set('Cookie', accessCookie)
          .set('Idempotency-Key', randomUUID())
          .send({
            accountId: acc,
            date: '2026-07-15',
            description: 'x',
            amount: '-1.00',
          });
      }

      const res = await request(app)
        .get(`/api/v1/transactions?accountId=${a1}`)
        .set('Cookie', accessCookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      for (const t of res.body.data) expect(t.accountId).toBe(a1);
    });

    it('filters by date range (from/to inclusive)', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      for (const date of ['2026-06-30', '2026-07-01', '2026-07-15', '2026-08-01']) {
        await request(app)
          .post('/api/v1/transactions')
          .set('Cookie', accessCookie)
          .set('Idempotency-Key', randomUUID())
          .send({ accountId, date, description: date, amount: '-1.00' });
      }

      const res = await request(app)
        .get('/api/v1/transactions?from=2026-07-01&to=2026-07-31')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(200);
      const dates = res.body.data.map((t: { date: string }) => t.date).sort();
      expect(dates).toEqual(['2026-07-01', '2026-07-15']);
    });

    it('filters by categoryId', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      const dining = await getOrCreateCategory(app, accessCookie, 'Dining');
      const groceries = await getOrCreateCategory(app, accessCookie, 'Groceries');
      for (const cat of [dining, dining, groceries]) {
        await request(app)
          .post('/api/v1/transactions')
          .set('Cookie', accessCookie)
          .set('Idempotency-Key', randomUUID())
          .send({
            accountId,
            date: '2026-07-15',
            description: 'x',
            amount: '-1.00',
            categoryId: cat,
          });
      }

      const res = await request(app)
        .get(`/api/v1/transactions?categoryId=${dining}`)
        .set('Cookie', accessCookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('paginates via cursor: limit=2 across 3 rows', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      for (const date of ['2026-07-01', '2026-07-02', '2026-07-03']) {
        await request(app)
          .post('/api/v1/transactions')
          .set('Cookie', accessCookie)
          .set('Idempotency-Key', randomUUID())
          .send({ accountId, date, description: date, amount: '-1.00' });
      }

      const page1 = await request(app)
        .get('/api/v1/transactions?limit=2')
        .set('Cookie', accessCookie);
      expect(page1.status).toBe(200);
      expect(page1.body.data).toHaveLength(2);
      // ORDER BY date DESC → newest first
      expect(page1.body.data[0].date).toBe('2026-07-03');
      expect(page1.body.data[1].date).toBe('2026-07-02');
      expect(page1.body.nextCursor).toBeTruthy();

      const page2 = await request(app)
        .get(
          `/api/v1/transactions?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`,
        )
        .set('Cookie', accessCookie);
      expect(page2.status).toBe(200);
      expect(page2.body.data).toHaveLength(1);
      expect(page2.body.data[0].date).toBe('2026-07-01');
      expect(page2.body.nextCursor).toBeNull();
    });

    it('rejects an invalid cursor with 400', async () => {
      const res = await request(app)
        .get('/api/v1/transactions?cursor=not-a-real-cursor')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/v1/transactions/:id', () => {
    it('updates fields', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      const created = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          accountId,
          date: '2026-07-15',
          description: 'Old',
          amount: '-1.00',
        });
      const id = created.body.data.id;

      const res = await request(app)
        .patch(`/api/v1/transactions/${id}`)
        .set('Cookie', accessCookie)
        .send({ description: 'New', amount: '-5.00' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        description: 'New',
        amount: '-5.00',
      });
    });

    it('returns 404 for a transaction owned by another user', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      const created = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          accountId,
          date: '2026-07-15',
          description: 'x',
          amount: '-1.00',
        });
      const id = created.body.data.id;

      const other = await signupAndGetCookies(app);
      const res = await request(app)
        .patch(`/api/v1/transactions/${id}`)
        .set('Cookie', other.accessCookie)
        .send({ description: 'hijacked' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/transactions/:id', () => {
    it('removes the transaction', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      const created = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          accountId,
          date: '2026-07-15',
          description: 'x',
          amount: '-1.00',
        });
      const id = created.body.data.id;

      const del = await request(app)
        .delete(`/api/v1/transactions/${id}`)
        .set('Cookie', accessCookie);
      expect(del.status).toBe(204);

      const list = await request(app)
        .get('/api/v1/transactions')
        .set('Cookie', accessCookie);
      expect(list.body.data).toHaveLength(0);
    });

    it('returns 404 when deleting a transaction owned by another user', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      const created = await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          accountId,
          date: '2026-07-15',
          description: 'x',
          amount: '-1.00',
        });
      const id = created.body.data.id;

      const other = await signupAndGetCookies(app);
      const res = await request(app)
        .delete(`/api/v1/transactions/${id}`)
        .set('Cookie', other.accessCookie);
      expect(res.status).toBe(404);
    });
  });

  describe('cross-user isolation', () => {
    it('user A cannot see user B transactions in list', async () => {
      const accountId = await createAccount(app, accessCookie, 'Checking');
      await request(app)
        .post('/api/v1/transactions')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          accountId,
          date: '2026-07-15',
          description: 'private',
          amount: '-1.00',
        });

      const other = await signupAndGetCookies(app);
      const list = await request(app)
        .get('/api/v1/transactions')
        .set('Cookie', other.accessCookie);
      expect(list.body.data).toHaveLength(0);
    });
  });
});
