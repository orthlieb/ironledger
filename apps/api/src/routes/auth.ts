/**
 * Auth routes — HTTP layer for authentication.
 *
 * Responsibilities:
 *  - Validate and parse request bodies (Zod schemas on each route)
 *  - Call the auth service
 *  - Set/clear the HttpOnly refresh token cookie
 *  - Map service errors to HTTP status codes
 *  - Log security events
 *
 * The service layer handles all business logic.
 * This layer handles only HTTP concerns.
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authenticate } from '../middleware/authenticate.js';
import { logSecurityEvent } from '../middleware/securityLogger.js';
import { verifyCaptcha, CaptchaError } from '../lib/captcha.js';
import { PwnedPasswordError } from '../lib/hibp.js';
import * as auth from '../services/authService.js';
import { config } from '../config.js';
import { redis } from '../server.js';
import type { FastifyReply } from 'fastify';

// ---------------------------------------------------------------------------
// Cookie configuration for the refresh token
// ---------------------------------------------------------------------------

const REFRESH_COOKIE = 'rt';  // short name — less visible in logs

function cookieOptions() {
  return {
    httpOnly: true,                                    // JS cannot read it
    secure:   config.NODE_ENV === 'production',        // HTTPS only in prod
    sameSite: 'strict' as const,                       // not sent cross-site
    path:     '/api/v1/auth',                          // only sent to auth routes
    maxAge:   config.REFRESH_TOKEN_TTL_DAYS * 86400,   // seconds
  };
}

// ---------------------------------------------------------------------------
// Input schemas (Zod)
// ---------------------------------------------------------------------------

const passwordSchema = z
  .string()
  .min(12,   'Password must be at least 12 characters')
  .max(1000, 'Password is too long');

const registerBody = z.object({
  email:          z.string().email('Invalid email address').max(254),
  password:       passwordSchema,
  captchaToken:   z.string().min(1, 'CAPTCHA is required'),
});

const loginBody = z.object({
  email:          z.string().email().max(254),
  password:       z.string().min(1),
  captchaToken:   z.string().min(1, 'CAPTCHA is required'),
});

const forgotBody = z.object({
  email:        z.string().email().max(254),
  captchaToken: z.string().min(1, 'CAPTCHA is required'),
});

const resetBody = z.object({
  token:    z.string().min(1),
  password: passwordSchema,
});

const verifyBody = z.object({
  token: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export const authRoutes: FastifyPluginAsyncZod = async (server) => {

  // ── POST /register ────────────────────────────────────────────────────────
  server.post('/register', {
    schema: {
      tags:        ['Auth'],
      summary:     'Register a new user',
      description: 'Creates a new account and sends an email verification link. Always returns 202 to prevent email enumeration.',
      body:        registerBody,
      response:    { 202: z.object({ message: z.string() }) },
    },
  }, async (req, reply) => {
    const { email, password, captchaToken } = req.body;

    await verifyCaptcha(captchaToken, req.ip).catch(handleCaptchaError(reply));
    if (reply.sent) return;

    // Per-IP email rate limit — silently drop the send if over quota.
    // The response is always 202 so the caller can't detect the block.
    // Skip in test environment — tests share the same IP and would exhaust the quota.
    if (redis && config.NODE_ENV !== 'test') {
      const key   = `reg_email_ip:${req.ip}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 86_400); // 24-hour window
      if (count > config.MAX_REG_EMAILS_PER_IP) {
        req.log.warn({ ip: req.ip, count }, 'reg email quota exceeded for IP');
        return reply.status(202).send({
          message: 'If that email is not already registered, a verification link is on its way.',
        });
      }
    }

    await auth.register({ email, password }).catch(handleAuthError(reply));
    if (reply.sent) return;

    logSecurityEvent({ eventType: 'register_success', req, metadata: { email } });

    // Always return 202 — we don't confirm whether the email exists
    return reply.status(202).send({
      message: 'If that email is not already registered, a verification link is on its way.',
    });
  });

  // ── POST /verify-email ────────────────────────────────────────────────────
  server.post('/verify-email', {
    schema: {
      tags:    ['Auth'],
      summary: 'Verify email address with token from verification email',
      body:    verifyBody,
    },
  }, async (req, reply) => {
    const result = await auth.verifyEmail(req.body.token).catch(handleAuthError(reply));
    if (!result || reply.sent) return;

    logSecurityEvent({ eventType: 'email_verified', req, userId: result.user.id });

    reply.setCookie(REFRESH_COOKIE, result.refreshToken, cookieOptions());

    return reply.status(200).send({
      user:        result.user,
      accessToken: result.accessToken,
    });
  });

  // ── POST /login ───────────────────────────────────────────────────────────
  server.post('/login', {
    schema: {
      tags:    ['Auth'],
      summary: 'Log in and receive an access token',
      body:    loginBody,
    },
    config: {
      rateLimit: {
        max:        config.RATE_LIMIT_LOGIN,
        timeWindow: '15 minutes',
      },
    },
  }, async (req, reply) => {
    const { email, password, captchaToken } = req.body;

    await verifyCaptcha(captchaToken, req.ip).catch(handleCaptchaError(reply));
    if (reply.sent) return;

    const result = await auth.login({ email, password })
      .catch((err: unknown) => {
        if (err instanceof auth.AuthError) {
          const eventType =
            err.code === 'EMAIL_UNVERIFIED' ? 'login_unverified' :
            err.code === 'ACCOUNT_DISABLED' ? 'account_disabled' :
            'login_failed';
          logSecurityEvent({ eventType, req, metadata: { email } });
          reply.status(err.statusCode).send({ statusCode: err.statusCode, error: err.name, message: err.message });
        } else {
          reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Login failed' });
        }
      });

    if (!result || reply.sent) return;

    logSecurityEvent({ eventType: 'login_success', req, userId: result.user.id });
    reply.setCookie(REFRESH_COOKIE, result.refreshToken, cookieOptions());

    return reply.status(200).send({
      user:        result.user,
      accessToken: result.accessToken,
    });
  });

  // ── POST /refresh ─────────────────────────────────────────────────────────
  server.post('/refresh', {
    schema: {
      tags:    ['Auth'],
      summary: 'Refresh access token using the refresh token cookie',
    },
  }, async (req, reply) => {
    const rawToken = req.cookies[REFRESH_COOKIE];

    if (!rawToken) {
      return reply.status(401).send({
        statusCode: 401,
        error:      'Unauthorized',
        message:    'No refresh token',
      });
    }

    const result = await auth.refresh(rawToken).catch((err: unknown) => {
      if (err instanceof auth.AuthError) {
        if (err.code === 'TOKEN_REUSE') {
          logSecurityEvent({ eventType: 'token_theft', req });
          // Clear the cookie — the legitimate user's browser will get this
          reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
        }
        reply.status(err.statusCode).send({ statusCode: err.statusCode, error: err.name, message: err.message });
      } else {
        reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: 'Refresh failed' });
      }
    });

    if (!result || reply.sent) return;

    logSecurityEvent({ eventType: 'token_refresh', req, userId: result.user.id });
    reply.setCookie(REFRESH_COOKIE, result.refreshToken, cookieOptions());

    return reply.status(200).send({
      user:        result.user,
      accessToken: result.accessToken,
    });
  });

  // ── POST /logout ──────────────────────────────────────────────────────────
  server.post('/logout', {
    schema: {
      tags:     ['Auth'],
      summary:  'Log out and revoke the refresh token',
      security: [{ bearerAuth: [] }],
    },
    preHandler: authenticate,
  }, async (req, reply) => {
    const rawToken = req.cookies[REFRESH_COOKIE];

    if (rawToken && req.user) {
      await auth.logout(rawToken, req.user.id).catch(() => {/* ignore */});
    }

    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });

    return reply.status(200).send({ message: 'Logged out' });
  });

  // ── POST /forgot-password ─────────────────────────────────────────────────
  server.post('/forgot-password', {
    schema: {
      tags:        ['Auth'],
      summary:     'Request a password reset email',
      description: 'Always returns 202 to prevent email enumeration.',
      body:        forgotBody,
      response:    { 202: z.object({ message: z.string() }) },
    },
    config: {
      rateLimit: {
        max:        config.RATE_LIMIT_REGISTER,
        timeWindow: '1 hour',
      },
    },
  }, async (req, reply) => {
    const { email, captchaToken } = req.body;

    await verifyCaptcha(captchaToken, req.ip).catch(handleCaptchaError(reply));
    if (reply.sent) return;

    // Always returns 202 — prevents email enumeration
    await auth.forgotPassword(email).catch(() => {/* silent */});

    logSecurityEvent({ eventType: 'password_reset_req', req, metadata: { email } });

    return reply.status(202).send({
      message: 'If an account exists for that email, a reset link is on its way.',
    });
  });

  // ── POST /reset-password ──────────────────────────────────────────────────
  server.post('/reset-password', {
    schema: {
      tags:    ['Auth'],
      summary: 'Reset password using token from reset email',
      body:    resetBody,
      response: { 200: z.object({ message: z.string() }) },
    },
  }, async (req, reply) => {
    await auth.resetPassword(req.body.token, req.body.password).catch(handleAuthError(reply));
    if (reply.sent) return;

    logSecurityEvent({ eventType: 'password_reset_done', req });

    // Clear any refresh cookie — the user must log in again on all devices
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });

    return reply.status(200).send({ message: 'Password updated. Please log in.' });
  });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a catch handler that maps AuthError → HTTP response. */
function handleAuthError(reply: FastifyReply) {
  return (err: unknown) => {
    if (err instanceof auth.AuthError) {
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
      reply.status(500).send({
        statusCode: 500,
        error:      'Internal Server Error',
        message:    'An unexpected error occurred',
      });
    }
  };
}

/** Returns a catch handler for CAPTCHA errors. */
function handleCaptchaError(reply: FastifyReply) {
  return (err: unknown) => {
    if (err instanceof CaptchaError) {
      reply.status(400).send({
        statusCode: 400,
        error:      'Bad Request',
        message:    'CAPTCHA verification failed. Please try again.',
      });
    } else {
      reply.status(503).send({
        statusCode: 503,
        error:      'Service Unavailable',
        message:    'CAPTCHA service temporarily unavailable',
      });
    }
  };
}
