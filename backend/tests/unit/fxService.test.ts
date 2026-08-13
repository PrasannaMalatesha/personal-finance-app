import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { createFxService } from '../../src/services/fx.service';
import type { FxRatesRepo, FxRateRow } from '../../src/repositories/fxRates.repo';
import type { FxRatesAdapter } from '../../src/lib/fxAdapter';

const silentLogger = pino({ level: 'silent' });

function makeRepo(overrides: Partial<FxRatesRepo> = {}): FxRatesRepo {
  return {
    findRate: vi.fn(async () => null),
    findMostRecentOnOrBefore: vi.fn(async () => null),
    upsert: vi.fn(async () => {}),
    ...overrides,
  };
}

function makeAdapter(overrides: Partial<FxRatesAdapter> = {}): FxRatesAdapter {
  return {
    fetchRate: vi.fn(async () => ({ rate: '1.1', effectiveDate: '2026-08-11' })),
    ...overrides,
  };
}

describe('FxService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 1 for same-currency conversions without hitting cache or adapter', async () => {
    const repo = makeRepo();
    const adapter = makeAdapter();
    const svc = createFxService({ fxAdapter: adapter, fxRatesRepo: repo, logger: silentLogger });

    const rate = await svc.rateFor('USD', 'USD', '2026-08-11');
    expect(rate).toBe('1');
    expect(repo.findRate).not.toHaveBeenCalled();
    expect(adapter.fetchRate).not.toHaveBeenCalled();
  });

  it('returns cached rate on hit', async () => {
    const cached: FxRateRow = {
      base: 'USD',
      quote: 'EUR',
      rate_date: new Date('2026-08-11'),
      rate: '0.9123',
      fetched_at: new Date(),
    };
    const repo = makeRepo({ findRate: vi.fn(async () => cached) });
    const adapter = makeAdapter();
    const svc = createFxService({ fxAdapter: adapter, fxRatesRepo: repo, logger: silentLogger });

    const rate = await svc.rateFor('USD', 'EUR', '2026-08-11');
    expect(rate).toBe('0.9123');
    expect(adapter.fetchRate).not.toHaveBeenCalled();
  });

  it('fetches, caches, and returns the rate on cache miss', async () => {
    const repo = makeRepo();
    const adapter = makeAdapter({
      fetchRate: vi.fn(async () => ({ rate: '0.9101', effectiveDate: '2026-08-11' })),
    });
    const svc = createFxService({ fxAdapter: adapter, fxRatesRepo: repo, logger: silentLogger });

    const rate = await svc.rateFor('USD', 'EUR', '2026-08-11');
    expect(rate).toBe('0.9101');
    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ base: 'USD', quote: 'EUR', rateDate: '2026-08-11', rate: '0.9101' }),
    );
  });

  it('when the effective date differs, upserts both the requested and effective dates', async () => {
    const repo = makeRepo();
    const adapter = makeAdapter({
      fetchRate: vi.fn(async () => ({ rate: '0.9101', effectiveDate: '2026-08-07' })),
    });
    const svc = createFxService({ fxAdapter: adapter, fxRatesRepo: repo, logger: silentLogger });

    await svc.rateFor('USD', 'EUR', '2026-08-09');
    expect(repo.upsert).toHaveBeenCalledTimes(2);
    expect(repo.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ rateDate: '2026-08-09' }),
    );
    expect(repo.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ rateDate: '2026-08-07' }),
    );
  });

  it('falls back to the most-recent cached rate when the provider fails', async () => {
    const stale: FxRateRow = {
      base: 'USD',
      quote: 'EUR',
      rate_date: new Date('2026-08-05'),
      rate: '0.9000',
      fetched_at: new Date(),
    };
    const repo = makeRepo({
      findMostRecentOnOrBefore: vi.fn(async () => stale),
    });
    const adapter = makeAdapter({
      fetchRate: vi.fn(async () => {
        throw new Error('provider down');
      }),
    });
    const svc = createFxService({ fxAdapter: adapter, fxRatesRepo: repo, logger: silentLogger });

    const rate = await svc.rateFor('USD', 'EUR', '2026-08-11');
    expect(rate).toBe('0.9000');
  });

  it('propagates the error when the provider fails and there is no cached fallback', async () => {
    const repo = makeRepo();
    const adapter = makeAdapter({
      fetchRate: vi.fn(async () => {
        throw new Error('provider down');
      }),
    });
    const svc = createFxService({ fxAdapter: adapter, fxRatesRepo: repo, logger: silentLogger });

    await expect(svc.rateFor('USD', 'EUR', '2026-08-11')).rejects.toThrow('provider down');
  });

  it('convert() multiplies amount × rate with decimal precision', async () => {
    const repo = makeRepo({
      findRate: vi.fn(async () => ({
        base: 'USD',
        quote: 'EUR',
        rate_date: new Date('2026-08-11'),
        rate: '0.9123',
        fetched_at: new Date(),
      })),
    });
    const svc = createFxService({ fxAdapter: makeAdapter(), fxRatesRepo: repo, logger: silentLogger });

    const eur = await svc.convert('123.45', 'USD', 'EUR', '2026-08-11');
    // 123.45 × 0.9123 = 112.623435 → 112.62 at 2dp
    expect(eur).toBe('112.62');
  });

  it('in-request cache dedupes lookups for the same triple', async () => {
    const repo = makeRepo({
      findRate: vi.fn(async () => ({
        base: 'USD',
        quote: 'EUR',
        rate_date: new Date('2026-08-11'),
        rate: '0.9',
        fetched_at: new Date(),
      })),
    });
    const svc = createFxService({ fxAdapter: makeAdapter(), fxRatesRepo: repo, logger: silentLogger });

    const cache = svc.newCache();
    await svc.rateFor('USD', 'EUR', '2026-08-11', cache);
    await svc.rateFor('USD', 'EUR', '2026-08-11', cache);
    await svc.rateFor('USD', 'EUR', '2026-08-11', cache);
    expect(repo.findRate).toHaveBeenCalledTimes(1);
  });
});
