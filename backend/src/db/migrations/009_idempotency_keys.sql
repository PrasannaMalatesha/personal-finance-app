-- Up Migration
CREATE TABLE idempotency_keys (
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key              TEXT NOT NULL,
  request_hash     TEXT NOT NULL,
  response_status  INTEGER NOT NULL,
  response_body    JSONB NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);
CREATE INDEX idx_idem_created ON idempotency_keys(created_at);

-- Down Migration
DROP TABLE IF EXISTS idempotency_keys;
