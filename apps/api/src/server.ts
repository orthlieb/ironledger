/**
 * Fastify server factory.
 *
 * buildServer() creates and configures the Fastify instance but does NOT
 * start listening. This separation allows tests to create the server without
 * binding a port, and the entry point (main.ts) to bind the port separately.
 */

import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { Redis } from 'ioredis';
import { serializerCompiler, validatorCompiler, jsonSchemaTransform } from 'fastify-type-provider-zod';

import { config } from './config.js';
import { checkDbHealth, adminDb } from './db/index.js';
import { securityEvents } from './db/schema.js';

import { authRoutes }        from './routes/auth.js';
import { characterRoutes }   from './routes/characters.js';
import { catalogueRoutes }   from './routes/catalogue.js';
import { userDataRoutes }    from './routes/userData.js';
import { sessionLogRoutes }  from './routes/sessionLog.js';
import { adminRoutes }       from './routes/admin.js';
import { inviteRoutes }      from './routes/invites.js';
import { healthRoutes }      from './routes/health.js';

// ---------------------------------------------------------------------------
// Redis client (shared across the app)
// ---------------------------------------------------------------------------

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck:     true,
  lazyConnect:          false,
});

redis.on('error', (err) => {
  // Log but don't crash — rate limiting degrades gracefully without Redis
  console.error('Redis error:', err.message);
});

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level:     config.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: config.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,    // in production, output raw JSON (for log aggregators)
    },
    trustProxy: true,   // respect X-Forwarded-For from Nginx
  });

  // ── Zod type provider — replaces AJV for request validation ──────────────
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  // ── OpenAPI spec + /docs UI ──────────────────────────────────────────────
  // Both are useful in dev for exploring the API and verifying zod schemas.
  // In production they would expose internal route shapes, which helps
  // attackers map the attack surface. Gate behind non-prod.
  if (config.NODE_ENV !== 'production') {
    await server.register(swagger, {
      transform: jsonSchemaTransform,
      openapi: {
        openapi: '3.0.3',
        info: {
          title:       'Iron Ledger API',
          description: 'REST API for the Ironsworn TTRPG character tracker.',
          version:     '1.0.1',
        },
        components: {
          securitySchemes: {
            bearerAuth: {
              type:         'http',
              scheme:       'bearer',
              bearerFormat: 'JWT',
              description:  'Access token obtained from POST /api/v1/auth/login',
            },
          },
        },
      },
    });

    await server.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking:  true,
      },
    });
  }

  // ── Security headers ──────────────────────────────────────────────────────
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'", 'https://hcaptcha.com', 'https://*.hcaptcha.com'],
        styleSrc:    ["'self'", "'unsafe-inline'", 'https://hcaptcha.com', 'https://*.hcaptcha.com'],
        frameSrc:    ['https://hcaptcha.com', 'https://*.hcaptcha.com'],
        connectSrc:  ["'self'", 'https://hcaptcha.com', 'https://*.hcaptcha.com'],
        imgSrc:      ["'self'", 'data:', 'https://hcaptcha.com', 'https://*.hcaptcha.com'],
        fontSrc:     ["'self'"],
        objectSrc:   ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,  // required for some browser APIs
  });

  // Swagger UI uses inline scripts — remove CSP on /docs paths only
  server.addHook('onSend', (_req, reply, payload, done) => {
    if (_req.url.startsWith('/docs')) {
      reply.removeHeader('content-security-policy');
    }
    done(null, payload);
  });

  // ── CORS ──────────────────────────────────────────────────────────────────
  await server.register(cors, {
    origin:      config.NODE_ENV === 'production' ? config.APP_URL : true,
    credentials: true,    // allow cookies on cross-origin requests
    methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // ── Cookies ───────────────────────────────────────────────────────────────
  // No secret needed — we don't use signed cookies.
  // The refresh token is already a cryptographic random; signing adds nothing.
  await server.register(cookie);

  // ── Rate limiting (backed by Redis) ───────────────────────────────────────
  await server.register(rateLimit, {
    global:    true,
    max:       config.RATE_LIMIT_GLOBAL,
    timeWindow: '1 minute',
    redis,
    keyGenerator: (req) => {
      // Prefer authenticated user ID over IP — logged-in users aren't unfairly
      // blocked by shared IPs (e.g. office NAT, mobile carrier NAT)
      return (req.user?.id ?? req.ip) as string;
    },
    errorResponseBuilder: () => ({
      statusCode: 429,
      error:      'Too Many Requests',
      message:    'Rate limit exceeded. Please slow down.',
    }),
  });

  // ── Request body size limit ───────────────────────────────────────────────
  // 2 MB to accommodate portrait images and log HTML payloads.
  server.addContentTypeParser(
    'application/json',
    { parseAs: 'string', bodyLimit: 2097152 },
    (req, body, done) => {
      try {
        done(null, JSON.parse(body as string));
      } catch {
        // Don't include the parser's own error message — it can leak
        // internals like position offsets / token snippets. Generic is
        // sufficient; Fastify maps this to a 400 automatically.
        const e = new Error('Invalid JSON body') as Error & { statusCode?: number };
        e.statusCode = 400;
        done(e, undefined);
      }
    },
  );

  // ── Global error handler ──────────────────────────────────────────────────
  server.setErrorHandler((error: FastifyError, req, reply) => {
    // Log the full error server-side (with stack trace)
    req.log.error({ err: error }, 'Request error');

    // Determine the status code
    const statusCode = error.statusCode ?? 500;

    // Audit-log real errors (skip routine 401/403 auth rejections — too noisy)
    if (adminDb && statusCode >= 400 && statusCode !== 401 && statusCode !== 403) {
      void adminDb.insert(securityEvents).values({
        userId:    req.user?.id ?? null,
        eventType: 'api_error',
        ipAddress: req.ip ?? null,
        metadata: {
          method:     req.method,
          url:        req.url,
          statusCode,
          message:    error.message,
          stack:      error.stack ?? null,
          userEmail:  req.user?.email ?? null,
        },
      }).catch(() => { /* don't let logging break the response */ });
    }

    // Never expose internal error details in production
    const message = config.NODE_ENV === 'production' && statusCode === 500
      ? 'An unexpected error occurred'
      : error.message;

    reply.status(statusCode).send({
      statusCode,
      error:   getErrorName(statusCode),
      message,
    });
  });

  // ── 404 handler ───────────────────────────────────────────────────────────
  server.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      statusCode: 404,
      error:      'Not Found',
      message:    `Route ${req.method} ${req.url} not found`,
    });
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  // All routes are prefixed with /api/v1 — future versions can add /api/v2
  // without breaking existing clients.
  await server.register(healthRoutes);
  await server.register(authRoutes,      { prefix: '/api/v1/auth' });
  await server.register(characterRoutes, { prefix: '/api/v1/characters' });
  await server.register(catalogueRoutes, { prefix: '/api/v1/catalogue' });
  await server.register(userDataRoutes,   { prefix: '/api/v1/session' });
  await server.register(sessionLogRoutes, { prefix: '/api/v1/session/log' });
  await server.register(adminRoutes,      { prefix: '/api/v1/admin' });
  await server.register(inviteRoutes,     { prefix: '/api/v1/invites' });

  // ── Public system status (no auth) ────────────────────────────────────
  // Returns maintenance + broadcast in a single response so the web layout
  // only polls one endpoint for both banners.
  const { getStatus: getMaintenanceStatus } = await import('./services/maintenanceService.js');
  const { getStatus: getBroadcastStatus }   = await import('./services/broadcastService.js');

  server.get('/api/v1/system/status', {
    schema: {
      tags:    ['System'],
      summary: 'Get combined maintenance + broadcast status (public)',
    },
  }, async (_req, reply) => {
    const [maintenance, broadcast] = await Promise.all([
      getMaintenanceStatus().catch(() => ({
        enabled: false, message: null, shutdownAt: null,
      })),
      getBroadcastStatus().catch(() => ({
        active: false, message: null, severity: 'info' as const, postedAt: null,
      })),
    ]);
    return reply.status(200).send({ maintenance, broadcast });
  });

  // ── Public registration status (no auth) ─────────────────────────────
  // Combines lock + quota + maintenance so /register/+page.server.ts can
  // decide whether to show the form in one round-trip. Each sub-status
  // falls back to a "fine" default if Redis is flaky — we never want a
  // transient infra issue to mark registration closed.
  const { getStatus: getRegistrationLockStatus } = await import('./services/registrationLockService.js');
  const { getStatus: getRegistrationQuotaStatus } = await import('./services/registrationQuotaService.js');

  server.get('/api/v1/registration/status', {
    schema: {
      tags:    ['System'],
      summary: 'Combined registration gate status (maintenance / lock / quota)',
    },
  }, async (_req, reply) => {
    const [maintenance, lock, quota] = await Promise.all([
      getMaintenanceStatus().catch(() => ({
        enabled: false, message: null, shutdownAt: null,
      })),
      getRegistrationLockStatus().catch(() => ({
        locked: false, message: null,
      })),
      getRegistrationQuotaStatus().catch(() => ({
        daily: null, usedToday: 0, remaining: null,
        resetsAt: new Date().toISOString(), exhausted: false,
      })),
    ]);

    // Derive a single "closed" flag + reason the frontend can render from.
    // Priority: maintenance > admin lock > daily quota.
    let closed: null | { reason: 'maintenance' | 'locked' | 'quota'; message: string } = null;
    if (maintenance.enabled) {
      closed = {
        reason:  'maintenance',
        message: maintenance.message ?? 'The system is currently under maintenance. Please try again later.',
      };
    } else if (lock.locked) {
      closed = {
        reason:  'locked',
        message: lock.message ?? 'New account registration is currently disabled.',
      };
    } else if (quota.exhausted) {
      closed = {
        reason:  'quota',
        message: "Today's new signups are full. Please come back tomorrow — we reset at UTC midnight.",
      };
    }

    return reply.status(200).send({ closed, maintenance, lock, quota });
  });

  // Backwards-compat alias: the web client used to poll this endpoint alone.
  // Kept for one release so older client builds don't 404 during rolling
  // deploy. Remove in the release after 5.x.
  server.get('/api/v1/maintenance/status', {
    schema: {
      tags:    ['Maintenance'],
      summary: 'Get current maintenance mode status (public, deprecated — use /api/v1/system/status)',
    },
  }, async (_req, reply) => {
    try {
      const status = await getMaintenanceStatus();
      return reply.status(200).send(status);
    } catch {
      return reply.status(200).send({ enabled: false, message: null, shutdownAt: null });
    }
  });

  return server;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getErrorName(statusCode: number): string {
  const names: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    503: 'Service Unavailable',
  };
  return names[statusCode] ?? 'Error';
}

// ---------------------------------------------------------------------------
// Extend FastifyRequest with our custom properties
// (populated by the auth middleware in Layer 6)
// ---------------------------------------------------------------------------

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id:    string;
      email: string;
      role:  string;
    };
  }
}
