import Decimal from 'decimal.js';
import type { Logger } from 'pino';
import type { FxRatesAdapter } from '../lib/fxAdapter';
import type { FxRatesRepo } from '../repositories/fxRates.repo';

export interface FxServiceDeps {
  fxAdapter: FxRatesAdapter;
  fxRatesRepo: FxRatesRepo;
  logger: Logger;
}

/**
 * Converts money between currencies using cached daily rates. Cache-first:
 * hit → return. Miss → fetch from provider, insert, return. If the provider
 * fails and a nearby cached rate exists (previous business day), fall back
 * to that so a flaky FX API doesn't break the dashboard.
 */
export function createFxService(deps: FxServiceDeps) {
  const { fxAdapter, fxRatesRepo, logger } = deps;
  // In-request memoization so a dashboard query that touches 30 transactions
  // in USD→EUR on the same day only hits Postgres once. Rebuilt per-call
  // since the service is a singleton but the maps are small and cheap.
  //
  // For a dashboard aggregating hundreds of txns, this saves N-1 queries.

  async function rateFor(
    base: string,
    quote: string,
    date: string,
    cache?: Map<string, string>,
  ): Promise<string> {
    if (base === quote) return '1';
    const key = `${base}|${quote}|${date}`;
    const cached = cache?.get(key);
    if (cached) return cached;

    const hit = await fxRatesRepo.findRate({ base, quote, rateDate: date });
    if (hit) {
      cache?.set(key, hit.rate);
      return hit.rate;
    }

    try {
      const fetched = await fxAdapter.fetchRate({ base, quote, date });
      // Frankfurter returns the *effective* date (may be earlier than the
      // requested date on weekends/holidays); cache under the requested date
      // so future lookups hit immediately, and also under the effective date
      // so cross-day lookups near that boundary reuse it.
      await fxRatesRepo.upsert({ base, quote, rateDate: date, rate: fetched.rate });
      if (fetched.effectiveDate !== date) {
        await fxRatesRepo.upsert({
          base,
          quote,
          rateDate: fetched.effectiveDate,
          rate: fetched.rate,
        });
      }
      cache?.set(key, fetched.rate);
      return fetched.rate;
    } catch (err) {
      const fallback = await fxRatesRepo.findMostRecentOnOrBefore({
        base,
        quote,
        rateDate: date,
      });
      if (fallback) {
        logger.warn(
          { err, base, quote, date, fallbackDate: fallback.rate_date },
          'FX provider failed; using most recent cached rate',
        );
        cache?.set(key, fallback.rate);
        return fallback.rate;
      }
      throw err;
    }
  }

  async function convert(
    amount: string | Decimal,
    from: string,
    to: string,
    date: string,
    cache?: Map<string, string>,
  ): Promise<string> {
    if (from === to) return new Decimal(amount).toFixed(2);
    const rate = await rateFor(from, to, date, cache);
    return new Decimal(amount).mul(rate).toFixed(2);
  }

  /** Fresh per-request memoization store for callers that will do many conversions. */
  function newCache(): Map<string, string> {
    return new Map();
  }

  return { rateFor, convert, newCache };
}

export type FxService = ReturnType<typeof createFxService>;
