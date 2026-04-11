/**
 * Registration lock service — Redis-backed flag to prevent new user registration.
 *
 * Mirrors the maintenance service pattern. Keys:
 *   registration:locked  — "1" when new registrations are blocked
 *   registration:message — admin-provided message shown on the register page
 */

import { redis } from '../server.js';
import { adminDb } from '../db/index.js';
import { securityEvents } from '../db/schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegistrationLockStatus {
  locked:  boolean;
  message: string | null;
}

// ---------------------------------------------------------------------------
// Redis key constants
// ---------------------------------------------------------------------------

const KEY_LOCKED  = 'registration:locked';
const KEY_MESSAGE = 'registration:message';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get the current registration lock status (safe to call without auth). */
export async function getStatus(): Promise<RegistrationLockStatus> {
  const [locked, message] = await redis.mget(KEY_LOCKED, KEY_MESSAGE);
  return {
    locked:  locked === '1',
    message: message ?? null,
  };
}

/** Lock new registrations. */
export async function lockRegistration(
  message: string,
  adminId: string,
  ip?: string,
): Promise<RegistrationLockStatus> {
  await redis
    .pipeline()
    .set(KEY_LOCKED, '1')
    .set(KEY_MESSAGE, message)
    .exec();

  void logEvent(adminId, 'admin_lock_registration', { message }, ip);

  return { locked: true, message };
}

/** Unlock new registrations. */
export async function unlockRegistration(
  adminId: string,
  ip?: string,
): Promise<void> {
  await redis.del(KEY_LOCKED, KEY_MESSAGE);
  void logEvent(adminId, 'admin_unlock_registration', {}, ip);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function logEvent(
  adminId: string,
  eventType: string,
  metadata: Record<string, unknown>,
  ip?: string,
): Promise<void> {
  if (!adminDb) return;
  await adminDb.insert(securityEvents).values({
    userId:    adminId,
    eventType,
    ipAddress: ip ?? null,
    metadata,
  }).catch(console.error);
}
