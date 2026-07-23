import type { Pool } from 'pg';
import type { Executor } from '../lib/tx';

export type RuleMatchType = 'substring' | 'exact';

export interface RuleRow {
  id: string;
  user_id: string;
  match_type: RuleMatchType;
  match_value: string;
  category_id: string;
  priority: number;
  created_at: Date;
}

export interface RulesRepo {
  listByUser(userId: string, executor?: Executor): Promise<RuleRow[]>;
}

export function createRulesRepo(pool: Pool): RulesRepo {
  return {
    async listByUser(userId, executor = pool) {
      const { rows } = await executor.query<RuleRow>(
        `SELECT * FROM rules
         WHERE user_id = $1
         ORDER BY priority ASC, created_at ASC`,
        [userId],
      );
      return rows;
    },
  };
}
