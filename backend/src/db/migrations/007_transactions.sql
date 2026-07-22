-- Up Migration
CREATE TABLE transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  description       TEXT NOT NULL,
  amount            NUMERIC(14,2) NOT NULL,
  category_id       UUID REFERENCES categories(id) ON DELETE SET NULL,
  import_batch_id   UUID REFERENCES import_batches(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_transactions_account_date ON transactions(account_id, date DESC);
CREATE INDEX idx_transactions_category ON transactions(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX idx_transactions_dup ON transactions(account_id, date, amount, description);

-- Down Migration
DROP TABLE IF EXISTS transactions;
