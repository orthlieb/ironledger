/**
 * Character routes — CRUD + history.
 *
 * All routes require authentication (authenticate preHandler).
 * req.user is guaranteed to be populated.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import * as chars from '../services/characterService.js';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const createBody = z.object({
  name: z.string().min(1).max(100),
  data: z.record(z.unknown()).optional().default({}),
});

const updateBody = z.object({
  name: z.string().min(1).max(100).optional(),
  data: z.record(z.unknown()).optional(),
});

const historyBody = z.object({
  entryHtml:  z.string().min(1).max(65536),
  occurredAt: z.string().datetime().optional(),
});

const idParam = z.object({
  id: z.string().uuid('Invalid character ID'),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function characterRoutes(server: FastifyInstance): Promise<void> {

  // All routes in this plugin require authentication
  server.addHook('preHandler', authenticate);

  // ── GET / ─────────────────────────────────────────────────────────────────
  server.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const result = await chars.list(req.user!.id).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── POST / ────────────────────────────────────────────────────────────────
  server.post('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(createBody, req.body, reply);
    if (!body) return;

    const character = await chars.create(req.user!.id, body.name, body.data)
      .catch(handleError(reply));
    if (!character || reply.sent) return;

    return reply.status(201).send(character);
  });

  // ── GET /:id ──────────────────────────────────────────────────────────────
  server.get('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const params = parseBody(idParam, req.params, reply);
    if (!params) return;

    const character = await chars.get(req.user!.id, params.id)
      .catch(handleError(reply));
    if (!character || reply.sent) return;

    return reply.status(200).send(character);
  });

  // ── PUT /:id ──────────────────────────────────────────────────────────────
  server.put('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const params = parseBody(idParam, req.params, reply);
    if (!params) return;

    const body = parseBody(updateBody, req.body, reply);
    if (!body) return;

    const character = await chars.update(req.user!.id, params.id, body)
      .catch(handleError(reply));
    if (!character || reply.sent) return;

    return reply.status(200).send(character);
  });

  // ── DELETE /:id ───────────────────────────────────────────────────────────
  server.delete('/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const params = parseBody(idParam, req.params, reply);
    if (!params) return;

    await chars.remove(req.user!.id, params.id).catch(handleError(reply));
    if (reply.sent) return;

    return reply.status(204).send();
  });

  // ── GET /:id/history ──────────────────────────────────────────────────────
  server.get('/:id/history', async (req: FastifyRequest, reply: FastifyReply) => {
    const params = parseBody(idParam, req.params, reply);
    if (!params) return;

    const history = await chars.getHistory(req.user!.id, params.id)
      .catch(handleError(reply));
    if (!history || reply.sent) return;

    return reply.status(200).send(history);
  });

  // ── POST /:id/history ─────────────────────────────────────────────────────
  server.post('/:id/history', async (req: FastifyRequest, reply: FastifyReply) => {
    const params = parseBody(idParam, req.params, reply);
    if (!params) return;

    const body = parseBody(historyBody, req.body, reply);
    if (!body) return;

    await chars.appendHistory(
      req.user!.id,
      params.id,
      body.entryHtml,
      body.occurredAt ? new Date(body.occurredAt) : undefined,
    ).catch(handleError(reply));
    if (reply.sent) return;

    return reply.status(201).send({ ok: true });
  });

  // ── DELETE /:id/history ───────────────────────────────────────────────────
  server.delete('/:id/history', async (req: FastifyRequest, reply: FastifyReply) => {
    const params = parseBody(idParam, req.params, reply);
    if (!params) return;

    await chars.clearHistory(req.user!.id, params.id).catch(handleError(reply));
    if (reply.sent) return;

    return reply.status(204).send();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBody<T>(schema: z.ZodType<T>, data: unknown, reply: FastifyReply): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    reply.status(400).send({
      statusCode: 400,
      error:      'Bad Request',
      message:    result.error.errors.map((e) => e.message).join(', '),
    });
    return null;
  }
  return result.data;
}

function handleError(reply: FastifyReply) {
  return (err: unknown) => {
    if (err instanceof chars.CharacterError) {
      reply.status(err.statusCode).send({
        statusCode: err.statusCode,
        error:      err.name,
        message:    err.message,
      });
    } else {
      reply.status(500).send({
        statusCode: 500,
        error:      'Internal Server Error',
        message:    'An unexpected error occurred',
      });
    }
  };
}
