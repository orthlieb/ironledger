/**
 * Public invite routes.
 *
 *   GET  /api/v1/invites/:token         → InvitePreview
 *   POST /api/v1/invites/:token/accept  → AuthResult (+ refresh-token cookie)
 *
 * Both are public (no authenticate middleware). Accept is rate-limited with
 * the same bucket as /register. Admin-side routes live in routes/admin.ts.
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyReply } from 'fastify';
import * as inviteService from '../services/inviteService.js';
import { AuthError } from '../services/authService.js';
import { PwnedPasswordError } from '../lib/hibp.js';
import { logSecurityEvent } from '../middleware/securityLogger.js';
import { config } from '../config.js';

const REFRESH_COOKIE = 'rt';

function cookieOptions() {
  return {
    httpOnly: true,
    secure:   config.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path:     '/api/v1/auth',
    maxAge:   config.REFRESH_TOKEN_TTL_DAYS * 86400,
  };
}

// Local error handler — mirrors routes/auth.ts handleAuthError without
// exporting that one.
function handleInviteError(reply: FastifyReply) {
  return (err: unknown) => {
    if (err instanceof AuthError) {
      reply.status(err.statusCode).send({
        statusCode: err.statusCode,
        error:      err.name,
        message:    err.message,
      });
    } else if (err instanceof PwnedPasswordError) {
      reply.status(400).send({
        statusCode: 400,
        error:      'Bad Request',
        message:    err.message,
      });
    } else {
      reply.log.error({ err }, 'invite error');
      reply.status(500).send({
        statusCode: 500,
        error:      'Internal Server Error',
        message:    'An unexpected error occurred',
      });
    }
  };
}

const tokenParam = z.object({
  token: z.string().min(16).max(128),
});

const acceptBody = z.object({
  password:    z.string().min(12, 'Password must be at least 12 characters').max(1000),
  displayName: z.string().trim().max(80).optional(),
});

export const inviteRoutes: FastifyPluginAsyncZod = async (server) => {

  // ── GET /:token ── Validate + preview ─────────────────────────────────────
  server.get('/:token', {
    schema: {
      tags:    ['Invites'],
      summary: 'Preview a pending invitation by token',
      params:  tokenParam,
    },
  }, async (req, reply) => {
    const preview = await inviteService.getInvitePreview(req.params.token)
      .catch(handleInviteError(reply));
    if (!preview || reply.sent) return;
    return reply.status(200).send(preview);
  });

  // ── POST /:token/accept ── Consume invite, create user, issue tokens ─────
  server.post('/:token/accept', {
    schema: {
      tags:    ['Invites'],
      summary: 'Accept an invitation and set password',
      params:  tokenParam,
      body:    acceptBody,
    },
    config: {
      // Reuse the register bucket — accepts create accounts too.
      rateLimit: {
        max:        config.RATE_LIMIT_REGISTER,
        timeWindow: '1 hour',
      },
    },
  }, async (req, reply) => {
    const result = await inviteService.acceptInvite(
      req.params.token,
      req.body.password,
      req.body.displayName,
    ).catch(handleInviteError(reply));
    if (!result || reply.sent) return;

    logSecurityEvent({
      eventType: 'invite_accepted',
      req,
      userId:    result.user.id,
      metadata:  { email: result.user.email },
    });

    reply.setCookie(REFRESH_COOKIE, result.refreshToken, cookieOptions());

    return reply.status(200).send({
      user:        result.user,
      accessToken: result.accessToken,
    });
  });
};
