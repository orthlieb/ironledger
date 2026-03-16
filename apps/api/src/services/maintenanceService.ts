/**
 * Maintenance mode service — Redis-backed system maintenance state.
 *
 * Stores state in Redis so it's shared across horizontally scaled API instances.
 * Keys:
 *   maintenance:enabled    — "1" when maintenance is active
 *   maintenance:message    — admin-provided message string
 *   maintenance:shutdownAt — ISO timestamp when system goes down
 */

import { isNull, eq } from 'drizzle-orm';
import { redis } from '../server.js';
import { adminDb } from '../db/index.js';
import { refreshTokens, securityEvents } from '../db/schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MaintenanceStatus {
  enabled:    boolean;
  message:    string | null;
  shutdownAt: string | null;
}

// ---------------------------------------------------------------------------
// Redis key constants
// ---------------------------------------------------------------------------

const KEY_ENABLED     = 'maintenance:enabled';
const KEY_MESSAGE     = 'maintenance:message';
const KEY_SHUTDOWN_AT = 'maintenance:shutdownAt';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get the current maintenance status (safe to call without auth). */
export async function getStatus(): Promise<MaintenanceStatus> {
  const [enabled, message, shutdownAt] = await redis.mget(
    KEY_ENABLED,
    KEY_MESSAGE,
    KEY_SHUTDOWN_AT,
  );

  return {
    enabled:    enabled === '1',
    message:    message ?? null,
    shutdownAt: shutdownAt ?? null,
  };
}

/**
 * Enable maintenance mode.
 *
 * 1. Sets Redis keys so all API instances see the flag immediately.
 * 2. Revokes all non-admin refresh tokens to force logout when access tokens expire.
 * 3. Audit-logs the event.
 */
export async function enableMaintenance(
  message: string,
  minutesUntilShutdown: number,
  adminId: string,
  ip?: string,
): Promise<MaintenanceStatus> {
  const shutdownAt = new Date(Date.now() + minutesUntilShutdown * 60_000).toISOString();

  // Set Redis keys atomically via pipeline
  await redis
    .pipeline()
    .set(KEY_ENABLED, '1')
    .set(KEY_MESSAGE, message)
    .set(KEY_SHUTDOWN_AT, shutdownAt)
    .exec();

  // Revoke all active refresh tokens (forces logoff after access token expires)
  if (adminDb) {
    await adminDb
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(isNull(refreshTokens.revokedAt));
  }

  // Audit log
  void logMaintenanceEvent(adminId, 'admin_enable_maintenance', {
    message,
    minutesUntilShutdown,
    shutdownAt,
  }, ip);

  return { enabled: true, message, shutdownAt };
}

/** Disable maintenance mode — clears all Redis keys. */
export async function disableMaintenance(
  adminId: string,
  ip?: string,
): Promise<void> {
  await redis.del(KEY_ENABLED, KEY_MESSAGE, KEY_SHUTDOWN_AT);

  // Audit log
  void logMaintenanceEvent(adminId, 'admin_disable_maintenance', {}, ip);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function logMaintenanceEvent(
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
