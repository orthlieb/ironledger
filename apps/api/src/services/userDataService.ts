/**
 * User-data service — get/upsert the global (non-character) game state.
 *
 * Stores encounters, expeditions, and session state as JSONB in a single row
 * per user. The row is created on first write (upsert pattern).
 */

import { withUserContext } from '../db/index.js';
import { userData } from '../db/schema.js';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionState {
  charId: string;
  foeId: string;
  expeditionId: string;
  activeTab?: string;
}

export interface UserDataPayload {
  encounters: unknown[];
  expeditions: unknown[];
  communities: unknown[];
  npcs: unknown[];
  sessionState: SessionState;
}

const DEFAULT_SESSION_STATE: SessionState = {
  charId: '',
  foeId: '',
  expeditionId: '',
  activeTab: '',
};

// ---------------------------------------------------------------------------
// get — return the user's global data (or defaults if row doesn't exist)
// ---------------------------------------------------------------------------

export async function get(userId: string): Promise<UserDataPayload> {
  const rows = await withUserContext(userId, async (tx) => {
    return tx.select().from(userData).limit(1);
  });

  if (rows.length === 0) {
    return {
      encounters: [],
      expeditions: [],
      communities: [],
      npcs: [],
      sessionState: DEFAULT_SESSION_STATE,
    };
  }

  // JSONB columns can round-trip as `{}` on rows written before the columns
  // had an array default (or after manual intervention). `?? []` does not
  // rescue a non-null object, so guard explicitly with Array.isArray.
  const row = rows[0]!;
  const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

  return {
    encounters: asArray(row.encounters),
    expeditions: asArray(row.expeditions),
    communities: asArray(row.communities),
    npcs: asArray(row.npcs),
    sessionState: (row.sessionState as SessionState) ?? DEFAULT_SESSION_STATE,
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
      INSERT INTO user_data (user_id, encounters, expeditions, communities, npcs, session_state, updated_at)
      VALUES (
        ${userId}::uuid,
        ${JSON.stringify(patch.encounters ?? [])}::jsonb,
        ${JSON.stringify(patch.expeditions ?? [])}::jsonb,
        ${JSON.stringify(patch.communities ?? [])}::jsonb,
        ${JSON.stringify(patch.npcs ?? [])}::jsonb,
        ${JSON.stringify(patch.sessionState ?? {})}::jsonb,
        now()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        encounters    = COALESCE(
          CASE WHEN ${patch.encounters !== undefined} THEN ${JSON.stringify(patch.encounters ?? [])}::jsonb END,
          user_data.encounters
        ),
        expeditions   = COALESCE(
          CASE WHEN ${patch.expeditions !== undefined} THEN ${JSON.stringify(patch.expeditions ?? [])}::jsonb END,
          user_data.expeditions
        ),
        communities   = COALESCE(
          CASE WHEN ${patch.communities !== undefined} THEN ${JSON.stringify(patch.communities ?? [])}::jsonb END,
          user_data.communities
        ),
        npcs          = COALESCE(
          CASE WHEN ${patch.npcs !== undefined} THEN ${JSON.stringify(patch.npcs ?? [])}::jsonb END,
          user_data.npcs
        ),
        session_state = COALESCE(
          CASE WHEN ${patch.sessionState !== undefined} THEN ${JSON.stringify(patch.sessionState ?? {})}::jsonb END,
          user_data.session_state
        ),
        updated_at    = now()
    `);
  });

  return get(userId);
}
