/**
 * User-data routes — global (non-character) game state.
 *
 * GET    /api/v1/session                 → { encounters, expeditions, communities, npcs, sessionState }
 * PATCH  /api/v1/session/state           → update active-selection state
 *
 * The four session collections are stored one row per entity (migration 0013).
 * `:kind` is the plural segment (encounters | expeditions | communities | npcs):
 *
 * PATCH  /api/v1/session/:kind           → replace the whole collection (reset/seed/import-replace)
 * POST   /api/v1/session/:kind           → create one entity
 * PATCH  /api/v1/session/:kind/:id       → update one entity
 * DELETE /api/v1/session/:kind/:id       → delete one entity
 *
 * Per-entity writes keep each request proportional to a single entity, so an
 * image-heavy collection no longer has to fit in one body.
 *
 * All routes require authentication.
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authenticate } from '../middleware/authenticate.js';
import * as ud from '../services/userDataService.js';
import type { EntityKind } from '../services/userDataService.js';
import * as portraits from '../services/portraitService.js';
import * as maps from '../services/userMapService.js';
import { MAP_ENTITY_ID } from '../services/portraitService.js';
import { isValidImageUrl, assertImageUrls } from '../lib/imageUrl.js';
import { config } from '../config.js';
import type { FastifyReply } from 'fastify';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const kindParams = z.object({ kind: z.string() });
const kindIdParams = z.object({ kind: z.string(), id: z.string() });
const entityBody = z.record(z.unknown());
const replaceBody = z.record(z.unknown()); // { <kind>: Entity[] }
const portraitBody = z.object({ dataUrl: z.string() });

const mapMarkerSchema = z.object({
  id: z.string(),
  q: z.number().int(),
  r: z.number().int(),
  label: z.string().max(120),
  icon: z.string().max(32),
  entityId: z.string().max(200).optional(),
});
const putMarkersBody = z.object({ markers: z.array(mapMarkerSchema).max(500) });

/** Free-form settings blob; the client owns the shape. Small size cap so
 *  a bug can't wedge megabytes of JSON into the row. */
const putMapSettingsBody = z.object({
  settings: z.record(z.unknown()),
});

const patchSessionStateBody = z.object({
  sessionState: z.object({
    charId: z.string(),
    foeId: z.string(),
    expeditionId: z.string(),
    activeTab: z.string().optional(),
  }),
});

// ---------------------------------------------------------------------------
// Per-kind config — caps and which kinds carry portraits worth validating.
// ---------------------------------------------------------------------------

const LIMIT_BY_KIND: Record<EntityKind, number> = {
  encounter: config.MAX_ENCOUNTERS_PER_USER,
  expedition: config.MAX_EXPEDITIONS_PER_USER,
  community: config.MAX_COMMUNITIES_PER_USER,
  npc: config.MAX_NPCS_PER_USER,
  place: config.MAX_PLACES_PER_USER,
};
const IMAGE_KINDS = new Set<EntityKind>(['expedition', 'community', 'npc', 'place']);

// imageUrl validation for Community/NPC/Expedition portraits lives in the
// shared lib so character routes can reuse the same rules — see
// ../lib/imageUrl.js.

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const userDataRoutes: FastifyPluginAsyncZod = async (server) => {
  server.addHook('preHandler', authenticate);

  // ── GET /session ──────────────────────────────────────────────────────────
  server.get('/', async (req, reply) => {
    const result = await ud.get(req.user!.id).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── Shared helpers for the :kind routes ───────────────────────────────────
  // Map the plural URL segment to a storage kind, 404ing unknown segments.
  // Returns null (and sends the response) when the segment is unrecognised.
  function resolveKind(segment: string, reply: FastifyReply): EntityKind | null {
    const kind = ud.KIND_BY_SEGMENT[segment];
    if (!kind) {
      reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Unknown collection '${segment}'`,
      });
      return null;
    }
    return kind;
  }

  function badRequest(reply: FastifyReply, message: string) {
    return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message });
  }

  // ── PATCH /session/:kind — replace the whole collection ────────────────────
  // Powers reset (PATCH { kind: [] }), seed, and import-replace flows. The body
  // is keyed by the plural segment, e.g. { npcs: [...] }.
  server.patch(
    '/:kind',
    { schema: { params: kindParams, body: replaceBody } },
    async (req, reply) => {
      const kind = resolveKind(req.params.kind, reply);
      if (!kind) return;
      const items = (req.body as Record<string, unknown>)[req.params.kind];
      if (!Array.isArray(items)) {
        return badRequest(reply, `Expected { ${req.params.kind}: [...] }`);
      }
      if (items.length > LIMIT_BY_KIND[kind]) {
        return reply.status(422).send({
          statusCode: 422,
          error: 'Unprocessable Entity',
          message: `${kind} limit reached (max ${LIMIT_BY_KIND[kind]})`,
        });
      }
      if (IMAGE_KINDS.has(kind)) {
        const imgErr = assertImageUrls(items as Array<Record<string, unknown>>, req.params.kind);
        if (imgErr) return badRequest(reply, imgErr);
      }
      try {
        await ud.replaceEntities(req.user!.id, kind, items as Array<Record<string, unknown>>);
        return reply.status(200).send(await ud.get(req.user!.id));
      } catch (err) {
        return handleError(reply)(err);
      }
    },
  );

  // ── POST /session/:kind — create one entity ────────────────────────────────
  server.post(
    '/:kind',
    { schema: { params: kindParams, body: entityBody } },
    async (req, reply) => {
      const kind = resolveKind(req.params.kind, reply);
      if (!kind) return;
      const entity = req.body as Record<string, unknown>;
      const id = typeof entity.id === 'string' && entity.id ? entity.id : null;
      if (!id) return badRequest(reply, 'Entity must have a non-empty string id');
      if (IMAGE_KINDS.has(kind) && !isValidImageUrl(entity.imageUrl)) {
        return badRequest(reply, 'imageUrl is not a valid image data URL or https URL');
      }
      try {
        const count = await ud.countEntities(req.user!.id, kind);
        if (count >= LIMIT_BY_KIND[kind]) {
          return reply.status(422).send({
            statusCode: 422,
            error: 'Unprocessable Entity',
            message: `${kind} limit reached (max ${LIMIT_BY_KIND[kind]})`,
          });
        }
        await ud.upsertEntity(req.user!.id, kind, id, entity);
        return reply.status(201).send(entity);
      } catch (err) {
        return handleError(reply)(err);
      }
    },
  );

  // ── PATCH /session/:kind/:id — update one entity ───────────────────────────
  server.patch(
    '/:kind/:id',
    { schema: { params: kindIdParams, body: entityBody } },
    async (req, reply) => {
      const kind = resolveKind(req.params.kind, reply);
      if (!kind) return;
      const entity = req.body as Record<string, unknown>;
      if (IMAGE_KINDS.has(kind) && !isValidImageUrl(entity.imageUrl)) {
        return badRequest(reply, 'imageUrl is not a valid image data URL or https URL');
      }
      try {
        await ud.upsertEntity(req.user!.id, kind, req.params.id, entity);
        return reply.status(200).send(entity);
      } catch (err) {
        return handleError(reply)(err);
      }
    },
  );

  // ── DELETE /session/:kind/:id — delete one entity ──────────────────────────
  server.delete('/:kind/:id', { schema: { params: kindIdParams } }, async (req, reply) => {
    const kind = resolveKind(req.params.kind, reply);
    if (!kind) return;
    try {
      await ud.deleteEntity(req.user!.id, kind, req.params.id);
      return reply.status(204).send();
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  // ── GET /session/:kind/:id/portrait — raw portrait bytes ───────────────────
  // Cacheable, revalidated via ETag. Bytes live in the content-addressed blob
  // store, not the entity JSON, so the /session payload stays image-free.
  server.get('/:kind/:id/portrait', { schema: { params: kindIdParams } }, async (req, reply) => {
    const kind = resolveKind(req.params.kind, reply);
    if (!kind) return;
    try {
      const portrait = await portraits.getPortrait(req.user!.id, kind, req.params.id);
      if (!portrait) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'Not Found', message: 'No portrait for this entity' });
      }
      if (ifNoneMatchHits(req.headers['if-none-match'], portrait.etag)) {
        return sendPortraitHeaders(reply, portrait.etag).status(304).send();
      }
      return sendPortraitHeaders(reply, portrait.etag)
        .header('Content-Type', portrait.mime)
        .status(200)
        .send(portrait.bytes);
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  // ── PUT /session/:kind/:id/portrait — store/replace the portrait ───────────
  server.put(
    '/:kind/:id/portrait',
    { schema: { params: kindIdParams, body: portraitBody } },
    async (req, reply) => {
      const kind = resolveKind(req.params.kind, reply);
      if (!kind) return;
      try {
        const { etag } = await portraits.putPortrait(
          req.user!.id,
          kind,
          req.params.id,
          req.body.dataUrl,
        );
        return reply.status(200).send({ etag });
      } catch (err) {
        if (err instanceof portraits.PortraitError) return badRequest(reply, err.message);
        return handleError(reply)(err);
      }
    },
  );

  // ── DELETE /session/:kind/:id/portrait — clear the portrait ────────────────
  server.delete('/:kind/:id/portrait', { schema: { params: kindIdParams } }, async (req, reply) => {
    const kind = resolveKind(req.params.kind, reply);
    if (!kind) return;
    try {
      await portraits.deletePortrait(req.user!.id, kind, req.params.id);
      return reply.status(204).send();
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  // ── Campaign map — persisted per-user, reuses portrait blob store for the
  //    background image. See docs/campaign-map.md for the shape.
  // GET    /session/map                → { markers, backgroundHash, settings, updatedAt }
  // PUT    /session/map/markers        → replace the markers array wholesale
  // PUT    /session/map/settings       → replace the settings blob wholesale
  // GET    /session/map/background     → raw image bytes (ETag revalidated)
  // PUT    /session/map/background     → { dataUrl } → { hash }
  // DELETE /session/map/background     → clear the background pointer
  // DELETE /session/map                → clear markers + background
  server.get('/map', async (req, reply) => {
    try {
      const m = await maps.getMap(req.user!.id);
      return reply.status(200).send(m);
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  server.put('/map/markers', { schema: { body: putMarkersBody } }, async (req, reply) => {
    try {
      const m = await maps.putMarkers(req.user!.id, req.body.markers);
      return reply.status(200).send(m);
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  server.put('/map/settings', { schema: { body: putMapSettingsBody } }, async (req, reply) => {
    try {
      const m = await maps.setSettings(req.user!.id, req.body.settings);
      return reply.status(200).send(m);
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  server.get('/map/background', async (req, reply) => {
    try {
      const portrait = await portraits.getPortrait(req.user!.id, 'map', MAP_ENTITY_ID);
      if (!portrait) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'Not Found', message: 'No background image set' });
      }
      if (ifNoneMatchHits(req.headers['if-none-match'], portrait.etag)) {
        return sendPortraitHeaders(reply, portrait.etag).status(304).send();
      }
      return sendPortraitHeaders(reply, portrait.etag)
        .header('Content-Type', portrait.mime)
        .status(200)
        .send(portrait.bytes);
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  server.put('/map/background', { schema: { body: portraitBody } }, async (req, reply) => {
    try {
      const { etag } = await portraits.putPortrait(
        req.user!.id,
        'map',
        MAP_ENTITY_ID,
        req.body.dataUrl,
      );
      await maps.setBackgroundHash(req.user!.id, etag);
      return reply.status(200).send({ hash: etag });
    } catch (err) {
      if (err instanceof portraits.PortraitError) return badRequest(reply, err.message);
      return handleError(reply)(err);
    }
  });

  server.delete('/map/background', async (req, reply) => {
    try {
      await portraits.deletePortrait(req.user!.id, 'map', MAP_ENTITY_ID);
      await maps.setBackgroundHash(req.user!.id, null);
      return reply.status(204).send();
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  server.delete('/map', async (req, reply) => {
    try {
      await portraits.deletePortrait(req.user!.id, 'map', MAP_ENTITY_ID);
      await maps.clearMap(req.user!.id);
      return reply.status(204).send();
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  // ── PATCH /session/state ──────────────────────────────────────────────────
  server.patch(
    '/state',
    {
      schema: {
        body: patchSessionStateBody,
      },
    },
    async (req, reply) => {
      const result = await ud
        .upsert(req.user!.id, { sessionState: req.body.sessionState })
        .catch(handleError(reply));
      if (!result || reply.sent) return;
      return reply.status(200).send(result);
    },
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function handleError(reply: FastifyReply) {
  return (err: unknown) => {
    console.error('[userDataRoutes]', err);
    reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  };
}
