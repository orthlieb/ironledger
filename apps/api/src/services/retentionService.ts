/**
 * Retention — how long the security log keeps its rows.
 *
 * `security_events` holds IP addresses, browser user agents and, in some
 * rows' metadata, email addresses. The privacy notice (/privacy in the web
 * app) says they're kept for SECURITY_LOG_RETENTION_DAYS, so older rows are
 * pruned once at start-up and then daily. Every API process runs it; the
 * delete is idempotent, so two workers pruning at once is harmless.
 */
import { lt } from 'drizzle-orm';
import { adminDb } from '../db/index.js';
import { securityEvents } from '../db/schema.js';

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

interface Logger {
  info: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

/** Prune now, then once a day. The timer doesn't keep the process alive. */
export function scheduleSecurityLogPruning(log: Logger): NodeJS.Timeout {
  const run = () =>
    pruneSecurityLog()
      .then((n) => {
        if (n > 0) log.info({ pruned: n }, 'Pruned old security-log rows');
      })
      .catch((err: unknown) => log.error({ err }, 'Security-log pruning failed'));
  void run();
  const timer = setInterval(run, DAY_MS);
  timer.unref();
  return timer;
}
