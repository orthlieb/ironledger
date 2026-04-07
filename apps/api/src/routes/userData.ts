/**
 * User-data routes — global (non-character) game state.
 *
 * GET  /api/v1/session          → { encounters, expeditions, communities }
 * PUT  /api/v1/session          → replace entire payload
 * PATCH /api/v1/session/encounters  → replace encounters only
 * PATCH /api/v1/session/expeditions → replace expeditions only
 * PATCH /api/v1/session/communities → replace communities only
 * PATCH /api/v1/session/npcs        → replace npcs only
 *
 * All routes require authentication.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import * as ud from '../services/userDataService.js';
import { config } from '../config.js';

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
// Routes
// ---------------------------------------------------------------------------

export async function userDataRoutes(server: FastifyInstance): Promise<void> {

  server.addHook('preHandler', authenticate);

  // ── GET /session ──────────────────────────────────────────────────────────
  server.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const result = await ud.get(req.user!.id).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── PATCH /session/encounters ─────────────────────────────────────────────
  server.patch('/encounters', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = patchEncountersBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.errors.map((e) => e.message).join(', ') });
    }
    if (parsed.data.encounters.length > config.MAX_ENCOUNTERS_PER_USER) {
      return reply.status(422).send({
        statusCode: 422,
        error:      'Unprocessable Entity',
        message:    `Encounter limit reached (max ${config.MAX_ENCOUNTERS_PER_USER})`,
      });
    }
    const result = await ud.upsert(req.user!.id, { encounters: parsed.data.encounters }).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── PATCH /session/expeditions ────────────────────────────────────────────
  server.patch('/expeditions', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = patchExpeditionsBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.errors.map((e) => e.message).join(', ') });
    }
    if (parsed.data.expeditions.length > config.MAX_EXPEDITIONS_PER_USER) {
      return reply.status(422).send({
        statusCode: 422,
        error:      'Unprocessable Entity',
        message:    `Expedition limit reached (max ${config.MAX_EXPEDITIONS_PER_USER})`,
      });
    }
    const result = await ud.upsert(req.user!.id, { expeditions: parsed.data.expeditions }).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── PATCH /session/communities ───────────────────────────────────────────
  server.patch('/communities', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = patchCommunitiesBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.errors.map((e) => e.message).join(', ') });
    }
    if (parsed.data.communities.length > config.MAX_COMMUNITIES_PER_USER) {
      return reply.status(422).send({
        statusCode: 422,
        error:      'Unprocessable Entity',
        message:    `Community limit reached (max ${config.MAX_COMMUNITIES_PER_USER})`,
      });
    }
    const result = await ud.upsert(req.user!.id, { communities: parsed.data.communities }).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── PATCH /session/npcs ──────────────────────────────────────────────────
  server.patch('/npcs', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = patchNpcsBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.errors.map((e) => e.message).join(', ') });
    }
    if (parsed.data.npcs.length > config.MAX_NPCS_PER_USER) {
      return reply.status(422).send({
        statusCode: 422,
        error:      'Unprocessable Entity',
        message:    `NPC limit reached (max ${config.MAX_NPCS_PER_USER})`,
      });
    }
    const result = await ud.upsert(req.user!.id, { npcs: parsed.data.npcs }).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── PATCH /session/state ──────────────────────────────────────────────────
  server.patch('/state', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = patchSessionStateBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: parsed.error.errors.map((e) => e.message).join(', ') });
    }
    const result = await ud.upsert(req.user!.id, { sessionState: parsed.data.sessionState }).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handleError(reply: FastifyReply) {
  return (err: unknown) => {
    console.error('[userDataRoutes]', err);
    reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'An unexpected error occurred' });
  };
}
