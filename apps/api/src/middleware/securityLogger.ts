/**
 * Security event logger.
 *
 * Writes to the security_events table. The app_user role can INSERT but
 * not SELECT or DELETE — so the audit trail cannot be tampered with via
 * the API even if the application is compromised.
 *
 * All writes are fire-and-forget: we never await the result in the request
 * path. A failed audit log write should not fail the user's request.
 *
 * Event types (expand as needed):
 *   login_success        — successful login
 *   login_failed         — wrong password or unknown email
 *   login_unverified     — correct password but email not verified
 *   register_success     — new account created
 *   email_verified       — email verification link used
 *   password_reset_req   — password reset email requested
 *   password_reset_done  — password successfully reset
 *   token_theft          — a revoked refresh token was presented
 *   token_refresh        — refresh token successfully rotated
 *   account_disabled     — login attempted on a deactivated account
 */

import { db } from '../db/index.js';
import { securityEvents } from '../db/schema.js';
import type { FastifyRequest } from 'fastify';

export type SecurityEventType =
  | 'login_success'
  | 'login_failed'
  | 'login_unverified'
  | 'register_success'
  | 'email_verified'
  | 'password_reset_req'
  | 'password_reset_done'
  | 'token_theft'
  | 'token_refresh'
  | 'account_disabled';

interface LogEventOptions {
  eventType:  SecurityEventType;
  req:        FastifyRequest;
  userId?:    string;
  metadata?:  Record<string, unknown>;
}

/**
 * Logs a security event. Fire-and-forget — never await this in a
 * request handler if you want to keep the response fast.
 *
 * Usage:
 *   logSecurityEvent({ eventType: 'login_failed', req, metadata: { email } });
 */
export function logSecurityEvent(opts: LogEventOptions): void {
  // Deliberately not awaited — failures are logged but don't affect the response
  void db
    .insert(securityEvents)
    .values({
      userId:    opts.userId,
      eventType: opts.eventType,
      ipAddress: req_ip(opts.req),
      userAgent: opts.req.headers['user-agent'] ?? null,
      metadata:  opts.metadata ?? null,
    })
    .catch((err: unknown) => {
      // Log to server log but don't throw — audit failure != request failure
      opts.req.log.error({ err }, 'Failed to write security event');
    });
}

// ---------------------------------------------------------------------------
// Helper — extract IP respecting the X-Forwarded-For header (set by Nginx)
// Fastify's req.ip already does this when trustProxy: true is set.
// ---------------------------------------------------------------------------

function req_ip(req: FastifyRequest): string {
  return req.ip;
}
