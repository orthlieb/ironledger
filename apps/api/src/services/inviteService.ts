/**
 * Invite service — admin-issued onboarding tokens.
 *
 * Flow:
 *   1. Admin creates an invite (email + optional display name). 400 if email
 *      already registered. Row + raw URL are returned.
 *   2. Admin can list or revoke pending invites.
 *   3. Recipient opens GET /api/v1/invites/:token → returns InvitePreview.
 *   4. Recipient POSTs /api/v1/invites/:token/accept with a password.
 *      Creates the user with role='user', emailVerifiedAt=now (the email was
 *      proven by clicking the link), marks the invite consumed. Returns the
 *      same AuthResult shape as verifyEmail, so callers issue cookies + JWT
 *      identically.
 *
 * Bypasses registrationLockService.isLocked() by design — invites ARE the
 * override for when registration is locked.
 */

import argon2 from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import { adminDb } from '../db/index.js';
import { users, userInvites, refreshTokens, type UserInvite } from '../db/schema.js';
import {
  generateRefreshToken,
  refreshTokenExpiresAt,
  generateFamilyId,
  signAccessToken,
  hashToken,
} from '../lib/tokens.js';
import { randomBytes } from 'crypto';
import { AuthError, ARGON2_OPTIONS } from './authService.js';
import { assertPasswordNotPwned } from '../lib/hibp.js';

// Types kept local — API doesn't import from @ironledger/shared (matches
// the pattern used by adminService.ts). Web-side duplicates are in
// packages/shared/src/index.ts and must stay in sync.
type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

interface AdminInvite {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  invitedBy: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedUserId: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: InviteStatus;
}

interface InvitePreview {
  email: string;
  displayName: string | null;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INVITE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours
const TOKEN_BYTES = 32; // 256 bits, 64 hex chars

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function requireAdminDb() {
  if (!adminDb) throw new AuthError('Admin DB not configured', 'CONFIG_ERROR', 500);
  return adminDb;
}

function generateInviteToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(TOKEN_BYTES).toString('hex');
  const hash = hashToken(raw);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  return { raw, hash, expiresAt };
}

function deriveStatus(row: UserInvite): InviteStatus {
  if (row.revokedAt) return 'revoked';
  if (row.acceptedAt) return 'accepted';
  if (row.expiresAt < new Date()) return 'expired';
  return 'pending';
}

function toAdminInvite(row: UserInvite): AdminInvite {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    invitedBy: row.invitedBy,
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    acceptedUserId: row.acceptedUserId,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    status: deriveStatus(row),
  };
}

// ---------------------------------------------------------------------------
// createInvite — admin creates a pending invite
// ---------------------------------------------------------------------------

export interface CreateInviteInput {
  email: string;
  displayName?: string;
  invitedBy: string; // admin's user id
}

export async function createInvite(
  input: CreateInviteInput,
): Promise<{ invite: AdminInvite; rawToken: string }> {
  const db = requireAdminDb();

  const email = input.email.toLowerCase().trim();
  const displayName = input.displayName?.trim() || null;

  // Hard 400 on already-registered email. Endpoint is behind requireAdmin, so
  // enumeration is not a concern — an admin asking to invite an existing
  // account should know why it won't work.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    throw new AuthError('An account with that email already exists.', 'EMAIL_EXISTS', 400);
  }

  const { raw, hash, expiresAt } = generateInviteToken();

  const [row] = await db
    .insert(userInvites)
    .values({
      email,
      displayName,
      role: 'user',
      tokenHash: hash,
      invitedBy: input.invitedBy,
      expiresAt,
    })
    .returning();

  if (!row) throw new AuthError('Failed to create invite', 'CREATE_FAILED', 500);

  return { invite: toAdminInvite(row), rawToken: raw };
}

// ---------------------------------------------------------------------------
// listInvites — admin view
// ---------------------------------------------------------------------------

export async function listInvites(): Promise<AdminInvite[]> {
  const db = requireAdminDb();

  const rows = await db.select().from(userInvites).orderBy(userInvites.createdAt).limit(200); // generous cap; pending invites should never be this many

  return rows.map(toAdminInvite);
}

// ---------------------------------------------------------------------------
// revokeInvite — admin invalidates a pending invite by expiring its token
//
// We expire the token (set expires_at = now()) rather than setting a separate
// revoked_at flag. The recipient sees the same "This invitation has expired"
// UI as a naturally-expired link, and the admin status badge shows 'expired'.
// The DB column revoked_at is kept for backward-compat with rows written
// before this change but is no longer set by new revoke calls.
// ---------------------------------------------------------------------------

export async function revokeInvite(inviteId: string): Promise<AdminInvite> {
  const db = requireAdminDb();

  const [existing] = await db
    .select()
    .from(userInvites)
    .where(eq(userInvites.id, inviteId))
    .limit(1);

  if (!existing) throw new AuthError('Invite not found', 'NOT_FOUND', 404);

  if (existing.acceptedAt) {
    throw new AuthError('Cannot revoke an already-accepted invite', 'ALREADY_ACCEPTED', 400);
  }

  // Idempotent — if already expired (or previously revoked), return as-is.
  if (existing.revokedAt || existing.expiresAt < new Date()) {
    return toAdminInvite(existing);
  }

  const [updated] = await db
    .update(userInvites)
    .set({ expiresAt: new Date() })
    .where(eq(userInvites.id, inviteId))
    .returning();

  if (!updated) throw new AuthError('Failed to revoke invite', 'UPDATE_FAILED', 500);
  return toAdminInvite(updated);
}

// ---------------------------------------------------------------------------
// getInvitePreview — public: validate a raw token and return the email
// ---------------------------------------------------------------------------

export async function getInvitePreview(rawToken: string): Promise<InvitePreview> {
  const db = requireAdminDb();

  const [row] = await db
    .select()
    .from(userInvites)
    .where(eq(userInvites.tokenHash, hashToken(rawToken)))
    .limit(1);

  if (!row) throw new AuthError('Invalid invitation link', 'TOKEN_INVALID', 400);
  if (row.revokedAt) throw new AuthError('This invitation has been revoked', 'TOKEN_REVOKED', 400);
  if (row.acceptedAt)
    throw new AuthError('This invitation has already been used', 'TOKEN_USED', 400);
  if (row.expiresAt < new Date())
    throw new AuthError('This invitation has expired', 'TOKEN_EXPIRED', 400);

  return {
    email: row.email,
    displayName: row.displayName,
    expiresAt: row.expiresAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// acceptInvite — public: set password, create user, issue tokens
// ---------------------------------------------------------------------------

export interface AcceptInviteResult {
  user: { id: string; email: string; role: string; displayName: string };
  accessToken: string;
  refreshToken: string;
  familyId: string;
}

export async function acceptInvite(
  rawToken: string,
  password: string,
  displayNameOverride?: string,
): Promise<AcceptInviteResult> {
  const db = requireAdminDb();

  // Look up by hash
  const [invite] = await db
    .select()
    .from(userInvites)
    .where(eq(userInvites.tokenHash, hashToken(rawToken)))
    .limit(1);

  if (!invite) throw new AuthError('Invalid invitation link', 'TOKEN_INVALID', 400);
  if (invite.revokedAt)
    throw new AuthError('This invitation has been revoked', 'TOKEN_REVOKED', 400);
  if (invite.acceptedAt)
    throw new AuthError('This invitation has already been used', 'TOKEN_USED', 400);
  if (invite.expiresAt < new Date())
    throw new AuthError('This invitation has expired', 'TOKEN_EXPIRED', 400);

  // Belt-and-braces: if the email got registered through some other path
  // (e.g. an old verification link), refuse rather than silently orphan the
  // invite.
  const [dupe] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, invite.email))
    .limit(1);

  if (dupe) throw new AuthError('An account with that email already exists.', 'EMAIL_EXISTS', 400);

  // HIBP + hash the new password
  await assertPasswordNotPwned(password);
  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);

  // Display name: accept override from the form, fall back to stored, fall
  // back to email — mirrors the registration default.
  const displayName = displayNameOverride?.trim() || invite.displayName?.trim() || invite.email;

  const familyId = generateFamilyId();
  const refresh = generateRefreshToken();
  const rtExpires = refreshTokenExpiresAt();

  // Create user + mark invite accepted + issue refresh token in one txn.
  const created = await db.transaction(async (tx) => {
    const [newUser] = await tx
      .insert(users)
      .values({
        email: invite.email,
        displayName,
        passwordHash,
        emailVerifiedAt: new Date(), // invitee proved email ownership by clicking the link
        isActive: true,
        role: invite.role, // 'user' — admin-role invites are rejected at create time
      })
      .returning({
        id: users.id,
        email: users.email,
        role: users.role,
        displayName: users.displayName,
      });

    if (!newUser) throw new AuthError('Failed to create user', 'CREATE_FAILED', 500);

    await tx
      .update(userInvites)
      .set({
        acceptedAt: new Date(),
        acceptedUserId: newUser.id,
      })
      .where(
        and(
          eq(userInvites.id, invite.id),
          isNull(userInvites.acceptedAt), // guard against race
        ),
      );

    await tx.insert(refreshTokens).values({
      userId: newUser.id,
      tokenHash: refresh.hash,
      familyId,
      expiresAt: rtExpires,
    });

    return newUser;
  });

  const accessToken = await signAccessToken(created.id, created.email, created.role);

  return {
    user: created,
    accessToken,
    refreshToken: refresh.raw,
    familyId,
  };
}
