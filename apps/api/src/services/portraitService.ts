/**
 * Portrait service — content-addressed blob storage for entity portraits.
 *
 * Portraits used to live inline as base64 data URLs inside the session/character
 * JSON, bloating every list payload. They now live as raw bytes in two tables
 * (see migration 0014):
 *
 *   portrait_blobs        (user_id, hash) → mime, bytes   — the bytes, once per
 *                                                            (user, content hash)
 *   user_entity_portraits (user_id, kind, entity_id) → hash — a thin reference
 *
 * Storing by content hash means importing the same image onto several entities
 * (or re-importing an export) collapses to a single blob row. The hash is
 * md5(bytes) — the same value Postgres computes in the 0014 backfill — and is
 * surfaced to clients as the HTTP ETag / `portraitEtag`.
 *
 * Every operation runs through withUserContext() so RLS confines a user to
 * their own rows.
 */

import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { withUserContext } from '../db/index.js';
import { MAX_IMAGE_DATA_URL_LEN } from '../lib/imageUrl.js';
import type { EntityKind } from './userDataService.js';

// 'character' joins the four session-collection kinds — character portraits use
// the same store, keyed by the character's uuid as entity_id. 'map' reuses the
// same store for the single per-user campaign map background; its entity_id
// is fixed at MAP_ENTITY_ID (see below) since there's only one map per user.
export type PortraitKind = EntityKind | 'character' | 'map';

/** Fixed entity_id for the per-user campaign map background. Reuses
 *  user_entity_portraits (which requires a non-null entity_id) even though
 *  the map is a singleton — one row per (user_id, 'map', 'MAP'). */
export const MAP_ENTITY_ID = 'MAP';

export interface Portrait {
  mime: string;
  bytes: Buffer;
  etag: string;
}

/** A base64 image data URL: data:image/<png|jpeg|webp|gif>;base64,<payload> */
const DATA_URL_RE = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

export class PortraitError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'PortraitError';
  }
}

/** Decode a data URL into { mime, bytes, hash }, or throw PortraitError(400). */
function decodeDataUrl(dataUrl: unknown): { mime: string; bytes: Buffer; hash: string } {
  if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
    throw new PortraitError('Portrait payload is required');
  }
  if (dataUrl.length > MAX_IMAGE_DATA_URL_LEN) {
    throw new PortraitError('Portrait exceeds the maximum allowed size');
  }
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) {
    throw new PortraitError('Portrait must be a base64 image data URL (png, jpeg, webp, or gif)');
  }
  const mime = m[1]!;
  const bytes = Buffer.from(m[2]!, 'base64');
  if (bytes.length === 0) throw new PortraitError('Portrait payload is empty');
  const hash = createHash('md5').update(bytes).digest('hex');
  return { mime, bytes, hash };
}

// ---------------------------------------------------------------------------
// get — resolve an entity's portrait bytes via its blob reference
// ---------------------------------------------------------------------------

export async function getPortrait(
  userId: string,
  kind: PortraitKind,
  entityId: string,
): Promise<Portrait | null> {
  const rows = await withUserContext(userId, async (tx) =>
    tx.execute(sql`
      SELECT b.mime AS mime, b.bytes AS bytes, b.hash AS hash
      FROM user_entity_portraits r
      JOIN portrait_blobs b ON b.user_id = r.user_id AND b.hash = r.hash
      WHERE r.user_id = ${userId}::uuid AND r.kind = ${kind} AND r.entity_id = ${entityId}
      LIMIT 1
    `),
  );
  const row = (rows as unknown as Array<{ mime: string; bytes: Buffer; hash: string }>)[0];
  if (!row) return null;
  // postgres-js returns bytea as a Buffer/Uint8Array; normalise to Buffer.
  const bytes = Buffer.isBuffer(row.bytes) ? row.bytes : Buffer.from(row.bytes as Uint8Array);
  return { mime: row.mime, bytes, etag: row.hash };
}

// ---------------------------------------------------------------------------
// put — store bytes (deduped by hash) and point the entity at them
// ---------------------------------------------------------------------------

export async function putPortrait(
  userId: string,
  kind: PortraitKind,
  entityId: string,
  dataUrl: unknown,
): Promise<{ etag: string }> {
  const { mime, bytes, hash } = decodeDataUrl(dataUrl);

  await withUserContext(userId, async (tx) => {
    // The blob is content-addressed: identical bytes already present → no-op.
    await tx.execute(sql`
      INSERT INTO portrait_blobs (user_id, hash, mime, bytes, byte_len)
      VALUES (${userId}::uuid, ${hash}, ${mime}, ${bytes}, ${bytes.length})
      ON CONFLICT (user_id, hash) DO NOTHING
    `);

    // Remember the blob this entity pointed at so we can GC it if it changes.
    const prevRows = await tx.execute(sql`
      SELECT hash FROM user_entity_portraits
      WHERE user_id = ${userId}::uuid AND kind = ${kind} AND entity_id = ${entityId}
    `);
    const prevHash = (prevRows as unknown as Array<{ hash: string }>)[0]?.hash;

    await tx.execute(sql`
      INSERT INTO user_entity_portraits (user_id, kind, entity_id, hash, updated_at)
      VALUES (${userId}::uuid, ${kind}, ${entityId}, ${hash}, now())
      ON CONFLICT (user_id, kind, entity_id) DO UPDATE
        SET hash = EXCLUDED.hash, updated_at = now()
    `);

    if (prevHash && prevHash !== hash) {
      await gcBlob(tx, userId, prevHash);
    }
  });

  return { etag: hash };
}

// ---------------------------------------------------------------------------
// delete — drop the reference and GC the blob if now orphaned
// ---------------------------------------------------------------------------

export async function deletePortrait(
  userId: string,
  kind: PortraitKind,
  entityId: string,
): Promise<void> {
  await withUserContext(userId, async (tx) => {
    const rows = await tx.execute(sql`
      DELETE FROM user_entity_portraits
      WHERE user_id = ${userId}::uuid AND kind = ${kind} AND entity_id = ${entityId}
      RETURNING hash
    `);
    const hash = (rows as unknown as Array<{ hash: string }>)[0]?.hash;
    if (hash) await gcBlob(tx, userId, hash);
  });
}

// ---------------------------------------------------------------------------
// Internal — delete a blob once nothing references it anymore
// ---------------------------------------------------------------------------

async function gcBlob(
  tx: Parameters<Parameters<typeof withUserContext>[1]>[0],
  userId: string,
  hash: string,
): Promise<void> {
  await tx.execute(sql`
    DELETE FROM portrait_blobs b
    WHERE b.user_id = ${userId}::uuid AND b.hash = ${hash}
      AND NOT EXISTS (
        SELECT 1 FROM user_entity_portraits r
        WHERE r.user_id = ${userId}::uuid AND r.hash = ${hash}
      )
  `);
}
