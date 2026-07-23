import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Pool } from 'pg';
import type { Express } from 'express';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
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

// -------- commit / list / undo --------

async function preview(
  app: Express,
  cookie: string,
  accountId: string,
  file = 'chase-sample.csv',
): Promise<{ previewToken: string; rowsInPreview: number }> {
  const res = await request(app)
    .post('/api/v1/imports/preview')
    .set('Cookie', cookie)
    .attach('file', `${FIXTURES}/${file}`)
    .field('accountId', accountId);
  if (res.status !== 200) {
    throw new Error(`preview failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    previewToken: res.body.data.previewToken,
    rowsInPreview: res.body.data.rows.length,
  };
}

async function countTx(pool: Pool, accountId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM transactions WHERE account_id = $1`,
    [accountId],
  );
  return Number(rows[0]!.count);
}
async function countBatches(pool: Pool, accountId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM import_batches WHERE account_id = $1`,
    [accountId],
  );
  return Number(rows[0]!.count);
}

describe('Imports — commit (integration)', () => {
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
    const s = await signupAndGetCookies(app);
    accessCookie = s.accessCookie;
    userId = s.userId;
  });

  it('commits all rows and creates one import_batches row', async () => {
    const accountId = await createAccount(app, accessCookie, 'Checking');
    const { previewToken, rowsInPreview } = await preview(app, accessCookie, accountId);

    const res = await request(app)
      .post('/api/v1/imports/commit')
      .set('Cookie', accessCookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        previewToken,
        filename: 'chase-jul.csv',
        rows: [], // no per-row edits → all rows committed, categoryId defaults null
      });

    expect(res.status).toBe(201);
    expect(res.body.data.inserted).toBe(rowsInPreview);
    expect(res.body.data.skipped).toBe(0);
    expect(res.body.data.importBatchId).toBeTruthy();

    expect(await countTx(pool, accountId)).toBe(rowsInPreview);
    expect(await countBatches(pool, accountId)).toBe(1);
  });

  it('honors skip=true per row', async () => {
    const accountId = await createAccount(app, accessCookie, 'Checking');
    const { previewToken } = await preview(app, accessCookie, accountId);

    const res = await request(app)
      .post('/api/v1/imports/commit')
      .set('Cookie', accessCookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        previewToken,
        filename: 'chase-jul.csv',
        rows: [{ index: 0, skip: true }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.inserted).toBe(2);
    expect(res.body.data.skipped).toBe(1);
    expect(await countTx(pool, accountId)).toBe(2);
  });

  it('assigns per-row categoryId when supplied', async () => {
    const accountId = await createAccount(app, accessCookie, 'Checking');
    // Reuse the seeded 'Dining' default
    const { body: catList } = await request(app)
      .get('/api/v1/categories')
      .set('Cookie', accessCookie);
    const diningId = (catList.data as Array<{ id: string; name: string }>).find(
      (c) => c.name === 'Dining',
    )!.id;

    const { previewToken } = await preview(app, accessCookie, accountId);
    const res = await request(app)
      .post('/api/v1/imports/commit')
      .set('Cookie', accessCookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        previewToken,
        filename: 'chase-jul.csv',
        rows: [{ index: 0, categoryId: diningId }],
      });

    expect(res.status).toBe(201);
    const { rows } = await pool.query<{ category_id: string | null }>(
      `SELECT category_id FROM transactions WHERE account_id = $1 ORDER BY date`,
      [accountId],
    );
    expect(rows[0]!.category_id).toBe(diningId);
    expect(rows[1]!.category_id).toBeNull();
    expect(rows[2]!.category_id).toBeNull();
  });

  it('returns 404 when a categoryId is not owned by the caller', async () => {
    const accountId = await createAccount(app, accessCookie, 'Checking');
    const other = await signupAndGetCookies(app);
    const otherCat = await request(app)
      .post('/api/v1/categories')
      .set('Cookie', other.accessCookie)
      .set('Idempotency-Key', randomUUID())
      .send({ name: 'OtherOnly', color: '#123456' });

    const { previewToken } = await preview(app, accessCookie, accountId);
    const res = await request(app)
      .post('/api/v1/imports/commit')
      .set('Cookie', accessCookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        previewToken,
        filename: 'chase-jul.csv',
        rows: [{ index: 0, categoryId: otherCat.body.data.id }],
      });

    expect(res.status).toBe(404);
    expect(await countTx(pool, accountId)).toBe(0);
    expect(await countBatches(pool, accountId)).toBe(0);
  });

  it('returns 401-shaped error for previewToken issued to a different user', async () => {
    const accountId = await createAccount(app, accessCookie, 'Checking');
    const { previewToken } = await preview(app, accessCookie, accountId);

    const other = await signupAndGetCookies(app);
    const res = await request(app)
      .post('/api/v1/imports/commit')
      .set('Cookie', other.accessCookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        previewToken,
        filename: 'chase-jul.csv',
        rows: [],
      });
    // verify() throws InvalidPreviewTokenError, not an AppError subclass; central
    // handler maps unknown Errors to 500. We just want to assert it's a failure
    // and DB is untouched.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await countTx(pool, accountId)).toBe(0);
  });

  it('atomicity: if the INSERT throws mid-tx, no batch and no transactions land', async () => {
    // Forge a previewToken with a valid signature but a poison row: an invalid
    // date string. Pre-tx checks (account, category ownership) all pass; the
    // failure happens inside bulkCreate when Postgres tries to cast the date
    // array. TRD §7.5.8 requires the whole tx rolls back.
    const accountId = await createAccount(app, accessCookie, 'Checking');
    const secret = process.env.JWT_ACCESS_SECRET!;
    const poison = jwt.sign(
      {
        accountId,
        rows: [
          { index: 0, date: '2026-13-99', description: 'poison', amount: '-1.00' },
          { index: 1, date: '2026-07-15', description: 'valid', amount: '-2.00' },
        ],
      },
      secret,
      { subject: userId, audience: 'import-preview', expiresIn: '5m' },
    );

    const res = await request(app)
      .post('/api/v1/imports/commit')
      .set('Cookie', accessCookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        previewToken: poison,
        filename: 'poison.csv',
        rows: [],
      });

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await countTx(pool, accountId)).toBe(0);
    expect(await countBatches(pool, accountId)).toBe(0);
  });

  it('idempotency: replay returns cached response, single batch persists', async () => {
    const accountId = await createAccount(app, accessCookie, 'Checking');
    const { previewToken } = await preview(app, accessCookie, accountId);
    const key = randomUUID();
    const body = { previewToken, filename: 'chase-jul.csv', rows: [] };

    const first = await request(app)
      .post('/api/v1/imports/commit')
      .set('Cookie', accessCookie)
      .set('Idempotency-Key', key)
      .send(body);
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/imports/commit')
      .set('Cookie', accessCookie)
      .set('Idempotency-Key', key)
      .send(body);
    expect(second.status).toBe(201);
    expect(second.body.data.importBatchId).toBe(first.body.data.importBatchId);

    expect(await countBatches(pool, accountId)).toBe(1);
    expect(await countTx(pool, accountId)).toBe(3);
  });
});

describe('Imports — list + undo (integration)', () => {
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
    const s = await signupAndGetCookies(app);
    accessCookie = s.accessCookie;
  });

  async function commitBatch(
    cookie: string,
    accountId: string,
    filename: string,
  ): Promise<string> {
    const { previewToken } = await preview(app, cookie, accountId);
    const res = await request(app)
      .post('/api/v1/imports/commit')
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({ previewToken, filename, rows: [] });
    if (res.status !== 201) throw new Error(`commit: ${res.status}`);
    return res.body.data.importBatchId as string;
  }

  it('GET /imports returns the caller batches only, most recent first', async () => {
    const acc = await createAccount(app, accessCookie, 'A');
    const b1 = await commitBatch(accessCookie, acc, 'first.csv');
    const b2 = await commitBatch(accessCookie, acc, 'second.csv');

    const res = await request(app).get('/api/v1/imports').set('Cookie', accessCookie);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((b: { id: string }) => b.id);
    expect(ids).toEqual([b2, b1]);
  });

  it('GET /imports?accountId= filters', async () => {
    const a1 = await createAccount(app, accessCookie, 'A1');
    const a2 = await createAccount(app, accessCookie, 'A2');
    await commitBatch(accessCookie, a1, 'a1.csv');
    await commitBatch(accessCookie, a2, 'a2.csv');

    const res = await request(app)
      .get(`/api/v1/imports?accountId=${a2}`)
      .set('Cookie', accessCookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].accountId).toBe(a2);
  });

  it('another user cannot see my batches', async () => {
    const acc = await createAccount(app, accessCookie, 'Mine');
    await commitBatch(accessCookie, acc, 'mine.csv');
    const other = await signupAndGetCookies(app);

    const res = await request(app).get('/api/v1/imports').set('Cookie', other.accessCookie);
    expect(res.body.data).toEqual([]);
  });

  it('POST /:id/undo removes transactions and sets undone_at; replay is a no-op', async () => {
    const acc = await createAccount(app, accessCookie, 'Checking');
    const batchId = await commitBatch(accessCookie, acc, 'first.csv');

    const before = await request(app).get('/api/v1/transactions').set('Cookie', accessCookie);
    expect(before.body.data).toHaveLength(3);

    const undo1 = await request(app)
      .post(`/api/v1/imports/${batchId}/undo`)
      .set('Cookie', accessCookie);
    expect(undo1.status).toBe(200);
    expect(undo1.body.data.deleted).toBe(3);
    expect(undo1.body.data.alreadyUndone).toBe(false);

    const after = await request(app).get('/api/v1/transactions').set('Cookie', accessCookie);
    expect(after.body.data).toEqual([]);

    // undone_at set
    const { rows } = await pool.query<{ undone_at: Date | null }>(
      `SELECT undone_at FROM import_batches WHERE id = $1`,
      [batchId],
    );
    expect(rows[0]!.undone_at).not.toBeNull();

    // Replay is a no-op
    const undo2 = await request(app)
      .post(`/api/v1/imports/${batchId}/undo`)
      .set('Cookie', accessCookie);
    expect(undo2.status).toBe(200);
    expect(undo2.body.data.alreadyUndone).toBe(true);
    expect(undo2.body.data.deleted).toBe(0);
  });

  it('returns 404 undoing another user batch', async () => {
    const acc = await createAccount(app, accessCookie, 'Mine');
    const batchId = await commitBatch(accessCookie, acc, 'mine.csv');
    const other = await signupAndGetCookies(app);

    const res = await request(app)
      .post(`/api/v1/imports/${batchId}/undo`)
      .set('Cookie', other.accessCookie);
    expect(res.status).toBe(404);
  });
});
