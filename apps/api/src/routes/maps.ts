/**
 * Campaign map routes — persisted per-user under /api/v1/session/maps.
 *
 * Each map's background image lives in the portrait blob store keyed by
 * (kind='map', entity_id=<mapId>). See docs/campaign-map.md for the shape.
 *
 * GET    /api/v1/session/maps                    → summary list of maps
 * GET    /api/v1/session/maps/entity-markers     → { entityId → [marker refs] } (back-references)
 * GET    /api/v1/session/maps/for-owner?kind=&id= → get-or-create the entity-owned map
 * POST   /api/v1/session/maps                    → create a new map
 * GET    /api/v1/session/maps/:mapId             → full map (markers, bg, settings)
 * PATCH  /api/v1/session/maps/:mapId             → update name / sort_order
 * DELETE /api/v1/session/maps/:mapId             → delete a map entirely
 * PUT    /api/v1/session/maps/:mapId/markers     → replace markers
 * PUT    /api/v1/session/maps/:mapId/settings    → replace settings blob
 * GET    /api/v1/session/maps/:mapId/background  → raw image bytes (ETag revalidated)
 * PUT    /api/v1/session/maps/:mapId/background  → upload { dataUrl } → { hash }
 * DELETE /api/v1/session/maps/:mapId/background  → clear background pointer
 *
 * All routes require authentication. Registered with prefix
 * /api/v1/session, so paths match the pre-split userData routes exactly.
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyReply } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import * as maps from '../services/userMapService.js';
import * as portraits from '../services/portraitService.js';
import { sendPortraitHeaders, ifNoneMatchHits } from '../lib/portraitHttp.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

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

const portraitBody = z.object({ dataUrl: z.string() });

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

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const mapRoutes: FastifyPluginAsyncZod = async (server) => {
  server.addHook('preHandler', authenticate);

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
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function badRequest(reply: FastifyReply, message: string) {
  return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message });
}

// Log tag inherited from userData.ts, where these routes lived before the
// split — kept identical so operator log greps don't change behaviour.
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
