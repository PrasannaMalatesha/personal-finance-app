import type { PoolClient } from 'pg';

export interface IdempotencyRow {
  user_id: string;
  key: string;
  request_hash: string;
  response_status: number;
  response_body: unknown;
  created_at: Date;
}

export interface IdempotencyKeysRepo {
  findByUserAndKey(
    client: PoolClient,
    userId: string,
    key: string,
  ): Promise<IdempotencyRow | null>;
  insert(
    client: PoolClient,
    row: {
      userId: string;
      key: string;
      requestHash: string;
      responseStatus: number;
      responseBody: unknown;
    },
  ): Promise<void>;
}

export function createIdempotencyKeysRepo(): IdempotencyKeysRepo {
  return {
    async findByUserAndKey(client, userId, key) {
      const { rows } = await client.query<IdempotencyRow>(
        `SELECT * FROM idempotency_keys WHERE user_id = $1 AND key = $2`,
        [userId, key],
      );
      return rows[0] ?? null;
    },
    async insert(client, { userId, key, requestHash, responseStatus, responseBody }) {
      await client.query(
        `INSERT INTO idempotency_keys
         (user_id, key, request_hash, response_status, response_body)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, key, requestHash, responseStatus, JSON.stringify(responseBody)],
      );
    },
  };
}
