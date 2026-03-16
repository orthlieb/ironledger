/**
 * Authentication middleware.
 *
 * Two exported hooks:
 *
 *  authenticate     — requires a valid JWT. Populates req.user.
 *                     Use on all protected routes.
 *
 *  optionalAuth     — attaches req.user if a valid JWT is present,
 *                     but does not reject the request if it's missing.
 *                     Use on routes that behave differently when logged in
 *                     (e.g. a public page that shows extra info to members).
 *
 * The JWT is expected in the Authorization header:
 *   Authorization: Bearer <access_token>
 *
 * The refresh token travels separately in an HttpOnly cookie and is
 * handled only by the POST /auth/refresh route — never here.
 */

import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { verifyAccessToken } from '../lib/tokens.js';

// ---------------------------------------------------------------------------
// authenticate — rejects the request if no valid JWT is present
// ---------------------------------------------------------------------------

export async function authenticate(
  req:   FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = extractBearerToken(req);

  if (!token) {
    return reply.status(401).send({
      statusCode: 401,
      error:      'Unauthorized',
      message:    'Authentication required',
    });
  }

  try {
    const payload = await verifyAccessToken(token);

    if (!payload.sub || !payload.email) {
      throw new Error('Malformed token payload');
    }

    // Attach to request — available in route handlers as req.user
    req.user = {
      id:    payload.sub,
      email: payload.email,
      role:  payload.role ?? 'user',
    };
  } catch {
    // Token is invalid, expired, or tampered with.
    // Don't reveal which — all cases return 401.
    return reply.status(401).send({
      statusCode: 401,
      error:      'Unauthorized',
      message:    'Invalid or expired token',
    });
  }
}

// ---------------------------------------------------------------------------
// optionalAuth — attaches req.user if a valid token is present, silent if not
// ---------------------------------------------------------------------------

export async function optionalAuth(
  req:   FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) return;

  try {
    const payload = await verifyAccessToken(token);
    if (payload.sub && payload.email) {
      req.user = { id: payload.sub, email: payload.email, role: payload.role ?? 'user' };
    }
  } catch {
    // Silently ignore invalid tokens in optional mode
  }
}

// ---------------------------------------------------------------------------
// Helper — pull the raw token out of "Authorization: Bearer <token>"
// ---------------------------------------------------------------------------

function extractBearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}
