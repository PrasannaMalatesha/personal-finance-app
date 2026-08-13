-- Up Migration

-- OAuth users have no password of their own. Existing rows keep their
-- password_hash NOT NULL by virtue of already having a value; the constraint
-- only relaxes for new rows created via the Google flow.
ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL;

-- Google's stable per-user identifier (the "sub" claim in the ID token).
-- Unique globally so two accounts can't be linked to the same Google user.
ALTER TABLE users
  ADD COLUMN google_sub TEXT UNIQUE;

CREATE INDEX idx_users_google_sub
  ON users(google_sub)
  WHERE google_sub IS NOT NULL;


-- Down Migration

DROP INDEX IF EXISTS idx_users_google_sub;
ALTER TABLE users DROP COLUMN IF EXISTS google_sub;
-- Re-tighten NOT NULL. This is only safe if all rows have a password_hash,
-- which is the case for any environment that hasn't opened Google sign-in.
-- If any NULLs exist the DDL will fail — that's the correct signal.
ALTER TABLE users
  ALTER COLUMN password_hash SET NOT NULL;
