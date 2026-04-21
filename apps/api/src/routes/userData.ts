/**
 * User-data routes — global (non-character) game state.
 *
 * GET   /api/v1/session                    → { encounters, expeditions, communities }
 * PATCH /api/v1/session/encounters         → replace encounters only
 * PATCH /api/v1/session/expeditions        → replace expeditions only
 * PATCH /api/v1/session/communities        → replace communities only
 * PATCH /api/v1/session/npcs               → replace npcs only
 * PATCH /api/v1/session/state              → update active selection state
 *
 * All routes require authentication.
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authenticate } from '../middleware/authenticate.js';
import * as ud from '../services/userDataService.js';
import { config } from '../config.js';
import type { FastifyReply } from 'fastify';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const patchEncountersBody = z.object({
  encounters: z.array(z.record(z.unknown())),
});

const patchExpeditionsBody = z.object({
  expeditions: z.array(z.record(z.unknown())),
});

const patchCommunitiesBody = z.object({
  communities: z.array(z.record(z.unknown())),
});

const patchNpcsBody = z.object({
  npcs: z.array(z.record(z.unknown())),
});

const patchSessionStateBody = z.object({
  sessionState: z.object({
    charId:       z.string(),
    foeId:        z.string(),
    expeditionId: z.string(),
    activeTab:    z.string().optional(),
  }),
});

// ---------------------------------------------------------------------------
// imageUrl validation — narrow the attack surface on Community/NPC portraits
//
// The item-level schemas above are z.record(z.unknown()) (free-form to allow
// the data model to evolve), so the `imageUrl` field is untyped at the schema
// layer. A malicious client could post javascript:, file://, or massive
// base64 strings with SVG+<script>. Images are rendered via <img src=...>
// so script-execution is largely blocked by browsers, but defense-in-depth
// says we should still refuse anything that isn't a recognised image URL.
//
// Accept:
//   data:image/(png|jpeg|webp|gif);base64,<chars>   up to ~1MB encoded
//   https://<host>/<path>                           external URL
// Reject everything else.
// ---------------------------------------------------------------------------

const MAX_IMAGE_DATA_URL_LEN = 1_200_000;                              // ~900KB decoded
const IMAGE_DATA_URL_RE      = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const HTTPS_URL_RE           = /^https:\/\/[^\s<>"']+$/;

function isValidImageUrl(s: unknown): boolean {
  if (typeof s !== 'string' || s.length === 0) return true;   // unset is fine
  if (s.length > MAX_IMAGE_DATA_URL_LEN) return false;
  if (IMAGE_DATA_URL_RE.test(s)) return true;
  if (HTTPS_URL_RE.test(s) && s.length <= 2048) return true;
  return false;
}

function assertImageUrls(items: Array<Record<string, unknown>>, kind: string): string | null {
  for (let i = 0; i < items.length; i++) {
    const url = items[i]?.imageUrl;
    if (url === undefined || url === null) continue;
    if (!isValidImageUrl(url)) {
      return `${kind}[${i}].imageUrl is not a valid image data URL or https URL (or exceeds size cap)`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const userDataRoutes: FastifyPluginAsyncZod = async (server) => {

  server.addHook('preHandler', authenticate);

  // ── GET /session ──────────────────────────────────────────────────────────
  server.get('/', {
    schema: {
      tags:     ['Session'],
      summary:  'Get all global game state (encounters, expeditions, communities)',
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    const result = await ud.get(req.user!.id).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── PATCH /session/encounters ─────────────────────────────────────────────
  server.patch('/encounters', {
    schema: {
      tags:     ['Session'],
      summary:  'Replace all encounters',
      body:     patchEncountersBody,
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    if (req.body.encounters.length > config.MAX_ENCOUNTERS_PER_USER) {
      return reply.status(422).send({
        statusCode: 422,
        error:      'Unprocessable Entity',
        message:    `Encounter limit reached (max ${config.MAX_ENCOUNTERS_PER_USER})`,
      });
    }
    const result = await ud.upsert(req.user!.id, { encounters: req.body.encounters }).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── PATCH /session/expeditions ────────────────────────────────────────────
  server.patch('/expeditions', {
    schema: {
      tags:     ['Session'],
      summary:  'Replace all expeditions',
      body:     patchExpeditionsBody,
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    if (req.body.expeditions.length > config.MAX_EXPEDITIONS_PER_USER) {
      return reply.status(422).send({
        statusCode: 422,
        error:      'Unprocessable Entity',
        message:    `Expedition limit reached (max ${config.MAX_EXPEDITIONS_PER_USER})`,
      });
    }
    const imgErr = assertImageUrls(req.body.expeditions, 'expeditions');
    if (imgErr) return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: imgErr });
    const result = await ud.upsert(req.user!.id, { expeditions: req.body.expeditions }).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── PATCH /session/communities ───────────────────────────────────────────
  server.patch('/communities', {
    schema: {
      tags:     ['Session'],
      summary:  'Replace all communities',
      body:     patchCommunitiesBody,
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    if (req.body.communities.length > config.MAX_COMMUNITIES_PER_USER) {
      return reply.status(422).send({
        statusCode: 422,
        error:      'Unprocessable Entity',
        message:    `Community limit reached (max ${config.MAX_COMMUNITIES_PER_USER})`,
      });
    }
    const imgErr = assertImageUrls(req.body.communities, 'communities');
    if (imgErr) return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: imgErr });
    const result = await ud.upsert(req.user!.id, { communities: req.body.communities }).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── PATCH /session/npcs ──────────────────────────────────────────────────
  server.patch('/npcs', {
    schema: {
      tags:     ['Session'],
      summary:  'Replace all NPCs',
      body:     patchNpcsBody,
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    if (req.body.npcs.length > config.MAX_NPCS_PER_USER) {
      return reply.status(422).send({
        statusCode: 422,
        error:      'Unprocessable Entity',
        message:    `NPC limit reached (max ${config.MAX_NPCS_PER_USER})`,
      });
    }
    const imgErr = assertImageUrls(req.body.npcs, 'npcs');
    if (imgErr) return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: imgErr });
    const result = await ud.upsert(req.user!.id, { npcs: req.body.npcs }).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── PATCH /session/state ──────────────────────────────────────────────────
  server.patch('/state', {
    schema: {
      tags:        ['Session'],
      summary:     'Update the active selection state (character, foe, expedition, tab)',
      body:        patchSessionStateBody,
      security:    [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    const result = await ud.upsert(req.user!.id, { sessionState: req.body.sessionState }).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handleError(reply: FastifyReply) {
  return (err: unknown) => {
    console.error('[userDataRoutes]', err);
    reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'An unexpected error occurred' });
  };
}
