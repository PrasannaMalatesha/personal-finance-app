-- Up Migration
CREATE TYPE rule_match_type AS ENUM ('substring','exact');

CREATE TABLE rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_type   rule_match_type NOT NULL,
  match_value  TEXT NOT NULL,
  category_id  UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  priority     INTEGER NOT NULL DEFAULT 100,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rules_user_priority ON rules(user_id, priority);

-- Down Migration
DROP TABLE IF EXISTS rules;
DROP TYPE IF EXISTS rule_match_type;
