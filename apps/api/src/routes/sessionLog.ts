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

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authenticate } from '../middleware/authenticate.js';
import * as sl from '../services/sessionLogService.js';
import type { FastifyReply } from 'fastify';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const logQuery = z.object({
  limit:  z.coerce.number().int().min(1).max(500).default(100),
  before: z.string().optional(),
});

const entryIdParam = z.object({
  entryId: z.string().uuid(),
});

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

export const sessionLogRoutes: FastifyPluginAsyncZod = async (server) => {

  server.addHook('preHandler', authenticate);

  // ── GET /session/log?limit=100&before=<iso> ───────────────────────────────
  server.get('/', {
    schema: {
      tags:        ['Session Log'],
      summary:     'Get paginated log entries (newest first)',
      querystring: logQuery,
      security:    [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    const { limit, before } = req.query;
    const entries = await sl.getLog(req.user!.id, limit, before).catch(handleError(reply));
    if (!entries || reply.sent) return;
    return reply.status(200).send(entries);
  });

  // ── POST /session/log ─────────────────────────────────────────────────────
  server.post('/', {
    schema: {
      tags:     ['Session Log'],
      summary:  'Append a log entry',
      body:     logEntrySchema,
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    await sl.appendEntry(req.user!.id, req.body).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(201).send({ ok: true });
  });

  // ── PATCH /session/log/:entryId ───────────────────────────────────────────
  server.patch('/:entryId', {
    schema: {
      tags:     ['Session Log'],
      summary:  'Update a log entry in-place',
      params:   entryIdParam,
      body:     patchEntrySchema,
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    await sl.updateEntry(req.user!.id, req.params.entryId, req.body).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(200).send({ ok: true });
  });

  // ── DELETE /session/log/:entryId ──────────────────────────────────────────
  server.delete('/:entryId', {
    schema: {
      tags:     ['Session Log'],
      summary:  'Delete a single log entry',
      params:   entryIdParam,
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    await sl.deleteEntry(req.user!.id, req.params.entryId).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(204).send();
  });

  // ── DELETE /session/log (clear all) ──────────────────────────────────────
  server.delete('/', {
    schema: {
      tags:     ['Session Log'],
      summary:  'Clear all log entries for the authenticated user',
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    await sl.clearLog(req.user!.id).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(204).send();
  });
};

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
