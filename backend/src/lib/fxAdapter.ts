import type { Logger } from 'pino';

/**
 * Free FX rates provider. Kept small — one call: fetch a historical daily
 * rate for a base→quote pair on a given date. Frankfurter (ECB-sourced,
 * no API key) is the default; a stub adapter is exported for tests.
 *
 * ECB has no weekend/holiday rates; Frankfurter returns the previous
 * business day's rate transparently, which is the right call for a
 * personal-finance demo.
 */
export interface FxRatesAdapter {
  fetchRate(input: {
    base: string;
    quote: string;
    date: string; // YYYY-MM-DD (UTC)
  }): Promise<{ rate: string; effectiveDate: string }>;
}

export interface FrankfurterAdapterConfig {
  logger: Logger;
  /** Injectable for tests; defaults to global fetch (Node 20+). */
  fetchImpl?: typeof fetch;
  /** Override for tests; defaults to https://api.frankfurter.dev/v1. */
  baseUrl?: string;
}

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

export function createFrankfurterAdapter(
  config: FrankfurterAdapterConfig,
): FxRatesAdapter {
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = (config.baseUrl ?? 'https://api.frankfurter.dev/v1').replace(
    /\/$/,
    '',
  );

  return {
    async fetchRate({ base, quote, date }) {
      // Frankfurter: GET /{date}?base={base}&symbols={quote}
      const url = `${baseUrl}/${encodeURIComponent(date)}?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(quote)}`;
      const res = await fetchImpl(url, { method: 'GET' });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        config.logger.error(
          { status: res.status, body, base, quote, date },
          'Frankfurter FX fetch failed',
        );
        throw new Error(`Frankfurter FX fetch failed with status ${res.status}`);
      }
      const json = (await res.json()) as FrankfurterResponse;
      const rateNum = json.rates?.[quote];
      if (typeof rateNum !== 'number' || !Number.isFinite(rateNum) || rateNum <= 0) {
        throw new Error(
          `Frankfurter returned no usable rate for ${base}→${quote} on ${date}`,
        );
      }
      // Frankfurter numbers arrive as floats — convert straight to string.
      // Precision loss at the JSON boundary is unavoidable with any HTTP FX
      // provider; downstream math uses decimal.js from this string onward.
      return { rate: String(rateNum), effectiveDate: json.date };
    },
  };
}
