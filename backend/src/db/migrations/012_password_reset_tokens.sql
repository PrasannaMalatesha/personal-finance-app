-- Up Migration

-- Same shape as refresh_tokens: store the sha256 HASH of the raw token, not
-- the token itself. The plaintext token is generated once, sent by email
-- (or logged), and never persisted server-side — so a stolen DB dump can't
-- be replayed as an active reset link.
CREATE TABLE password_reset_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_password_reset_tokens_user
  ON password_reset_tokens(user_id)
  WHERE used_at IS NULL;


-- Down Migration

DROP INDEX IF EXISTS idx_password_reset_tokens_user;
DROP TABLE IF EXISTS password_reset_tokens;
