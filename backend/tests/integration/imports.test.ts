import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { createTestPool, truncateAll } from './helpers/testDb';
import { buildTestApp, signupAndGetCookies } from './helpers/testApp';

const FIXTURES = resolve(__dirname, '../fixtures/imports');

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
  if (res.status !== 201) {
    throw new Error(`createAccount failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
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

describe('Imports — preview (integration)', () => {
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

  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/v1/imports/preview')
      .attach('file', `${FIXTURES}/chase-sample.csv`)
      .field('accountId', randomUUID());
    expect(res.status).toBe(401);
  });

  it('returns 400 when accountId is missing from form', async () => {
    const res = await request(app)
      .post('/api/v1/imports/preview')
      .set('Cookie', accessCookie)
      .attach('file', `${FIXTURES}/chase-sample.csv`);
    expect(res.status).toBe(400);
  });

  it('returns 400 when file field is missing', async () => {
    const accountId = await createAccount(app, accessCookie, 'Checking');
    const res = await request(app)
      .post('/api/v1/imports/preview')
      .set('Cookie', accessCookie)
      .field('accountId', accountId);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when accountId is not owned by caller', async () => {
    const other = await signupAndGetCookies(app);
    const otherAccountId = await createAccount(app, other.accessCookie, 'Foreign');

    const res = await request(app)
      .post('/api/v1/imports/preview')
      .set('Cookie', accessCookie)
      .attach('file', `${FIXTURES}/chase-sample.csv`)
      .field('accountId', otherAccountId);

    expect(res.status).toBe(404);
  });

  it('previews a Chase CSV: 3 rows, signed amounts, MDY dates', async () => {
    const accountId = await createAccount(app, accessCookie, 'Checking');

    const res = await request(app)
      .post('/api/v1/imports/preview')
      .set('Cookie', accessCookie)
      .attach('file', `${FIXTURES}/chase-sample.csv`)
      .field('accountId', accountId);

    expect(res.status).toBe(200);
    expect(res.body.data.detectedColumns).toMatchObject({
      presetName: 'Chase',
      amountKind: 'signed',
    });
    expect(res.body.data.rows).toHaveLength(3);
    expect(res.body.data.rows[0]).toMatchObject({
      index: 0,
      date: '2026-07-15',
      description: 'STARBUCKS COFFEE #4021',
      amount: '-6.50',
      isDuplicate: false,
    });
    expect(res.body.data.previewToken).toBeTruthy();
    expect(res.body.data.expiresInSec).toBeGreaterThan(0);
  });

  it('previews an HDFC CSV: debit/credit split, DMY dates', async () => {
    const accountId = await createAccount(app, accessCookie, 'HDFC');

    const res = await request(app)
      .post('/api/v1/imports/preview')
      .set('Cookie', accessCookie)
      .attach('file', `${FIXTURES}/hdfc-sample.csv`)
      .field('accountId', accountId);

    expect(res.status).toBe(200);
    expect(res.body.data.detectedColumns.presetName).toBe('HDFC');
    expect(res.body.data.rows[0]).toMatchObject({
      date: '2026-07-15',
      description: 'UPI-STARBUCKS BENGALURU',
      amount: '-450.00',
    });
    expect(res.body.data.rows[1]).toMatchObject({
      description: 'SALARY CREDIT ACME CORP',
      amount: '50000.00',
    });
  });

  it('auto-proposes categories using the rule engine', async () => {
    const accountId = await createAccount(app, accessCookie, 'Checking');
    const diningId = await findCategoryId(app, accessCookie, 'Dining');
    // Seed a substring rule for STARBUCKS → Dining
    await pool.query(
      `INSERT INTO rules (user_id, match_type, match_value, category_id, priority)
       VALUES ($1, 'substring', 'STARBUCKS', $2, 100)`,
      [userId, diningId],
    );

    const res = await request(app)
      .post('/api/v1/imports/preview')
      .set('Cookie', accessCookie)
      .attach('file', `${FIXTURES}/chase-sample.csv`)
      .field('accountId', accountId);

    expect(res.status).toBe(200);
    const starbucks = res.body.data.rows.find(
      (r: { description: string }) => r.description.includes('STARBUCKS'),
    );
    expect(starbucks.proposedCategoryId).toBe(diningId);
    expect(starbucks.proposedCategoryName).toBe('Dining');
    expect(starbucks.matchedRuleId).toBeTruthy();

    // Non-matching row has no proposal
    const amazon = res.body.data.rows.find(
      (r: { description: string }) => r.description.includes('AMAZON'),
    );
    expect(amazon.proposedCategoryId).toBeNull();
    expect(amazon.matchedRuleId).toBeNull();
  });

  it('flags duplicates against existing transactions on the same account', async () => {
    const accountId = await createAccount(app, accessCookie, 'Checking');
    // Pre-seed a matching tx for the first Chase row: 2026-07-15, -6.50,
    // "STARBUCKS COFFEE #4021"
    const existing = await request(app)
      .post('/api/v1/transactions')
      .set('Cookie', accessCookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        accountId,
        date: '2026-07-15',
        description: 'STARBUCKS COFFEE #4021',
        amount: '-6.50',
      });
    expect(existing.status).toBe(201);
    const existingId = existing.body.data.id;

    const res = await request(app)
      .post('/api/v1/imports/preview')
      .set('Cookie', accessCookie)
      .attach('file', `${FIXTURES}/chase-sample.csv`)
      .field('accountId', accountId);

    expect(res.status).toBe(200);
    const starbucks = res.body.data.rows.find(
      (r: { description: string }) => r.description.includes('STARBUCKS'),
    );
    expect(starbucks.isDuplicate).toBe(true);
    expect(starbucks.duplicateOfTransactionId).toBe(existingId);

    // Other rows are not duplicates.
    const notDup = res.body.data.rows.filter(
      (r: { isDuplicate: boolean }) => !r.isDuplicate,
    );
    expect(notDup).toHaveLength(2);
  });

  it('scopes duplicate detection per account (same tx on another account is not a dup)', async () => {
    const acc1 = await createAccount(app, accessCookie, 'A1');
    const acc2 = await createAccount(app, accessCookie, 'A2');
    // Seed a matching tx on acc2 — should NOT trigger a dup on acc1
    await request(app)
      .post('/api/v1/transactions')
      .set('Cookie', accessCookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        accountId: acc2,
        date: '2026-07-15',
        description: 'STARBUCKS COFFEE #4021',
        amount: '-6.50',
      });

    const res = await request(app)
      .post('/api/v1/imports/preview')
      .set('Cookie', accessCookie)
      .attach('file', `${FIXTURES}/chase-sample.csv`)
      .field('accountId', acc1);

    expect(res.status).toBe(200);
    const anyDup = res.body.data.rows.some(
      (r: { isDuplicate: boolean }) => r.isDuplicate,
    );
    expect(anyDup).toBe(false);
  });

  it('returns 400 with CSV_PARSE_ERROR on malformed CSV', async () => {
    const accountId = await createAccount(app, accessCookie, 'Checking');
    const badCsv = Buffer.from('this is not a csv,,,\n"unterminated');

    const res = await request(app)
      .post('/api/v1/imports/preview')
      .set('Cookie', accessCookie)
      .attach('file', badCsv, { filename: 'bad.csv', contentType: 'text/csv' })
      .field('accountId', accountId);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CSV_PARSE_ERROR');
  });

  it('rejects a non-CSV mime with 415', async () => {
    const accountId = await createAccount(app, accessCookie, 'Checking');
    const res = await request(app)
      .post('/api/v1/imports/preview')
      .set('Cookie', accessCookie)
      .attach('file', Buffer.from('not a csv'), {
        filename: 'evil.exe',
        contentType: 'application/x-msdownload',
      })
      .field('accountId', accountId);

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});
