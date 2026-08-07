import { Pool } from 'pg';

const TABLES = [
  'idempotency_keys',
  'budgets',
  'transactions',
  'recurring_groups',
  'import_batches',
  'rules',
  'categories',
  'accounts',
  'password_reset_tokens',
  'refresh_tokens',
  'users',
];

export function createTestPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL not set (check vitest.setup.ts)');
  return new Pool({ connectionString, max: 5 });
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
}
