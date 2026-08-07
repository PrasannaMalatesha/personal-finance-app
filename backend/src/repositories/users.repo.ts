import type { Pool } from 'pg';
import type { Executor } from '../lib/tx';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  base_currency: string;
  created_at: Date;
  updated_at: Date;
}

export interface UsersRepo {
  findByEmail(email: string, executor?: Executor): Promise<UserRow | null>;
  findById(id: string, executor?: Executor): Promise<UserRow | null>;
  create(
    input: { email: string; passwordHash: string; baseCurrency: string },
    executor?: Executor,
  ): Promise<UserRow>;
  updatePasswordHash(
    userId: string,
    passwordHash: string,
    executor?: Executor,
  ): Promise<void>;
}

export function createUsersRepo(pool: Pool): UsersRepo {
  return {
    async findByEmail(email, executor = pool) {
      const { rows } = await executor.query<UserRow>(
        'SELECT * FROM users WHERE email = $1',
        [email],
      );
      return rows[0] ?? null;
    },
    async findById(id, executor = pool) {
      const { rows } = await executor.query<UserRow>(
        'SELECT * FROM users WHERE id = $1',
        [id],
      );
      return rows[0] ?? null;
    },
    async create({ email, passwordHash, baseCurrency }, executor = pool) {
      const { rows } = await executor.query<UserRow>(
        `INSERT INTO users (email, password_hash, base_currency)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [email, passwordHash, baseCurrency],
      );
      const row = rows[0];
      if (!row) throw new Error('users.create: no row returned');
      return row;
    },
    async updatePasswordHash(userId, passwordHash, executor = pool) {
      await executor.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [passwordHash, userId],
      );
    },
  };
}
