/**
 * Retention — how long the security log keeps its rows, and clearing out
 * spent sign-in tokens.
 *
 * `security_events` holds IP addresses, browser user agents and, in some
 * rows' metadata, email addresses. The privacy notice (/privacy in the web
 * app) says they're kept for SECURITY_LOG_RETENTION_DAYS, so older rows are
 * pruned once at start-up and then daily. Every API process runs it; the
 * delete is idempotent, so two workers pruning at once is harmless.
 */
import { lt, or, and, isNotNull } from 'drizzle-orm';
import { adminDb } from '../db/index.js';
import { securityEvents, refreshTokens, authTokens } from '../db/schema.js';

/** Keep in step with the privacy notice (apps/web/src/routes/privacy). */
export const SECURITY_LOG_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Delete security-log rows older than the retention period. Returns how many. */
export async function pruneSecurityLog(now: Date = new Date()): Promise<number> {
  if (!adminDb) return 0;
  const cutoff = new Date(now.getTime() - SECURITY_LOG_RETENTION_DAYS * DAY_MS);
  const gone = await adminDb
    .delete(securityEvents)
    .where(lt(securityEvents.createdAt, cutoff))
    .returning({ id: securityEvents.id });
  return gone.length;
}

/**
 * Delete spent sign-in tokens: refresh tokens a day past expiry, and
 * verification / reset links a day past expiry or use. Nothing reads them
 * after that (an expired refresh token is refused either way), and each row
 * holds a user id and a timestamp. Returns how many went.
 */
export async function pruneSpentTokens(now: Date = new Date()): Promise<number> {
  if (!adminDb) return 0;
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const refresh = await adminDb
    .delete(refreshTokens)
    .where(lt(refreshTokens.expiresAt, dayAgo))
    .returning({ id: refreshTokens.id });
  const links = await adminDb
    .delete(authTokens)
    .where(
      or(
        lt(authTokens.expiresAt, dayAgo),
        and(isNotNull(authTokens.usedAt), lt(authTokens.usedAt, dayAgo)),
      ),
    )
    .returning({ id: authTokens.id });
  return refresh.length + links.length;
}

interface Logger {
  info: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

/** Prune now, then once a day. The timer doesn't keep the process alive. */
export function scheduleSecurityLogPruning(log: Logger): NodeJS.Timeout {
  const run = () =>
    Promise.all([pruneSecurityLog(), pruneSpentTokens()])
      .then(([events, tokens]) => {
        if (events > 0) log.info({ pruned: events }, 'Pruned old security-log rows');
        if (tokens > 0) log.info({ pruned: tokens }, 'Pruned spent sign-in tokens');
      })
      .catch((err: unknown) => log.error({ err }, 'Retention pruning failed'));
  void run();
  const timer = setInterval(run, DAY_MS);
  timer.unref();
  return timer;
}
