import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { randomBytes, randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { createTestPool, truncateAll } from './helpers/testDb';
import { createPlaidItemsRepo } from '../../src/repositories/plaidItems.repo';
import { createAesGcm } from '../../src/lib/crypto';

const KEY = randomBytes(32).toString('base64');
const cipher = createAesGcm(KEY);

async function seedUser(pool: Pool): Promise<string> {
  const email = `u${Date.now()}${Math.random()}@example.com`;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, base_currency)
     VALUES ($1, 'hash', 'USD') RETURNING id`,
    [email],
  );
  return rows[0]!.id;
}

describe('plaidItems repo (integration) — encryption at rest', () => {
  let pool: Pool;
  beforeAll(() => {
    pool = createTestPool();
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(pool);
  });

  it('encrypts on write and decrypts on read', async () => {
    const userId = await seedUser(pool);
    const repo = createPlaidItemsRepo(pool, cipher);
    const upserted = await repo.upsertByItemId({
      userId,
      itemId: 'plaid-item-1',
      accessToken: 'access-sandbox-real-value',
      institutionId: 'ins_1',
      institutionName: 'Test Bank',
    });
    expect(upserted.access_token).toBe('access-sandbox-real-value');

    // Raw DB: encrypted column populated, plaintext left blank.
    const { rows } = await pool.query<{
      access_token: string | null;
      access_token_encrypted: Buffer | null;
    }>(
      `SELECT access_token, access_token_encrypted FROM plaid_items WHERE id = $1`,
      [upserted.id],
    );
    const raw = rows[0]!;
    expect(raw.access_token).toBe('');
    expect(raw.access_token_encrypted).toBeInstanceOf(Buffer);
    expect(raw.access_token_encrypted!.length).toBeGreaterThanOrEqual(28);
    // Sanity: raw bytes must not contain the plaintext.
    expect(raw.access_token_encrypted!.toString('binary')).not.toContain(
      'access-sandbox-real-value',
    );

    const read = await repo.findByIdForUser(upserted.id, userId);
    expect(read?.access_token).toBe('access-sandbox-real-value');
  });

  it('reads legacy plaintext rows when the encrypted column is null', async () => {
    // Simulate a pre-encryption row directly.
    const userId = await seedUser(pool);
    const rowId = randomUUID();
    await pool.query(
      `INSERT INTO plaid_items (id, user_id, item_id, access_token, institution_name)
       VALUES ($1, $2, 'legacy-item', 'legacy-plaintext-token', 'Legacy Bank')`,
      [rowId, userId],
    );
    const repo = createPlaidItemsRepo(pool, cipher);
    const read = await repo.findByIdForUser(rowId, userId);
    expect(read?.access_token).toBe('legacy-plaintext-token');
  });

  it('deleteById removes the row and reports the count', async () => {
    const userId = await seedUser(pool);
    const repo = createPlaidItemsRepo(pool, cipher);
    const upserted = await repo.upsertByItemId({
      userId,
      itemId: 'plaid-item-x',
      accessToken: 'access-x',
      institutionId: null,
      institutionName: null,
    });
    expect(await repo.deleteById(upserted.id, userId)).toBe(true);
    expect(await repo.findByIdForUser(upserted.id, userId)).toBeNull();
    expect(await repo.deleteById(upserted.id, userId)).toBe(false);
  });

  it('refuses to return an encrypted row when no cipher is configured', async () => {
    const userId = await seedUser(pool);
    const encryptedRepo = createPlaidItemsRepo(pool, cipher);
    const upserted = await encryptedRepo.upsertByItemId({
      userId,
      itemId: 'plaid-item-y',
      accessToken: 'access-y',
      institutionId: null,
      institutionName: null,
    });
    const plainRepo = createPlaidItemsRepo(pool, null);
    await expect(plainRepo.findByIdForUser(upserted.id, userId)).rejects.toThrow(
      /encrypted/,
    );
  });
});
