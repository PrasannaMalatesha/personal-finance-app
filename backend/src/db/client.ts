import { Pool } from 'pg';
import { env } from '../config/env';
import logger from '../logger';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
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
