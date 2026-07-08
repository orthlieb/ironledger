/**
 * User-data service — get/upsert the global (non-character) game state.
 *
 * Stores encounters, expeditions, and session state as JSONB in a single row
 * per user. The row is created on first write (upsert pattern).
 */

import { withUserContext } from '../db/index.js';
import { userData } from '../db/schema.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

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
  places: unknown[];
  sessionState: SessionState;
}

const DEFAULT_SESSION_STATE: SessionState = {
  charId: '',
  foeId: '',
  expeditionId: '',
  activeTab: '',
};

// ---------------------------------------------------------------------------
// Entity kinds — the four session collections, now stored one row per entity
// in user_entities (see migration 0013). The plural route segment maps to the
// singular `kind` column value.
// ---------------------------------------------------------------------------

export type EntityKind = 'encounter' | 'expedition' | 'community' | 'npc' | 'place';

export const KIND_BY_SEGMENT: Record<string, EntityKind> = {
  encounters: 'encounter',
  expeditions: 'expedition',
  communities: 'community',
  npcs: 'npc',
  places: 'place',
};

/** Read all entities of one kind for a user, in insertion order. */
async function listKind(
  tx: Parameters<Parameters<typeof withUserContext>[1]>[0],
  userId: string,
  kind: EntityKind,
): Promise<unknown[]> {
  const rows = await tx.execute(sql`
    SELECT entity FROM user_entities
    WHERE user_id = ${userId}::uuid AND kind = ${kind}
    ORDER BY seq
  `);
  return (rows as unknown as Array<{ entity: unknown }>).map((r) => r.entity);
}

// ---------------------------------------------------------------------------
// get — return the user's global data (collections from user_entities, the
// active-selection state from user_data). Missing rows → empty defaults.
// ---------------------------------------------------------------------------

export async function get(userId: string): Promise<UserDataPayload> {
  return withUserContext(userId, async (tx) => {
    // Sequential awaits: postgres-js serialises queries on a single
    // transaction connection, so don't Promise.all these.
    const encounters = await listKind(tx, userId, 'encounter');
    const expeditions = await listKind(tx, userId, 'expedition');
    const communities = await listKind(tx, userId, 'community');
    const npcs = await listKind(tx, userId, 'npc');
    const places = await listKind(tx, userId, 'place');

    const stateRows = await tx.select().from(userData).limit(1);
    const sessionState = (stateRows[0]?.sessionState as SessionState) ?? DEFAULT_SESSION_STATE;

    return { encounters, expeditions, communities, npcs, places, sessionState };
  });
}

// ---------------------------------------------------------------------------
// Per-entity CRUD — one row per entity so a single create/update/delete
// travels in its own request, independent of collection size.
// ---------------------------------------------------------------------------

/** Number of entities of a kind — used to enforce per-user caps on create. */
export async function countEntities(userId: string, kind: EntityKind): Promise<number> {
  const rows = await withUserContext(userId, async (tx) =>
    tx.execute(sql`
      SELECT count(*)::int AS n FROM user_entities
      WHERE user_id = ${userId}::uuid AND kind = ${kind}
    `),
  );
  return (rows as unknown as Array<{ n: number }>)[0]?.n ?? 0;
}

/** Insert or update a single entity (matched by client id within the kind). */
export async function upsertEntity(
  userId: string,
  kind: EntityKind,
  entityId: string,
  entity: unknown,
): Promise<void> {
  await withUserContext(userId, async (tx) => {
    await tx.execute(sql`
      INSERT INTO user_entities (user_id, kind, entity_id, entity)
      VALUES (${userId}::uuid, ${kind}, ${entityId}, ${JSON.stringify(entity)}::jsonb)
      ON CONFLICT (user_id, kind, entity_id) DO UPDATE
        SET entity = EXCLUDED.entity, updated_at = now()
    `);
  });
}

/** Remove a single entity. */
export async function deleteEntity(
  userId: string,
  kind: EntityKind,
  entityId: string,
): Promise<void> {
  await withUserContext(userId, async (tx) => {
    await tx.execute(sql`
      DELETE FROM user_entities
      WHERE user_id = ${userId}::uuid AND kind = ${kind} AND entity_id = ${entityId}
    `);
  });
}

/** Replace the whole collection of a kind in one transaction (delete-all then
 *  re-insert). Backs the array-style PATCH used by reset/seed/import-replace. */
export async function replaceEntities(
  userId: string,
  kind: EntityKind,
  items: Array<Record<string, unknown>>,
): Promise<void> {
  await withUserContext(userId, async (tx) => {
    await tx.execute(sql`
      DELETE FROM user_entities WHERE user_id = ${userId}::uuid AND kind = ${kind}
    `);
    for (const item of items) {
      const entityId = typeof item.id === 'string' && item.id ? item.id : randomUUID();
      await tx.execute(sql`
        INSERT INTO user_entities (user_id, kind, entity_id, entity)
        VALUES (${userId}::uuid, ${kind}, ${entityId}, ${JSON.stringify(item)}::jsonb)
        ON CONFLICT (user_id, kind, entity_id) DO UPDATE
          SET entity = EXCLUDED.entity, updated_at = now()
      `);
    }
  });
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
