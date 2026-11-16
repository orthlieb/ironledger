/**
 * Integration tests for authService.ts
 *
 * These tests use a real PostgreSQL database. External calls (email, HIBP,
 * captcha) are mocked — we test our code, not third-party services.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as auth from '../../src/services/authService.js';
import { adminDb } from '../../src/db/index.js';
import { users, authTokens } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

// Tests use adminDb (bypasses RLS) for all setup, cleanup, and verification
// queries.  The app_user pool gets its session GUC set to '' after any
// withUserContext transaction ends, causing ''::uuid errors in RLS policies
// on subsequent plain db.select/delete calls.  adminDb is unaffected by RLS.
if (!adminDb) throw new Error('adminDb is required — set DATABASE_ADMIN_URL');

// ---------------------------------------------------------------------------
// Mock external dependencies
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/hibp.js', () => ({
  assertPasswordNotPwned: vi.fn().mockResolvedValue(undefined),
  getPwnedCount: vi.fn().mockResolvedValue(0),
  PwnedPasswordError: class PwnedPasswordError extends Error {},
}));

const { sendVerificationEmail } = await import('../../src/lib/mailer.js');
const { redis } = await import('../../src/server.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_EMAIL = 'integration-test@example.com';
const TEST_PASSWORD = 'CorrectHorseBatteryStaple!99';

async function cleanupUser(email: string) {
  // adminDb bypasses RLS — needed because plain db (app_user) has its
  // session GUC app.user_id reset to '' after any withUserContext transaction,
  // which causes '':uuid failures in RLS policies on subsequent queries.
  // Cascade deletes refresh_tokens and auth_tokens automatically via FK.
  await adminDb!.delete(users).where(eq(users.email, email));
}

async function createVerifiedUser(email = TEST_EMAIL, password = TEST_PASSWORD) {
  await auth.register({ email, password });

  // Get the verification token directly from the DB (adminDb bypasses RLS)
  const [tokenRow] = await adminDb!
    .select()
    .from(authTokens)
    .where(eq(authTokens.purpose, 'verify_email'))
    .orderBy(authTokens.createdAt)
    .limit(1);

  if (!tokenRow) throw new Error('No auth token found');

  // We need the raw token — in tests we read it from the hash lookup
  // by using the token's id to get the row, then reconstruct via the mailer mock
  const calls = vi.mocked(sendVerificationEmail).mock.calls;
  const lastCall = calls[calls.length - 1];
  if (!lastCall) throw new Error('sendVerificationEmail was not called');
  const rawToken = lastCall[1]; // second arg is the raw token

  return auth.verifyEmail(rawToken);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('register', () => {
  beforeEach(async () => {
    await cleanupUser(TEST_EMAIL);
    vi.clearAllMocks();
  });

  it('creates a user with email_verified_at = null', async () => {
    await auth.register({ email: TEST_EMAIL, password: TEST_PASSWORD });

    const [user] = await adminDb!.select().from(users).where(eq(users.email, TEST_EMAIL));

    expect(user).toBeDefined();
    expect(user!.emailVerifiedAt).toBeNull();
    expect(user!.passwordHash).not.toBe(TEST_PASSWORD); // must be hashed
    expect(user!.passwordHash).toMatch(/^\$argon2/);
  });

  it('sends a verification email', async () => {
    await auth.register({ email: TEST_EMAIL, password: TEST_PASSWORD });
    // Allow fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(sendVerificationEmail).toHaveBeenCalledWith(TEST_EMAIL, expect.any(String));
  });

  it('silently succeeds for duplicate emails (no enumeration)', async () => {
    await auth.register({ email: TEST_EMAIL, password: TEST_PASSWORD });
    // Second registration — same email
    await expect(
      auth.register({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    ).resolves.toBeUndefined();
  });

  it('stores email in lowercase', async () => {
    await auth.register({ email: 'UPPER@EXAMPLE.COM', password: TEST_PASSWORD });
    const [user] = await adminDb!
      .select({ email: users.email })
      .from(users)
      .where(eq(users.email, 'upper@example.com'));

    expect(user?.email).toBe('upper@example.com');
    await cleanupUser('upper@example.com');
  });
});

describe('verifyEmail', () => {
  beforeEach(async () => {
    await cleanupUser(TEST_EMAIL);
    vi.clearAllMocks();
  });

  it('marks email as verified and returns tokens', async () => {
    const result = await createVerifiedUser();

    expect(result.user.email).toBe(TEST_EMAIL);
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();

    const [user] = await adminDb!
      .select({ emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.email, TEST_EMAIL));

    expect(user?.emailVerifiedAt).not.toBeNull();
  });

  it('rejects an invalid token', async () => {
    await expect(auth.verifyEmail('not-a-real-token')).rejects.toThrow(auth.AuthError);
  });

  it('rejects a token used twice', async () => {
    await auth.register({ email: TEST_EMAIL, password: TEST_PASSWORD });
    await new Promise((r) => setTimeout(r, 50));

    const calls = vi.mocked(sendVerificationEmail).mock.calls;
    const rawToken = calls[calls.length - 1]![1];

    await auth.verifyEmail(rawToken);
    await expect(auth.verifyEmail(rawToken)).rejects.toMatchObject({
      code: 'TOKEN_USED',
    });
  });
});

describe('login', () => {
  beforeEach(async () => {
    await cleanupUser(TEST_EMAIL);
    vi.clearAllMocks();
    await createVerifiedUser();
  });

  it('returns access and refresh tokens on success', async () => {
    const result = await auth.login({ email: TEST_EMAIL, password: TEST_PASSWORD });
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.email).toBe(TEST_EMAIL);
  });

  it('rejects wrong password', async () => {
    await expect(
      auth.login({ email: TEST_EMAIL, password: 'WrongPassword123!' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
  });

  it('rejects unknown email', async () => {
    await expect(
      auth.login({ email: 'nobody@example.com', password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', statusCode: 401 });
  });

  it('rejects unverified email', async () => {
    const unverifiedEmail = 'unverified@example.com';
    await auth.register({ email: unverifiedEmail, password: TEST_PASSWORD });

    await expect(
      auth.login({ email: unverifiedEmail, password: TEST_PASSWORD }),
    ).rejects.toMatchObject({ code: 'EMAIL_UNVERIFIED', statusCode: 403 });

    await cleanupUser(unverifiedEmail);
  });
});

describe('refresh token rotation', () => {
  beforeEach(async () => {
    await cleanupUser(TEST_EMAIL);
    vi.clearAllMocks();
    await createVerifiedUser();
  });

  it('issues a new access and refresh token', async () => {
    const loginResult = await auth.login({ email: TEST_EMAIL, password: TEST_PASSWORD });
    const refreshResult = await auth.refresh(loginResult.refreshToken);

    expect(refreshResult.accessToken).toBeTruthy();
    expect(refreshResult.refreshToken).not.toBe(loginResult.refreshToken);
  });

  it('detects token reuse and revokes entire family', async () => {
    const login = await auth.login({ email: TEST_EMAIL, password: TEST_PASSWORD });
    const rotated = await auth.refresh(login.refreshToken);

    // Use the OLD (now revoked) token again — theft detection triggers
    await expect(auth.refresh(login.refreshToken)).rejects.toMatchObject({
      code: 'TOKEN_REUSE',
    });

    // The new token should also be revoked now (whole family killed)
    await expect(auth.refresh(rotated.refreshToken)).rejects.toThrow();
  });
});

describe('forgotPassword / resetPassword', () => {
  beforeEach(async () => {
    await cleanupUser(TEST_EMAIL);
    vi.clearAllMocks();
    await createVerifiedUser();
  });

  it('sends a reset email for a known address', async () => {
    const { sendPasswordResetEmail } = await import('../../src/lib/mailer.js');
    await auth.forgotPassword(TEST_EMAIL);
    await new Promise((r) => setTimeout(r, 50));

    expect(sendPasswordResetEmail).toHaveBeenCalledWith(TEST_EMAIL, expect.any(String));
  });

  it('silently does nothing for unknown address', async () => {
    const { sendPasswordResetEmail } = await import('../../src/lib/mailer.js');
    await auth.forgotPassword('nobody@example.com');
    await new Promise((r) => setTimeout(r, 50));

    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('resets the password and revokes all sessions', async () => {
    const { sendPasswordResetEmail } = await import('../../src/lib/mailer.js');

    // Log in first to create a session
    const { refreshToken } = await auth.login({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    await auth.forgotPassword(TEST_EMAIL);
    await new Promise((r) => setTimeout(r, 50));

    const calls = vi.mocked(sendPasswordResetEmail).mock.calls;
    const rawToken = calls[calls.length - 1]![1];
    const newPass = 'NewSuperSecurePassword!42';

    await auth.resetPassword(rawToken, newPass);

    // Old sessions should be revoked
    await expect(auth.refresh(refreshToken)).rejects.toThrow();

    // New password should work
    await expect(auth.login({ email: TEST_EMAIL, password: newPass })).resolves.toBeDefined();
  });
});

describe('verification links: 24 hours, and a new one on request', () => {
  /** The raw token in the most recent verification email. */
  const lastLink = () => {
    const calls = vi.mocked(sendVerificationEmail).mock.calls;
    const last = calls[calls.length - 1];
    if (!last) throw new Error('sendVerificationEmail was not called');
    return last[1];
  };
  const settle = () => new Promise((r) => setTimeout(r, 50));

  /** Lift the one-email-a-minute limit, as if a minute had passed. */
  async function minutePasses(email = TEST_EMAIL) {
    const [u] = await adminDb!.select({ id: users.id }).from(users).where(eq(users.email, email));
    await redis.del(`verify_resend:${u!.id}`);
  }

  beforeEach(async () => {
    await cleanupUser(TEST_EMAIL);
    vi.clearAllMocks();
  });

  it('a verification link works for 24 hours', async () => {
    const before = Date.now();
    await auth.register({ email: TEST_EMAIL, password: TEST_PASSWORD });
    const [u] = await adminDb!
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, TEST_EMAIL));
    const [token] = await adminDb!.select().from(authTokens).where(eq(authTokens.userId, u!.id));

    const lifetimeH = (token!.expiresAt.getTime() - before) / 3_600_000;
    expect(lifetimeH).toBeGreaterThan(23.9);
    expect(lifetimeH).toBeLessThan(24.1);
  });

  it('resendVerification sends a new link, and the old one stops working', async () => {
    await auth.register({ email: TEST_EMAIL, password: TEST_PASSWORD });
    await settle();
    const first = lastLink();

    await minutePasses();
    await auth.resendVerification(TEST_EMAIL.toUpperCase()); // any case
    await settle();
    const second = lastLink();

    expect(sendVerificationEmail).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
    await expect(auth.verifyEmail(first)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
    await expect(auth.verifyEmail(second)).resolves.toBeDefined();
  });

  it('sends at most one verification email a minute per account', async () => {
    await auth.register({ email: TEST_EMAIL, password: TEST_PASSWORD });
    await auth.resendVerification(TEST_EMAIL);
    await auth.resendVerification(TEST_EMAIL);
    await settle();

    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it('silently does nothing for an unknown or already verified address', async () => {
    await auth.resendVerification('nobody@example.com');
    await createVerifiedUser();
    vi.clearAllMocks();
    await minutePasses();
    await auth.resendVerification(TEST_EMAIL);
    await settle();

    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('registering again with an unverified address sends a fresh link; the first password stands', async () => {
    await auth.register({ email: TEST_EMAIL, password: TEST_PASSWORD });
    await settle();
    const first = lastLink();

    await minutePasses();
    await auth.register({ email: TEST_EMAIL, password: 'AnotherPassword!Entirely7' });
    await settle();
    const second = lastLink();

    expect(second).not.toBe(first);
    await expect(auth.verifyEmail(first)).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
    await auth.verifyEmail(second);
    await expect(auth.login({ email: TEST_EMAIL, password: TEST_PASSWORD })).resolves.toBeDefined();
    await expect(
      auth.login({ email: TEST_EMAIL, password: 'AnotherPassword!Entirely7' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('registering again with a verified address sends nothing', async () => {
    await createVerifiedUser();
    vi.clearAllMocks();
    await minutePasses();
    await auth.register({ email: TEST_EMAIL, password: TEST_PASSWORD });
    await settle();

    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});
