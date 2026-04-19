/**
 * Broadcast banner service — Redis-backed admin announcement.
 *
 * Renders a dismissible banner for all users. Unlike maintenanceService:
 *   • does NOT revoke refresh tokens
 *   • does NOT block login
 *   • dismissal is per-user (client-side localStorage keyed on postedAt)
 *
 * Redis keys (shared across API instances):
 *   broadcast:active    — "1" when the banner is shown
 *   broadcast:message   — admin-provided string
 *   broadcast:severity  — "info" | "warning"
 *   broadcast:postedAt  — ISO timestamp (dismissal key — a new postedAt
 *                         invalidates everyone's prior dismissal)
 */

import { redis } from '../server.js';
import { adminDb } from '../db/index.js';
import { securityEvents } from '../db/schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BroadcastSeverity = 'info' | 'warning';

export interface BroadcastStatus {
  active:   boolean;
  message:  string | null;
  severity: BroadcastSeverity;
  postedAt: string | null;
}

// ---------------------------------------------------------------------------
// Redis key constants
// ---------------------------------------------------------------------------

const KEY_ACTIVE    = 'broadcast:active';
const KEY_MESSAGE   = 'broadcast:message';
const KEY_SEVERITY  = 'broadcast:severity';
const KEY_POSTED_AT = 'broadcast:postedAt';

function parseSeverity(raw: string | null | undefined): BroadcastSeverity {
  return raw === 'warning' ? 'warning' : 'info';   // default + unknown → info
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get the current broadcast status (safe to call without auth). */
export async function getStatus(): Promise<BroadcastStatus> {
  const [active, message, severity, postedAt] = await redis.mget(
    KEY_ACTIVE,
    KEY_MESSAGE,
    KEY_SEVERITY,
    KEY_POSTED_AT,
  );

  return {
    active:   active === '1',
    message:  message  ?? null,
    severity: parseSeverity(severity),
    postedAt: postedAt ?? null,
  };
}

/**
 * Post or update the banner. A new postedAt is always written, so previously
 * dismissed clients re-show the banner — the admin's intent is that every
 * edit is a new message.
 */
export async function postBroadcast(
  message:  string,
  severity: BroadcastSeverity,
  adminId:  string,
  ip?:      string,
): Promise<BroadcastStatus> {
  const postedAt = new Date().toISOString();

  await redis
    .pipeline()
    .set(KEY_ACTIVE,    '1')
    .set(KEY_MESSAGE,   message)
    .set(KEY_SEVERITY,  severity)
    .set(KEY_POSTED_AT, postedAt)
    .exec();

  void logBroadcastEvent(adminId, 'admin_post_broadcast', { message, severity, postedAt }, ip);

  return { active: true, message, severity, postedAt };
}

/** Clear the banner — all keys deleted. */
export async function clearBroadcast(
  adminId: string,
  ip?:     string,
): Promise<void> {
  await redis.del(KEY_ACTIVE, KEY_MESSAGE, KEY_SEVERITY, KEY_POSTED_AT);
  void logBroadcastEvent(adminId, 'admin_clear_broadcast', {}, ip);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function logBroadcastEvent(
  adminId:   string,
  eventType: string,
  metadata:  Record<string, unknown>,
  ip?:       string,
): Promise<void> {
  if (!adminDb) return;
  await adminDb.insert(securityEvents).values({
    userId:    adminId,
    eventType,
    ipAddress: ip ?? null,
    metadata,
  }).catch(console.error);
}
