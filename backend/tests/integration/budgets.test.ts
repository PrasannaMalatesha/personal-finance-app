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
): Promise<string> {
  const res = await request(app)
    .post('/api/v1/accounts')
    .set('Cookie', cookie)
    .set('Idempotency-Key', randomUUID())
    .send({ name, type: 'checking', openingBalance: '0' });
  if (res.status !== 201) throw new Error(`createAccount: ${res.status}`);
  return res.body.data.id as string;
}

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

async function createTx(
  app: Express,
  cookie: string,
  input: { accountId: string; date: string; amount: string; categoryId?: string; description?: string },
): Promise<void> {
  const res = await request(app)
    .post('/api/v1/transactions')
    .set('Cookie', cookie)
    .set('Idempotency-Key', randomUUID())
    .send({
      accountId: input.accountId,
      date: input.date,
      description: input.description ?? 'test',
      amount: input.amount,
      categoryId: input.categoryId,
    });
  if (res.status !== 201) {
    throw new Error(`createTx: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

describe('Budgets (integration)', () => {
  let pool: Pool;
  let app: Express;
  let accessCookie: string;
  let diningId: string;
  let groceriesId: string;

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
    groceriesId = await findCategoryId(app, accessCookie, 'Groceries');
  });

  describe('GET /api/v1/budgets', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/v1/budgets?month=2026-07');
      expect(res.status).toBe(401);
    });

    it('returns 400 when month is missing', async () => {
      const res = await request(app)
        .get('/api/v1/budgets')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(400);
    });

    it('returns 400 on bad month format', async () => {
      const res = await request(app)
        .get('/api/v1/budgets?month=2026-13')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(400);
    });

    it('returns [] when no budgets exist for the month', async () => {
      const res = await request(app)
        .get('/api/v1/budgets?month=2026-07')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('PUT /api/v1/budgets', () => {
    it('creates a new budget (upsert)', async () => {
      const res = await request(app)
        .put('/api/v1/budgets')
        .set('Cookie', accessCookie)
        .send({ categoryId: diningId, month: '2026-07', amountLimit: '5000.00' });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        categoryId: diningId,
        categoryName: 'Dining',
        month: '2026-07',
        amountLimit: '5000.00',
        amountSpent: '0.00',
        amountRemaining: '5000.00',
        percentUsed: 0,
        isOverBudget: false,
      });
      expect(res.body.data.budgetId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('upsert replaces the amount on a second PUT — same budget id', async () => {
      const first = await request(app)
        .put('/api/v1/budgets')
        .set('Cookie', accessCookie)
        .send({ categoryId: diningId, month: '2026-07', amountLimit: '5000.00' });

      const second = await request(app)
        .put('/api/v1/budgets')
        .set('Cookie', accessCookie)
        .send({ categoryId: diningId, month: '2026-07', amountLimit: '7500.00' });

      expect(second.status).toBe(200);
      expect(second.body.data.budgetId).toBe(first.body.data.budgetId);
      expect(second.body.data.amountLimit).toBe('7500.00');

      // Only one row in DB
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM budgets`,
      );
      expect(Number(rows[0]!.count)).toBe(1);
    });

    it('returns 404 when categoryId is not owned by caller', async () => {
      const other = await signupAndGetCookies(app);
      const otherCat = await findCategoryId(app, other.accessCookie, 'Dining');

      const res = await request(app)
        .put('/api/v1/budgets')
        .set('Cookie', accessCookie)
        .send({ categoryId: otherCat, month: '2026-07', amountLimit: '5000.00' });

      expect(res.status).toBe(404);
    });

    it('returns 400 on invalid amountLimit (negative)', async () => {
      const res = await request(app)
        .put('/api/v1/budgets')
        .set('Cookie', accessCookie)
        .send({ categoryId: diningId, month: '2026-07', amountLimit: '-100.00' });
      expect(res.status).toBe(400);
    });

    it('returns 400 on invalid amountLimit (too many decimals)', async () => {
      const res = await request(app)
        .put('/api/v1/budgets')
        .set('Cookie', accessCookie)
        .send({ categoryId: diningId, month: '2026-07', amountLimit: '100.123' });
      expect(res.status).toBe(400);
    });

    it('accepts a zero-limit budget (isOverBudget=true when any spend)', async () => {
      const accountId = await createAccount(app, accessCookie, 'A');
      await createTx(app, accessCookie, {
        accountId,
        date: '2026-07-05',
        amount: '-1.00',
        categoryId: diningId,
      });

      const res = await request(app)
        .put('/api/v1/budgets')
        .set('Cookie', accessCookie)
        .send({ categoryId: diningId, month: '2026-07', amountLimit: '0.00' });

      expect(res.status).toBe(200);
      expect(res.body.data.amountLimit).toBe('0.00');
      expect(res.body.data.amountSpent).toBe('1.00');
      expect(res.body.data.percentUsed).toBe(0); // guarded against divide-by-zero
      expect(res.body.data.isOverBudget).toBe(true);
    });
  });

  describe('GET /budgets — spend computation', () => {
    it('sums only expenses in the requested month, only from user-owned accounts', async () => {
      const accountId = await createAccount(app, accessCookie, 'A');
      // Expenses that count
      await createTx(app, accessCookie, { accountId, date: '2026-07-01', amount: '-100.00', categoryId: diningId });
      await createTx(app, accessCookie, { accountId, date: '2026-07-15', amount: '-250.00', categoryId: diningId });
      await createTx(app, accessCookie, { accountId, date: '2026-07-31', amount: '-150.00', categoryId: diningId });
      // Income in-month with same category — should NOT reduce spend
      await createTx(app, accessCookie, { accountId, date: '2026-07-10', amount: '50.00', categoryId: diningId });
      // Expense out of month — should not count
      await createTx(app, accessCookie, { accountId, date: '2026-06-30', amount: '-999.00', categoryId: diningId });
      await createTx(app, accessCookie, { accountId, date: '2026-08-01', amount: '-999.00', categoryId: diningId });
      // Expense in a different category — should not count
      await createTx(app, accessCookie, { accountId, date: '2026-07-10', amount: '-999.00', categoryId: groceriesId });

      await request(app)
        .put('/api/v1/budgets')
        .set('Cookie', accessCookie)
        .send({ categoryId: diningId, month: '2026-07', amountLimit: '1000.00' });

      const res = await request(app)
        .get('/api/v1/budgets?month=2026-07')
        .set('Cookie', accessCookie);

      expect(res.status).toBe(200);
      const dining = res.body.data.find(
        (b: { categoryId: string }) => b.categoryId === diningId,
      );
      expect(dining.amountSpent).toBe('500.00');
      expect(dining.amountRemaining).toBe('500.00');
      expect(dining.percentUsed).toBe(50);
      expect(dining.isOverBudget).toBe(false);
    });

    it('reports overBudget when spend > limit', async () => {
      const accountId = await createAccount(app, accessCookie, 'A');
      await createTx(app, accessCookie, { accountId, date: '2026-07-15', amount: '-1200.00', categoryId: diningId });

      await request(app)
        .put('/api/v1/budgets')
        .set('Cookie', accessCookie)
        .send({ categoryId: diningId, month: '2026-07', amountLimit: '1000.00' });

      const res = await request(app)
        .get('/api/v1/budgets?month=2026-07')
        .set('Cookie', accessCookie);
      const dining = res.body.data[0];
      expect(dining.amountSpent).toBe('1200.00');
      expect(dining.amountRemaining).toBe('-200.00');
      expect(dining.percentUsed).toBe(120);
      expect(dining.isOverBudget).toBe(true);
    });

    it('ignores transactions in another user\'s accounts', async () => {
      // My budget on Dining, no txs of mine
      await request(app)
        .put('/api/v1/budgets')
        .set('Cookie', accessCookie)
        .send({ categoryId: diningId, month: '2026-07', amountLimit: '1000.00' });

      // Another user seeds a transaction in Dining in the same month
      const other = await signupAndGetCookies(app);
      const otherAccountId = await createAccount(app, other.accessCookie, 'Their');
      const theirDining = await findCategoryId(app, other.accessCookie, 'Dining');
      await createTx(app, other.accessCookie, {
        accountId: otherAccountId,
        date: '2026-07-10',
        amount: '-500.00',
        categoryId: theirDining,
      });

      const res = await request(app)
        .get('/api/v1/budgets?month=2026-07')
        .set('Cookie', accessCookie);
      expect(res.body.data[0].amountSpent).toBe('0.00');
    });
  });

  describe('DELETE /api/v1/budgets/:id', () => {
    it('removes a budget', async () => {
      const created = await request(app)
        .put('/api/v1/budgets')
        .set('Cookie', accessCookie)
        .send({ categoryId: diningId, month: '2026-07', amountLimit: '1000.00' });

      const del = await request(app)
        .delete(`/api/v1/budgets/${created.body.data.budgetId}`)
        .set('Cookie', accessCookie);
      expect(del.status).toBe(204);

      const list = await request(app)
        .get('/api/v1/budgets?month=2026-07')
        .set('Cookie', accessCookie);
      expect(list.body.data).toEqual([]);
    });

    it('returns 404 when deleting a budget belonging to another user', async () => {
      const created = await request(app)
        .put('/api/v1/budgets')
        .set('Cookie', accessCookie)
        .send({ categoryId: diningId, month: '2026-07', amountLimit: '1000.00' });

      const other = await signupAndGetCookies(app);
      const res = await request(app)
        .delete(`/api/v1/budgets/${created.body.data.budgetId}`)
        .set('Cookie', other.accessCookie);
      expect(res.status).toBe(404);
    });
  });

  describe('category deletion cascade', () => {
    it('deleting the category also deletes its budgets (FK cascade)', async () => {
      // Create a fresh custom category we control (system defaults aren't deletable? they are per TRD.
      // Custom is safer here — no seeding tests to break.)
      const cat = await request(app)
        .post('/api/v1/categories')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'Casual', color: '#abcdef' });
      const catId = cat.body.data.id;

      await request(app)
        .put('/api/v1/budgets')
        .set('Cookie', accessCookie)
        .send({ categoryId: catId, month: '2026-07', amountLimit: '100.00' });

      await request(app)
        .delete(`/api/v1/categories/${catId}`)
        .set('Cookie', accessCookie);

      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM budgets WHERE category_id = $1`,
        [catId],
      );
      expect(Number(rows[0]!.count)).toBe(0);
    });
  });
});
