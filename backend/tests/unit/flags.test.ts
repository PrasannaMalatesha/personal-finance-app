import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';

describe('GET /api/v1/flags', () => {
  it('returns default flag state', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/flags');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      plaid: false,
      recurringDetection: false,
      multiCurrency: false,
    });
  });
});
