import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { flagsRouter } from '../../src/routes/flags.routes';

describe('GET /api/v1/flags', () => {
  it('returns the effective flag state', async () => {
    const app = express();
    app.use('/api/v1/flags', flagsRouter);

    const res = await request(app).get('/api/v1/flags');

    expect(res.status).toBe(200);
    // Shape check + one-flag-per-key contract. Actual values depend on env:
    // v2 flags default false in prod but the test env sets FLAG_RECURRING=true
    // (see vitest.setup.ts) so recurring integration tests can hit the router.
    expect(res.body.data).toEqual({
      plaid: false,
      recurringDetection: expect.any(Boolean),
      multiCurrency: false,
      netWorth: expect.any(Boolean),
      hierarchicalCategories: expect.any(Boolean),
      passwordReset: expect.any(Boolean),
      ruleLearning: expect.any(Boolean),
    });
  });
});
