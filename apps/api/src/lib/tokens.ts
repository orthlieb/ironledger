/**
 * Token utilities
 *
 * Handles two kinds of tokens:
 *
 *  1. Access tokens — short-lived JWTs (15 min). Sent in the Authorization
 *     header. Signed with RS256 (private key); verified with the public key.
 *
 *  2. Refresh tokens — long-lived opaque random bytes (30 days). Stored as
 *     SHA-256 hashes in the database. Sent/received via HttpOnly cookie.
 *     Rotated on every use. Revocation terminates the entire token family.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { createHash, randomBytes } from 'crypto';
import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Key objects — parsed once at module load, reused on every request
// ---------------------------------------------------------------------------

const privateKey = await (async () => {
  const { createPrivateKey } = await import('crypto');
  return createPrivateKey(
    config.JWT_PRIVATE_KEY.replace(/\\n/g, '\n'),
  );
})();

const publicKey = await (async () => {
  const { createPublicKey } = await import('crypto');
  return createPublicKey(
    config.JWT_PUBLIC_KEY.replace(/\\n/g, '\n'),
  );
})();

// ---------------------------------------------------------------------------
// Access tokens (JWT)
// ---------------------------------------------------------------------------

export interface AccessTokenPayload extends JWTPayload {
  sub:   string;   // user UUID
  email: string;
  role:  string;   // 'user' | 'admin'
}

/**
 * Issues a signed JWT access token for the given user.
 * TTL is controlled by JWT_EXPIRES_IN (default 900 seconds).
 */
export async function signAccessToken(
  userId: string,
  email: string,
  role: string = 'user',
): Promise<string> {
  return new SignJWT({ email, role })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(userId)
    .setJti(randomBytes(16).toString('hex'))   // unique per token; enables future revocation
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + config.JWT_EXPIRES_IN)
    .sign(privateKey);
}

/**
 * Verifies a JWT access token and returns its payload.
 * Throws if the token is invalid, expired, or tampered with.
 */
export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, publicKey, {
    algorithms: ['RS256'],
  });
  return payload as AccessTokenPayload;
}

// ---------------------------------------------------------------------------
// Refresh tokens (opaque random bytes)
// ---------------------------------------------------------------------------

/**
 * Generates a cryptographically random refresh token.
 * Returns both the raw token (sent to the client) and its SHA-256 hash
 * (stored in the database — we never store the raw token).
 */
export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex');   // 64 hex chars, 256 bits
  const hash = hashToken(raw);
  return { raw, hash };
}

/**
 * Hashes a raw token with SHA-256.
 * Used to look up stored tokens without exposing the raw value.
 */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Generates a new family ID for a fresh login session.
 * All rotated tokens from the same login share this ID.
 */
export function generateFamilyId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Calculates the expiry date for a new refresh token.
 */
export function refreshTokenExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + config.REFRESH_TOKEN_TTL_DAYS);
  return d;
}

// ---------------------------------------------------------------------------
// Email verification / password reset tokens (opaque random bytes)
// ---------------------------------------------------------------------------

/**
 * Generates a short-lived single-use token for email verification
 * or password reset. Returns raw (for the email link) + hash (for the DB).
 * Expires after 1 hour.
 */
export function generateAuthToken(): {
  raw: string;
  hash: string;
  expiresAt: Date;
} {
  const raw = randomBytes(32).toString('hex');
  const hash = hashToken(raw);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);  // 1 hour
  return { raw, hash, expiresAt };
}
