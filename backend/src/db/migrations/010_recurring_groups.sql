-- Up Migration

CREATE TABLE recurring_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Normalized description (uppercase, whitespace collapsed) used as the
  -- grouping key. Two txs are in the same group iff their normalized
  -- descriptions match. Human-readable "display name" stays on the txs.
  merchant_key    TEXT NOT NULL,
  category_id     UUID REFERENCES categories(id) ON DELETE SET NULL,
  avg_amount      NUMERIC(14,2) NOT NULL,
  cadence_days    INTEGER NOT NULL,
  first_seen      DATE NOT NULL,
  last_seen       DATE NOT NULL,
  next_expected   DATE,
  -- User can dismiss a false positive. Dismissed groups don't reappear on
  -- subsequent re-runs of detection.
  is_dismissed    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, merchant_key)
);
CREATE INDEX idx_recurring_groups_user ON recurring_groups(user_id);

-- Wire transactions to their group. SET NULL on delete so removing a group
-- doesn't cascade-delete the underlying transactions (they still belong to
-- the account + category).
ALTER TABLE transactions
  ADD COLUMN recurring_group_id UUID REFERENCES recurring_groups(id) ON DELETE SET NULL;
CREATE INDEX idx_transactions_recurring
  ON transactions(recurring_group_id) WHERE recurring_group_id IS NOT NULL;


-- Down Migration

ALTER TABLE transactions DROP COLUMN IF EXISTS recurring_group_id;
DROP TABLE IF EXISTS recurring_groups;
