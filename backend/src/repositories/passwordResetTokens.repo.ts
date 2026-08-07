import type { Pool } from 'pg';
import type { Executor } from '../lib/tx';

export interface PasswordResetTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface PasswordResetTokensRepo {
  create(
    input: { userId: string; tokenHash: string; expiresAt: Date },
    executor?: Executor,
  ): Promise<PasswordResetTokenRow>;
  findByHash(
    tokenHash: string,
    executor?: Executor,
  ): Promise<PasswordResetTokenRow | null>;
  markUsed(id: string, now: Date, executor?: Executor): Promise<void>;
}

export function createPasswordResetTokensRepo(pool: Pool): PasswordResetTokensRepo {
  return {
    async create({ userId, tokenHash, expiresAt }, executor = pool) {
      const { rows } = await executor.query<PasswordResetTokenRow>(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [userId, tokenHash, expiresAt],
      );
      const row = rows[0];
      if (!row) throw new Error('password_reset_tokens.create: no row returned');
      return row;
    },
    async findByHash(tokenHash, executor = pool) {
      const { rows } = await executor.query<PasswordResetTokenRow>(
        `SELECT * FROM password_reset_tokens WHERE token_hash = $1`,
        [tokenHash],
      );
      return rows[0] ?? null;
    },
    async markUsed(id, now, executor = pool) {
      await executor.query(
        `UPDATE password_reset_tokens SET used_at = $1 WHERE id = $2`,
        [now, id],
      );
    },
  };
}
