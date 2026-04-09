/**
 * Session log routes
 *
 * GET    /api/v1/session/log              → paginated entries, newest first
 * POST   /api/v1/session/log              → append one entry (idempotent)
 * PATCH  /api/v1/session/log/:entryId     → update html / note / source in-place
 * DELETE /api/v1/session/log/:entryId     → remove one entry
 * DELETE /api/v1/session/log              → clear all entries for user
 *
 * All routes require authentication.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import * as sl from '../services/sessionLogService.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const logEntrySchema = z.object({
  id:     z.string().uuid(),
  title:  z.string(),
  html:   z.string(),
  ts:     z.string(),
  note:   z.string().optional(),
  source: z.string().optional(),
  roll:   z.unknown().optional(),
});

const patchEntrySchema = z.object({
  html:   z.string().optional(),
  note:   z.string().optional(),
  source: z.string().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Patch body must contain at least one field' });

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function sessionLogRoutes(server: FastifyInstance): Promise<void> {

  server.addHook('preHandler', authenticate);

  // ── GET /session/log?limit=100&before=<iso> ───────────────────────────────
  server.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as { limit?: string; before?: string };
    const limit = Math.min(Math.max(parseInt(query.limit ?? '100', 10), 1), 500);
    const entries = await sl.getLog(req.user!.id, limit, query.before).catch(handleError(reply));
    if (!entries || reply.sent) return;
    return reply.status(200).send(entries);
  });

  // ── POST /session/log ─────────────────────────────────────────────────────
  server.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = logEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error:      'Bad Request',
        message:    parsed.error.errors.map((e) => e.message).join(', '),
      });
    }
    await sl.appendEntry(req.user!.id, parsed.data).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(201).send({ ok: true });
  });

  // ── PATCH /session/log/:entryId ───────────────────────────────────────────
  server.patch('/:entryId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { entryId } = req.params as { entryId: string };
    const parsed = patchEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        statusCode: 400,
        error:      'Bad Request',
        message:    parsed.error.errors.map((e) => e.message).join(', '),
      });
    }
    await sl.updateEntry(req.user!.id, entryId, parsed.data).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(200).send({ ok: true });
  });

  // ── DELETE /session/log/:entryId ──────────────────────────────────────────
  server.delete('/:entryId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { entryId } = req.params as { entryId: string };
    await sl.deleteEntry(req.user!.id, entryId).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(204).send();
  });

  // ── DELETE /session/log (clear all) ──────────────────────────────────────
  server.delete('/', async (req: FastifyRequest, reply: FastifyReply) => {
    await sl.clearLog(req.user!.id).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(204).send();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handleError(reply: FastifyReply) {
  return (err: unknown) => {
    console.error('[sessionLogRoutes]', err);
    reply.status(500).send({
      statusCode: 500,
      error:      'Internal Server Error',
      message:    'An unexpected error occurred',
    });
  };
}
