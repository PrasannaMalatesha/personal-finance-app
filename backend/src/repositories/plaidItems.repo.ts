import type { Pool } from 'pg';
import type { Executor } from '../lib/tx';
import type { AesGcm } from '../lib/crypto';

// Row surfaced to the service. access_token is always plaintext at this
// boundary — the repo transparently encrypts on write and decrypts on read.
// access_token may be empty string if the DB row somehow has neither the
// encrypted nor the plaintext column populated (defensive; should never
// happen given the upsert always writes one of them).
export interface PlaidItemRow {
  id: string;
  user_id: string;
  item_id: string;
  access_token: string;
  institution_id: string | null;
  institution_name: string | null;
  cursor: string | null;
  last_synced_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Raw shape from the DB before decryption. Kept private to the repo.
interface PlaidItemDbRow {
  id: string;
  user_id: string;
  item_id: string;
  access_token: string | null;
  access_token_encrypted: Buffer | null;
  institution_id: string | null;
  institution_name: string | null;
  cursor: string | null;
  last_synced_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PlaidItemsRepo {
  listByUser(userId: string, executor?: Executor): Promise<PlaidItemRow[]>;
  findByIdForUser(
    id: string,
    userId: string,
    executor?: Executor,
  ): Promise<PlaidItemRow | null>;
  upsertByItemId(
    input: {
      userId: string;
      itemId: string;
      accessToken: string;
      institutionId: string | null;
      institutionName: string | null;
    },
    executor?: Executor,
  ): Promise<PlaidItemRow>;
  updateCursor(id: string, cursor: string, executor?: Executor): Promise<void>;
  deleteById(id: string, userId: string, executor?: Executor): Promise<boolean>;
}

/**
 * @param cipher When provided, all new writes encrypt the access token and
 * populate access_token_encrypted; the legacy access_token column is left
 * empty. When undefined (sandbox with no PLAID_ENCRYPTION_KEY), tokens
 * continue to be stored plaintext for backward compatibility.
 *
 * On read the repo prefers the encrypted column when present; otherwise it
 * falls back to the plaintext column so pre-encryption rows keep working.
 */
export function createPlaidItemsRepo(
  pool: Pool,
  cipher: AesGcm | null = null,
): PlaidItemsRepo {
  function toRow(db: PlaidItemDbRow): PlaidItemRow {
    let accessToken = '';
    if (db.access_token_encrypted) {
      if (!cipher) {
        // Row is encrypted but we have no key — refuse to leak nonsense.
        throw new Error(
          'plaid_items row is encrypted but PLAID_ENCRYPTION_KEY is not configured',
        );
      }
      accessToken = cipher.decrypt(db.access_token_encrypted.toString('base64'));
    } else if (db.access_token) {
      accessToken = db.access_token;
    }
    return {
      id: db.id,
      user_id: db.user_id,
      item_id: db.item_id,
      access_token: accessToken,
      institution_id: db.institution_id,
      institution_name: db.institution_name,
      cursor: db.cursor,
      last_synced_at: db.last_synced_at,
      created_at: db.created_at,
      updated_at: db.updated_at,
    };
  }

  return {
    async listByUser(userId, executor = pool) {
      const { rows } = await executor.query<PlaidItemDbRow>(
        `SELECT * FROM plaid_items WHERE user_id = $1 ORDER BY created_at ASC`,
        [userId],
      );
      return rows.map(toRow);
    },

    async findByIdForUser(id, userId, executor = pool) {
      const { rows } = await executor.query<PlaidItemDbRow>(
        `SELECT * FROM plaid_items WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      const first = rows[0];
      return first ? toRow(first) : null;
    },

    async upsertByItemId(
      { userId, itemId, accessToken, institutionId, institutionName },
      executor = pool,
    ) {
      const plaintext = cipher ? '' : accessToken;
      const encrypted = cipher
        ? Buffer.from(cipher.encrypt(accessToken), 'base64')
        : null;
      const { rows } = await executor.query<PlaidItemDbRow>(
        `INSERT INTO plaid_items
           (user_id, item_id, access_token, access_token_encrypted, institution_id, institution_name)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, item_id) DO UPDATE SET
           access_token = EXCLUDED.access_token,
           access_token_encrypted = EXCLUDED.access_token_encrypted,
           institution_id = EXCLUDED.institution_id,
           institution_name = EXCLUDED.institution_name,
           updated_at = NOW()
         RETURNING *`,
        [userId, itemId, plaintext, encrypted, institutionId, institutionName],
      );
      const row = rows[0];
      if (!row) throw new Error('plaid_items.upsert: no row returned');
      return toRow(row);
    },

    async updateCursor(id, cursor, executor = pool) {
      await executor.query(
        `UPDATE plaid_items
            SET cursor = $2, last_synced_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [id, cursor],
      );
    },

    async deleteById(id, userId, executor = pool) {
      const { rowCount } = await executor.query(
        `DELETE FROM plaid_items WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      return (rowCount ?? 0) > 0;
    },
  };
}
