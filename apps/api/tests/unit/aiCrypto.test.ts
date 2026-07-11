/**
 * Unit tests for services/aiCrypto.ts — AES-256-GCM encryption of provider keys.
 * No database, network, or config: the env secret is passed in directly.
 */
import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from '../../src/services/aiCrypto.js';

const SECRET = 'test-master-secret-of-sufficient-length';

describe('aiCrypto', () => {
  it('round-trips a plaintext key', () => {
    const key = 'sk-ant-abc123-XYZ';
    const enc = encryptSecret(key, SECRET);
    expect(decryptSecret(enc, SECRET)).toBe(key);
  });

  it('produces base64 ciphertext/iv/tag and hides the plaintext', () => {
    const enc = encryptSecret('sk-secret-value', SECRET);
    for (const part of [enc.ciphertext, enc.iv, enc.tag]) {
      expect(part).toMatch(/^[A-Za-z0-9+/]+=*$/);
    }
    expect(enc.ciphertext).not.toContain('secret');
    expect(Buffer.from(enc.iv, 'base64')).toHaveLength(12);
  });

  it('uses a unique IV per encryption (same input → different ciphertext)', () => {
    const a = encryptSecret('same', SECRET);
    const b = encryptSecret('same', SECRET);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(decryptSecret(a, SECRET)).toBe('same');
    expect(decryptSecret(b, SECRET)).toBe('same');
  });

  it('fails authentication with the wrong secret', () => {
    const enc = encryptSecret('sk-key', SECRET);
    expect(() => decryptSecret(enc, 'wrong-secret')).toThrow();
  });

  it('fails authentication when the ciphertext is tampered with', () => {
    const enc = encryptSecret('sk-key', SECRET);
    const bytes = Buffer.from(enc.ciphertext, 'base64');
    bytes[0] ^= 0xff;
    expect(() => decryptSecret({ ...enc, ciphertext: bytes.toString('base64') }, SECRET)).toThrow();
  });

  it('handles unicode and empty strings', () => {
    for (const v of ['', 'ключ-秘密-🔑']) {
      expect(decryptSecret(encryptSecret(v, SECRET), SECRET)).toBe(v);
    }
  });
});
