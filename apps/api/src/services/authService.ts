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
import { eq, and, isNull } from 'drizzle-orm';
import { db, withUserContext, adminDb } from '../db/index.js';
import {
  users, refreshTokens, authTokens,
  type User,
} from '../db/schema.js';
import {
  signAccessToken,
  generateRefreshToken,
  generateFamilyId,
  refreshTokenExpiresAt,
  generateAuthToken,
  hashToken,
} from '../lib/tokens.js';
import { assertPasswordNotPwned } from '../lib/hibp.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from '../lib/mailer.js';

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
const ARGON2_OPTIONS = {
  type:        argon2.argon2id,
  memoryCost:  19456,
  timeCost:    2,
  parallelism: 1,
};

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
  email:    string;
  password: string;
}

export interface AuthResult {
  user:         Pick<User, 'id' | 'email'>;
  accessToken:  string;
  refreshToken: string;    // raw — caller puts this in the HttpOnly cookie
  familyId:     string;
}

export async function register(input: RegisterInput): Promise<void> {
  const email = input.email.toLowerCase().trim();

  if (!adminDb) throw new AuthError('Admin DB not configured', 'CONFIG_ERROR', 500);

  // Check for existing account — but don't reveal whether it exists.
  // Use adminDb: this is a pre-auth lookup, no user context exists yet,
  // so the RLS-protected db would return no rows.
  // We always hash the password (even if we're going to reject) to keep
  // timing consistent (prevents user enumeration via response time).
  const [existing] = await adminDb
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Hash regardless so timing is the same whether or not the user exists
  await argon2.hash(input.password, ARGON2_OPTIONS);

  if (existing) {
    // Return success silently — don't tell the caller the email is taken.
    // The user will see "check your email" and notice no email arrives.
    // This prevents email enumeration via the registration endpoint.
    return;
  }

  // Check password against breach database
  await assertPasswordNotPwned(input.password);

  // Hash the real password
  const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);

  // Create the user — use adminDb because there is no user context yet
  // (we're creating the user, so we can't set app.user_id before the INSERT).
  const [newUser] = await adminDb
    .insert(users)
    .values({ email, passwordHash })
    .returning({ id: users.id, email: users.email });

  if (!newUser) throw new AuthError('Failed to create user', 'CREATE_FAILED', 500);

  // Generate and store verification token
  const { raw, hash, expiresAt } = generateAuthToken();

  await withUserContext(newUser.id, async (tx) => {
    await tx.insert(authTokens).values({
      userId:    newUser.id,
      tokenHash: hash,
      purpose:   'verify_email',
      expiresAt,
    });
  });

  // Send verification email (don't await — don't block the response)
  void sendVerificationEmail(email, raw).catch(console.error);
}

// ---------------------------------------------------------------------------
// verifyEmail
// ---------------------------------------------------------------------------

export async function verifyEmail(rawToken: string): Promise<AuthResult> {
  const tokenHash = hashToken(rawToken);

  // Find the token — we don't know the user yet so we can't use withUserContext.
  // Use adminDb here (bypasses RLS) just for this lookup.
  if (!adminDb) throw new AuthError('Admin DB not configured', 'CONFIG_ERROR', 500);

  const [token] = await adminDb
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, tokenHash),
        eq(authTokens.purpose, 'verify_email'),
      ),
    )
    .limit(1);

  if (!token)                          throw new AuthError('Invalid or expired link', 'TOKEN_INVALID', 400);
  if (token.usedAt)                    throw new AuthError('This link has already been used', 'TOKEN_USED', 400);
  if (token.expiresAt < new Date())    throw new AuthError('This link has expired', 'TOKEN_EXPIRED', 400);

  // Mark token used and verify the email in one transaction
  const familyId = generateFamilyId();
  const refresh   = generateRefreshToken();
  const expiresAt = refreshTokenExpiresAt();

  let verifiedUser: Pick<User, 'id' | 'email'>;

  await withUserContext(token.userId, async (tx) => {
    // Mark token used
    await tx
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(eq(authTokens.id, token.id));

    // Verify the email
    const [u] = await tx
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, token.userId))
      .returning({ id: users.id, email: users.email });

    if (!u) throw new AuthError('User not found', 'USER_NOT_FOUND', 500);
    verifiedUser = u;

    // Issue the first refresh token for this session
    await tx.insert(refreshTokens).values({
      userId:    token.userId,
      tokenHash: refresh.hash,
      familyId,
      expiresAt,
    });
  });

  const accessToken = await signAccessToken(verifiedUser!.id, verifiedUser!.email);

  return {
    user:         verifiedUser!,
    accessToken,
    refreshToken: refresh.raw,
    familyId,
  };
}

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

export interface LoginInput {
  email:    string;
  password: string;
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const email = input.email.toLowerCase().trim();

  if (!adminDb) throw new AuthError('Admin DB not configured', 'CONFIG_ERROR', 500);

  // Always fetch user + hash, even for unknown emails, to keep timing consistent.
  // Use adminDb: this is a pre-auth lookup — no user context exists yet, so the
  // RLS-protected db would return no rows (app.user_id is not set before login).
  const [user] = await adminDb
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Use a dummy hash for timing consistency when the user doesn't exist
  const hashToVerify = user?.passwordHash ?? '$argon2id$v=19$m=19456,t=2,p=1$placeholder';

  let passwordValid: boolean;
  try {
    passwordValid = await argon2.verify(hashToVerify, input.password);
  } catch {
    passwordValid = false;
  }

  if (!user || !passwordValid) {
    throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
  }

  if (!user.isActive) {
    throw new AuthError('Account is disabled', 'ACCOUNT_DISABLED', 403);
  }

  if (!user.emailVerifiedAt) {
    throw new AuthError('Please verify your email address before logging in', 'EMAIL_UNVERIFIED', 403);
  }

  // Issue tokens
  const familyId    = generateFamilyId();
  const refresh     = generateRefreshToken();
  const expiresAt   = refreshTokenExpiresAt();
  const accessToken = await signAccessToken(user.id, user.email);

  await withUserContext(user.id, async (tx) => {
    await tx.insert(refreshTokens).values({
      userId:    user.id,
      tokenHash: refresh.hash,
      familyId,
      expiresAt,
    });

    // Update last login timestamp
    await tx
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));
  });

  return {
    user:         { id: user.id, email: user.email },
    accessToken,
    refreshToken: refresh.raw,
    familyId,
  };
}

// ---------------------------------------------------------------------------
// refresh — rotate the refresh token, issue a new access token
// ---------------------------------------------------------------------------

export async function refresh(rawToken: string): Promise<AuthResult> {
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
    .select({ id: users.id, email: users.email, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, token.userId))
    .limit(1);

  if (!user || !user.isActive) {
    throw new AuthError('Account not found or disabled', 'ACCOUNT_ERROR', 401);
  }

  // Rotate: revoke old token, issue new one (same family)
  const newRefresh  = generateRefreshToken();
  const expiresAt   = refreshTokenExpiresAt();
  const accessToken = await signAccessToken(user.id, user.email);

  await withUserContext(user.id, async (tx) => {
    // Revoke the old token
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.id, token.id));

    // Insert the new token (same familyId — keeps the chain intact)
    await tx.insert(refreshTokens).values({
      userId:    user.id,
      tokenHash: newRefresh.hash,
      familyId:  token.familyId,
      expiresAt,
    });
  });

  return {
    user:         { id: user.id, email: user.email },
    accessToken,
    refreshToken: newRefresh.raw,
    familyId:     token.familyId,
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

  if (!adminDb) return;  // silently fail if admin DB not configured

  // Look up the user — always return success to prevent email enumeration.
  // Use adminDb: pre-auth lookup, no user context set.
  const [user] = await adminDb
    .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.email, normalised))
    .limit(1);

  if (!user?.emailVerifiedAt) return;  // silently do nothing

  const { raw, hash, expiresAt } = generateAuthToken();

  await withUserContext(user.id, async (tx) => {
    await tx.insert(authTokens).values({
      userId:    user.id,
      tokenHash: hash,
      purpose:   'reset_password',
      expiresAt,
    });
  });

  void sendPasswordResetEmail(normalised, raw).catch(console.error);
}

// ---------------------------------------------------------------------------
// resetPassword
// ---------------------------------------------------------------------------

export async function resetPassword(
  rawToken: string,
  newPassword: string,
): Promise<void> {
  const tokenHash = hashToken(rawToken);

  if (!adminDb) throw new AuthError('Admin DB not configured', 'CONFIG_ERROR', 500);

  const [token] = await adminDb
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, tokenHash),
        eq(authTokens.purpose, 'reset_password'),
      ),
    )
    .limit(1);

  if (!token)                       throw new AuthError('Invalid or expired link', 'TOKEN_INVALID', 400);
  if (token.usedAt)                 throw new AuthError('This link has already been used', 'TOKEN_USED', 400);
  if (token.expiresAt < new Date()) throw new AuthError('This link has expired', 'TOKEN_EXPIRED', 400);

  // Check new password against breach database
  await assertPasswordNotPwned(newPassword);

  const passwordHash = await argon2.hash(newPassword, ARGON2_OPTIONS);

  await withUserContext(token.userId, async (tx) => {
    // Mark token used
    await tx
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(eq(authTokens.id, token.id));

    // Update password
    await tx
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, token.userId));

    // Revoke ALL refresh tokens for this user — forces re-login on all devices.
    // If someone reset the password, it may be because they were compromised.
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.userId, token.userId),
          isNull(refreshTokens.revokedAt),
        ),
      );
  });
}
