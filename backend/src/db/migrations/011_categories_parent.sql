-- Up Migration

-- Depth-2 hierarchy: a category may have a parent, but a parent's parent
-- must be NULL. Enforced in the service layer; the DB just allows self-
-- referencing NULLable FKs and lets the service reject bad shapes.
--
-- SET NULL on delete so removing a parent turns its children into
-- top-level categories rather than orphaning them.
ALTER TABLE categories
  ADD COLUMN parent_category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX idx_categories_parent
  ON categories(parent_category_id)
  WHERE parent_category_id IS NOT NULL;


-- Down Migration

DROP INDEX IF EXISTS idx_categories_parent;
ALTER TABLE categories DROP COLUMN IF EXISTS parent_category_id;
