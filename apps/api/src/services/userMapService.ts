/**
 * userMapService — persistence for the per-user campaign maps.
 *
 * Each map is one row in `maps` (markers + backgroundHash + settings + optional
 * owner_kind/owner_id linkage to a first-class entity, Phase 3). The image
 * bytes live in `portrait_blobs`, referenced via a `('map', mapId)` row in
 * `user_entity_portraits` — mapId is the entity_id, so per-map uploads don't
 * collide.
 *
 * Every op runs inside withUserContext so RLS confines the caller to their
 * own row. Callers hand raw user + map ids; the service handles all the SQL.
 */

import { sql } from 'drizzle-orm';
import { withUserContext } from '../db/index.js';

export interface MapMarker {
  id: string;
  /** Fractional world-unit coordinates on the square grid.
   *  See apps/web/src/lib/mapStore.svelte.ts::MapMarker for the client type. */
  x: number;
  y: number;
  label: string;
  icon: string;
  color?: string;
  entityId?: string;
}

/** Free-form per-map settings JSONB. Client owns the shape (see
 *  `apps/web/src/lib/mapStore.svelte.ts::MapServerSettings`). Kept typed as
 *  `Record<string, unknown>` here so the server doesn't couple to the
 *  client's evolving shape. */
export type MapSettingsBlob = Record<string, unknown>;

/** Summary row surfaced by the list endpoint — enough to render the picker
 *  chip without pulling the full markers array for every map. */
export interface MapSummary {
  id: string;
  name: string;
  sortOrder: number;
  ownerKind: string | null;
  ownerId: string | null;
  updatedAt: string; // ISO
}

/** Full map payload — summary fields plus markers/backgroundHash/settings. */
export interface UserMap extends MapSummary {
  markers: MapMarker[];
  /** md5 hash of the background image bytes, or null when no image is set. */
  backgroundHash: string | null;
  settings: MapSettingsBlob;
}

/** Map row shape as returned by the driver — snake_case columns. Extends
 *  `Record<string, unknown>` so it satisfies drizzle's execute<T> generic
 *  bound (which enforces an index signature on row types). */
type MapRow = Record<string, unknown> & {
  id: string;
  name: string;
  sort_order: number;
  owner_kind: string | null;
  owner_id: string | null;
  markers: MapMarker[] | null;
  background_hash: string | null;
  settings: MapSettingsBlob | null;
  updated_at: Date;
};

function rowToMap(row: MapRow): UserMap {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    ownerKind: row.owner_kind,
    ownerId: row.owner_id,
    markers: Array.isArray(row.markers) ? row.markers : [],
    backgroundHash: row.background_hash,
    settings: row.settings && typeof row.settings === 'object' ? row.settings : {},
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function rowToSummary(row: MapRow): MapSummary {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    ownerKind: row.owner_kind,
    ownerId: row.owner_id,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** Cap on maps per user — pragmatic guardrail against runaway loops or
 *  accidental spam. High enough that no real GM will hit it. */
export const MAX_MAPS_PER_USER = 50;

// ---------------------------------------------------------------------------
// List / create
// ---------------------------------------------------------------------------

/** List every map the caller owns, ordered for stable UI. */
export async function listMaps(userId: string): Promise<MapSummary[]> {
  return withUserContext(userId, async (tx) => {
    const rows = await tx.execute<MapRow>(sql`
      SELECT id, name, sort_order, owner_kind, owner_id, NULL AS markers,
             background_hash, NULL AS settings, updated_at
      FROM maps
      WHERE user_id = ${userId}::uuid
      ORDER BY sort_order ASC, updated_at DESC
    `);
    return Array.from(rows, rowToSummary);
  });
}

/** Count without pulling data — cheap gate for MAX_MAPS_PER_USER. */
export async function countMaps(userId: string): Promise<number> {
  return withUserContext(userId, async (tx) => {
    const rows = await tx.execute<{ count: number }>(sql`
      SELECT COUNT(*)::int AS count FROM maps WHERE user_id = ${userId}::uuid
    `);
    return rows[0]?.count ?? 0;
  });
}

export interface CreateMapInput {
  name?: string;
  ownerKind?: string | null;
  ownerId?: string | null;
}

/** Create a new map. Auto-assigns a sort_order at the end of the list. */
export async function createMap(userId: string, input: CreateMapInput = {}): Promise<UserMap> {
  return withUserContext(userId, async (tx) => {
    const name = input.name?.trim() || 'Untitled Map';
    const ownerKind = input.ownerKind ?? null;
    const ownerId = input.ownerId ?? null;
    // Next sort_order = max + 1; NULL-safe via COALESCE.
    const rows = await tx.execute<MapRow>(sql`
      WITH next_sort AS (
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS n
        FROM maps WHERE user_id = ${userId}::uuid
      )
      INSERT INTO maps (user_id, name, sort_order, owner_kind, owner_id)
      VALUES (
        ${userId}::uuid,
        ${name},
        (SELECT n FROM next_sort),
        ${ownerKind},
        ${ownerId}
      )
      RETURNING id, name, sort_order, owner_kind, owner_id,
                markers, background_hash, settings, updated_at
    `);
    const row = rows[0];
    if (!row) throw new Error('createMap: INSERT returned no row');
    return rowToMap(row);
  });
}

// ---------------------------------------------------------------------------
// Get / update / delete
// ---------------------------------------------------------------------------

/** Fetch one full map by id. Returns null when the id doesn't belong to
 *  the caller (RLS gate) or has been deleted. */
export async function getMap(userId: string, mapId: string): Promise<UserMap | null> {
  return withUserContext(userId, async (tx) => {
    const rows = await tx.execute<MapRow>(sql`
      SELECT id, name, sort_order, owner_kind, owner_id,
             markers, background_hash, settings, updated_at
      FROM maps
      WHERE user_id = ${userId}::uuid AND id = ${mapId}::uuid
      LIMIT 1
    `);
    const row = rows[0];
    return row ? rowToMap(row) : null;
  });
}

export interface UpdateMapInput {
  name?: string;
  sortOrder?: number;
}

/** Update a map's user-visible metadata (name + sort order). No-op with the
 *  current row returned when neither field is provided. */
export async function updateMap(
  userId: string,
  mapId: string,
  patch: UpdateMapInput,
): Promise<UserMap | null> {
  return withUserContext(userId, async (tx) => {
    await tx.execute(sql`
      UPDATE maps
      SET
        name = COALESCE(${patch.name ?? null}, name),
        sort_order = COALESCE(${patch.sortOrder ?? null}, sort_order),
        updated_at = now()
      WHERE user_id = ${userId}::uuid AND id = ${mapId}::uuid
    `);
    return getMap(userId, mapId);
  });
}

/** Hard-delete a map. The portrait blob is content-addressed and shared
 *  across maps (dedupe by md5), so we leave it — a future GC job can sweep
 *  unreferenced blobs. */
export async function deleteMap(userId: string, mapId: string): Promise<void> {
  await withUserContext(userId, async (tx) => {
    await tx.execute(sql`
      DELETE FROM maps
      WHERE user_id = ${userId}::uuid AND id = ${mapId}::uuid
    `);
  });
}

// ---------------------------------------------------------------------------
// Content mutations (markers / background / settings)
// ---------------------------------------------------------------------------

/** Replace the settings blob wholesale. */
export async function setSettings(
  userId: string,
  mapId: string,
  settings: MapSettingsBlob,
): Promise<UserMap | null> {
  return withUserContext(userId, async (tx) => {
    await tx.execute(sql`
      UPDATE maps
      SET settings = ${JSON.stringify(settings)}::jsonb, updated_at = now()
      WHERE user_id = ${userId}::uuid AND id = ${mapId}::uuid
    `);
    return getMap(userId, mapId);
  });
}

/** Replace the markers array wholesale. */
export async function putMarkers(
  userId: string,
  mapId: string,
  markers: MapMarker[],
): Promise<UserMap | null> {
  return withUserContext(userId, async (tx) => {
    await tx.execute(sql`
      UPDATE maps
      SET markers = ${JSON.stringify(markers)}::jsonb, updated_at = now()
      WHERE user_id = ${userId}::uuid AND id = ${mapId}::uuid
    `);
    return getMap(userId, mapId);
  });
}

/** Set the `background_hash` pointer (called by the portrait upload flow
 *  after it inserts the blob). */
export async function setBackgroundHash(
  userId: string,
  mapId: string,
  hash: string | null,
): Promise<UserMap | null> {
  return withUserContext(userId, async (tx) => {
    await tx.execute(sql`
      UPDATE maps
      SET background_hash = ${hash}, updated_at = now()
      WHERE user_id = ${userId}::uuid AND id = ${mapId}::uuid
    `);
    return getMap(userId, mapId);
  });
}

/** Wipe a single map's contents — markers + background pointer. The row
 *  itself stays; use deleteMap to remove the map entirely. */
export async function clearMap(userId: string, mapId: string): Promise<void> {
  await withUserContext(userId, async (tx) => {
    await tx.execute(sql`
      UPDATE maps
      SET markers = '[]'::jsonb, background_hash = NULL, updated_at = now()
      WHERE user_id = ${userId}::uuid AND id = ${mapId}::uuid
    `);
  });
}
