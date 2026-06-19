/**
 * Integration tests for registrationQuotaService.ts.
 *
 * Real Redis + DB. The quota uses a per-UTC-day counter, so each test wipes
 * both the quota config and today's counter key before running. We don't
 * try to fake "today" — we just let the service derive its own key and
 * clean it up afterwards.
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

const service = await import('../../src/services/registrationQuotaService.js');
const { redis } = await import('../../src/server.js');

// ---------------------------------------------------------------------------
// Helpers + fixtures
// ---------------------------------------------------------------------------

const ADMIN_EMAIL = 'reg-quota-admin@example.com';
const KEY_QUOTA = 'registration:daily_quota';

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `registration:count:${yyyy}-${mm}-${dd}`;
}

async function seedAdmin(): Promise<string> {
  await adminDb!.delete(users).where(eq(users.email, ADMIN_EMAIL));
  const [row] = await adminDb!
    .insert(users)
    .values({
      email: ADMIN_EMAIL,
      displayName: 'Quota Admin',
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
  await redis.del(KEY_QUOTA, todayKey());
  adminId = await seedAdmin();
  await adminDb!.delete(securityEvents).where(eq(securityEvents.userId, adminId));
});

afterAll(async () => {
  await redis.del(KEY_QUOTA, todayKey());
});

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------

describe('getStatus', () => {
  it('reports unlimited (daily=null, remaining=null) when no quota is set', async () => {
    const s = await service.getStatus();
    expect(s.daily).toBeNull();
    expect(s.remaining).toBeNull();
    expect(s.usedToday).toBe(0);
    expect(s.exhausted).toBe(false);
    // resetsAt should be a future ISO timestamp at exactly midnight UTC.
    const d = new Date(s.resetsAt);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getTime()).toBeGreaterThan(Date.now());
  });

  it('reflects a configured quota with the current counter', async () => {
    await redis.set(KEY_QUOTA, '5');
    await redis.set(todayKey(), '2');

    const s = await service.getStatus();
    expect(s.daily).toBe(5);
    expect(s.usedToday).toBe(2);
    expect(s.remaining).toBe(3);
    expect(s.exhausted).toBe(false);
  });

  it('reports exhausted=true when usedToday >= daily', async () => {
    await redis.set(KEY_QUOTA, '3');
    await redis.set(todayKey(), '3');
    const s = await service.getStatus();
    expect(s.exhausted).toBe(true);
    expect(s.remaining).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// setQuota
// ---------------------------------------------------------------------------

describe('setQuota', () => {
  it('sets the daily quota, audits the change, and returns the new status', async () => {
    const result = await service.setQuota(10, adminId, '198.51.100.5');
    expect(result.daily).toBe(10);
    expect(await redis.get(KEY_QUOTA)).toBe('10');

    await tick();
    const [evt] = await adminDb!
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, adminId));
    expect(evt.eventType).toBe('admin_set_registration_quota');
    expect(evt.ipAddress).toBe('198.51.100.5');
    expect((evt.metadata as { daily: number }).daily).toBe(10);
  });

  it('clears the quota when called with null', async () => {
    await redis.set(KEY_QUOTA, '5');
    const result = await service.setQuota(null, adminId);
    expect(result.daily).toBeNull();
    expect(await redis.get(KEY_QUOTA)).toBeNull();
  });

  it('rejects zero with a clear error', async () => {
    await expect(service.setQuota(0, adminId)).rejects.toThrow(/positive integer/);
  });

  it('rejects negative values', async () => {
    await expect(service.setQuota(-1, adminId)).rejects.toThrow(/positive integer/);
  });

  it('rejects non-integer (fractional) values', async () => {
    await expect(service.setQuota(2.5, adminId)).rejects.toThrow(/positive integer/);
  });
});

// ---------------------------------------------------------------------------
// checkAndIncrement
// ---------------------------------------------------------------------------

describe('checkAndIncrement', () => {
  it('always returns true and does NOT touch the counter when no quota is set', async () => {
    expect(await service.checkAndIncrement()).toBe(true);
    expect(await service.checkAndIncrement()).toBe(true);
    expect(await redis.get(todayKey())).toBeNull();
  });

  it('increments the daily counter up to the cap and returns true each time', async () => {
    await service.setQuota(3, adminId);
    expect(await service.checkAndIncrement()).toBe(true);
    expect(await service.checkAndIncrement()).toBe(true);
    expect(await service.checkAndIncrement()).toBe(true);
    expect(await redis.get(todayKey())).toBe('3');
  });

  it('returns false and rolls back the counter when the quota is exceeded', async () => {
    await service.setQuota(2, adminId);
    expect(await service.checkAndIncrement()).toBe(true);
    expect(await service.checkAndIncrement()).toBe(true);
    expect(await service.checkAndIncrement()).toBe(false);
    // The 3rd attempt was rolled back — counter still reflects 2 successes.
    expect(await redis.get(todayKey())).toBe('2');
  });

  it('sets a 48h TTL on the counter on first increment of the day', async () => {
    await service.setQuota(10, adminId);
    await service.checkAndIncrement();
    const ttl = await redis.ttl(todayKey());
    // 48h = 172800s — allow a generous lower bound for clock drift.
    expect(ttl).toBeGreaterThan(48 * 3600 - 10);
    expect(ttl).toBeLessThanOrEqual(48 * 3600);
  });

  it('does not reset the TTL on subsequent increments', async () => {
    await service.setQuota(10, adminId);
    await service.checkAndIncrement();
    const ttlAfterFirst = await redis.ttl(todayKey());
    await new Promise((r) => setTimeout(r, 1100)); // let at least 1s tick by
    await service.checkAndIncrement();
    const ttlAfterSecond = await redis.ttl(todayKey());
    expect(ttlAfterSecond).toBeLessThan(ttlAfterFirst);
  });
});
