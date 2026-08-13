import { describe, it, expect } from 'vitest';
import { randomBytes } from 'crypto';
import { createAesGcm } from '../../src/lib/crypto';

function newKey(): string {
  return randomBytes(32).toString('base64');
}

describe('createAesGcm', () => {
  it('roundtrips arbitrary strings', () => {
    const c = createAesGcm(newKey());
    for (const plaintext of [
      '',
      'access-sandbox-abc-123',
      'special: !@#$%^&*() unicode: 日本語 🔒',
      'a'.repeat(2048),
    ]) {
      expect(c.decrypt(c.encrypt(plaintext))).toBe(plaintext);
    }
  });

  it('produces different ciphertexts for the same plaintext (fresh IV)', () => {
    const c = createAesGcm(newKey());
    const a = c.encrypt('secret');
    const b = c.encrypt('secret');
    expect(a).not.toBe(b);
    expect(c.decrypt(a)).toBe('secret');
    expect(c.decrypt(b)).toBe('secret');
  });

  it('rejects a wrong key with an auth-tag error', () => {
    const a = createAesGcm(newKey());
    const b = createAesGcm(newKey());
    const enc = a.encrypt('secret');
    expect(() => b.decrypt(enc)).toThrow();
  });

  it('rejects tampered ciphertext', () => {
    const c = createAesGcm(newKey());
    const enc = c.encrypt('secret');
    // Flip a byte in the middle (past the iv+tag prefix).
    const buf = Buffer.from(enc, 'base64');
    buf[buf.length - 1] = buf[buf.length - 1]! ^ 0xff;
    expect(() => c.decrypt(buf.toString('base64'))).toThrow();
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => createAesGcm(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
  });
});
