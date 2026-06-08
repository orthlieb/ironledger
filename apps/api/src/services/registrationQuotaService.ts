/**
 * Registration quota service — Redis-backed daily signup limit.
 *
 * Throttles new user registrations so an open site doesn't get swamped by
 * a sudden flood. Independent of the registration-lock admin toggle:
 *   • Lock   = admin manually closes registration (indefinite)
 *   • Quota  = rate-control per UTC day, auto-resets at midnight UTC
 *
 * Redis keys:
 *   registration:daily_quota     — integer string, or missing = unlimited
 *   registration:count:YYYY-MM-DD — counter, incremented per successful
 *                                   registration, 48h TTL (auto-prune)
 *
 * UTC day is used so the reset anchor is stable regardless of server locale.
 */

import { redis } from '../server.js';
import { adminDb } from '../db/index.js';
import { securityEvents } from '../db/schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegistrationQuotaStatus {
  /** null when unlimited. Integer 1..N when capped. */
  daily: number | null;
  /** Number of successful registrations so far today (UTC). */
  usedToday: number;
  /** null when unlimited, else `max(0, daily - usedToday)`. */
  remaining: number | null;
  /** ISO timestamp of the next UTC midnight. */
  resetsAt: string;
  /** True if a quota is configured AND it has been hit for today. */
  exhausted: boolean;
}

// ---------------------------------------------------------------------------
// Redis keys
// ---------------------------------------------------------------------------

const KEY_QUOTA = 'registration:daily_quota';

/** Today's counter key, keyed by UTC day. */
function countKey(d: Date = new Date()): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `registration:count:${yyyy}-${mm}-${dd}`;
}

/** The next UTC midnight as an ISO string. */
function nextUtcMidnightIso(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Full status snapshot. Safe to call without auth. */
export async function getStatus(): Promise<RegistrationQuotaStatus> {
  const [quotaRaw, countRaw] = await redis.mget(KEY_QUOTA, countKey());

  const daily = quotaRaw ? parsePositiveInt(quotaRaw) : null;
  const usedToday = countRaw ? (parsePositiveInt(countRaw) ?? 0) : 0;
  const remaining = daily !== null ? Math.max(0, daily - usedToday) : null;

  return {
    daily,
    usedToday,
    remaining,
    resetsAt: nextUtcMidnightIso(),
    exhausted: daily !== null && usedToday >= daily,
  };
}

/**
 * Set the daily quota. Pass null (or omit) to clear / make unlimited.
 * Integer > 0 when capping.
 */
export async function setQuota(
  daily: number | null,
  adminId: string,
  ip?: string,
): Promise<RegistrationQuotaStatus> {
  if (daily === null) {
    await redis.del(KEY_QUOTA);
  } else {
    if (!Number.isInteger(daily) || daily < 1) {
      throw new Error('Daily quota must be a positive integer or null.');
    }
    await redis.set(KEY_QUOTA, String(daily));
  }

  void logEvent(adminId, 'admin_set_registration_quota', { daily }, ip);
  return getStatus();
}

/**
 * Atomically check-and-increment the daily counter.
 *
 * Returns `true` if the registration is allowed (counter was incremented),
 * `false` if the quota has been hit for today. Call this AFTER every
 * successful user insert — if it returns false the caller should reject
 * the request before sending a verification email.
 *
 * The TTL on the counter key is set to 48h on first increment of the day
 * so old day-keys auto-prune. Using 48h (not 24h) gives a safety buffer
 * around the midnight boundary.
 */
export async function checkAndIncrement(): Promise<boolean> {
  const quotaRaw = await redis.get(KEY_QUOTA);
  const quota = quotaRaw ? parsePositiveInt(quotaRaw) : null;

  // Unlimited — always allow, don't bother counting.
  if (quota === null) return true;

  const key = countKey();
  const count = await redis.incr(key);
  // Set TTL on first increment of the day. EXPIRE is a no-op if TTL
  // already exists (NX flag), so later increments don't reset it.
  if (count === 1) {
    await redis.expire(key, 48 * 3600);
  }

  if (count > quota) {
    // Roll back the increment so the counter reflects reality (i.e. only
    // successful registrations). Otherwise repeated rejections would
    // inflate the counter without bound.
    await redis.decr(key);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePositiveInt(s: string): number | null {
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

async function logEvent(
  adminId: string,
  eventType: string,
  metadata: Record<string, unknown>,
  ip?: string,
): Promise<void> {
  if (!adminDb) return;
  await adminDb
    .insert(securityEvents)
    .values({
      userId: adminId,
      eventType,
      ipAddress: ip ?? null,
      metadata,
    })
    .catch(console.error);
}
