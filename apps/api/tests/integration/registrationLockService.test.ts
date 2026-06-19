/**
 * Integration tests for registrationLockService.ts.
 *
 * Uses the real test Redis (via the redis client exported from server.ts) and
 * the real test DB (for the fire-and-forget audit-log inserts). Each test
 * deletes the lock keys up front so suites don't bleed into each other, and
 * waits a small tick after lock/unlock calls before reading audit rows back.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { adminDb } from '../../src/db/index.js';
import { users, securityEvents } from '../../src/db/schema.js';

if (!adminDb) throw new Error('adminDb is required — set DATABASE_ADMIN_URL');

// HIBP/mailer aren't touched by this service, but the wider config import chain
// pulls them in; stub for hermeticity.
vi.mock('../../src/lib/hibp.js', () => ({
  assertPasswordNotPwned: vi.fn().mockResolvedValue(undefined),
  getPwnedCount: vi.fn().mockResolvedValue(0),
  PwnedPasswordError: class PwnedPasswordError extends Error {},
}));

const service = await import('../../src/services/registrationLockService.js');
const { redis } = await import('../../src/server.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = 'reg-lock-admin@example.com';
const KEY_LOCKED = 'registration:locked';
const KEY_MESSAGE = 'registration:message';

async function seedAdmin(): Promise<string> {
  await adminDb!.delete(users).where(eq(users.email, ADMIN_EMAIL));
  const [row] = await adminDb!
    .insert(users)
    .values({
      email: ADMIN_EMAIL,
      displayName: 'Lock Admin',
      passwordHash: 'unused',
      emailVerifiedAt: new Date(),
      role: 'admin',
      isActive: true,
    })
    .returning({ id: users.id });
  return row.id;
}

const tick = () => new Promise((r) => setTimeout(r, 50));

let adminId: string;

beforeEach(async () => {
  await redis.del(KEY_LOCKED, KEY_MESSAGE);
  adminId = await seedAdmin();
  await adminDb!.delete(securityEvents).where(eq(securityEvents.userId, adminId));
});

afterAll(async () => {
  await redis.del(KEY_LOCKED, KEY_MESSAGE);
});

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------

describe('getStatus', () => {
  it('returns { locked:false, message:null } when nothing is set', async () => {
    const s = await service.getStatus();
    expect(s).toEqual({ locked: false, message: null });
  });

  it('reflects the keys after a manual Redis write', async () => {
    await redis.set(KEY_LOCKED, '1');
    await redis.set(KEY_MESSAGE, 'down for migrations');
    const s = await service.getStatus();
    expect(s).toEqual({ locked: true, message: 'down for migrations' });
  });
});

// ---------------------------------------------------------------------------
// lockRegistration
// ---------------------------------------------------------------------------

describe('lockRegistration', () => {
  it('sets both keys, returns the new status, and audits with the message', async () => {
    const result = await service.lockRegistration('closed-for-now', adminId, '198.51.100.10');

    expect(result).toEqual({ locked: true, message: 'closed-for-now' });

    expect(await redis.get(KEY_LOCKED)).toBe('1');
    expect(await redis.get(KEY_MESSAGE)).toBe('closed-for-now');

    await tick();
    const [evt] = await adminDb!
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, adminId));
    expect(evt.eventType).toBe('admin_lock_registration');
    expect(evt.ipAddress).toBe('198.51.100.10');
    expect((evt.metadata as { message: string }).message).toBe('closed-for-now');
  });

  it('does not require an ip address', async () => {
    await service.lockRegistration('msg', adminId);
    await tick();
    const [evt] = await adminDb!
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, adminId));
    expect(evt.ipAddress).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// unlockRegistration
// ---------------------------------------------------------------------------

describe('unlockRegistration', () => {
  it('deletes both keys and audits an unlock event', async () => {
    await service.lockRegistration('temp', adminId, '203.0.113.1');
    await adminDb!.delete(securityEvents).where(eq(securityEvents.userId, adminId));

    await service.unlockRegistration(adminId, '203.0.113.2');

    expect(await redis.get(KEY_LOCKED)).toBeNull();
    expect(await redis.get(KEY_MESSAGE)).toBeNull();

    const s = await service.getStatus();
    expect(s).toEqual({ locked: false, message: null });

    await tick();
    const [evt] = await adminDb!
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, adminId));
    expect(evt.eventType).toBe('admin_unlock_registration');
    expect(evt.ipAddress).toBe('203.0.113.2');
  });

  it('is idempotent — unlocking an already-unlocked state still audits', async () => {
    await service.unlockRegistration(adminId);
    await tick();
    const rows = await adminDb!
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, adminId));
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe('admin_unlock_registration');
  });
});
