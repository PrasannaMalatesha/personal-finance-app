-- Up Migration
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Down Migration
-- Extensions intentionally left in place on rollback: other schemas may depend on them.
