import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import { createFrankfurterAdapter } from '../../src/lib/fxAdapter';

const silentLogger = pino({ level: 'silent' });

type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

function ok(body: unknown) {
  return vi.fn<FetchFn>(async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('createFrankfurterAdapter', () => {
  it('requests /{date}?base=&symbols= and returns the rate', async () => {
    const fetchImpl = ok({
      amount: 1,
      base: 'USD',
      date: '2026-08-11',
      rates: { EUR: 0.9123 },
    });
    const adapter = createFrankfurterAdapter({
      logger: silentLogger,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await adapter.fetchRate({
      base: 'USD',
      quote: 'EUR',
      date: '2026-08-11',
    });

    expect(result.rate).toBe('0.9123');
    expect(result.effectiveDate).toBe('2026-08-11');
    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toContain('/2026-08-11');
    expect(url).toContain('base=USD');
    expect(url).toContain('symbols=EUR');
  });

  it('reports the provider-returned effective date when it differs (weekend/holiday)', async () => {
    const fetchImpl = ok({
      amount: 1,
      base: 'USD',
      date: '2026-08-07', // provider returned Friday for a Sunday request
      rates: { EUR: 0.9101 },
    });
    const adapter = createFrankfurterAdapter({
      logger: silentLogger,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await adapter.fetchRate({
      base: 'USD',
      quote: 'EUR',
      date: '2026-08-09',
    });
    expect(result.effectiveDate).toBe('2026-08-07');
  });

  it('throws on non-2xx', async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => new Response('nope', { status: 502 }));
    const adapter = createFrankfurterAdapter({
      logger: silentLogger,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      adapter.fetchRate({ base: 'USD', quote: 'EUR', date: '2026-08-11' }),
    ).rejects.toThrow(/502/);
  });

  it('throws when the response body has no usable rate', async () => {
    const fetchImpl = ok({ amount: 1, base: 'USD', date: '2026-08-11', rates: {} });
    const adapter = createFrankfurterAdapter({
      logger: silentLogger,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      adapter.fetchRate({ base: 'USD', quote: 'EUR', date: '2026-08-11' }),
    ).rejects.toThrow(/no usable rate/);
  });
});
