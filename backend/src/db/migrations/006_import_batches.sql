-- Up Migration
CREATE TABLE import_batches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  row_count    INTEGER NOT NULL,
  imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone_at    TIMESTAMPTZ
);
CREATE INDEX idx_import_batches_account ON import_batches(account_id);

-- Down Migration
DROP TABLE IF EXISTS import_batches;
