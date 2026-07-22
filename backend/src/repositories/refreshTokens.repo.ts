import type { Pool, PoolClient } from 'pg';
import type { Executor } from '../lib/tx';

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

export interface RefreshTokensRepo {
  create(
    input: { userId: string; tokenHash: string; expiresAt: Date },
    executor?: Executor,
  ): Promise<RefreshTokenRow>;
  findByHashForUpdate(
    client: PoolClient,
    tokenHash: string,
  ): Promise<RefreshTokenRow | null>;
  revoke(id: string, now: Date, executor?: Executor): Promise<void>;
  revokeAllForUser(userId: string, now: Date, executor?: Executor): Promise<void>;
}

export function createRefreshTokensRepo(pool: Pool): RefreshTokensRepo {
  return {
    async create({ userId, tokenHash, expiresAt }, executor = pool) {
      const { rows } = await executor.query<RefreshTokenRow>(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [userId, tokenHash, expiresAt],
      );
      const row = rows[0];
      if (!row) throw new Error('refresh_tokens.create: no row returned');
      return row;
    },
    async findByHashForUpdate(client, tokenHash) {
      const { rows } = await client.query<RefreshTokenRow>(
        `SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
        [tokenHash],
      );
      return rows[0] ?? null;
    },
    async revoke(id, now, executor = pool) {
      await executor.query(
        `UPDATE refresh_tokens SET revoked_at = $1 WHERE id = $2`,
        [now, id],
      );
    },
    async revokeAllForUser(userId, now, executor = pool) {
      await executor.query(
        `UPDATE refresh_tokens SET revoked_at = $1
         WHERE user_id = $2 AND revoked_at IS NULL`,
        [now, userId],
      );
    },
  };
}
