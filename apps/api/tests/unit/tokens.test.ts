/**
 * Unit tests for lib/tokens.ts
 *
 * These tests exercise the token utilities in isolation — no database,
 * no network, no filesystem. The JWT key pair is generated fresh for
 * the test suite.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPairSync }             from 'crypto';
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashToken,
  generateFamilyId,
  refreshTokenExpiresAt,
  generateAuthToken,
} from '../../src/lib/tokens.js';

// ---------------------------------------------------------------------------
// Generate a fresh RSA key pair for testing.
// We override the config values before importing tokens.ts so that the
// module uses our test keys instead of reading from process.env.
// ---------------------------------------------------------------------------

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Inject test keys before module load
process.env['JWT_PRIVATE_KEY'] = privateKey.replace(/\n/g, '\\n');
process.env['JWT_PUBLIC_KEY']  = publicKey.replace(/\n/g, '\\n');
process.env['JWT_EXPIRES_IN']  = '900';
process.env['APP_URL']         = 'http://localhost:3000';
process.env['DATABASE_URL']    = 'postgres://test:test@localhost:5432/test';
process.env['REDIS_URL']       = 'redis://localhost:6379';
process.env['EMAIL_FROM']      = 'test@example.com';
process.env['HCAPTCHA_SECRET'] = '0x0000000000000000000000000000000000000000';
process.env['REFRESH_TOKEN_TTL_DAYS'] = '30';
process.env['EMAIL_PROVIDER']  = 'resend';
process.env['RESEND_API_KEY']  = 're_test';

// ---------------------------------------------------------------------------
// Access tokens
// ---------------------------------------------------------------------------

describe('signAccessToken / verifyAccessToken', () => {
  const userId = '018e1b3a-dead-beef-cafe-000000000001';
  const email  = 'hero@example.com';

  it('signs a token and verifies it successfully', async () => {
    const token   = await signAccessToken(userId, email);
    const payload = await verifyAccessToken(token);

    expect(payload.sub).toBe(userId);
    expect(payload.email).toBe(email);
  });

  it('token is a three-part JWT string', async () => {
    const token = await signAccessToken(userId, email);
    expect(token.split('.')).toHaveLength(3);
  });

  it('rejects a tampered token', async () => {
    const token  = await signAccessToken(userId, email);
    const parts  = token.split('.');
    // Corrupt the payload section
    parts[1] = Buffer.from(JSON.stringify({ sub: 'hacker', email: 'evil@example.com' }))
      .toString('base64url');
    const tampered = parts.join('.');

    await expect(verifyAccessToken(tampered)).rejects.toThrow();
  });

  it('rejects a token signed with a different key', async () => {
    const { privateKey: otherKey } = generateKeyPairSync('rsa', {
      modulusLength:    2048,
      publicKeyEncoding:  { type: 'spki',  format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    // Manually sign with the wrong key using jose
    const { SignJWT } = await import('jose');
    const { createPrivateKey } = await import('crypto');
    const wrongKey = createPrivateKey(otherKey);
    const token = await new SignJWT({ email })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(wrongKey);

    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it('two tokens for the same user are not identical (iat differs)', async () => {
    const t1 = await signAccessToken(userId, email);
    // Small delay so iat differs
    await new Promise((r) => setTimeout(r, 10));
    const t2 = await signAccessToken(userId, email);
    expect(t1).not.toBe(t2);
  });
});

// ---------------------------------------------------------------------------
// Refresh tokens
// ---------------------------------------------------------------------------

describe('generateRefreshToken', () => {
  it('returns a raw string and a hash', () => {
    const { raw, hash } = generateRefreshToken();
    expect(typeof raw).toBe('string');
    expect(typeof hash).toBe('string');
    expect(raw).not.toBe(hash);
  });

  it('raw token is 64 hex characters (256 bits)', () => {
    const { raw } = generateRefreshToken();
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hash is a 64-character hex SHA-256', () => {
    const { hash } = generateRefreshToken();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('two calls produce different tokens', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });

  it('hash(raw) equals the stored hash', () => {
    const { raw, hash } = generateRefreshToken();
    expect(hashToken(raw)).toBe(hash);
  });
});

// ---------------------------------------------------------------------------
// hashToken
// ---------------------------------------------------------------------------

describe('hashToken', () => {
  it('is deterministic for the same input', () => {
    expect(hashToken('hello')).toBe(hashToken('hello'));
  });

  it('differs for different inputs', () => {
    expect(hashToken('hello')).not.toBe(hashToken('world'));
  });

  it('returns a 64-character hex string', () => {
    expect(hashToken('any-string')).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// generateFamilyId
// ---------------------------------------------------------------------------

describe('generateFamilyId', () => {
  it('returns a 32-character hex string', () => {
    expect(generateFamilyId()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('two calls return different IDs', () => {
    expect(generateFamilyId()).not.toBe(generateFamilyId());
  });
});

// ---------------------------------------------------------------------------
// refreshTokenExpiresAt
// ---------------------------------------------------------------------------

describe('refreshTokenExpiresAt', () => {
  it('returns a date in the future', () => {
    const expires = refreshTokenExpiresAt();
    expect(expires.getTime()).toBeGreaterThan(Date.now());
  });

  it('is approximately 30 days from now', () => {
    const expires     = refreshTokenExpiresAt();
    const thirtyDays  = 30 * 24 * 60 * 60 * 1000;
    const delta       = expires.getTime() - Date.now();
    // Allow 5 seconds of slack
    expect(delta).toBeGreaterThan(thirtyDays - 5000);
    expect(delta).toBeLessThan(thirtyDays   + 5000);
  });
});

// ---------------------------------------------------------------------------
// generateAuthToken (email verification / password reset)
// ---------------------------------------------------------------------------

describe('generateAuthToken', () => {
  it('returns raw, hash, and expiresAt', () => {
    const { raw, hash, expiresAt } = generateAuthToken();
    expect(typeof raw).toBe('string');
    expect(typeof hash).toBe('string');
    expect(expiresAt).toBeInstanceOf(Date);
  });

  it('expires approximately 1 hour from now', () => {
    const { expiresAt } = generateAuthToken();
    const oneHour       = 60 * 60 * 1000;
    const delta         = expiresAt.getTime() - Date.now();
    expect(delta).toBeGreaterThan(oneHour - 5000);
    expect(delta).toBeLessThan(oneHour   + 5000);
  });

  it('hash matches hashToken(raw)', () => {
    const { raw, hash } = generateAuthToken();
    expect(hashToken(raw)).toBe(hash);
  });

  it('two calls produce different tokens', () => {
    const a = generateAuthToken();
    const b = generateAuthToken();
    expect(a.raw).not.toBe(b.raw);
  });
});
