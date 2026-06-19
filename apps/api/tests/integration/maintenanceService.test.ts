/**
 * Integration tests for maintenanceService.ts.
 *
 * Real Redis + DB. Each test clears the three maintenance keys up front so
 * suites don't bleed into each other. enableMaintenance has a side effect
 * we explicitly verify: it revokes all currently-active refresh tokens so
 * users get logged out when their access tokens expire.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq, isNull } from 'drizzle-orm';
import { adminDb } from '../../src/db/index.js';
import { users, refreshTokens, securityEvents } from '../../src/db/schema.js';

if (!adminDb) throw new Error('adminDb is required');

vi.mock('../../src/lib/hibp.js', () => ({
  assertPasswordNotPwned: vi.fn().mockResolvedValue(undefined),
  getPwnedCount: vi.fn().mockResolvedValue(0),
  PwnedPasswordError: class PwnedPasswordError extends Error {},
}));

const service = await import('../../src/services/maintenanceService.js');
const { redis } = await import('../../src/server.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = 'maintenance-admin@example.com';
const USER_EMAIL = 'maintenance-user@example.com';
const KEY_ENABLED = 'maintenance:enabled';
const KEY_MESSAGE = 'maintenance:message';
const KEY_SHUTDOWN_AT = 'maintenance:shutdownAt';

let rtCounter = 0;
async function seedUser(email: string, role: 'admin' | 'user' = 'user'): Promise<string> {
  await adminDb!.delete(users).where(eq(users.email, email));
  const [row] = await adminDb!
    .insert(users)
    .values({
      email,
      displayName: 'M',
      passwordHash: 'unused',
      emailVerifiedAt: new Date(),
      role,
      isActive: true,
    })
    .returning({ id: users.id });
  return row.id;
}

async function seedRefreshToken(userId: string) {
  rtCounter += 1;
  const hash = rtCounter.toString(16).padStart(64, '0');
  await adminDb!.insert(refreshTokens).values({
    userId,
    tokenHash: hash,
    familyId: '00000000000000000000000000000000',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
}

const tick = () => new Promise((r) => setTimeout(r, 50));

let adminId: string;
let userId: string;

beforeEach(async () => {
  await redis.del(KEY_ENABLED, KEY_MESSAGE, KEY_SHUTDOWN_AT);
  adminId = await seedUser(ADMIN_EMAIL, 'admin');
  userId = await seedUser(USER_EMAIL);
  await adminDb!.delete(securityEvents).where(eq(securityEvents.userId, adminId));
});

afterAll(async () => {
  await redis.del(KEY_ENABLED, KEY_MESSAGE, KEY_SHUTDOWN_AT);
});

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------

describe('getStatus', () => {
  it('returns { enabled:false, message:null, shutdownAt:null } when nothing is set', async () => {
    expect(await service.getStatus()).toEqual({
      enabled: false,
      message: null,
      shutdownAt: null,
    });
  });

  it('reflects the keys after a manual Redis write', async () => {
    await redis.set(KEY_ENABLED, '1');
    await redis.set(KEY_MESSAGE, 'down for the weekend');
    await redis.set(KEY_SHUTDOWN_AT, '2026-12-31T00:00:00.000Z');

    expect(await service.getStatus()).toEqual({
      enabled: true,
      message: 'down for the weekend',
      shutdownAt: '2026-12-31T00:00:00.000Z',
    });
  });
});

// ---------------------------------------------------------------------------
// enableMaintenance
// ---------------------------------------------------------------------------

describe('enableMaintenance', () => {
  it('sets all three Redis keys and returns the new status with an ISO shutdownAt', async () => {
    const before = Date.now();
    const result = await service.enableMaintenance('back at noon', 15, adminId, '198.51.100.1');

    expect(result.enabled).toBe(true);
    expect(result.message).toBe('back at noon');
    const shutdown = new Date(result.shutdownAt!).getTime();
    // ~15 min in the future, ± 5s slack for test machine jitter.
    expect(shutdown).toBeGreaterThanOrEqual(before + 15 * 60_000 - 5_000);
    expect(shutdown).toBeLessThanOrEqual(before + 15 * 60_000 + 5_000);

    expect(await redis.get(KEY_ENABLED)).toBe('1');
    expect(await redis.get(KEY_MESSAGE)).toBe('back at noon');
    expect(await redis.get(KEY_SHUTDOWN_AT)).toBe(result.shutdownAt);
  });

  it('revokes all currently-active refresh tokens', async () => {
    await seedRefreshToken(userId);
    await seedRefreshToken(userId);
    await seedRefreshToken(adminId);

    // Sanity check: 3 active tokens before.
    const activeBefore = await adminDb!
      .select()
      .from(refreshTokens)
      .where(isNull(refreshTokens.revokedAt));
    expect(activeBefore).toHaveLength(3);

    await service.enableMaintenance('msg', 5, adminId);

    const activeAfter = await adminDb!
      .select()
      .from(refreshTokens)
      .where(isNull(refreshTokens.revokedAt));
    expect(activeAfter).toHaveLength(0);
  });

  it('audits the action with metadata + ip', async () => {
    await service.enableMaintenance('msg', 30, adminId, '203.0.113.99');
    await tick();
    const [evt] = await adminDb!
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, adminId));
    expect(evt.eventType).toBe('admin_enable_maintenance');
    expect(evt.ipAddress).toBe('203.0.113.99');
    const meta = evt.metadata as {
      message: string;
      minutesUntilShutdown: number;
      shutdownAt: string;
    };
    expect(meta.message).toBe('msg');
    expect(meta.minutesUntilShutdown).toBe(30);
    expect(meta.shutdownAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// disableMaintenance
// ---------------------------------------------------------------------------

describe('disableMaintenance', () => {
  it('clears all three Redis keys and audits an disable event', async () => {
    await service.enableMaintenance('msg', 5, adminId);
    await adminDb!.delete(securityEvents).where(eq(securityEvents.userId, adminId));

    await service.disableMaintenance(adminId, '203.0.113.1');

    expect(await redis.get(KEY_ENABLED)).toBeNull();
    expect(await redis.get(KEY_MESSAGE)).toBeNull();
    expect(await redis.get(KEY_SHUTDOWN_AT)).toBeNull();

    expect(await service.getStatus()).toEqual({
      enabled: false,
      message: null,
      shutdownAt: null,
    });

    await tick();
    const [evt] = await adminDb!
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, adminId));
    expect(evt.eventType).toBe('admin_disable_maintenance');
    expect(evt.ipAddress).toBe('203.0.113.1');
  });

  it('is idempotent on already-disabled state', async () => {
    await service.disableMaintenance(adminId);
    await tick();
    const rows = await adminDb!
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, adminId));
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe('admin_disable_maintenance');
  });
});
