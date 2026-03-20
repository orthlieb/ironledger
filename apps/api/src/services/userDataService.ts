/**
 * User-data service — get/upsert the global (non-character) game state.
 *
 * Stores encounters and expeditions as JSONB in a single row per user.
 * The row is created on first write (upsert pattern).
 */

import { withUserContext } from '../db/index.js';
import { userData } from '../db/schema.js';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserDataPayload {
  encounters:  unknown[];
  expeditions: unknown[];
}

// ---------------------------------------------------------------------------
// get — return the user's global data (or defaults if row doesn't exist)
// ---------------------------------------------------------------------------

export async function get(userId: string): Promise<UserDataPayload> {
  const rows = await withUserContext(userId, async (tx) => {
    return tx.select().from(userData).limit(1);
  });

  if (rows.length === 0) {
    return { encounters: [], expeditions: [] };
  }

  return {
    encounters:  (rows[0]!.encounters  as unknown[]) ?? [],
    expeditions: (rows[0]!.expeditions as unknown[]) ?? [],
  };
}

// ---------------------------------------------------------------------------
// upsert — create or update the user's global data
// ---------------------------------------------------------------------------

export async function upsert(
  userId: string,
  patch: Partial<UserDataPayload>,
): Promise<UserDataPayload> {
  await withUserContext(userId, async (tx) => {
    await tx.execute(sql`
      INSERT INTO user_data (user_id, encounters, expeditions, updated_at)
      VALUES (
        ${userId}::uuid,
        ${JSON.stringify(patch.encounters  ?? [])}::jsonb,
        ${JSON.stringify(patch.expeditions ?? [])}::jsonb,
        now()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        encounters  = COALESCE(
          CASE WHEN ${patch.encounters  !== undefined} THEN ${JSON.stringify(patch.encounters  ?? [])}::jsonb END,
          user_data.encounters
        ),
        expeditions = COALESCE(
          CASE WHEN ${patch.expeditions !== undefined} THEN ${JSON.stringify(patch.expeditions ?? [])}::jsonb END,
          user_data.expeditions
        ),
        updated_at  = now()
    `);
  });

  return get(userId);
}
