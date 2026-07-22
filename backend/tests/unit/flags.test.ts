import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { flagsRouter } from '../../src/routes/flags.routes';

describe('GET /api/v1/flags', () => {
  it('returns the default flag state', async () => {
    const app = express();
    app.use('/api/v1/flags', flagsRouter);

    const res = await request(app).get('/api/v1/flags');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      plaid: false,
      recurringDetection: false,
      multiCurrency: false,
    });
  });
});
