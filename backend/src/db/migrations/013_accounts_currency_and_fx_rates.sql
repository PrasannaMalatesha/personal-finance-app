-- Up Migration

-- Per-account currency. Backfill existing rows from the owner's base_currency
-- so no account is ever currency-less. Same 10-currency whitelist as users.
ALTER TABLE accounts
  ADD COLUMN currency CHAR(3);

UPDATE accounts a
   SET currency = u.base_currency
  FROM users u
 WHERE a.user_id = u.id
   AND a.currency IS NULL;

ALTER TABLE accounts
  ALTER COLUMN currency SET NOT NULL,
  ADD CONSTRAINT accounts_currency_check
    CHECK (currency IN ('INR','USD','EUR','GBP','JPY','CAD','AUD','SGD','AED','CHF'));

-- Daily FX rates cache. One row per (base, quote, date). Populated on-demand
-- by the FX service — first dashboard hit that needs a missing rate fetches
-- from Frankfurter (ECB) and INSERTs; subsequent reads are cache hits.
--
-- rate: units of `quote` per one unit of `base`, e.g. base=EUR quote=USD
-- rate=1.08 means 1 EUR = 1.08 USD. NUMERIC(18,8) to preserve precision
-- across chained conversions.
CREATE TABLE fx_rates (
  base       CHAR(3) NOT NULL,
  quote      CHAR(3) NOT NULL,
  rate_date  DATE    NOT NULL,
  rate       NUMERIC(18,8) NOT NULL CHECK (rate > 0),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (base, quote, rate_date)
);

CREATE INDEX idx_fx_rates_date ON fx_rates(rate_date);


-- Down Migration

DROP INDEX IF EXISTS idx_fx_rates_date;
DROP TABLE IF EXISTS fx_rates;

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_currency_check;
ALTER TABLE accounts DROP COLUMN IF EXISTS currency;
