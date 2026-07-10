/**
 * AI companion routes (/api/v1/ai).
 *
 * Per-provider config is stored server-side with the API key encrypted at rest;
 * keys are never returned to the client. Generation runs server-side and
 * streams a normalized SSE text stream back, so the browser never handles the
 * key or talks to the provider directly.
 */
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyReply } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import * as ai from '../services/aiConfigService.js';
import { streamProvider, testProvider } from '../services/aiProvider.js';

const providerParam = z.object({ provider: z.enum(['claude', 'chatgpt', 'gemini']) });
const activeBody = z.object({ provider: z.enum(['none', 'claude', 'chatgpt', 'gemini']) });
const providerConfigBody = z.object({
  model: z.string().min(1).max(100),
  setup: z.string().max(8000),
  // Omit to keep the existing key; empty string is treated as "keep".
  key: z.string().max(1000).optional(),
});
const generateBody = z.object({
  user: z.string().min(1).max(400_000),
  system: z.string().max(20_000).optional(),
  maxTokens: z.number().int().min(1).max(8000).optional(),
});

export const aiRoutes: FastifyPluginAsyncZod = async (server) => {
  server.addHook('preHandler', authenticate);

  // ── GET /ai/config — settings view (keys elided to hasKey) ─────────────────
  server.get('/config', async (req, reply) => {
    const view = await ai.getConfig(req.user!.id).catch(handleError(reply));
    if (!view || reply.sent) return;
    return reply.status(200).send(view);
  });

  // ── PUT /ai/active — select None / Claude / ChatGPT ────────────────────────
  server.put('/active', { schema: { body: activeBody } }, async (req, reply) => {
    const provider = req.body.provider === 'none' ? null : req.body.provider;
    await ai.setActiveProvider(req.user!.id, provider).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(200).send({ ok: true });
  });

  // ── PUT /ai/provider/:provider — set model/setup (+ optional key) ──────────
  server.put(
    '/provider/:provider',
    { schema: { params: providerParam, body: providerConfigBody } },
    async (req, reply) => {
      await ai
        .setProviderConfig(req.user!.id, req.params.provider, req.body)
        .catch(handleError(reply));
      if (reply.sent) return;
      return reply.status(200).send({ ok: true });
    },
  );

  // ── DELETE /ai/provider/:provider/key — forget the stored key ──────────────
  server.delete(
    '/provider/:provider/key',
    { schema: { params: providerParam } },
    async (req, reply) => {
      await ai.clearProviderKey(req.user!.id, req.params.provider).catch(handleError(reply));
      if (reply.sent) return;
      return reply.status(200).send({ ok: true });
    },
  );

  // ── POST /ai/test/:provider — verify the stored key ────────────────────────
  server.post('/test/:provider', { schema: { params: providerParam } }, async (req, reply) => {
    const stored = await ai
      .getProviderKey(req.user!.id, req.params.provider)
      .catch(handleError(reply));
    if (reply.sent) return;
    if (!stored)
      return reply.status(200).send({ ok: false, message: 'No key stored for this provider.' });
    const result = await testProvider(req.params.provider, stored.apiKey, stored.model);
    return reply.status(200).send(result);
  });

  // ── POST /ai/generate — server-side streaming generation ───────────────────
  server.post('/generate', { schema: { body: generateBody } }, async (req, reply) => {
    const active = await ai.getActiveForGeneration(req.user!.id).catch(handleError(reply));
    if (reply.sent) return;
    if (!active) {
      return reply.status(400).send({ error: 'No AI companion is configured with a key.' });
    }

    // Stream a normalized SSE of { text } deltas, then { done } or { error }.
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    const ac = new AbortController();
    raw.on('close', () => ac.abort()); // client disconnect → cancel upstream

    try {
      const gen = streamProvider(active.provider, {
        apiKey: active.apiKey,
        model: active.model,
        system: req.body.system ?? active.setup,
        user: req.body.user,
        signal: ac.signal,
        maxTokens: req.body.maxTokens,
      });
      for await (const chunk of gen) {
        if (chunk) raw.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
      raw.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch (err) {
      if (!ac.signal.aborted) {
        const message = err instanceof Error ? err.message : 'Generation failed.';
        raw.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      }
    } finally {
      raw.end();
    }
  });
};

function handleError(reply: FastifyReply) {
  return (err: unknown) => {
    console.error('[aiRoutes]', err);
    reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  };
}
