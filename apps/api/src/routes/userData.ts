/**
 * User-data routes — global (non-character) game state.
 *
 * GET  /api/v1/session          → { encounters, expeditions }
 * PUT  /api/v1/session          → replace entire payload
 * PATCH /api/v1/session/encounters  → replace encounters only
 * PATCH /api/v1/session/expeditions → replace expeditions only
 *
 * All routes require authentication.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import * as ud from '../services/userDataService.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const patchEncountersBody = z.object({
  encounters: z.array(z.record(z.unknown())),
});

const patchExpeditionsBody = z.object({
  expeditions: z.array(z.record(z.unknown())),
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
    const result = await ud.upsert(req.user!.id, { expeditions: parsed.data.expeditions }).catch(handleError(reply));
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
