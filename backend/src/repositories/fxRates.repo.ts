import type { Pool } from 'pg';
import type { Executor } from '../lib/tx';

export interface FxRateRow {
  base: string;
  quote: string;
  rate_date: Date;
  rate: string;
  fetched_at: Date;
}

export interface FxRatesRepo {
  findRate(
    input: { base: string; quote: string; rateDate: string },
    executor?: Executor,
  ): Promise<FxRateRow | null>;
  /** Most-recent cached rate for this pair on or before rateDate (fallback for holidays). */
  findMostRecentOnOrBefore(
    input: { base: string; quote: string; rateDate: string },
    executor?: Executor,
  ): Promise<FxRateRow | null>;
  upsert(
    input: { base: string; quote: string; rateDate: string; rate: string },
    executor?: Executor,
  ): Promise<void>;
}

export function createFxRatesRepo(pool: Pool): FxRatesRepo {
  return {
    async findRate({ base, quote, rateDate }, executor = pool) {
      const { rows } = await executor.query<FxRateRow>(
        `SELECT * FROM fx_rates WHERE base = $1 AND quote = $2 AND rate_date = $3`,
        [base, quote, rateDate],
      );
      return rows[0] ?? null;
    },
    async findMostRecentOnOrBefore({ base, quote, rateDate }, executor = pool) {
      const { rows } = await executor.query<FxRateRow>(
        `SELECT * FROM fx_rates
          WHERE base = $1 AND quote = $2 AND rate_date <= $3
          ORDER BY rate_date DESC
          LIMIT 1`,
        [base, quote, rateDate],
      );
      return rows[0] ?? null;
    },
    async upsert({ base, quote, rateDate, rate }, executor = pool) {
      await executor.query(
        `INSERT INTO fx_rates (base, quote, rate_date, rate)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (base, quote, rate_date) DO UPDATE SET
           rate = EXCLUDED.rate,
           fetched_at = NOW()`,
        [base, quote, rateDate, rate],
      );
    },
  };
}
