import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM helpers for encrypting small secrets at rest (e.g. Plaid
 * access tokens). Not designed for large payloads or streaming.
 *
 * Wire format (base64):   iv (12 bytes) || tag (16 bytes) || ciphertext
 *
 * GCM guarantees integrity: any tampering with the ciphertext or IV fails
 * the auth tag verification and decrypt throws. Fresh random IV per encrypt
 * means the same plaintext + same key produce different ciphertexts —
 * required for GCM's security bound.
 */
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32; // AES-256

export interface AesGcm {
  encrypt(plaintext: string): string;
  decrypt(payload: string): string;
}

/**
 * @param keyBase64 base64-encoded 32-byte key. Generate with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
export function createAesGcm(keyBase64: string): AesGcm {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== KEY_LEN) {
    throw new Error(
      `AES-256-GCM key must decode to ${KEY_LEN} bytes; got ${key.length}`,
    );
  }

  return {
    encrypt(plaintext) {
      const iv = randomBytes(IV_LEN);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return Buffer.concat([iv, tag, enc]).toString('base64');
    },

    decrypt(payload) {
      const buf = Buffer.from(payload, 'base64');
      if (buf.length < IV_LEN + TAG_LEN) {
        throw new Error('Encrypted payload too short');
      }
      const iv = buf.subarray(0, IV_LEN);
      const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
      const enc = buf.subarray(IV_LEN + TAG_LEN);
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
      return dec.toString('utf8');
    },
  };
}
