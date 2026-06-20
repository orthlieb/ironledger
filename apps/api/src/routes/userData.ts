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
};
const IMAGE_KINDS = new Set<EntityKind>(['expedition', 'community', 'npc']);

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
