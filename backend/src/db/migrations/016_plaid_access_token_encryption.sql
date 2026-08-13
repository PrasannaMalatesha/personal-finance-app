-- Up Migration

-- Ciphertext column for AES-256-GCM-encrypted Plaid access tokens. Nullable
-- so existing rows keep their plaintext value in access_token; the repo
-- writes to *_encrypted from now on and prefers it on read. Once every row
-- has an encrypted value, a follow-up migration can drop access_token.
--
-- BYTEA rather than TEXT because the wire format is binary (iv || tag ||
-- ciphertext) — bytea skips base64 round-trips at the storage boundary.
ALTER TABLE plaid_items
  ADD COLUMN access_token_encrypted BYTEA;


-- Down Migration

ALTER TABLE plaid_items DROP COLUMN IF EXISTS access_token_encrypted;
