/**
 * Integration tests for broadcastService.ts.
 *
 * Real Redis + DB. Each test clears the four broadcast keys before running
 * and verifies the same fire-and-forget audit pattern used by the other
 * Redis-backed admin services.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { adminDb } from '../../src/db/index.js';
import { users, securityEvents } from '../../src/db/schema.js';

if (!adminDb) throw new Error('adminDb is required');

vi.mock('../../src/lib/hibp.js', () => ({
  assertPasswordNotPwned: vi.fn().mockResolvedValue(undefined),
  getPwnedCount: vi.fn().mockResolvedValue(0),
  PwnedPasswordError: class PwnedPasswordError extends Error {},
}));

const service = await import('../../src/services/broadcastService.js');
const { redis } = await import('../../src/server.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = 'broadcast-admin@example.com';
const KEYS = [
  'broadcast:active',
  'broadcast:message',
  'broadcast:severity',
  'broadcast:postedAt',
] as const;

async function seedAdmin(): Promise<string> {
  await adminDb!.delete(users).where(eq(users.email, ADMIN_EMAIL));
  const [row] = await adminDb!
    .insert(users)
    .values({
      email: ADMIN_EMAIL,
      displayName: 'B',
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
  await redis.del(...KEYS);
  adminId = await seedAdmin();
  await adminDb!.delete(securityEvents).where(eq(securityEvents.userId, adminId));
});

afterAll(async () => {
  await redis.del(...KEYS);
});

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------

describe('getStatus', () => {
  it('returns inactive defaults when nothing is set', async () => {
    expect(await service.getStatus()).toEqual({
      active: false,
      message: null,
      severity: 'info',
      postedAt: null,
    });
  });

  it('reflects values written directly to Redis', async () => {
    await redis.set('broadcast:active', '1');
    await redis.set('broadcast:message', 'incoming meteor');
    await redis.set('broadcast:severity', 'warning');
    await redis.set('broadcast:postedAt', '2026-06-19T12:00:00.000Z');

    expect(await service.getStatus()).toEqual({
      active: true,
      message: 'incoming meteor',
      severity: 'warning',
      postedAt: '2026-06-19T12:00:00.000Z',
    });
  });

  it('defaults unknown severity strings back to "info"', async () => {
    await redis.set('broadcast:active', '1');
    await redis.set('broadcast:severity', 'critical'); // not in the allowed set
    const s = await service.getStatus();
    expect(s.severity).toBe('info');
  });
});

// ---------------------------------------------------------------------------
// postBroadcast
// ---------------------------------------------------------------------------

describe('postBroadcast', () => {
  it('sets all four keys, returns the new status, and audits with metadata + ip', async () => {
    const before = Date.now();
    const result = await service.postBroadcast(
      'scheduled downtime',
      'warning',
      adminId,
      '198.51.100.1',
    );

    expect(result.active).toBe(true);
    expect(result.message).toBe('scheduled downtime');
    expect(result.severity).toBe('warning');
    const postedAt = new Date(result.postedAt!).getTime();
    expect(postedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(postedAt).toBeLessThanOrEqual(Date.now() + 1000);

    expect(await redis.get('broadcast:active')).toBe('1');
    expect(await redis.get('broadcast:message')).toBe('scheduled downtime');
    expect(await redis.get('broadcast:severity')).toBe('warning');
    expect(await redis.get('broadcast:postedAt')).toBe(result.postedAt);

    await tick();
    const [evt] = await adminDb!
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, adminId));
    expect(evt.eventType).toBe('admin_post_broadcast');
    expect(evt.ipAddress).toBe('198.51.100.1');
    const meta = evt.metadata as { message: string; severity: string; postedAt: string };
    expect(meta.message).toBe('scheduled downtime');
    expect(meta.severity).toBe('warning');
    expect(meta.postedAt).toBe(result.postedAt);
  });

  it('overwrites with a fresh postedAt on every call (re-shows for dismissed clients)', async () => {
    const first = await service.postBroadcast('one', 'info', adminId);
    await new Promise((r) => setTimeout(r, 20)); // guarantee different ms
    const second = await service.postBroadcast('two', 'info', adminId);
    expect(second.postedAt).not.toBe(first.postedAt);
    expect(new Date(second.postedAt!).getTime()).toBeGreaterThan(
      new Date(first.postedAt!).getTime(),
    );
    expect(await redis.get('broadcast:message')).toBe('two');
  });

  it('does not require an ip address', async () => {
    await service.postBroadcast('msg', 'info', adminId);
    await tick();
    const [evt] = await adminDb!
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, adminId));
    expect(evt.ipAddress).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearBroadcast
// ---------------------------------------------------------------------------

describe('clearBroadcast', () => {
  it('deletes all four keys and audits a clear event', async () => {
    await service.postBroadcast('temp', 'info', adminId);
    await adminDb!.delete(securityEvents).where(eq(securityEvents.userId, adminId));

    await service.clearBroadcast(adminId, '203.0.113.42');

    for (const k of KEYS) {
      expect(await redis.get(k)).toBeNull();
    }
    expect(await service.getStatus()).toEqual({
      active: false,
      message: null,
      severity: 'info',
      postedAt: null,
    });

    await tick();
    const [evt] = await adminDb!
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, adminId));
    expect(evt.eventType).toBe('admin_clear_broadcast');
    expect(evt.ipAddress).toBe('203.0.113.42');
  });

  it('is idempotent when nothing was set', async () => {
    await service.clearBroadcast(adminId);
    await tick();
    const rows = await adminDb!
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, adminId));
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe('admin_clear_broadcast');
  });
});
