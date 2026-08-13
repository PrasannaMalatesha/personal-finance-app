-- Up Migration

-- One row per bank connection ("Item" in Plaid parlance). An Item spans
-- multiple bank accounts belonging to one login at one institution.
--
-- access_token: opaque Plaid token that grants ongoing read access to this
-- user's bank data. Stored plaintext for the sandbox/demo — a production
-- hardening pass would AES-GCM encrypt at rest with an app-secret. Not a
-- code change; a follow-up migration + tiny wrapper in the repo.
--
-- cursor: opaque continuation token for /transactions/sync. NULL means
-- "sync from the beginning"; each successful sync updates it to the
-- provider's returned cursor so the next call only fetches deltas.
CREATE TABLE plaid_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id           TEXT NOT NULL,
  access_token      TEXT NOT NULL,
  institution_id    TEXT,
  institution_name  TEXT,
  cursor            TEXT,
  last_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, item_id)
);
CREATE INDEX idx_plaid_items_user ON plaid_items(user_id);

-- Link accounts + transactions back to their Plaid origin. Nullable — manual
-- and CSV-imported records leave these NULL. UNIQUE-per-user prevents
-- double-inserts on re-sync.
ALTER TABLE accounts
  ADD COLUMN plaid_account_id TEXT,
  ADD COLUMN plaid_item_id    UUID REFERENCES plaid_items(id) ON DELETE SET NULL,
  ADD CONSTRAINT accounts_plaid_account_unique UNIQUE (user_id, plaid_account_id);

ALTER TABLE transactions
  ADD COLUMN plaid_transaction_id TEXT;

-- Partial unique so manual/CSV rows (NULL plaid_transaction_id) don't fight
-- the constraint. Only Plaid-sourced rows must be globally-per-user unique.
CREATE UNIQUE INDEX idx_transactions_plaid_unique
  ON transactions(plaid_transaction_id)
  WHERE plaid_transaction_id IS NOT NULL;


-- Down Migration

DROP INDEX IF EXISTS idx_transactions_plaid_unique;
ALTER TABLE transactions DROP COLUMN IF EXISTS plaid_transaction_id;

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_plaid_account_unique;
ALTER TABLE accounts DROP COLUMN IF EXISTS plaid_item_id;
ALTER TABLE accounts DROP COLUMN IF EXISTS plaid_account_id;

DROP INDEX IF EXISTS idx_plaid_items_user;
DROP TABLE IF EXISTS plaid_items;
