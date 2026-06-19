/**
 * Integration tests for adminService.ts.
 *
 * Uses the real test DB via adminDb (bypasses RLS) for setup/cleanup. All
 * external services (HIBP / mailer) are mocked since the admin service
 * doesn't actually touch them — it's pure DB orchestration plus audit
 * logging. The audit-log writes are fire-and-forget inside the service;
 * we await a small delay before reading them back to avoid a flake.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq, and, isNull } from 'drizzle-orm';
import { adminDb } from '../../src/db/index.js';
import { users, characters, userData, securityEvents, refreshTokens } from '../../src/db/schema.js';

if (!adminDb) throw new Error('adminDb is required — set DATABASE_ADMIN_URL');

vi.mock('../../src/lib/hibp.js', () => ({
  assertPasswordNotPwned: vi.fn().mockResolvedValue(undefined),
  getPwnedCount: vi.fn().mockResolvedValue(0),
  PwnedPasswordError: class PwnedPasswordError extends Error {},
}));
vi.mock('../../src/lib/mailer.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendInviteEmail: vi.fn().mockResolvedValue(undefined),
}));

const admin = await import('../../src/services/adminService.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = 'admin-svc-tests@example.com';
const TARGET_EMAIL = 'target-svc-tests@example.com';
const ALT_EMAIL = 'alt-svc-tests@example.com';

async function wipeAll() {
  // Order matters — security_events has no FK; users cascades to characters,
  // user_data, refresh_tokens via ON DELETE CASCADE.
  await adminDb!.delete(securityEvents);
  await adminDb!.delete(users);
}

interface SeedOpts {
  email: string;
  role?: 'user' | 'admin';
  isActive?: boolean;
  createdAt?: Date;
  lastLoginAt?: Date | null;
}
async function seedUser(opts: SeedOpts): Promise<string> {
  const [row] = await adminDb!
    .insert(users)
    .values({
      email: opts.email,
      displayName: opts.email.split('@')[0],
      passwordHash: 'irrelevant-for-admin-tests',
      emailVerifiedAt: new Date(),
      role: opts.role ?? 'user',
      isActive: opts.isActive ?? true,
      createdAt: opts.createdAt ?? new Date(),
      lastLoginAt: opts.lastLoginAt ?? null,
    })
    .returning({ id: users.id });
  return row.id;
}

async function seedCharacter(userId: string, name = 'Test Char') {
  await adminDb!.insert(characters).values({
    userId,
    name,
    data: {},
  });
}

async function seedUserData(userId: string, encounters: unknown[], expeditions: unknown[]) {
  await adminDb!.insert(userData).values({ userId, encounters, expeditions }).onConflictDoUpdate({
    target: userData.userId,
    set: { encounters, expeditions },
  });
}

let rtCounter = 0;
async function seedRefreshToken(userId: string) {
  // token_hash has a UNIQUE constraint — increment a counter so multiple
  // calls in the same test don't collide.
  rtCounter += 1;
  const hash = rtCounter.toString(16).padStart(64, '0');
  await adminDb!.insert(refreshTokens).values({
    userId,
    tokenHash: hash,
    familyId: '00000000000000000000000000000000',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
}

/** Read the most recent audit event for a given event_type. */
async function lastEvent(eventType: string) {
  const rows = await adminDb!
    .select()
    .from(securityEvents)
    .where(eq(securityEvents.eventType, eventType));
  return rows[rows.length - 1] ?? null;
}

/** The service's audit logEvent is fire-and-forget — give it a tick to land. */
const tick = () => new Promise((r) => setTimeout(r, 50));

let adminId: string;

beforeEach(async () => {
  await wipeAll();
  adminId = await seedUser({ email: ADMIN_EMAIL, role: 'admin' });
});

// ---------------------------------------------------------------------------
// listUsers
// ---------------------------------------------------------------------------

describe('listUsers', () => {
  it('returns every user with character/encounter/expedition counts', async () => {
    const targetId = await seedUser({ email: TARGET_EMAIL });
    await seedCharacter(targetId, 'Char A');
    await seedCharacter(targetId, 'Char B');
    await seedUserData(targetId, [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }], [{ id: 'e1' }]);

    const list = await admin.listUsers();
    const target = list.find((u) => u.email === TARGET_EMAIL)!;
    expect(target).toBeTruthy();
    expect(target.characterCount).toBe(2);
    expect(target.encounterCount).toBe(3);
    expect(target.expeditionCount).toBe(1);
    expect(target.role).toBe('user');
    expect(target.isActive).toBe(true);
  });

  it('treats users with no user_data row as 0/0/0 counts', async () => {
    await seedUser({ email: TARGET_EMAIL });
    const list = await admin.listUsers();
    const target = list.find((u) => u.email === TARGET_EMAIL)!;
    expect(target.characterCount).toBe(0);
    expect(target.encounterCount).toBe(0);
    expect(target.expeditionCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getStats
// ---------------------------------------------------------------------------

describe('getStats', () => {
  it('aggregates totals + windowed activity counts', async () => {
    const u1 = await seedUser({ email: TARGET_EMAIL, lastLoginAt: new Date() }); // active now
    const u2 = await seedUser({
      email: ALT_EMAIL,
      lastLoginAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    }); // active 7d, not 15m
    await seedCharacter(u1, 'a');
    await seedCharacter(u2, 'b');
    await seedUserData(u1, [{ id: 'x' }, { id: 'y' }], [{ id: 'p' }]);

    const stats = await admin.getStats();
    expect(stats.totalUsers).toBeGreaterThanOrEqual(3); // admin + 2 seeded
    expect(stats.totalCharacters).toBe(2);
    expect(stats.totalEncounters).toBe(2);
    expect(stats.totalExpeditions).toBe(1);
    expect(stats.activeUsers7d).toBeGreaterThanOrEqual(2);
    expect(stats.currentlyLoggedIn).toBeGreaterThanOrEqual(1);
  });

  it('returns zeroes when the DB is empty (no users at all)', async () => {
    await wipeAll();
    const stats = await admin.getStats();
    expect(stats.totalUsers).toBe(0);
    expect(stats.totalCharacters).toBe(0);
    expect(stats.totalEncounters).toBe(0);
    expect(stats.totalExpeditions).toBe(0);
    expect(stats.activeUsers7d).toBe(0);
    expect(stats.currentlyLoggedIn).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// deleteUser
// ---------------------------------------------------------------------------

describe('deleteUser', () => {
  it('deletes the target row and audits with target email + ip', async () => {
    const targetId = await seedUser({ email: TARGET_EMAIL });

    await admin.deleteUser(targetId, adminId, '203.0.113.5');

    const [stored] = await adminDb!.select().from(users).where(eq(users.id, targetId)).limit(1);
    expect(stored).toBeUndefined();

    await tick();
    const evt = await lastEvent('admin_delete_user');
    expect(evt).toBeTruthy();
    expect(evt.userId).toBe(adminId);
    expect(evt.ipAddress).toBe('203.0.113.5');
    expect((evt.metadata as { targetEmail: string }).targetEmail).toBe(TARGET_EMAIL);
  });

  it('throws NOT_FOUND for an unknown id', async () => {
    const err = await admin
      .deleteUser('00000000-0000-0000-0000-000000000000', adminId)
      .catch((e: unknown) => e as Error & { code?: string; statusCode?: number });
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// setUserRole
// ---------------------------------------------------------------------------

describe('setUserRole', () => {
  it('promotes a user to admin and records previousRole in the audit', async () => {
    const targetId = await seedUser({ email: TARGET_EMAIL });
    await admin.setUserRole(targetId, 'admin', adminId, '203.0.113.6');

    const [stored] = await adminDb!.select().from(users).where(eq(users.id, targetId)).limit(1);
    expect(stored.role).toBe('admin');

    await tick();
    const evt = await lastEvent('admin_set_role');
    expect(evt).toBeTruthy();
    expect((evt.metadata as { previousRole: string; newRole: string }).previousRole).toBe('user');
    expect((evt.metadata as { newRole: string }).newRole).toBe('admin');
  });

  it('demotes an admin to user', async () => {
    const targetId = await seedUser({ email: TARGET_EMAIL, role: 'admin' });
    await admin.setUserRole(targetId, 'user', adminId);

    const [stored] = await adminDb!.select().from(users).where(eq(users.id, targetId)).limit(1);
    expect(stored.role).toBe('user');
  });

  it('rejects INVALID_ROLE without touching the DB', async () => {
    const targetId = await seedUser({ email: TARGET_EMAIL });
    const err = await admin
      .setUserRole(targetId, 'superuser', adminId)
      .catch((e: unknown) => e as Error & { code?: string });
    expect(err.code).toBe('INVALID_ROLE');

    const [stored] = await adminDb!.select().from(users).where(eq(users.id, targetId)).limit(1);
    expect(stored.role).toBe('user'); // unchanged
  });

  it('throws NOT_FOUND for an unknown id', async () => {
    const err = await admin
      .setUserRole('00000000-0000-0000-0000-000000000000', 'admin', adminId)
      .catch((e: unknown) => e as Error & { code?: string });
    expect(err.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// suspendUser / unsuspendUser
// ---------------------------------------------------------------------------

describe('suspendUser', () => {
  it('sets is_active=false and revokes all active refresh tokens', async () => {
    const targetId = await seedUser({ email: TARGET_EMAIL });
    await seedRefreshToken(targetId);
    await seedRefreshToken(targetId);

    await admin.suspendUser(targetId, adminId, '203.0.113.7');

    const [stored] = await adminDb!.select().from(users).where(eq(users.id, targetId)).limit(1);
    expect(stored.isActive).toBe(false);

    const active = await adminDb!
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, targetId), isNull(refreshTokens.revokedAt)));
    expect(active).toHaveLength(0);

    await tick();
    const evt = await lastEvent('admin_suspend_user');
    expect(evt.ipAddress).toBe('203.0.113.7');
  });

  it('throws NOT_FOUND for an unknown id', async () => {
    const err = await admin
      .suspendUser('00000000-0000-0000-0000-000000000000', adminId)
      .catch((e: unknown) => e as Error & { code?: string });
    expect(err.code).toBe('NOT_FOUND');
  });
});

describe('unsuspendUser', () => {
  it('sets is_active=true and audits', async () => {
    const targetId = await seedUser({ email: TARGET_EMAIL, isActive: false });
    await admin.unsuspendUser(targetId, adminId);

    const [stored] = await adminDb!.select().from(users).where(eq(users.id, targetId)).limit(1);
    expect(stored.isActive).toBe(true);

    await tick();
    const evt = await lastEvent('admin_unsuspend_user');
    expect(evt).toBeTruthy();
  });

  it('throws NOT_FOUND for an unknown id', async () => {
    const err = await admin
      .unsuspendUser('00000000-0000-0000-0000-000000000000', adminId)
      .catch((e: unknown) => e as Error & { code?: string });
    expect(err.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// autoLockAccount
// ---------------------------------------------------------------------------

describe('autoLockAccount', () => {
  it('deactivates the user, revokes refresh tokens, and writes an auto_lockout event with userId=null', async () => {
    const targetId = await seedUser({ email: TARGET_EMAIL });
    await seedRefreshToken(targetId);

    await admin.autoLockAccount(targetId, TARGET_EMAIL);

    const [stored] = await adminDb!.select().from(users).where(eq(users.id, targetId)).limit(1);
    expect(stored.isActive).toBe(false);

    const active = await adminDb!
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, targetId), isNull(refreshTokens.revokedAt)));
    expect(active).toHaveLength(0);

    const evt = await lastEvent('auto_lockout');
    expect(evt).toBeTruthy();
    // System action — no human admin attached.
    expect(evt.userId).toBeNull();
    expect((evt.metadata as { targetEmail: string }).targetEmail).toBe(TARGET_EMAIL);
    expect((evt.metadata as { reason: string }).reason).toBe('too_many_failed_logins');
  });
});

// ---------------------------------------------------------------------------
// getAuditLog
// ---------------------------------------------------------------------------

describe('getAuditLog', () => {
  it('returns events most-recent-first with the admin email joined in', async () => {
    const targetId = await seedUser({ email: TARGET_EMAIL });
    await admin.deleteUser(targetId, adminId);
    await tick();

    const events = await admin.getAuditLog();
    expect(events.length).toBeGreaterThan(0);
    const evt = events.find((e) => e.eventType === 'admin_delete_user')!;
    expect(evt.adminEmail).toBe(ADMIN_EMAIL);
    expect(evt.adminId).toBe(adminId);
  });

  it('respects the limit argument', async () => {
    // Generate three events so the limit can actually trim.
    for (let i = 0; i < 3; i++) {
      const tid = await seedUser({ email: `bulk-${i}@example.com` });
      await admin.deleteUser(tid, adminId);
    }
    await tick();

    const all = await admin.getAuditLog(100);
    expect(all.length).toBeGreaterThanOrEqual(3);
    const trimmed = await admin.getAuditLog(2);
    expect(trimmed.length).toBe(2);
  });

  it('filters by search across admin email and metadata.targetEmail', async () => {
    const targetId = await seedUser({ email: 'searchable-target@example.com' });
    const otherId = await seedUser({ email: 'other@example.com' });
    await admin.deleteUser(targetId, adminId);
    await admin.deleteUser(otherId, adminId);
    await tick();

    const hits = await admin.getAuditLog(100, 'searchable-target');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(
      hits.some(
        (e) =>
          (e.metadata as { targetEmail?: string } | null)?.targetEmail ===
          'searchable-target@example.com',
      ),
    ).toBe(true);
    expect(
      hits.every(
        (e) =>
          ((e.metadata as { targetEmail?: string } | null)?.targetEmail ?? '').includes(
            'searchable-target',
          ) || (e.adminEmail ?? '').includes('searchable-target'),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getUserTimeseries
// ---------------------------------------------------------------------------

describe('getUserTimeseries', () => {
  it('returns 12 buckets for the 1hr timeframe', async () => {
    const series = await admin.getUserTimeseries('1hr');
    expect(series.timeframe).toBe('1hr');
    expect(series.buckets).toHaveLength(12);
  });

  it('returns 24 buckets for 1day, 7 for 7day, 30 for 30day', async () => {
    expect((await admin.getUserTimeseries('1day')).buckets).toHaveLength(24);
    expect((await admin.getUserTimeseries('7day')).buckets).toHaveLength(7);
    expect((await admin.getUserTimeseries('30day')).buckets).toHaveLength(30);
  });

  it('counts a user as new in the bucket their createdAt falls in', async () => {
    // Place the user's createdAt squarely inside the most recent bucket of
    // the 1hr timeframe (last 5-minute window). We can't pick the exact
    // bucket without re-implementing the math, so just verify the total
    // newUsers across the window matches what we seeded.
    const before = (await admin.getUserTimeseries('1hr')).buckets.reduce(
      (s, b) => s + b.newUsers,
      0,
    );
    await seedUser({ email: 'fresh-user@example.com', createdAt: new Date() });
    const after = (await admin.getUserTimeseries('1hr')).buckets.reduce(
      (s, b) => s + b.newUsers,
      0,
    );
    expect(after - before).toBe(1);
  });

  it('produces monotonically non-decreasing cumulative totalUsers', async () => {
    const { buckets } = await admin.getUserTimeseries('30day');
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i].totalUsers).toBeGreaterThanOrEqual(buckets[i - 1].totalUsers);
    }
  });
});

// ---------------------------------------------------------------------------
// clearAuditLog
// ---------------------------------------------------------------------------

describe('clearAuditLog', () => {
  it('deletes existing events and writes a single admin_clear_audit event', async () => {
    const targetId = await seedUser({ email: TARGET_EMAIL });
    await admin.deleteUser(targetId, adminId);
    await tick();

    const beforeAll = await adminDb!.select().from(securityEvents);
    expect(beforeAll.length).toBeGreaterThan(0);

    await admin.clearAuditLog(adminId, '203.0.113.9');

    const after = await adminDb!.select().from(securityEvents);
    // After the clear, exactly one event should remain: the clear itself.
    expect(after).toHaveLength(1);
    expect(after[0].eventType).toBe('admin_clear_audit');
    expect(after[0].userId).toBe(adminId);
    expect(after[0].ipAddress).toBe('203.0.113.9');
  });
});
