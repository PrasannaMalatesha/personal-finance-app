import type { Pool } from 'pg';
import type { Executor } from '../lib/tx';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  base_currency: string;
  google_sub: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UsersRepo {
  findByEmail(email: string, executor?: Executor): Promise<UserRow | null>;
  findById(id: string, executor?: Executor): Promise<UserRow | null>;
  findByGoogleSub(sub: string, executor?: Executor): Promise<UserRow | null>;
  create(
    input: { email: string; passwordHash: string; baseCurrency: string },
    executor?: Executor,
  ): Promise<UserRow>;
  /** Create an OAuth-only user (no password). base_currency defaults to USD. */
  createOAuth(
    input: { email: string; baseCurrency: string; googleSub: string },
    executor?: Executor,
  ): Promise<UserRow>;
  updatePasswordHash(
    userId: string,
    passwordHash: string,
    executor?: Executor,
  ): Promise<void>;
  /** Link a Google identity to an existing (password) account. */
  linkGoogleSub(
    userId: string,
    googleSub: string,
    executor?: Executor,
  ): Promise<void>;
  updateBaseCurrency(
    userId: string,
    baseCurrency: string,
    executor?: Executor,
  ): Promise<void>;
  clearGoogleSub(userId: string, executor?: Executor): Promise<void>;
  /** Cascades via FK ON DELETE — nukes every downstream row. */
  deleteById(userId: string, executor?: Executor): Promise<boolean>;
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
    async findByGoogleSub(sub, executor = pool) {
      const { rows } = await executor.query<UserRow>(
        'SELECT * FROM users WHERE google_sub = $1',
        [sub],
      );
      return rows[0] ?? null;
    },
    async createOAuth({ email, baseCurrency, googleSub }, executor = pool) {
      const { rows } = await executor.query<UserRow>(
        `INSERT INTO users (email, password_hash, base_currency, google_sub)
         VALUES ($1, NULL, $2, $3)
         RETURNING *`,
        [email, baseCurrency, googleSub],
      );
      const row = rows[0];
      if (!row) throw new Error('users.createOAuth: no row returned');
      return row;
    },
    async linkGoogleSub(userId, googleSub, executor = pool) {
      await executor.query(
        `UPDATE users SET google_sub = $1, updated_at = NOW() WHERE id = $2`,
        [googleSub, userId],
      );
    },
    async updateBaseCurrency(userId, baseCurrency, executor = pool) {
      await executor.query(
        `UPDATE users SET base_currency = $1, updated_at = NOW() WHERE id = $2`,
        [baseCurrency, userId],
      );
    },
    async clearGoogleSub(userId, executor = pool) {
      await executor.query(
        `UPDATE users SET google_sub = NULL, updated_at = NOW() WHERE id = $1`,
        [userId],
      );
    },
    async deleteById(userId, executor = pool) {
      const { rowCount } = await executor.query(
        `DELETE FROM users WHERE id = $1`,
        [userId],
      );
      return (rowCount ?? 0) > 0;
    },
  };
}
