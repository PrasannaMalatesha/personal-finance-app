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
  input: { accountId: string; date: string; amount: string; description: string; categoryId?: string },
): Promise<void> {
  const res = await request(app)
    .post('/api/v1/transactions')
    .set('Cookie', cookie)
    .set('Idempotency-Key', randomUUID())
    .send({
      accountId: input.accountId,
      date: input.date,
      description: input.description,
      amount: input.amount,
      // Skip rule engine by passing an explicit categoryId (even if null we
      // want deterministic assignment).
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    });
  if (res.status !== 201) {
    throw new Error(`createTx: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

describe('Recurring detection (integration)', () => {
  let pool: Pool;
  let app: Express;
  let accessCookie: string;
  let accountId: string;
  let subsCatId: string;

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
    subsCatId = await findCategoryId(app, accessCookie, 'Subscriptions');
  });

  describe('GET /api/v1/recurring', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/v1/recurring');
      expect(res.status).toBe(401);
    });

    it('returns [] when nothing has been detected yet', async () => {
      const res = await request(app)
        .get('/api/v1/recurring')
        .set('Cookie', accessCookie);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('POST /api/v1/recurring/detect', () => {
    it('finds a monthly subscription with amounts within ±5% and cadence 28–33 days', async () => {
      // Netflix-style: 3 charges roughly 30 days apart, amounts $15.99.
      // The rule engine already categorizes "NETFLIX.COM" as Subscriptions,
      // but pass explicit categoryId so the assertion is deterministic.
      await createTx(app, accessCookie, { accountId, date: '2026-05-05', amount: '-15.99', description: 'NETFLIX.COM', categoryId: subsCatId });
      await createTx(app, accessCookie, { accountId, date: '2026-06-05', amount: '-16.10', description: 'NETFLIX.COM', categoryId: subsCatId });
      await createTx(app, accessCookie, { accountId, date: '2026-07-05', amount: '-15.99', description: 'NETFLIX.COM', categoryId: subsCatId });

      const detect = await request(app)
        .post('/api/v1/recurring/detect')
        .set('Cookie', accessCookie);
      expect(detect.status).toBe(200);
      expect(detect.body.data.totalGroups).toBe(1);
      expect(detect.body.data.detected).toBe(1);

      const list = await request(app)
        .get('/api/v1/recurring')
        .set('Cookie', accessCookie);
      expect(list.body.data).toHaveLength(1);
      const group = list.body.data[0];
      expect(group.merchantKey).toBe('NETFLIX.COM');
      expect(group.categoryName).toBe('Subscriptions');
      expect(group.cadenceDays).toBeGreaterThanOrEqual(29);
      expect(group.cadenceDays).toBeLessThanOrEqual(31);
      expect(group.txCount).toBe(3);
      // avg of 15.99, 16.10, 15.99 = 16.026... → "16.03"
      expect(group.avgAmount).toBe('16.03');
      expect(group.nextExpected).toMatch(/^2026-08/);
    });

    it('ignores merchants whose amounts vary by more than ±5%', async () => {
      await createTx(app, accessCookie, { accountId, date: '2026-05-05', amount: '-10.00', description: 'STARBUCKS', categoryId: subsCatId });
      await createTx(app, accessCookie, { accountId, date: '2026-06-05', amount: '-20.00', description: 'STARBUCKS', categoryId: subsCatId });

      const detect = await request(app)
        .post('/api/v1/recurring/detect')
        .set('Cookie', accessCookie);
      expect(detect.body.data.totalGroups).toBe(0);
    });

    it('ignores merchants whose cadence is outside 28–33 days', async () => {
      // 21 days apart — not monthly.
      await createTx(app, accessCookie, { accountId, date: '2026-05-05', amount: '-30.00', description: 'BIWEEKLY', categoryId: subsCatId });
      await createTx(app, accessCookie, { accountId, date: '2026-05-26', amount: '-30.00', description: 'BIWEEKLY', categoryId: subsCatId });
      await createTx(app, accessCookie, { accountId, date: '2026-06-16', amount: '-30.00', description: 'BIWEEKLY', categoryId: subsCatId });

      const detect = await request(app)
        .post('/api/v1/recurring/detect')
        .set('Cookie', accessCookie);
      expect(detect.body.data.totalGroups).toBe(0);
    });

    it('ignores single-occurrence merchants (min 2 occurrences)', async () => {
      await createTx(app, accessCookie, { accountId, date: '2026-07-05', amount: '-15.99', description: 'ONE-OFF', categoryId: subsCatId });
      const detect = await request(app)
        .post('/api/v1/recurring/detect')
        .set('Cookie', accessCookie);
      expect(detect.body.data.totalGroups).toBe(0);
    });

    it('normalizes description casing + whitespace when grouping', async () => {
      await createTx(app, accessCookie, { accountId, date: '2026-06-01', amount: '-9.99', description: 'spotify  usa', categoryId: subsCatId });
      await createTx(app, accessCookie, { accountId, date: '2026-07-01', amount: '-9.99', description: 'SPOTIFY USA', categoryId: subsCatId });
      const detect = await request(app)
        .post('/api/v1/recurring/detect')
        .set('Cookie', accessCookie);
      expect(detect.body.data.totalGroups).toBe(1);
    });

    it('is idempotent — re-running detection reports 0 new inserts', async () => {
      await createTx(app, accessCookie, { accountId, date: '2026-06-01', amount: '-15.99', description: 'NETFLIX', categoryId: subsCatId });
      await createTx(app, accessCookie, { accountId, date: '2026-07-01', amount: '-15.99', description: 'NETFLIX', categoryId: subsCatId });

      const first = await request(app)
        .post('/api/v1/recurring/detect')
        .set('Cookie', accessCookie);
      expect(first.body.data.detected).toBe(1);
      expect(first.body.data.updated).toBe(0);

      const second = await request(app)
        .post('/api/v1/recurring/detect')
        .set('Cookie', accessCookie);
      expect(second.body.data.detected).toBe(0);
      expect(second.body.data.updated).toBe(1);
      expect(second.body.data.totalGroups).toBe(1);
    });

    it('scopes detection per user', async () => {
      const other = await signupAndGetCookies(app);
      const otherAccount = await createAccount(app, other.accessCookie, 'Their');
      const otherSubs = await findCategoryId(app, other.accessCookie, 'Subscriptions');
      await createTx(app, other.accessCookie, { accountId: otherAccount, date: '2026-06-05', amount: '-15.99', description: 'NETFLIX', categoryId: otherSubs });
      await createTx(app, other.accessCookie, { accountId: otherAccount, date: '2026-07-05', amount: '-15.99', description: 'NETFLIX', categoryId: otherSubs });

      const detect = await request(app)
        .post('/api/v1/recurring/detect')
        .set('Cookie', accessCookie);
      expect(detect.body.data.totalGroups).toBe(0);
    });
  });

  describe('POST /api/v1/recurring/:id/dismiss + DELETE', () => {
    it('dismissed groups stay dismissed across re-runs', async () => {
      await createTx(app, accessCookie, { accountId, date: '2026-06-01', amount: '-15.99', description: 'NETFLIX', categoryId: subsCatId });
      await createTx(app, accessCookie, { accountId, date: '2026-07-01', amount: '-15.99', description: 'NETFLIX', categoryId: subsCatId });
      await request(app).post('/api/v1/recurring/detect').set('Cookie', accessCookie);

      const list = await request(app).get('/api/v1/recurring').set('Cookie', accessCookie);
      const id = list.body.data[0].id;

      const dismiss = await request(app)
        .post(`/api/v1/recurring/${id}/dismiss`)
        .set('Cookie', accessCookie);
      expect(dismiss.status).toBe(200);
      expect(dismiss.body.data.isDismissed).toBe(true);

      // Re-run detection: the dismissed key should NOT come back.
      const rerun = await request(app)
        .post('/api/v1/recurring/detect')
        .set('Cookie', accessCookie);
      expect(rerun.body.data.totalGroups).toBe(0);
    });

    it('DELETE removes the group and nulls tx.recurring_group_id', async () => {
      await createTx(app, accessCookie, { accountId, date: '2026-06-01', amount: '-15.99', description: 'NETFLIX', categoryId: subsCatId });
      await createTx(app, accessCookie, { accountId, date: '2026-07-01', amount: '-15.99', description: 'NETFLIX', categoryId: subsCatId });
      await request(app).post('/api/v1/recurring/detect').set('Cookie', accessCookie);

      const list = await request(app).get('/api/v1/recurring').set('Cookie', accessCookie);
      const id = list.body.data[0].id;

      const del = await request(app)
        .delete(`/api/v1/recurring/${id}`)
        .set('Cookie', accessCookie);
      expect(del.status).toBe(204);

      // Group is gone; underlying transactions still exist but with null group.
      const after = await request(app).get('/api/v1/recurring').set('Cookie', accessCookie);
      expect(after.body.data).toEqual([]);

      const txCheck = await pool.query<{ recurring_group_id: string | null }>(
        `SELECT recurring_group_id FROM transactions WHERE description = 'NETFLIX'`,
      );
      expect(txCheck.rows.every((r) => r.recurring_group_id === null)).toBe(true);
    });

    it('returns 404 dismissing another user group', async () => {
      await createTx(app, accessCookie, { accountId, date: '2026-06-01', amount: '-15.99', description: 'NETFLIX', categoryId: subsCatId });
      await createTx(app, accessCookie, { accountId, date: '2026-07-01', amount: '-15.99', description: 'NETFLIX', categoryId: subsCatId });
      await request(app).post('/api/v1/recurring/detect').set('Cookie', accessCookie);

      const mine = await request(app).get('/api/v1/recurring').set('Cookie', accessCookie);
      const id = mine.body.data[0].id;

      const other = await signupAndGetCookies(app);
      const res = await request(app)
        .post(`/api/v1/recurring/${id}/dismiss`)
        .set('Cookie', other.accessCookie);
      expect(res.status).toBe(404);
    });
  });
});
