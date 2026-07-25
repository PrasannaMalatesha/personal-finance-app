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

export interface RuleWithCategoryRow extends RuleRow {
  category_name: string;
  category_color: string;
}

export interface RulesRepo {
  listByUser(userId: string, executor?: Executor): Promise<RuleRow[]>;
  listWithCategory(userId: string, executor?: Executor): Promise<RuleWithCategoryRow[]>;
  findWithCategoryByIdForUser(
    id: string,
    userId: string,
    executor?: Executor,
  ): Promise<RuleWithCategoryRow | null>;
  create(
    input: {
      userId: string;
      matchType: RuleMatchType;
      matchValue: string;
      categoryId: string;
      priority: number;
    },
    executor?: Executor,
  ): Promise<RuleRow>;
  update(
    id: string,
    userId: string,
    patch: {
      matchType?: RuleMatchType;
      matchValue?: string;
      categoryId?: string;
      priority?: number;
    },
    executor?: Executor,
  ): Promise<RuleRow | null>;
  delete(id: string, userId: string, executor?: Executor): Promise<boolean>;
  /**
   * Seed default rules atomically inside the signup transaction. Each seed
   * row resolves its category by name from the just-seeded categories — no
   * round-trips per rule.
   */
  bulkSeed(
    userId: string,
    rules: ReadonlyArray<{
      matchType: RuleMatchType;
      matchValue: string;
      categoryName: string;
      priority: number;
    }>,
    executor: Executor,
  ): Promise<void>;
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

    async listWithCategory(userId, executor = pool) {
      const { rows } = await executor.query<RuleWithCategoryRow>(
        `SELECT r.*, c.name AS category_name, c.color AS category_color
         FROM rules r
         JOIN categories c ON c.id = r.category_id
         WHERE r.user_id = $1
         ORDER BY r.priority ASC, r.created_at ASC`,
        [userId],
      );
      return rows;
    },

    async findWithCategoryByIdForUser(id, userId, executor = pool) {
      const { rows } = await executor.query<RuleWithCategoryRow>(
        `SELECT r.*, c.name AS category_name, c.color AS category_color
         FROM rules r
         JOIN categories c ON c.id = r.category_id
         WHERE r.id = $1 AND r.user_id = $2`,
        [id, userId],
      );
      return rows[0] ?? null;
    },

    async create(input, executor = pool) {
      const { rows } = await executor.query<RuleRow>(
        `INSERT INTO rules (user_id, match_type, match_value, category_id, priority)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          input.userId,
          input.matchType,
          input.matchValue,
          input.categoryId,
          input.priority,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error('rules.create: no row returned');
      return row;
    },

    async update(id, userId, patch, executor = pool) {
      const sets: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      if (patch.matchType !== undefined) {
        sets.push(`match_type = $${i++}`);
        values.push(patch.matchType);
      }
      if (patch.matchValue !== undefined) {
        sets.push(`match_value = $${i++}`);
        values.push(patch.matchValue);
      }
      if (patch.categoryId !== undefined) {
        sets.push(`category_id = $${i++}`);
        values.push(patch.categoryId);
      }
      if (patch.priority !== undefined) {
        sets.push(`priority = $${i++}`);
        values.push(patch.priority);
      }
      if (sets.length === 0) {
        const { rows } = await executor.query<RuleRow>(
          `SELECT * FROM rules WHERE id = $1 AND user_id = $2`,
          [id, userId],
        );
        return rows[0] ?? null;
      }
      values.push(id, userId);
      const { rows } = await executor.query<RuleRow>(
        `UPDATE rules SET ${sets.join(', ')}
         WHERE id = $${i++} AND user_id = $${i++}
         RETURNING *`,
        values,
      );
      return rows[0] ?? null;
    },

    async delete(id, userId, executor = pool) {
      const { rowCount } = await executor.query(
        `DELETE FROM rules WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      return (rowCount ?? 0) > 0;
    },

    async bulkSeed(userId, rules, executor) {
      if (rules.length === 0) return;
      // One-shot INSERT ... SELECT — resolves each category by name via a
      // VALUES-typed table joined to the just-seeded categories row set.
      const values: unknown[] = [];
      const rowLiterals: string[] = [];
      rules.forEach((r, i) => {
        const base = i * 4;
        rowLiterals.push(
          `($${base + 1}::rule_match_type, $${base + 2}, $${base + 3}, $${base + 4}::int)`,
        );
        values.push(r.matchType, r.matchValue, r.categoryName, r.priority);
      });
      values.push(userId);
      const userParam = `$${values.length}`;
      await executor.query(
        `INSERT INTO rules (user_id, match_type, match_value, category_id, priority)
         SELECT ${userParam}, d.match_type, d.match_value, c.id, d.priority
         FROM (VALUES ${rowLiterals.join(', ')})
           AS d(match_type, match_value, category_name, priority)
         JOIN categories c ON c.user_id = ${userParam} AND c.name = d.category_name`,
        values,
      );
    },
  };
}
