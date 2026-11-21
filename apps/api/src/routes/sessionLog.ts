/**
 * Session log routes
 *
 * GET    /api/v1/session/log              → paginated entries, newest first
 * POST   /api/v1/session/log              → append one entry (idempotent)
 * POST   /api/v1/session/log/batch        → append many, with their own ids and times (an import)
 * PATCH  /api/v1/session/log/:entryId     → update html / note / source in-place
 * DELETE /api/v1/session/log/:entryId     → remove one entry
 * DELETE /api/v1/session/log              → clear all entries for user
 *
 * All routes require authentication.
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authenticate } from '../middleware/authenticate.js';
import { makeHandleError } from '../lib/handleError.js';
import * as sl from '../services/sessionLogService.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

// Up to the whole log (LOG_CAP) in one page, which an export reads.
const logQuery = z.object({
  limit: z.coerce.number().int().min(1).max(sl.LOG_CAP).default(100),
  before: z.string().optional(),
});

const entryIdParam = z.object({
  entryId: z.string().uuid(),
});

const logEntrySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  html: z.string(),
  ts: z.string(),
  note: z.string().optional(),
  source: z.string().optional(),
  roll: z.unknown().optional(),
});

// An import's entries, with their own ids and times. The time has to parse,
// as it becomes the row's occurred_at; the body limit (2 MB) bounds the
// batch's size, so the client sends a big log in several.
const logBatchSchema = z.object({
  entries: z
    .array(
      logEntrySchema.extend({
        ts: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid timestamp'),
      }),
    )
    .min(1)
    .max(sl.LOG_CAP),
});

const patchEntrySchema = z
  .object({
    html: z.string().optional(),
    note: z.string().optional(),
    source: z.string().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'Patch body must contain at least one field',
  });

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const sessionLogRoutes: FastifyPluginAsyncZod = async (server) => {
  server.addHook('preHandler', authenticate);

  // ── GET /session/log?limit=100&before=<iso> ───────────────────────────────
  server.get(
    '/',
    {
      schema: {
        querystring: logQuery,
      },
    },
    async (req, reply) => {
      const { limit, before } = req.query;
      const entries = await sl.getLog(req.user!.id, limit, before).catch(handleError(reply));
      if (!entries || reply.sent) return;
      return reply.status(200).send(entries);
    },
  );

  // ── POST /session/log ─────────────────────────────────────────────────────
  server.post(
    '/',
    {
      schema: {
        body: logEntrySchema,
      },
    },
    async (req, reply) => {
      await sl.appendEntry(req.user!.id, req.body).catch(handleError(reply));
      if (reply.sent) return;
      return reply.status(201).send({ ok: true });
    },
  );

  // ── POST /session/log/batch ───────────────────────────────────────────────
  server.post(
    '/batch',
    {
      schema: {
        body: logBatchSchema,
      },
    },
    async (req, reply) => {
      const inserted = await sl
        .appendEntries(req.user!.id, req.body.entries)
        .catch(handleError(reply));
      if (reply.sent) return;
      return reply.status(201).send({ ok: true, inserted });
    },
  );

  // ── PATCH /session/log/:entryId ───────────────────────────────────────────
  server.patch(
    '/:entryId',
    {
      schema: {
        params: entryIdParam,
        body: patchEntrySchema,
      },
    },
    async (req, reply) => {
      await sl.updateEntry(req.user!.id, req.params.entryId, req.body).catch(handleError(reply));
      if (reply.sent) return;
      return reply.status(200).send({ ok: true });
    },
  );

  // ── DELETE /session/log/:entryId ──────────────────────────────────────────
  server.delete(
    '/:entryId',
    {
      schema: {
        params: entryIdParam,
      },
    },
    async (req, reply) => {
      await sl.deleteEntry(req.user!.id, req.params.entryId).catch(handleError(reply));
      if (reply.sent) return;
      return reply.status(204).send();
    },
  );

  // ── DELETE /session/log (clear all) ──────────────────────────────────────
  server.delete('/', async (req, reply) => {
    await sl.clearLog(req.user!.id).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(204).send();
  });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const handleError = makeHandleError('sessionLogRoutes');
