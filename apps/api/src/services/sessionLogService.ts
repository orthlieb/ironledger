/**
 * Session log service — append-only log of game events, one DB row per entry.
 *
 * Each row stores a single LogEntry as JSONB so the shape can grow without
 * migrations. occurred_at is a real column so we can paginate efficiently.
 *
 * A rolling cap of LOG_CAP entries is enforced on every append: after the
 * INSERT the oldest entry beyond the cap is deleted in the same transaction.
 */

import { withUserContext } from '../db/index.js';
import { sql } from 'drizzle-orm';

const LOG_CAP = 1000;

// ---------------------------------------------------------------------------
// Types (mirror LogEntry from the web app)
// ---------------------------------------------------------------------------

export interface LogEntryPayload {
  id:      string;
  title:   string;
  html:    string;
  ts:      string;
  note?:   string;
  source?: string;
  roll?:   unknown;
}

// ---------------------------------------------------------------------------
// getLog — newest-first, cursor pagination via `before` ISO timestamp
// ---------------------------------------------------------------------------

export async function getLog(
  userId: string,
  limit = 100,
  before?: string,
): Promise<LogEntryPayload[]> {
  const rows = await withUserContext(userId, async (tx) => {
    if (before) {
      return tx.execute(sql`
        SELECT entry FROM session_log_entries
        WHERE user_id = ${userId}::uuid
          AND occurred_at < ${before}::timestamptz
        ORDER BY occurred_at DESC
        LIMIT ${limit}
      `);
    }
    return tx.execute(sql`
      SELECT entry FROM session_log_entries
      WHERE user_id = ${userId}::uuid
      ORDER BY occurred_at DESC
      LIMIT ${limit}
    `);
  });

  return (rows as unknown as Array<{ entry: LogEntryPayload }>).map((r) => r.entry);
}

// ---------------------------------------------------------------------------
// appendEntry — insert one entry, then trim to rolling cap
// ---------------------------------------------------------------------------

export async function appendEntry(
  userId: string,
  payload: LogEntryPayload,
): Promise<void> {
  await withUserContext(userId, async (tx) => {
    // Insert (idempotent — ON CONFLICT DO NOTHING handles duplicate entry_id)
    await tx.execute(sql`
      INSERT INTO session_log_entries (user_id, entry_id, entry, occurred_at)
      VALUES (
        ${userId}::uuid,
        ${payload.id},
        ${JSON.stringify(payload)}::jsonb,
        ${payload.ts}::timestamptz
      )
      ON CONFLICT (user_id, entry_id) DO NOTHING
    `);

    // Rolling cap: delete any entries beyond the newest LOG_CAP
    await tx.execute(sql`
      DELETE FROM session_log_entries
      WHERE user_id = ${userId}::uuid
        AND entry_id NOT IN (
          SELECT entry_id
          FROM   session_log_entries
          WHERE  user_id = ${userId}::uuid
          ORDER  BY occurred_at DESC
          LIMIT  ${LOG_CAP}
        )
    `);
  });
}

// ---------------------------------------------------------------------------
// updateEntry — merge a patch object into the entry JSONB
// ---------------------------------------------------------------------------

export async function updateEntry(
  userId: string,
  entryId: string,
  patch: Partial<LogEntryPayload>,
): Promise<void> {
  await withUserContext(userId, async (tx) => {
    await tx.execute(sql`
      UPDATE session_log_entries
      SET    entry = entry || ${JSON.stringify(patch)}::jsonb
      WHERE  user_id  = ${userId}::uuid
        AND  entry_id = ${entryId}
    `);
  });
}

// ---------------------------------------------------------------------------
// deleteEntry — remove a single entry
// ---------------------------------------------------------------------------

export async function deleteEntry(
  userId: string,
  entryId: string,
): Promise<void> {
  await withUserContext(userId, async (tx) => {
    await tx.execute(sql`
      DELETE FROM session_log_entries
      WHERE user_id  = ${userId}::uuid
        AND entry_id = ${entryId}
    `);
  });
}

// ---------------------------------------------------------------------------
// clearLog — wipe all entries for a user
// ---------------------------------------------------------------------------

export async function clearLog(userId: string): Promise<void> {
  await withUserContext(userId, async (tx) => {
    await tx.execute(sql`
      DELETE FROM session_log_entries
      WHERE user_id = ${userId}::uuid
    `);
  });
}
