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
  input: {
    accountId: string;
    date: string;
    amount: string;
    categoryId?: string;
    description?: string;
  },
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

async function upsertBudget(
  app: Express,
  cookie: string,
  input: { categoryId: string; month: string; amountLimit: string },
): Promise<void> {
  const res = await request(app)
    .put('/api/v1/budgets')
    .set('Cookie', cookie)
    .send(input);
  if (res.status !== 200) {
    throw new Error(`upsertBudget: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

describe('Dashboard (integration)', () => {
  let pool: Pool;
  let app: Express;
  let accessCookie: string;
  let accountId: string;
  let diningId: string;
  let groceriesId: string;
  let salaryId: string;

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
    accountId = await createAccount(app, accessCookie, 'Checking');
    diningId = await findCategoryId(app, accessCookie, 'Dining');
    groceriesId = await findCategoryId(app, accessCookie, 'Groceries');
    salaryId = await findCategoryId(app, accessCookie, 'Salary');
  });

  describe('GET /api/v1/dashboard/summary', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/v1/dashboard/summary?month=2026-07');
      expect(res.status).toBe(401);
    });

    it('returns 400 on missing month', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(400);
    });

    it('returns 400 on bad month format', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/summary?month=2026-13')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(400);
    });

    it('returns all-zeros when no transactions exist', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/summary?month=2026-07')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        month: '2026-07',
        income: '0.00',
        expenses: '0.00',
        net: '0.00',
        budgetTotalLimit: '0.00',
        budgetTotalSpent: '0.00',
        budgetPercentUsed: 0,
      });
    });

    it('aggregates income + expenses and computes budget progress', async () => {
      await createTx(app, accessCookie, {
        accountId,
        date: '2026-07-05',
        amount: '2000.00',
        categoryId: salaryId,
      });
      await createTx(app, accessCookie, {
        accountId,
        date: '2026-07-06',
        amount: '-120.00',
        categoryId: diningId,
      });
      await createTx(app, accessCookie, {
        accountId,
        date: '2026-07-07',
        amount: '-350.00',
        categoryId: groceriesId,
      });
      // Transaction outside the month must NOT count.
      await createTx(app, accessCookie, {
        accountId,
        date: '2026-06-30',
        amount: '-999.00',
        categoryId: diningId,
      });
      await upsertBudget(app, accessCookie, {
        categoryId: diningId,
        month: '2026-07',
        amountLimit: '500.00',
      });
      await upsertBudget(app, accessCookie, {
        categoryId: groceriesId,
        month: '2026-07',
        amountLimit: '500.00',
      });

      const res = await request(app)
        .get('/api/v1/dashboard/summary?month=2026-07')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        month: '2026-07',
        income: '2000.00',
        expenses: '470.00',
        net: '1530.00',
        budgetTotalLimit: '1000.00',
        budgetTotalSpent: '470.00',
        budgetPercentUsed: 47,
      });
    });

    it('is user-scoped — another user cannot see this data', async () => {
      await createTx(app, accessCookie, {
        accountId,
        date: '2026-07-05',
        amount: '-100.00',
        categoryId: diningId,
      });
      const other = await signupAndGetCookies(app);
      const res = await request(app)
        .get('/api/v1/dashboard/summary?month=2026-07')
        .set('Cookie', other.accessCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.expenses).toBe('0.00');
    });
  });

  describe('GET /api/v1/dashboard/by-category', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/v1/dashboard/by-category?month=2026-07');
      expect(res.status).toBe(401);
    });

    it('returns 400 on missing month', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/by-category')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(400);
    });

    it('returns [] when no expenses exist', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/by-category?month=2026-07')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('sums expense magnitudes per category (excludes income)', async () => {
      await createTx(app, accessCookie, {
        accountId,
        date: '2026-07-01',
        amount: '-120.00',
        categoryId: diningId,
      });
      await createTx(app, accessCookie, {
        accountId,
        date: '2026-07-02',
        amount: '-80.00',
        categoryId: diningId,
      });
      await createTx(app, accessCookie, {
        accountId,
        date: '2026-07-03',
        amount: '-350.00',
        categoryId: groceriesId,
      });
      await createTx(app, accessCookie, {
        accountId,
        date: '2026-07-04',
        amount: '2000.00',
        categoryId: salaryId,
      });

      const res = await request(app)
        .get('/api/v1/dashboard/by-category?month=2026-07')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(200);
      const data = res.body.data as Array<{ categoryName: string; amount: string }>;
      // Sorted by amount DESC.
      expect(data).toHaveLength(2);
      expect(data[0]).toMatchObject({ categoryName: 'Groceries', amount: '350.00' });
      expect(data[1]).toMatchObject({ categoryName: 'Dining', amount: '200.00' });
    });

    it('collapses uncategorized expenses into a synthetic slice', async () => {
      await createTx(app, accessCookie, {
        accountId,
        date: '2026-07-01',
        amount: '-45.00',
        // No categoryId — uncategorized.
      });
      const res = await request(app)
        .get('/api/v1/dashboard/by-category?month=2026-07')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([
        {
          categoryId: null,
          categoryName: 'Uncategorized',
          color: '#94a3b8',
          amount: '45.00',
        },
      ]);
    });

    it('rolls up subcategory expenses into their parent when hierarchy flag is on', async () => {
      // Create Coffee as a subcategory of Dining, then charge both.
      const coffee = await request(app)
        .post('/api/v1/categories')
        .set('Cookie', accessCookie)
        .set('Idempotency-Key', randomUUID())
        .send({
          name: 'Coffee',
          color: '#795548',
          parentCategoryId: diningId,
        });
      expect(coffee.status).toBe(201);

      await createTx(app, accessCookie, {
        accountId,
        date: '2026-07-01',
        amount: '-40.00',
        categoryId: diningId,
      });
      await createTx(app, accessCookie, {
        accountId,
        date: '2026-07-02',
        amount: '-15.00',
        categoryId: coffee.body.data.id,
      });
      await createTx(app, accessCookie, {
        accountId,
        date: '2026-07-03',
        amount: '-100.00',
        categoryId: groceriesId,
      });

      const res = await request(app)
        .get('/api/v1/dashboard/by-category?month=2026-07')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(200);
      const data = res.body.data as Array<{ categoryName: string; amount: string }>;
      // Coffee ($15) rolled into Dining ($40) → $55. Groceries stays $100.
      // Order is DESC by amount, so Groceries first, then Dining.
      expect(data).toHaveLength(2);
      expect(data[0]).toMatchObject({ categoryName: 'Groceries', amount: '100.00' });
      expect(data[1]).toMatchObject({ categoryName: 'Dining', amount: '55.00' });
      // No "Coffee" slice should appear on its own.
      expect(data.some((s) => s.categoryName === 'Coffee')).toBe(false);
    });
  });

  describe('GET /api/v1/dashboard/trend', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/v1/dashboard/trend');
      expect(res.status).toBe(401);
    });

    it('returns 400 on months out of range', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/trend?months=1')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(400);
    });

    it('returns 6 zero-filled months ending at endMonth by default', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/trend?months=6&endMonth=2026-07')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(200);
      const data = res.body.data as Array<{ month: string; income: string; expenses: string }>;
      expect(data.map((p) => p.month)).toEqual([
        '2026-02',
        '2026-03',
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
      ]);
      expect(data.every((p) => p.income === '0.00' && p.expenses === '0.00')).toBe(true);
    });

    it('aggregates income + expenses into the correct month buckets', async () => {
      await createTx(app, accessCookie, {
        accountId,
        date: '2026-05-15',
        amount: '-100.00',
        categoryId: diningId,
      });
      await createTx(app, accessCookie, {
        accountId,
        date: '2026-07-01',
        amount: '2000.00',
        categoryId: salaryId,
      });
      await createTx(app, accessCookie, {
        accountId,
        date: '2026-07-05',
        amount: '-250.00',
        categoryId: groceriesId,
      });

      const res = await request(app)
        .get('/api/v1/dashboard/trend?months=6&endMonth=2026-07')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(200);
      const data = res.body.data as Array<{ month: string; income: string; expenses: string }>;
      const may = data.find((p) => p.month === '2026-05')!;
      const jul = data.find((p) => p.month === '2026-07')!;
      expect(may).toMatchObject({ income: '0.00', expenses: '100.00' });
      expect(jul).toMatchObject({ income: '2000.00', expenses: '250.00' });
    });

    it('is user-scoped — another user gets zero-filled points', async () => {
      await createTx(app, accessCookie, {
        accountId,
        date: '2026-07-05',
        amount: '-100.00',
        categoryId: diningId,
      });
      const other = await signupAndGetCookies(app);
      const res = await request(app)
        .get('/api/v1/dashboard/trend?months=6&endMonth=2026-07')
        .set('Cookie', other.accessCookie);
      expect(res.status).toBe(200);
      const data = res.body.data as Array<{ expenses: string }>;
      expect(data.every((p) => p.expenses === '0.00')).toBe(true);
    });
  });

  describe('GET /api/v1/dashboard/net-worth', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/v1/dashboard/net-worth');
      expect(res.status).toBe(401);
    });

    it('returns 400 on months out of range', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/net-worth?months=1')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(400);
    });

    it('returns 6 zero-filled points when no accounts or transactions exist', async () => {
      // Fresh user with no data. Existing beforeEach created ONE account
      // with opening_balance=0, so all 6 points should be 0.00.
      const res = await request(app)
        .get('/api/v1/dashboard/net-worth?months=6&endMonth=2026-07')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(200);
      const data = res.body.data as Array<{ month: string; netWorth: string }>;
      expect(data.map((p) => p.month)).toEqual([
        '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
      ]);
      expect(data.every((p) => p.netWorth === '0.00')).toBe(true);
    });

    it('accumulates opening balances + transaction flow through each month', async () => {
      // Give the account an opening balance by patching it.
      await request(app)
        .patch(`/api/v1/accounts/${accountId}`)
        .set('Cookie', accessCookie)
        .send({ openingBalance: '1000.00' });

      // May: +200 income → month-end net = 1200
      await createTx(app, accessCookie, {
        accountId, date: '2026-05-15', amount: '200.00', categoryId: salaryId,
      });
      // June: -300 expense → month-end net = 900
      await createTx(app, accessCookie, {
        accountId, date: '2026-06-20', amount: '-300.00', categoryId: diningId,
      });
      // July: +500 income → month-end net = 1400
      await createTx(app, accessCookie, {
        accountId, date: '2026-07-01', amount: '500.00', categoryId: salaryId,
      });

      const res = await request(app)
        .get('/api/v1/dashboard/net-worth?months=6&endMonth=2026-07')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(200);
      const data = res.body.data as Array<{ month: string; netWorth: string }>;
      const byMonth = new Map(data.map((p) => [p.month, p.netWorth]));
      expect(byMonth.get('2026-02')).toBe('1000.00');
      expect(byMonth.get('2026-03')).toBe('1000.00');
      expect(byMonth.get('2026-04')).toBe('1000.00');
      expect(byMonth.get('2026-05')).toBe('1200.00');
      expect(byMonth.get('2026-06')).toBe('900.00');
      expect(byMonth.get('2026-07')).toBe('1400.00');
    });

    it('is user-scoped — another user\'s data is not visible', async () => {
      await request(app)
        .patch(`/api/v1/accounts/${accountId}`)
        .set('Cookie', accessCookie)
        .send({ openingBalance: '5000.00' });
      const other = await signupAndGetCookies(app);
      const res = await request(app)
        .get('/api/v1/dashboard/net-worth?months=6&endMonth=2026-07')
        .set('Cookie', other.accessCookie);
      expect(res.status).toBe(200);
      const data = res.body.data as Array<{ netWorth: string }>;
      expect(data.every((p) => p.netWorth === '0.00')).toBe(true);
    });
  });
});
