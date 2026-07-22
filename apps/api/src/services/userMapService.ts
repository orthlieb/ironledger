/**
 * userMapService — persistence for the per-user campaign map.
 *
 * A map is one row in `user_maps` (markers + backgroundHash) plus (optionally)
 * one blob in `portrait_blobs` for the background image, referenced via the
 * `('map', MAP_ENTITY_ID)` row in `user_entity_portraits`. Reusing the
 * portrait blob store means dedupe, GC, RLS, and the entire ETag / upload
 * plumbing are inherited for free — a map is just "one more portrait kind"
 * plus a small JSON row.
 *
 * Every op runs inside withUserContext so RLS confines the caller to their
 * own row. Callers hand raw user ids; the service handles all the SQL.
 */

import { sql } from 'drizzle-orm';
import { withUserContext } from '../db/index.js';

export interface MapMarker {
  id: string;
  q: number;
  r: number;
  label: string;
  icon: string;
  entityId?: string;
}

export interface UserMap {
  markers: MapMarker[];
  /** md5 hash of the background image bytes, or null when no image is set.
   *  Client uses this as the cache-buster in <img src=".../background?v=hash">. */
  backgroundHash: string | null;
  updatedAt: string; // ISO
}

const EMPTY: UserMap = { markers: [], backgroundHash: null, updatedAt: new Date(0).toISOString() };

/** Fetch the caller's map. Returns EMPTY when the user has no row yet — GETs
 *  never 404 for the map endpoint, matching how getSessionState behaves. */
export async function getMap(userId: string): Promise<UserMap> {
  return withUserContext(userId, async (tx) => {
    const rows = await tx.execute<{
      markers: MapMarker[];
      background_hash: string | null;
      updated_at: Date;
    }>(sql`
      SELECT markers, background_hash, updated_at
      FROM user_maps
      WHERE user_id = ${userId}::uuid
      LIMIT 1
    `);
    const row = rows.rows?.[0] ?? rows[0];
    if (!row) return EMPTY;
    return {
      markers: Array.isArray(row.markers) ? row.markers : [],
      backgroundHash: row.background_hash,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  });
}

/** Replace the markers array wholesale. Simplest atomic operation — the
 *  client always sends its current full array. Upserts the row if missing. */
export async function putMarkers(userId: string, markers: MapMarker[]): Promise<UserMap> {
  return withUserContext(userId, async (tx) => {
    await tx.execute(sql`
      INSERT INTO user_maps (user_id, markers, updated_at)
      VALUES (${userId}::uuid, ${JSON.stringify(markers)}::jsonb, now())
      ON CONFLICT (user_id) DO UPDATE
        SET markers = EXCLUDED.markers, updated_at = now()
    `);
    return getMap(userId);
  });
}

/** Set the `background_hash` pointer (called by the portrait upload flow
 *  after it inserts the blob). Upserts the row if missing. */
export async function setBackgroundHash(userId: string, hash: string | null): Promise<UserMap> {
  return withUserContext(userId, async (tx) => {
    await tx.execute(sql`
      INSERT INTO user_maps (user_id, background_hash, updated_at)
      VALUES (${userId}::uuid, ${hash}, now())
      ON CONFLICT (user_id) DO UPDATE
        SET background_hash = EXCLUDED.background_hash, updated_at = now()
    `);
    return getMap(userId);
  });
}

/** Wipe everything — markers + background pointer. The portrait blob itself
 *  isn't collected here; run whatever blob-GC is scheduled elsewhere (there
 *  isn't one yet, but content-addressed blobs are safe to leave). */
export async function clearMap(userId: string): Promise<void> {
  await withUserContext(userId, async (tx) => {
    await tx.execute(sql`
      UPDATE user_maps
      SET markers = '[]'::jsonb, background_hash = NULL, updated_at = now()
      WHERE user_id = ${userId}::uuid
    `);
  });
}
