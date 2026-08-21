import { Pool } from 'pg';
import { env } from '../config/env';
import logger from '../logger';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_POOL_IDLE_MS,
  connectionTimeoutMillis: 5_000,
});

// Set statement_timeout on every new connection so a runaway query can't
// hold a pool slot forever. Applied on 'connect' rather than as a
// per-query hint so callers don't have to remember it. Read replicas,
// migrations, and long-running maintenance scripts should either raise
// this or use a separate pool.
pool.on('connect', (client) => {
  client
    .query(`SET statement_timeout = ${env.DB_STATEMENT_TIMEOUT_MS}`)
    .catch((err: unknown) => {
      logger.warn({ err }, 'Failed to set statement_timeout on new pg connection');
    });
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected pg pool error');
});

export async function testConnection(): Promise<boolean> {
  try {
    const result = await pool.query<{ ok: number }>('SELECT 1 AS ok');
    return result.rows[0]?.ok === 1;
  } catch (err) {
    logger.error({ err }, 'Database connection test failed');
    return false;
  }
}
