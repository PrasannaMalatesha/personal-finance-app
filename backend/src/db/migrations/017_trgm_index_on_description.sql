-- Up Migration

-- The transactions search endpoint runs `description ILIKE '%q%'`, which a
-- btree index cannot serve — it degenerates to a sequential scan of every
-- row the user owns. On a demo user with ~500 rows that's fine; on a real
-- one with 50k+ it becomes the slowest query in the app.
--
-- pg_trgm + a GIN index on the description column indexes 3-character
-- shingles so leading-wildcard LIKE queries become O(log n) lookups on the
-- token set. Roughly a 10-100× speedup for substring search at scale, at
-- the cost of extra write overhead and disk (~15-30% of the column size).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_transactions_description_trgm
  ON transactions
  USING gin (description gin_trgm_ops);


-- Down Migration

DROP INDEX IF EXISTS idx_transactions_description_trgm;
-- Extension left in place — other schemas may rely on it, and removing
-- an extension whose objects still exist would fail anyway.
