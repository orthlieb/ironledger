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
import * as portraits from '../services/portraitService.js';
import { isValidImageUrl } from '../lib/imageUrl.js';
import { sendPortraitHeaders, ifNoneMatchHits } from '../lib/portraitHttp.js';
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
  entryHtml: z.string().min(1).max(65536),
  occurredAt: z.string().datetime().optional(),
});

const idParam = z.object({
  id: z.string().uuid('Invalid character ID'),
});

const portraitBody = z.object({ dataUrl: z.string() });

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const characterRoutes: FastifyPluginAsyncZod = async (server) => {
  // All routes in this plugin require authentication
  server.addHook('preHandler', authenticate);

  // ── GET / ─────────────────────────────────────────────────────────────────
  server.get('/', async (req, reply) => {
    const result = await chars.list(req.user!.id).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── POST / ────────────────────────────────────────────────────────────────
  server.post(
    '/',
    {
      schema: {
        body: createBody,
      },
    },
    async (req, reply) => {
      if (rejectBadPortrait(req.body.data, reply)) return;
      const character = await chars
        .create(req.user!.id, req.body.name, req.body.data)
        .catch(handleError(reply));
      if (!character || reply.sent) return;
      return reply.status(201).send(character);
    },
  );

  // ── GET /:id ──────────────────────────────────────────────────────────────
  server.get(
    '/:id',
    {
      schema: {
        params: idParam,
      },
    },
    async (req, reply) => {
      const character = await chars.get(req.user!.id, req.params.id).catch(handleError(reply));
      if (!character || reply.sent) return;
      return reply.status(200).send(character);
    },
  );

  // ── PUT /:id ──────────────────────────────────────────────────────────────
  server.put(
    '/:id',
    {
      schema: {
        params: idParam,
        body: updateBody,
      },
    },
    async (req, reply) => {
      if (rejectBadPortrait(req.body.data, reply)) return;
      const character = await chars
        .update(req.user!.id, req.params.id, req.body)
        .catch(handleError(reply));
      if (!character || reply.sent) return;
      return reply.status(200).send(character);
    },
  );

  // ── DELETE /:id ───────────────────────────────────────────────────────────
  server.delete(
    '/:id',
    {
      schema: {
        params: idParam,
      },
    },
    async (req, reply) => {
      await chars.remove(req.user!.id, req.params.id).catch(handleError(reply));
      if (reply.sent) return;
      return reply.status(204).send();
    },
  );

  // ── GET /:id/history ──────────────────────────────────────────────────────
  server.get(
    '/:id/history',
    {
      schema: {
        params: idParam,
      },
    },
    async (req, reply) => {
      const history = await chars.getHistory(req.user!.id, req.params.id).catch(handleError(reply));
      if (!history || reply.sent) return;
      return reply.status(200).send(history);
    },
  );

  // ── POST /:id/history ─────────────────────────────────────────────────────
  server.post(
    '/:id/history',
    {
      schema: {
        params: idParam,
        body: historyBody,
      },
    },
    async (req, reply) => {
      await chars
        .appendHistory(
          req.user!.id,
          req.params.id,
          req.body.entryHtml,
          req.body.occurredAt ? new Date(req.body.occurredAt) : undefined,
        )
        .catch(handleError(reply));
      if (reply.sent) return;
      return reply.status(201).send({ ok: true });
    },
  );

  // ── DELETE /:id/history ───────────────────────────────────────────────────
  server.delete(
    '/:id/history',
    {
      schema: {
        params: idParam,
      },
    },
    async (req, reply) => {
      await chars.clearHistory(req.user!.id, req.params.id).catch(handleError(reply));
      if (reply.sent) return;
      return reply.status(204).send();
    },
  );

  // ── GET /:id/portrait — raw portrait bytes (cacheable, ETag-revalidated) ────
  // The character's portrait lives in the content-addressed blob store, not in
  // data.portrait, so the character list payload stays image-free.
  server.get('/:id/portrait', { schema: { params: idParam } }, async (req, reply) => {
    try {
      const portrait = await portraits.getPortrait(req.user!.id, 'character', req.params.id);
      if (!portrait) {
        return reply
          .status(404)
          .send({ statusCode: 404, error: 'Not Found', message: 'No portrait for this character' });
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

  // ── PUT /:id/portrait — store/replace the character portrait ───────────────
  server.put(
    '/:id/portrait',
    { schema: { params: idParam, body: portraitBody } },
    async (req, reply) => {
      try {
        const { etag } = await portraits.putPortrait(
          req.user!.id,
          'character',
          req.params.id,
          req.body.dataUrl,
        );
        return reply.status(200).send({ etag });
      } catch (err) {
        if (err instanceof portraits.PortraitError) {
          return reply
            .status(400)
            .send({ statusCode: 400, error: 'Bad Request', message: err.message });
        }
        return handleError(reply)(err);
      }
    },
  );

  // ── DELETE /:id/portrait — clear the character portrait ────────────────────
  server.delete('/:id/portrait', { schema: { params: idParam } }, async (req, reply) => {
    await portraits
      .deletePortrait(req.user!.id, 'character', req.params.id)
      .catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(204).send();
  });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// The character portrait lives at data.portrait as a base64 image data URL.
// data is free-form (z.record), so validate the portrait the same way the
// session collections validate imageUrl. Returns true (and sends a 400) when
// the portrait is rejected, so the caller can bail.
function rejectBadPortrait(
  data: Record<string, unknown> | undefined,
  reply: FastifyReply,
): boolean {
  if (!data || isValidImageUrl(data.portrait)) return false;
  reply.status(400).send({
    statusCode: 400,
    error: 'Bad Request',
    message: 'data.portrait is not a valid image data URL or https URL (or exceeds size cap)',
  });
  return true;
}

function handleError(reply: FastifyReply) {
  return (err: unknown) => {
    if (err instanceof chars.CharacterError) {
      reply.status(err.statusCode).send({
        statusCode: err.statusCode,
        error: err.name,
        message: err.message,
      });
    } else {
      reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      });
    }
  };
}
