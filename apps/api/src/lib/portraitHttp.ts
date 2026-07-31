// ---------------------------------------------------------------------------
// Portrait HTTP helpers — ETag / Cache-Control + conditional-request handling
// shared by the portrait endpoints. Previously these lived in routes/userData
// and were imported cross-route by routes/characters; hoisted here so route
// modules don't depend on each other.
// ---------------------------------------------------------------------------
import type { FastifyReply } from 'fastify';

// Portraits are immutable per ETag (the ETag is the content hash), but we keep
// them private and force revalidation so a changed/cleared portrait is picked
// up immediately — the matching ETag then short-circuits to a 304.
export const PORTRAIT_CACHE_CONTROL = 'private, no-cache';

/** Set the ETag + Cache-Control headers shared by 200 and 304 portrait replies. */
export function sendPortraitHeaders(reply: FastifyReply, etag: string): FastifyReply {
  return reply.header('ETag', `"${etag}"`).header('Cache-Control', PORTRAIT_CACHE_CONTROL);
}

/** True when an If-None-Match header lists the given (unquoted) ETag. Tolerates
 *  weak validators and the `*` wildcard. */
export function ifNoneMatchHits(header: string | string[] | undefined, etag: string): boolean {
  if (!header) return false;
  const raw = Array.isArray(header) ? header.join(',') : header;
  return raw
    .split(',')
    .map((t) => t.trim().replace(/^W\//, '').replace(/^"|"$/g, ''))
    .some((t) => t === etag || t === '*');
}
