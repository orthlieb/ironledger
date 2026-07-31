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
import { isValidImageUrl, assertImageUrls } from '../lib/imageUrl.js';
import { sendPortraitHeaders, ifNoneMatchHits } from '../lib/portraitHttp.js';
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
  // World-unit fractional coordinates on the square grid. See
  // apps/web/src/lib/mapStore.svelte.ts::MapMarker for the client-side type.
  x: z.number(),
  y: z.number(),
  label: z.string().max(120),
  icon: z.string().max(32),
  color: z.string().max(64).optional(),
  entityId: z.string().max(200).optional(),
  // Rotation in degrees, clockwise. Clamped to a wide range so a bug
  // upstream can't wedge NaN/Infinity into the JSONB row.
  angle: z.number().finite().min(-3600).max(3600).optional(),
});
const putMarkersBody = z.object({ markers: z.array(mapMarkerSchema).max(500) });

/** Free-form settings blob; the client owns the shape. Small size cap so
 *  a bug can't wedge megabytes of JSON into the row. */
const putMapSettingsBody = z.object({
  settings: z.record(z.unknown()),
});

const mapIdParams = z.object({ mapId: z.string().uuid() });

const createMapBody = z.object({
  name: z.string().max(120).optional(),
  ownerKind: z.enum(['community', 'place', 'journey', 'site']).nullish(),
  ownerId: z.string().max(200).nullish(),
});

const updateMapBody = z.object({
  name: z.string().max(120).optional(),
  sortOrder: z.number().int().optional(),
});

const forOwnerQuery = z.object({
  kind: z.enum(['community', 'place', 'journey', 'site']),
  id: z.string().min(1).max(200),
  name: z.string().max(120).optional(),
});

const patchSessionStateBody = z.object({
  sessionState: z.object({
    charId: z.string(),
    foeId: z.string(),
    expeditionId: z.string(),
    activeTab: z.string().optional(),
    activeMapId: z.string().nullish(),
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

  // ── Campaign maps — persisted per-user; each map's background image lives
  //    in the portrait blob store keyed by (kind='map', entity_id=<mapId>).
  //    See docs/campaign-map.md for the shape.
  //
  // GET    /session/maps                        → summary list of maps
  // GET    /session/maps/entity-markers         → { entityId → [marker refs] } (back-references)
  // GET    /session/maps/for-owner?kind=&id=    → get-or-create the entity-owned map
  // POST   /session/maps                        → create a new map
  // GET    /session/maps/:mapId                 → full map (markers, bg, settings)
  // PATCH  /session/maps/:mapId                 → update name / sort_order
  // DELETE /session/maps/:mapId                 → delete a map entirely
  // PUT    /session/maps/:mapId/markers         → replace markers
  // PUT    /session/maps/:mapId/settings        → replace settings blob
  // GET    /session/maps/:mapId/background      → raw image bytes (ETag revalidated)
  // PUT    /session/maps/:mapId/background      → upload { dataUrl } → { hash }
  // DELETE /session/maps/:mapId/background      → clear background pointer

  server.get('/maps', async (req, reply) => {
    try {
      const rows = await maps.listMaps(req.user!.id);
      return reply.status(200).send({ maps: rows });
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  // Back-references: `{ entityId → [marker refs] }` across every map the
  // user owns. Powers the "📍 On map at (x, y)" chip on entity cards.
  server.get('/maps/entity-markers', async (req, reply) => {
    try {
      const index = await maps.listEntityMarkers(req.user!.id);
      return reply.status(200).send({ index });
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  // Get-or-create the map owned by an entity — enforces the
  // UNIQUE (user_id, owner_kind, owner_id) constraint at the app layer.
  // `?kind=&id=&name=` in the query so it works as an idempotent GET.
  server.get('/maps/for-owner', { schema: { querystring: forOwnerQuery } }, async (req, reply) => {
    try {
      const count = await maps.countMaps(req.user!.id);
      if (count >= maps.MAX_MAPS_PER_USER) {
        // Only relevant if we're going to CREATE; but easier to check
        // up-front than to distinguish inside the service.
        const existing = await maps.listMaps(req.user!.id);
        const already = existing.find(
          (m) => m.ownerKind === req.query.kind && m.ownerId === req.query.id,
        );
        if (!already) {
          return reply.status(422).send({
            statusCode: 422,
            error: 'Unprocessable Entity',
            message: `Map limit reached (max ${maps.MAX_MAPS_PER_USER})`,
          });
        }
      }
      const m = await maps.getOrCreateMapForOwner(
        req.user!.id,
        req.query.kind,
        req.query.id,
        req.query.name ?? `${req.query.kind} map`,
      );
      return reply.status(200).send(m);
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  server.post('/maps', { schema: { body: createMapBody } }, async (req, reply) => {
    try {
      const count = await maps.countMaps(req.user!.id);
      if (count >= maps.MAX_MAPS_PER_USER) {
        return reply.status(422).send({
          statusCode: 422,
          error: 'Unprocessable Entity',
          message: `Map limit reached (max ${maps.MAX_MAPS_PER_USER})`,
        });
      }
      const m = await maps.createMap(req.user!.id, {
        name: req.body.name,
        ownerKind: req.body.ownerKind ?? null,
        ownerId: req.body.ownerId ?? null,
      });
      return reply.status(201).send(m);
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  server.get('/maps/:mapId', { schema: { params: mapIdParams } }, async (req, reply) => {
    try {
      const m = await maps.getMap(req.user!.id, req.params.mapId);
      if (!m)
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'Not Found', message: 'Map not found' });
      return reply.status(200).send(m);
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  server.patch(
    '/maps/:mapId',
    { schema: { params: mapIdParams, body: updateMapBody } },
    async (req, reply) => {
      try {
        const m = await maps.updateMap(req.user!.id, req.params.mapId, req.body);
        if (!m)
          return reply
            .status(404)
            .send({ statusCode: 404, error: 'Not Found', message: 'Map not found' });
        return reply.status(200).send(m);
      } catch (err) {
        return handleError(reply)(err);
      }
    },
  );

  server.delete('/maps/:mapId', { schema: { params: mapIdParams } }, async (req, reply) => {
    try {
      // Delete the map row and its background portrait pointer. The
      // portrait blob itself is content-addressed + potentially shared
      // across maps, so we don't GC it here.
      await portraits.deletePortrait(req.user!.id, 'map', req.params.mapId);
      await maps.deleteMap(req.user!.id, req.params.mapId);
      return reply.status(204).send();
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  server.put(
    '/maps/:mapId/markers',
    { schema: { params: mapIdParams, body: putMarkersBody } },
    async (req, reply) => {
      try {
        const m = await maps.putMarkers(req.user!.id, req.params.mapId, req.body.markers);
        if (!m)
          return reply
            .status(404)
            .send({ statusCode: 404, error: 'Not Found', message: 'Map not found' });
        return reply.status(200).send(m);
      } catch (err) {
        return handleError(reply)(err);
      }
    },
  );

  server.put(
    '/maps/:mapId/settings',
    { schema: { params: mapIdParams, body: putMapSettingsBody } },
    async (req, reply) => {
      try {
        const m = await maps.setSettings(req.user!.id, req.params.mapId, req.body.settings);
        if (!m)
          return reply
            .status(404)
            .send({ statusCode: 404, error: 'Not Found', message: 'Map not found' });
        return reply.status(200).send(m);
      } catch (err) {
        return handleError(reply)(err);
      }
    },
  );

  server.get('/maps/:mapId/background', { schema: { params: mapIdParams } }, async (req, reply) => {
    try {
      const portrait = await portraits.getPortrait(req.user!.id, 'map', req.params.mapId);
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

  server.put(
    '/maps/:mapId/background',
    { schema: { params: mapIdParams, body: portraitBody } },
    async (req, reply) => {
      try {
        const { etag } = await portraits.putPortrait(
          req.user!.id,
          'map',
          req.params.mapId,
          req.body.dataUrl,
        );
        await maps.setBackgroundHash(req.user!.id, req.params.mapId, etag);
        return reply.status(200).send({ hash: etag });
      } catch (err) {
        if (err instanceof portraits.PortraitError) return badRequest(reply, err.message);
        return handleError(reply)(err);
      }
    },
  );

  server.delete(
    '/maps/:mapId/background',
    { schema: { params: mapIdParams } },
    async (req, reply) => {
      try {
        await portraits.deletePortrait(req.user!.id, 'map', req.params.mapId);
        await maps.setBackgroundHash(req.user!.id, req.params.mapId, null);
        return reply.status(204).send();
      } catch (err) {
        return handleError(reply)(err);
      }
    },
  );

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
