/**
 * Integration tests for inviteService.ts.
 *
 * Uses the real test DB (adminDb bypasses RLS for setup/cleanup/verification)
 * but mocks the HIBP check so we don't hit the public API. The mailer isn't
 * touched by inviteService directly — the route layer fires
 * sendInviteEmail() separately after createInvite returns — so no need to
 * mock it here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { adminDb } from '../../src/db/index.js';
import { users, userInvites, refreshTokens } from '../../src/db/schema.js';
import { hashToken } from '../../src/lib/tokens.js';

if (!adminDb) throw new Error('adminDb is required — set DATABASE_ADMIN_URL');

// HIBP is the only external dep — stub it to always pass.
vi.mock('../../src/lib/hibp.js', () => ({
  assertPasswordNotPwned: vi.fn().mockResolvedValue(undefined),
  getPwnedCount: vi.fn().mockResolvedValue(0),
  PwnedPasswordError: class PwnedPasswordError extends Error {},
}));

const invite = await import('../../src/services/inviteService.js');
const { AuthError } = await import('../../src/services/authService.js');

// ---------------------------------------------------------------------------
// Test fixtures + helpers
// ---------------------------------------------------------------------------

const INVITER_EMAIL = 'invite-test-admin@example.com';
const INVITEE_EMAIL = 'invitee@example.com';
const ALT_INVITEE_EMAIL = 'alt-invitee@example.com';
const TEST_PASSWORD = 'CorrectHorseBatteryStaple!99';

/** Direct DB insert of an admin user we can use as `invitedBy` and reference. */
async function createAdmin(email = INVITER_EMAIL): Promise<string> {
  await adminDb!.delete(users).where(eq(users.email, email));
  const [row] = await adminDb!
    .insert(users)
    .values({
      email,
      displayName: 'Admin',
      passwordHash: 'unused-for-this-test',
      emailVerifiedAt: new Date(),
      role: 'admin',
      isActive: true,
    })
    .returning({ id: users.id });
  return row.id;
}

async function cleanupEmail(email: string) {
  await adminDb!.delete(users).where(eq(users.email, email));
}

async function cleanupAllInvitesFor(email: string) {
  await adminDb!.delete(userInvites).where(eq(userInvites.email, email.toLowerCase().trim()));
}

let adminId: string;

beforeEach(async () => {
  adminId = await createAdmin();
  await cleanupEmail(INVITEE_EMAIL);
  await cleanupEmail(ALT_INVITEE_EMAIL);
  await cleanupAllInvitesFor(INVITEE_EMAIL);
  await cleanupAllInvitesFor(ALT_INVITEE_EMAIL);
});

// ---------------------------------------------------------------------------
// createInvite
// ---------------------------------------------------------------------------

describe('createInvite', () => {
  it('issues a pending invite with a 64-hex rawToken and ~72h TTL', async () => {
    const before = Date.now();
    const { invite: row, rawToken } = await invite.createInvite({
      email: INVITEE_EMAIL,
      displayName: 'Astrid',
      invitedBy: adminId,
    });

    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(row.email).toBe(INVITEE_EMAIL);
    expect(row.displayName).toBe('Astrid');
    expect(row.status).toBe('pending');
    expect(row.role).toBe('user');
    expect(row.invitedBy).toBe(adminId);
    expect(row.acceptedAt).toBeNull();
    expect(row.acceptedUserId).toBeNull();

    const expires = new Date(row.expiresAt).getTime();
    const expected = before + 72 * 60 * 60 * 1000;
    expect(Math.abs(expires - expected)).toBeLessThan(60_000); // within 1 minute

    // The DB row's token_hash matches the raw token's hash.
    const [stored] = await adminDb!
      .select()
      .from(userInvites)
      .where(eq(userInvites.id, row.id))
      .limit(1);
    expect(stored.tokenHash).toBe(hashToken(rawToken));
  });

  it('normalises email (lowercases + trims) before storing', async () => {
    const { invite: row } = await invite.createInvite({
      email: '  INVITEE@Example.com  ',
      invitedBy: adminId,
    });
    expect(row.email).toBe('invitee@example.com');
  });

  it('rejects an email that already has a user account', async () => {
    // Pretend invitee already registered through some other path.
    await adminDb!.insert(users).values({
      email: INVITEE_EMAIL,
      displayName: 'Already Here',
      passwordHash: 'x',
      emailVerifiedAt: new Date(),
      role: 'user',
      isActive: true,
    });

    const err = await invite
      .createInvite({ email: INVITEE_EMAIL, invitedBy: adminId })
      .catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe('EMAIL_EXISTS');
    expect(err.statusCode).toBe(400);
  });

  it('stores displayName as null when omitted or whitespace-only', async () => {
    const a = await invite.createInvite({ email: INVITEE_EMAIL, invitedBy: adminId });
    expect(a.invite.displayName).toBeNull();

    await cleanupAllInvitesFor(INVITEE_EMAIL);

    const b = await invite.createInvite({
      email: INVITEE_EMAIL,
      displayName: '   ',
      invitedBy: adminId,
    });
    expect(b.invite.displayName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// listInvites
// ---------------------------------------------------------------------------

describe('listInvites', () => {
  it('returns an empty array when there are no invites', async () => {
    await adminDb!.delete(userInvites);
    const list = await invite.listInvites();
    expect(list).toEqual([]);
  });

  it('derives status correctly for pending / accepted / expired / revoked rows', async () => {
    await adminDb!.delete(userInvites);

    const now = new Date();
    const future = new Date(now.getTime() + 1000 * 60 * 60);
    const past = new Date(now.getTime() - 1000);

    // pending — future expiry, no acceptedAt / revokedAt
    await adminDb!.insert(userInvites).values({
      email: 'pending@example.com',
      tokenHash: 'a'.repeat(64),
      expiresAt: future,
    });
    // accepted — acceptedAt set
    await adminDb!.insert(userInvites).values({
      email: 'accepted@example.com',
      tokenHash: 'b'.repeat(64),
      expiresAt: future,
      acceptedAt: now,
    });
    // revoked — revokedAt set
    await adminDb!.insert(userInvites).values({
      email: 'revoked@example.com',
      tokenHash: 'c'.repeat(64),
      expiresAt: future,
      revokedAt: now,
    });
    // expired — past expiry, no other flags
    await adminDb!.insert(userInvites).values({
      email: 'expired@example.com',
      tokenHash: 'd'.repeat(64),
      expiresAt: past,
    });

    const list = await invite.listInvites();
    const byEmail = Object.fromEntries(list.map((i) => [i.email, i.status]));
    expect(byEmail['pending@example.com']).toBe('pending');
    expect(byEmail['accepted@example.com']).toBe('accepted');
    expect(byEmail['revoked@example.com']).toBe('revoked');
    expect(byEmail['expired@example.com']).toBe('expired');
  });
});

// ---------------------------------------------------------------------------
// revokeInvite
// ---------------------------------------------------------------------------

describe('revokeInvite', () => {
  it('moves a pending invite to expired status', async () => {
    const { invite: row } = await invite.createInvite({
      email: INVITEE_EMAIL,
      invitedBy: adminId,
    });
    const revoked = await invite.revokeInvite(row.id);
    expect(revoked.status).toBe('expired');

    // DB confirms expires_at is in the past now.
    const [stored] = await adminDb!
      .select()
      .from(userInvites)
      .where(eq(userInvites.id, row.id))
      .limit(1);
    expect(stored.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('throws NOT_FOUND for an unknown id', async () => {
    const err = await invite.revokeInvite('00000000-0000-0000-0000-000000000000').catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
  });

  it('throws ALREADY_ACCEPTED when the invite has been used', async () => {
    const { invite: row } = await invite.createInvite({
      email: INVITEE_EMAIL,
      invitedBy: adminId,
    });
    await adminDb!
      .update(userInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(userInvites.id, row.id));

    const err = await invite.revokeInvite(row.id).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe('ALREADY_ACCEPTED');
  });

  it('is idempotent — revoking an already-expired invite returns it as-is', async () => {
    const { invite: row } = await invite.createInvite({
      email: INVITEE_EMAIL,
      invitedBy: adminId,
    });
    // Force expire by overwriting expires_at into the past.
    await adminDb!
      .update(userInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(userInvites.id, row.id));

    const r1 = await invite.revokeInvite(row.id);
    const r2 = await invite.revokeInvite(row.id);
    expect(r1.status).toBe('expired');
    expect(r2.status).toBe('expired');
  });
});

// ---------------------------------------------------------------------------
// getInvitePreview
// ---------------------------------------------------------------------------

describe('getInvitePreview', () => {
  it('returns the email + displayName + expiresAt for a pending token', async () => {
    const { rawToken } = await invite.createInvite({
      email: INVITEE_EMAIL,
      displayName: 'Astrid',
      invitedBy: adminId,
    });
    const preview = await invite.getInvitePreview(rawToken);
    expect(preview.email).toBe(INVITEE_EMAIL);
    expect(preview.displayName).toBe('Astrid');
    expect(new Date(preview.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('throws TOKEN_INVALID for an unknown token', async () => {
    const err = await invite.getInvitePreview('deadbeef'.repeat(8)).catch((e) => e);
    expect(err.code).toBe('TOKEN_INVALID');
  });

  it('throws TOKEN_REVOKED when revokedAt is set', async () => {
    const { invite: row, rawToken } = await invite.createInvite({
      email: INVITEE_EMAIL,
      invitedBy: adminId,
    });
    // The current revokeInvite() expires the token rather than setting
    // revoked_at, but rows from before that change still carry revoked_at.
    // Simulate one by setting it directly.
    await adminDb!
      .update(userInvites)
      .set({ revokedAt: new Date() })
      .where(eq(userInvites.id, row.id));

    const err = await invite.getInvitePreview(rawToken).catch((e) => e);
    expect(err.code).toBe('TOKEN_REVOKED');
  });

  it('throws TOKEN_USED when acceptedAt is set', async () => {
    const { invite: row, rawToken } = await invite.createInvite({
      email: INVITEE_EMAIL,
      invitedBy: adminId,
    });
    await adminDb!
      .update(userInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(userInvites.id, row.id));

    const err = await invite.getInvitePreview(rawToken).catch((e) => e);
    expect(err.code).toBe('TOKEN_USED');
  });

  it('throws TOKEN_EXPIRED when expires_at is in the past', async () => {
    const { invite: row, rawToken } = await invite.createInvite({
      email: INVITEE_EMAIL,
      invitedBy: adminId,
    });
    await adminDb!
      .update(userInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(userInvites.id, row.id));

    const err = await invite.getInvitePreview(rawToken).catch((e) => e);
    expect(err.code).toBe('TOKEN_EXPIRED');
  });
});

// ---------------------------------------------------------------------------
// acceptInvite
// ---------------------------------------------------------------------------

describe('acceptInvite', () => {
  it('creates a verified user, marks the invite accepted, issues tokens', async () => {
    const { invite: row, rawToken } = await invite.createInvite({
      email: INVITEE_EMAIL,
      displayName: 'Astrid',
      invitedBy: adminId,
    });

    const result = await invite.acceptInvite(rawToken, TEST_PASSWORD);

    // Returned shape
    expect(result.user.email).toBe(INVITEE_EMAIL);
    expect(result.user.role).toBe('user');
    expect(result.user.displayName).toBe('Astrid');
    expect(result.accessToken).toMatch(/^eyJ/); // looks like a JWT header
    expect(result.refreshToken).toMatch(/^[0-9a-f]+$/);
    expect(result.familyId).toMatch(/^[0-9a-f]+$/);
    expect(result.familyId.length).toBeGreaterThanOrEqual(16);

    // User row exists and is verified.
    const [stored] = await adminDb!
      .select()
      .from(users)
      .where(eq(users.id, result.user.id))
      .limit(1);
    expect(stored.email).toBe(INVITEE_EMAIL);
    expect(stored.emailVerifiedAt).toBeInstanceOf(Date);
    expect(stored.role).toBe('user');

    // Invite is marked accepted, linked to the new user.
    const [acceptedRow] = await adminDb!
      .select()
      .from(userInvites)
      .where(eq(userInvites.id, row.id))
      .limit(1);
    expect(acceptedRow.acceptedAt).toBeInstanceOf(Date);
    expect(acceptedRow.acceptedUserId).toBe(result.user.id);

    // A refresh token row exists for the new user.
    const [rt] = await adminDb!
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, result.user.id))
      .limit(1);
    expect(rt).toBeTruthy();
    // Postgres returns UUIDs with hyphens; the service emits them without —
    // compare normalised.
    expect(rt.familyId.replace(/-/g, '')).toBe(result.familyId);
  });

  it('honours an override displayName from the form', async () => {
    const { rawToken } = await invite.createInvite({
      email: INVITEE_EMAIL,
      displayName: 'Astrid',
      invitedBy: adminId,
    });
    const result = await invite.acceptInvite(rawToken, TEST_PASSWORD, 'Astrid the Bold');
    expect(result.user.displayName).toBe('Astrid the Bold');
  });

  it('falls back to the email when no displayName is on the invite or form', async () => {
    const { rawToken } = await invite.createInvite({
      email: INVITEE_EMAIL,
      invitedBy: adminId,
    });
    const result = await invite.acceptInvite(rawToken, TEST_PASSWORD);
    expect(result.user.displayName).toBe(INVITEE_EMAIL);
  });

  it('refuses if the email got registered through another path between issue + accept', async () => {
    const { rawToken } = await invite.createInvite({
      email: INVITEE_EMAIL,
      invitedBy: adminId,
    });

    // Now suppose the invitee verified through a separate code path.
    await adminDb!.insert(users).values({
      email: INVITEE_EMAIL,
      displayName: 'Already',
      passwordHash: 'x',
      emailVerifiedAt: new Date(),
      role: 'user',
      isActive: true,
    });

    const err = await invite.acceptInvite(rawToken, TEST_PASSWORD).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe('EMAIL_EXISTS');
  });

  it('throws TOKEN_USED on second use (re-replay of a consumed link)', async () => {
    const { rawToken } = await invite.createInvite({
      email: INVITEE_EMAIL,
      invitedBy: adminId,
    });
    await invite.acceptInvite(rawToken, TEST_PASSWORD);

    const err = await invite.acceptInvite(rawToken, TEST_PASSWORD).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe('TOKEN_USED');
  });

  it('throws TOKEN_EXPIRED on a stale link', async () => {
    const { invite: row, rawToken } = await invite.createInvite({
      email: INVITEE_EMAIL,
      invitedBy: adminId,
    });
    await adminDb!
      .update(userInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(userInvites.id, row.id));

    const err = await invite.acceptInvite(rawToken, TEST_PASSWORD).catch((e) => e);
    expect(err.code).toBe('TOKEN_EXPIRED');
  });

  it('throws TOKEN_INVALID on a bogus token', async () => {
    const err = await invite.acceptInvite('deadbeef'.repeat(8), TEST_PASSWORD).catch((e) => e);
    expect(err.code).toBe('TOKEN_INVALID');
  });
});
