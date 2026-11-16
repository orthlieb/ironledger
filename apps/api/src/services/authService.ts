/**
 * Auth service — all authentication business logic.
 *
 * Rules:
 *  - Never throws HTTP errors directly. Throws typed domain errors that the
 *    route layer catches and maps to HTTP status codes.
 *  - Never reads process.env. All config comes from config.ts.
 *  - All DB writes that touch user data go through withUserContext() so RLS
 *    is enforced even here in the service layer.
 */

import argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { withUserContext, adminDb } from '../db/index.js';
import { users, refreshTokens, authTokens, userInvites, type User } from '../db/schema.js';
import {
  signAccessToken,
  generateRefreshToken,
  generateFamilyId,
  refreshTokenExpiresAt,
  generateAuthToken,
  hashToken,
  VERIFY_LINK_TTL_MS,
} from '../lib/tokens.js';
import { assertPasswordNotPwned } from '../lib/hibp.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/mailer.js';
import { getStatus as getMaintenanceStatus } from './maintenanceService.js';
import { getStatus as getRegistrationLockStatus } from './registrationLockService.js';
import { checkAndIncrement as checkRegistrationQuota } from './registrationQuotaService.js';
import { redis } from '../server.js';
import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Argon2id configuration
//
// OWASP recommends (2024):
//   memoryCost: 19456 (19 MB)  — makes GPU cracking expensive
//   timeCost:   2              — number of iterations
//   parallelism: 1             — threads (keep at 1 for server use)
//
// On a modest server this takes ~50ms per hash — acceptable for login,
// imperceptible to users, but brutal for offline cracking attempts.
// ---------------------------------------------------------------------------
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * Dummy Argon2id hash used by `login()` when the submitted email isn't in
 * the database, so the verify path runs at the same CPU cost as a real
 * login. Computed once at module load from random bytes — nothing will
 * ever hash to it, so a comparison always fails. Without this, an
 * attacker could time responses and enumerate valid emails.
 *
 * Top-level await is fine in ESM; this adds ~50ms to cold start.
 */
const DUMMY_PASSWORD_HASH = await argon2.hash(randomBytes(32).toString('hex'), ARGON2_OPTIONS);

// ---------------------------------------------------------------------------
// Domain errors — the route layer maps these to HTTP status codes
// ---------------------------------------------------------------------------

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string; // optional — empty/omitted falls back to the email
}

export interface AuthResult {
  user: Pick<User, 'id' | 'email'>;
  accessToken: string;
  refreshToken: string; // raw — caller puts this in the HttpOnly cookie
  familyId: string;
}

export async function register(input: RegisterInput): Promise<void> {
  // Block registration during maintenance
  const maint = await getMaintenanceStatus();
  if (maint.enabled) {
    throw new AuthError(
      'System is under maintenance. Please try again later.',
      'MAINTENANCE_MODE',
      503,
    );
  }

  // Block registration when locked by admin
  const regLock = await getRegistrationLockStatus();
  if (regLock.locked) {
    throw new AuthError(
      regLock.message ?? 'New registrations are currently disabled.',
      'REGISTRATION_LOCKED',
      403,
    );
  }

  const email = input.email.toLowerCase().trim();

  if (!adminDb) throw new AuthError('Admin DB not configured', 'CONFIG_ERROR', 500);

  // Check for existing account — but don't reveal whether it exists.
  // Use adminDb: this is a pre-auth lookup, no user context exists yet,
  // so the RLS-protected db would return no rows.
  // We always hash the password (even if we're going to reject) to keep
  // timing consistent (prevents user enumeration via response time).
  const [existing] = await adminDb
    .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt, isActive: users.isActive })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Hash regardless so timing is the same whether or not the user exists
  await argon2.hash(input.password, ARGON2_OPTIONS);

  if (existing) {
    // Return success silently — don't tell the caller the email is taken.
    // This prevents email enumeration via the registration endpoint.
    // An account still waiting to be verified gets a fresh link: whoever
    // registers again most likely lost the first email. The password
    // given now is ignored; the one set at the first registration stands,
    // and "Forgot password" works once the address is verified.
    if (!existing.emailVerifiedAt && existing.isActive) {
      await sendFreshVerificationLink(existing.id, email);
    }
    return;
  }

  // Check password against breach database
  await assertPasswordNotPwned(input.password);

  // Daily quota — atomic check-and-increment. Positioned here (after the
  // existing-email check) so duplicate-email attempts don't consume slots.
  // If quota exhausted, reject before inserting. The page-load UX catches
  // this earlier for real visitors; this is the belt-and-braces server guard.
  const quotaOk = await checkRegistrationQuota();
  if (!quotaOk) {
    throw new AuthError(
      "Today's new signups are full. Please come back tomorrow.",
      'REGISTRATION_QUOTA_EXHAUSTED',
      429,
    );
  }

  // Hash the real password
  const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);

  // Display name: use the trimmed input if the user provided one, else the
  // email. Length cap matches the zod schema; trim handles accidental
  // whitespace from paste/autofill.
  const displayName = input.displayName?.trim() || email;

  // Create the user — use adminDb because there is no user context yet
  // (we're creating the user, so we can't set app.user_id before the INSERT).
  const [newUser] = await adminDb
    .insert(users)
    .values({ email, displayName, passwordHash })
    .returning({ id: users.id, email: users.email });

  if (!newUser) throw new AuthError('Failed to create user', 'CREATE_FAILED', 500);

  await sendFreshVerificationLink(newUser.id, email);
}

// ---------------------------------------------------------------------------
// Verification links — issue, and send again
// ---------------------------------------------------------------------------

/** Shortest gap between two verification emails to one account. */
const VERIFY_RESEND_COOLDOWN_S = 60;

/**
 * Give an account a fresh 24-hour verification link and email it. Any
 * earlier unused link stops working. At most one email a minute per
 * account, so neither "Send a new link" nor registering again can flood
 * an inbox; within the minute this silently does nothing.
 */
async function sendFreshVerificationLink(userId: string, email: string): Promise<void> {
  if (redis) {
    const first = await redis
      .set(`verify_resend:${userId}`, '1', 'EX', VERIFY_RESEND_COOLDOWN_S, 'NX')
      .catch(() => 'OK'); // Redis down: send anyway; the route's rate limit still applies
    if (first !== 'OK') return;
  }

  const { raw, hash, expiresAt } = generateAuthToken(VERIFY_LINK_TTL_MS);

  await withUserContext(userId, async (tx) => {
    await tx
      .delete(authTokens)
      .where(
        and(
          eq(authTokens.userId, userId),
          eq(authTokens.purpose, 'verify_email'),
          isNull(authTokens.usedAt),
        ),
      );
    await tx.insert(authTokens).values({
      userId,
      tokenHash: hash,
      purpose: 'verify_email',
      expiresAt,
    });
  });

  // Send verification email (don't await — don't block the response)
  void sendVerificationEmail(email, raw).catch(console.error);
}

/**
 * Send a new verification link to an account that hasn't verified its
 * email yet. Silently does nothing for an unknown, verified or disabled
 * address, so the caller can't tell which addresses have accounts.
 */
export async function resendVerification(email: string): Promise<void> {
  const normalised = email.toLowerCase().trim();

  if (!adminDb) return;

  // Pre-auth lookup, no user context yet: adminDb, as in forgotPassword.
  const [user] = await adminDb
    .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt, isActive: users.isActive })
    .from(users)
    .where(eq(users.email, normalised))
    .limit(1);

  if (!user || user.emailVerifiedAt || !user.isActive) return;

  await sendFreshVerificationLink(user.id, normalised);
}

// ---------------------------------------------------------------------------
// verifyEmail
// ---------------------------------------------------------------------------

/**
 * Mark an address verified. It proves only that the clicker can read that
 * inbox, so it signs no one in: the password is asked for at log-in. If it
 * did, whoever registered the address first, with a password of their own,
 * would share the account with its owner once the owner clicked their link
 * (pre-account takeover). The owner who didn't set that password uses
 * "Forgot password", which works for unverified accounts too.
 */
export async function verifyEmail(rawToken: string): Promise<{ email: string }> {
  const tokenHash = hashToken(rawToken);

  // Find the token — we don't know the user yet so we can't use withUserContext.
  // Use adminDb here (bypasses RLS) just for this lookup.
  if (!adminDb) throw new AuthError('Admin DB not configured', 'CONFIG_ERROR', 500);

  const [token] = await adminDb
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, tokenHash), eq(authTokens.purpose, 'verify_email')))
    .limit(1);

  if (!token) throw new AuthError('Invalid or expired link', 'TOKEN_INVALID', 400);
  if (token.usedAt) throw new AuthError('This link has already been used', 'TOKEN_USED', 400);
  if (token.expiresAt < new Date())
    throw new AuthError('This link has expired', 'TOKEN_EXPIRED', 400);

  let email = '';
  await withUserContext(token.userId, async (tx) => {
    // Spend the token only if no one else just did (two clicks at once).
    const [spent] = await tx
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(authTokens.id, token.id), isNull(authTokens.usedAt)))
      .returning({ id: authTokens.id });
    if (!spent) throw new AuthError('This link has already been used', 'TOKEN_USED', 400);

    const [u] = await tx
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, token.userId))
      .returning({ email: users.email });
    if (!u) throw new AuthError('User not found', 'USER_NOT_FOUND', 500);
    email = u.email;
  });

  return { email };
}

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

export interface LoginInput {
  email: string;
  password: string;
  /** The client's address: failed sign-ins lock an address *from that IP*. */
  ip?: string;
}

/** How long too many failed sign-ins lock an address from one IP. */
const LOGIN_LOCK_S = 15 * 60;

export async function login(input: LoginInput): Promise<AuthResult> {
  const email = input.email.toLowerCase().trim();

  if (!adminDb) throw new AuthError('Admin DB not configured', 'CONFIG_ERROR', 500);

  // Too many failures for this address from this IP: refuse for a while. Keyed
  // by address AND IP, and counted for unknown addresses too, so it neither
  // lets anyone lock someone else out (the old permanent lock disabled the
  // account itself, which only an admin could undo) nor reveals which
  // addresses have accounts. The captcha and the route's per-IP rate limit
  // still slow guessing across addresses.
  const failKey = `login_fail:${email}:${input.ip ?? '-'}`;
  const lockKey = `login_lock:${email}:${input.ip ?? '-'}`;
  if (redis && (await redis.exists(lockKey).catch(() => 0))) {
    throw new AuthError(
      'Too many failed sign-ins from here. Please wait 15 minutes and try again.',
      'LOGIN_LOCKED',
      429,
    );
  }

  // Always fetch user + hash, even for unknown emails, to keep timing consistent.
  // Use adminDb: this is a pre-auth lookup — no user context exists yet, so the
  // RLS-protected db would return no rows (app.user_id is not set before login).
  const [user] = await adminDb.select().from(users).where(eq(users.email, email)).limit(1);

  // Use a real dummy Argon2id hash for timing consistency when the email
  // isn't in the DB. A malformed string would make verify() fail fast via
  // a parse error, which is detectable via response time.
  const hashToVerify = user?.passwordHash ?? DUMMY_PASSWORD_HASH;

  let passwordValid: boolean;
  try {
    passwordValid = await argon2.verify(hashToVerify, input.password);
  } catch {
    passwordValid = false;
  }

  if (!user || !passwordValid) {
    if (redis) {
      try {
        const fails = await redis.incr(failKey);
        if (fails === 1) await redis.expire(failKey, LOGIN_LOCK_S);
        if (fails >= config.LOGIN_FAIL_LOCKOUT_THRESHOLD) {
          await redis.set(lockKey, '1', 'EX', LOGIN_LOCK_S);
          await redis.del(failKey);
        }
      } catch {
        /* Redis down: no lock; captcha and rate limits still apply */
      }
    }
    throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
  }

  if (!user.isActive) {
    throw new AuthError('Account is disabled', 'ACCOUNT_DISABLED', 403);
  }

  if (!user.emailVerifiedAt) {
    throw new AuthError(
      'Please verify your email address before logging in',
      'EMAIL_UNVERIFIED',
      403,
    );
  }

  // Maintenance mode gate — admins can still log in
  if (user.role !== 'admin') {
    const maint = await getMaintenanceStatus();
    if (maint.enabled) {
      throw new AuthError(
        maint.message || 'System is under maintenance. Please try again later.',
        'MAINTENANCE_MODE',
        503,
      );
    }
  }

  // Clear any lingering failed-login counter on success
  if (redis) {
    void redis.del(failKey).catch(() => {});
  }

  // Issue tokens
  const familyId = generateFamilyId();
  const refresh = generateRefreshToken();
  const expiresAt = refreshTokenExpiresAt();
  const accessToken = await signAccessToken(user.id, user.email, user.role);

  await withUserContext(user.id, async (tx) => {
    await tx.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: refresh.hash,
      familyId,
      expiresAt,
    });

    // Update last login timestamp
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  });

  return {
    user: { id: user.id, email: user.email },
    accessToken,
    refreshToken: refresh.raw,
    familyId,
  };
}

// ---------------------------------------------------------------------------
// refresh — rotate the refresh token, issue a new access token
// ---------------------------------------------------------------------------

export async function refresh(rawToken: string): Promise<AuthResult> {
  // Maintenance mode — block token refresh so sessions expire naturally
  const maint = await getMaintenanceStatus();
  if (maint.enabled) {
    throw new AuthError('System is under maintenance', 'MAINTENANCE_MODE', 503);
  }

  const tokenHash = hashToken(rawToken);

  if (!adminDb) throw new AuthError('Admin DB not configured', 'CONFIG_ERROR', 500);

  // Look up the token — use adminDb because we don't know the user yet
  const [token] = await adminDb
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!token) {
    throw new AuthError('Invalid refresh token', 'TOKEN_INVALID', 401);
  }

  // Token theft detection: if this token was already revoked, revoke the
  // entire family (all sessions from the same login) and force re-login.
  if (token.revokedAt) {
    await adminDb
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.familyId, token.familyId));

    throw new AuthError('Token reuse detected. Please log in again.', 'TOKEN_REUSE', 401);
  }

  if (token.expiresAt < new Date()) {
    throw new AuthError('Refresh token expired', 'TOKEN_EXPIRED', 401);
  }

  // Fetch the user
  const [user] = await adminDb
    .select({ id: users.id, email: users.email, isActive: users.isActive, role: users.role })
    .from(users)
    .where(eq(users.id, token.userId))
    .limit(1);

  if (!user || !user.isActive) {
    throw new AuthError('Account not found or disabled', 'ACCOUNT_ERROR', 401);
  }

  // Rotate: revoke old token, issue new one (same family)
  const newRefresh = generateRefreshToken();
  const expiresAt = refreshTokenExpiresAt();
  const accessToken = await signAccessToken(user.id, user.email, user.role);

  await withUserContext(user.id, async (tx) => {
    // Revoke the old token
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, token.id));

    // Insert the new token (same familyId — keeps the chain intact)
    await tx.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: newRefresh.hash,
      familyId: token.familyId,
      expiresAt,
    });
  });

  return {
    user: { id: user.id, email: user.email },
    accessToken,
    refreshToken: newRefresh.raw,
    familyId: token.familyId,
  };
}

// ---------------------------------------------------------------------------
// logout — revoke the current refresh token
// ---------------------------------------------------------------------------

export async function logout(rawToken: string, userId: string): Promise<void> {
  const tokenHash = hashToken(rawToken);

  await withUserContext(userId, async (tx) => {
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          eq(refreshTokens.userId, userId),
          isNull(refreshTokens.revokedAt),
        ),
      );
  });
  // Silently succeeds even if the token was already revoked or not found
}

// ---------------------------------------------------------------------------
// forgotPassword
// ---------------------------------------------------------------------------

export async function forgotPassword(email: string): Promise<void> {
  const normalised = email.toLowerCase().trim();

  if (!adminDb) return; // silently fail if admin DB not configured

  // Look up the user — always return success to prevent email enumeration.
  // Use adminDb: pre-auth lookup, no user context set.
  const [user] = await adminDb
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalised))
    .limit(1);

  // Unverified accounts too: the link goes to the inbox, so using it proves
  // ownership (resetPassword verifies the address). It's how an owner takes
  // back an address someone else registered first, with their own password.
  if (!user) return; // silently do nothing

  const { raw, hash, expiresAt } = generateAuthToken();

  await withUserContext(user.id, async (tx) => {
    await tx.insert(authTokens).values({
      userId: user.id,
      tokenHash: hash,
      purpose: 'reset_password',
      expiresAt,
    });
  });

  void sendPasswordResetEmail(normalised, raw).catch(console.error);
}

// ---------------------------------------------------------------------------
// resetPassword
// ---------------------------------------------------------------------------

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(rawToken);

  if (!adminDb) throw new AuthError('Admin DB not configured', 'CONFIG_ERROR', 500);

  const [token] = await adminDb
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, tokenHash), eq(authTokens.purpose, 'reset_password')))
    .limit(1);

  if (!token) throw new AuthError('Invalid or expired link', 'TOKEN_INVALID', 400);
  if (token.usedAt) throw new AuthError('This link has already been used', 'TOKEN_USED', 400);
  if (token.expiresAt < new Date())
    throw new AuthError('This link has expired', 'TOKEN_EXPIRED', 400);

  // Check new password against breach database
  await assertPasswordNotPwned(newPassword);

  const passwordHash = await argon2.hash(newPassword, ARGON2_OPTIONS);

  await withUserContext(token.userId, async (tx) => {
    // Spend the token only if no one else just did (two submits at once).
    const [spent] = await tx
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(authTokens.id, token.id), isNull(authTokens.usedAt)))
      .returning({ id: authTokens.id });
    if (!spent) throw new AuthError('This link has already been used', 'TOKEN_USED', 400);

    // Update the password. The link came through the inbox, so the address is
    // verified too (if it wasn't), and any other unused reset links go.
    await tx
      .update(users)
      .set({ passwordHash, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
      .where(eq(users.id, token.userId));
    await tx
      .delete(authTokens)
      .where(
        and(
          eq(authTokens.userId, token.userId),
          eq(authTokens.purpose, 'reset_password'),
          isNull(authTokens.usedAt),
        ),
      );

    // Revoke ALL refresh tokens for this user — forces re-login on all devices.
    // If someone reset the password, it may be because they were compromised.
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, token.userId), isNull(refreshTokens.revokedAt)));
  });
}

// ---------------------------------------------------------------------------
// deleteAccount — a player deletes their own account
// ---------------------------------------------------------------------------

/**
 * Delete the signed-in user's account and everything in it, after checking
 * their password again. Every table holding their data cascades from
 * `users` (characters, entities, portraits, maps, the log, AI settings,
 * tokens); invitations sent to their address go too. The security log
 * keeps its rows (no FK) until they age out.
 *
 * An admin can't delete their own account this way, so the site can't be
 * left without one by accident: another admin removes the role first.
 */
export async function deleteAccount(userId: string, password: string): Promise<void> {
  if (!adminDb) throw new AuthError('Admin DB not configured', 'CONFIG_ERROR', 500);

  const [user] = await adminDb
    .select({ email: users.email, passwordHash: users.passwordHash, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new AuthError('Account not found', 'ACCOUNT_ERROR', 404);

  let passwordValid: boolean;
  try {
    passwordValid = await argon2.verify(user.passwordHash, password);
  } catch {
    passwordValid = false;
  }
  if (!passwordValid) {
    throw new AuthError("That password isn't right.", 'WRONG_PASSWORD', 400);
  }

  if (user.role === 'admin') {
    throw new AuthError(
      "An admin account can't delete itself. Another admin can remove the admin role first.",
      'ADMIN_ACCOUNT',
      403,
    );
  }

  await adminDb.transaction(async (tx) => {
    await tx.delete(userInvites).where(eq(userInvites.email, user.email));
    await tx.delete(users).where(eq(users.id, userId));
  });
}
