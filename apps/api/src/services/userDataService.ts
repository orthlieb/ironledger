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
  /** Currently-open map id from the Campaign Map dialog. Server-owned
   *  so the same map opens on every device. Null/absent = "open the
   *  first map" fallback. */
  activeMapId?: string | null;
  /** The user's extension choices (see ExtensionChoices). Written only
   *  through patchExtensions, so a session-state save leaves it alone. */
  extensions?: ExtensionChoices;
}

/** Which extensions a user has turned on or off, by extension id. An id
 *  missing from the map takes the extension's own `defaultEnabled`. Kept
 *  per user (in user_data.session_state), so every device agrees. */
export type ExtensionChoices = Record<string, boolean>;

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

/**
 * Batch-upsert N entities of the same kind in ONE transaction. Unlike
 * `replaceEntities`, this is NON-destructive — it only touches the ids
 * supplied and leaves everything else alone. Backs the client-side
 * `addMany` import path that trades N serial POST / PATCH round-trips
 * for one PUT, keeping big imports comfortably under the per-user rate
 * limit even without further bumps.
 */
export async function upsertEntities(
  userId: string,
  kind: EntityKind,
  entities: Array<Record<string, unknown>>,
): Promise<void> {
  if (entities.length === 0) return;
  await withUserContext(userId, async (tx) => {
    for (const item of entities) {
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
        -- Merged, not replaced: the keys a save carries win, and the
        -- rest (the extension choices) stay.
        session_state = COALESCE(
          CASE WHEN ${patch.sessionState !== undefined}
            THEN user_data.session_state || ${JSON.stringify(patch.sessionState ?? {})}::jsonb END,
          user_data.session_state
        ),
        updated_at    = now()
    `);
  });

  return get(userId);
}

// ---------------------------------------------------------------------------
// Extension choices — session_state.extensions, read and written on their own
// so the toggles follow the user rather than the browser.
// ---------------------------------------------------------------------------

/** Only string keys with boolean values: anything else in the column (a
 *  hand edit, an older shape) is dropped rather than trusted. */
function cleanChoices(v: unknown): ExtensionChoices {
  const out: ExtensionChoices = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, on] of Object.entries(v as Record<string, unknown>))
    if (typeof on === 'boolean') out[k] = on;
  return out;
}

/** The user's extension choices; {} before they've made any. */
export async function getExtensions(userId: string): Promise<ExtensionChoices> {
  const rows = await withUserContext(userId, async (tx) =>
    tx.execute(sql`
      SELECT session_state->'extensions' AS ext FROM user_data
      WHERE user_id = ${userId}::uuid
    `),
  );
  return cleanChoices((rows as unknown as Array<{ ext: unknown }>)[0]?.ext);
}

/**
 * Set some of the user's extension choices: true / false sets one, null
 * clears it back to the extension's default. Ids not in `patch` keep
 * their choice, so two devices toggling different extensions don't undo
 * each other. Returns the choices after the write.
 */
export async function patchExtensions(
  userId: string,
  patch: Record<string, boolean | null>,
): Promise<ExtensionChoices> {
  const json = JSON.stringify(patch);
  await withUserContext(userId, async (tx) => {
    await tx.execute(sql`
      INSERT INTO user_data (user_id, session_state, updated_at)
      VALUES (
        ${userId}::uuid,
        jsonb_build_object('extensions', jsonb_strip_nulls(${json}::jsonb)),
        now()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        session_state = jsonb_set(
          user_data.session_state,
          '{extensions}',
          jsonb_strip_nulls(
            COALESCE(user_data.session_state->'extensions', '{}'::jsonb) || ${json}::jsonb
          )
        ),
        updated_at = now()
    `);
  });
  return getExtensions(userId);
}
