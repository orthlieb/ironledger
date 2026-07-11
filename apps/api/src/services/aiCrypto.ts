/**
 * AI key encryption at rest.
 *
 * Provider API keys are encrypted with AES-256-GCM before being stored in the
 * database and decrypted only when the server needs to call the provider. The
 * plaintext key is never returned to a client.
 *
 * The 32-byte cipher key is derived from a high-entropy env secret
 * (AI_KEY_ENC_SECRET) via SHA-256. This protects the key ciphertext at rest
 * (DB dumps, backups, disk theft) — it is NOT zero-knowledge: a server holding
 * the env secret can decrypt, which it must to make the provider call.
 *
 * Pure module (secret passed in) so it's unit-testable without loading config.
 */
import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard nonce length

export interface EncryptedSecret {
  /** base64 ciphertext */
  ciphertext: string;
  /** base64 initialization vector (unique per encryption) */
  iv: string;
  /** base64 GCM authentication tag */
  tag: string;
}

/** Derive the 32-byte AES key from the env secret. */
function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

/** Encrypt a plaintext secret (e.g. an API key) for storage. */
export function encryptSecret(plaintext: string, secret: string): EncryptedSecret {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

/**
 * Decrypt a stored secret. Throws if the ciphertext/tag fail authentication
 * (tampering, or the wrong env secret).
 */
export function decryptSecret(enc: EncryptedSecret, secret: string): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    deriveKey(secret),
    Buffer.from(enc.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(enc.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
