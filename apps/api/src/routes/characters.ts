/**
 * Character routes — CRUD + history.
 *
 * All routes require authentication (authenticate preHandler).
 * req.user is guaranteed to be populated.
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authenticate } from '../middleware/authenticate.js';
import * as chars from '../services/characterService.js';
import type { FastifyReply } from 'fastify';

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

export const characterRoutes: FastifyPluginAsyncZod = async (server) => {

  // All routes in this plugin require authentication
  server.addHook('preHandler', authenticate);

  // ── GET / ─────────────────────────────────────────────────────────────────
  server.get('/', {
    schema: {
      tags:     ['Characters'],
      summary:  'List all characters for the authenticated user',
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    const result = await chars.list(req.user!.id).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── POST / ────────────────────────────────────────────────────────────────
  server.post('/', {
    schema: {
      tags:     ['Characters'],
      summary:  'Create a new character',
      body:     createBody,
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    const character = await chars.create(req.user!.id, req.body.name, req.body.data)
      .catch(handleError(reply));
    if (!character || reply.sent) return;
    return reply.status(201).send(character);
  });

  // ── GET /:id ──────────────────────────────────────────────────────────────
  server.get('/:id', {
    schema: {
      tags:     ['Characters'],
      summary:  'Get a character by ID',
      params:   idParam,
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    const character = await chars.get(req.user!.id, req.params.id)
      .catch(handleError(reply));
    if (!character || reply.sent) return;
    return reply.status(200).send(character);
  });

  // ── PUT /:id ──────────────────────────────────────────────────────────────
  server.put('/:id', {
    schema: {
      tags:     ['Characters'],
      summary:  'Update a character',
      params:   idParam,
      body:     updateBody,
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    const character = await chars.update(req.user!.id, req.params.id, req.body)
      .catch(handleError(reply));
    if (!character || reply.sent) return;
    return reply.status(200).send(character);
  });

  // ── DELETE /:id ───────────────────────────────────────────────────────────
  server.delete('/:id', {
    schema: {
      tags:     ['Characters'],
      summary:  'Delete a character and all associated data',
      params:   idParam,
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    await chars.remove(req.user!.id, req.params.id).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(204).send();
  });

  // ── GET /:id/history ──────────────────────────────────────────────────────
  server.get('/:id/history', {
    schema: {
      tags:     ['Characters'],
      summary:  'Get character history entries',
      params:   idParam,
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    const history = await chars.getHistory(req.user!.id, req.params.id)
      .catch(handleError(reply));
    if (!history || reply.sent) return;
    return reply.status(200).send(history);
  });

  // ── POST /:id/history ─────────────────────────────────────────────────────
  server.post('/:id/history', {
    schema: {
      tags:     ['Characters'],
      summary:  'Append a history entry',
      params:   idParam,
      body:     historyBody,
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    await chars.appendHistory(
      req.user!.id,
      req.params.id,
      req.body.entryHtml,
      req.body.occurredAt ? new Date(req.body.occurredAt) : undefined,
    ).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(201).send({ ok: true });
  });

  // ── DELETE /:id/history ───────────────────────────────────────────────────
  server.delete('/:id/history', {
    schema: {
      tags:     ['Characters'],
      summary:  'Clear all history entries for a character',
      params:   idParam,
      security: [{ bearerAuth: [] }],
    },
  }, async (req, reply) => {
    await chars.clearHistory(req.user!.id, req.params.id).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(204).send();
  });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
