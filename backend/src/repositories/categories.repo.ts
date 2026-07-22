import type { Pool } from 'pg';
import type { Executor } from '../lib/tx';

export interface CategoryRow {
  id: string;
  user_id: string;
  name: string;
  color: string;
  is_system_default: boolean;
  created_at: Date;
}

export interface CategoriesRepo {
  listByUser(userId: string, executor?: Executor): Promise<CategoryRow[]>;
  findByIdForUser(
    id: string,
    userId: string,
    executor?: Executor,
  ): Promise<CategoryRow | null>;
  create(
    input: { userId: string; name: string; color: string; isSystemDefault?: boolean },
    executor?: Executor,
  ): Promise<CategoryRow>;
  update(
    id: string,
    userId: string,
    patch: { name?: string; color?: string },
    executor?: Executor,
  ): Promise<CategoryRow | null>;
  delete(
    id: string,
    userId: string,
    executor?: Executor,
  ): Promise<boolean>;
  bulkCreate(
    userId: string,
    categories: ReadonlyArray<{ name: string; color: string }>,
    executor: Executor,
  ): Promise<void>;
}

export function createCategoriesRepo(pool: Pool): CategoriesRepo {
  return {
    async listByUser(userId, executor = pool) {
      const { rows } = await executor.query<CategoryRow>(
        `SELECT * FROM categories WHERE user_id = $1 ORDER BY name ASC`,
        [userId],
      );
      return rows;
    },

    async findByIdForUser(id, userId, executor = pool) {
      const { rows } = await executor.query<CategoryRow>(
        `SELECT * FROM categories WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      return rows[0] ?? null;
    },

    async create({ userId, name, color, isSystemDefault = false }, executor = pool) {
      const { rows } = await executor.query<CategoryRow>(
        `INSERT INTO categories (user_id, name, color, is_system_default)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, name, color, isSystemDefault],
      );
      const row = rows[0];
      if (!row) throw new Error('categories.create: no row returned');
      return row;
    },

    async update(id, userId, patch, executor = pool) {
      const sets: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      if (patch.name !== undefined) {
        sets.push(`name = $${i++}`);
        values.push(patch.name);
      }
      if (patch.color !== undefined) {
        sets.push(`color = $${i++}`);
        values.push(patch.color);
      }
      if (sets.length === 0) {
        return this.findByIdForUser(id, userId, executor);
      }
      values.push(id, userId);
      const { rows } = await executor.query<CategoryRow>(
        `UPDATE categories SET ${sets.join(', ')}
         WHERE id = $${i++} AND user_id = $${i++}
         RETURNING *`,
        values,
      );
      return rows[0] ?? null;
    },

    async delete(id, userId, executor = pool) {
      const { rowCount } = await executor.query(
        `DELETE FROM categories WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      return (rowCount ?? 0) > 0;
    },

    async bulkCreate(userId, categories, executor) {
      if (categories.length === 0) return;
      const values: unknown[] = [];
      const placeholders: string[] = [];
      categories.forEach((cat, i) => {
        const base = i * 4;
        placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
        values.push(userId, cat.name, cat.color, true);
      });
      await executor.query(
        `INSERT INTO categories (user_id, name, color, is_system_default)
         VALUES ${placeholders.join(', ')}`,
        values,
      );
    },
  };
}
