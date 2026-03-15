/**
 * Fastify server factory.
 *
 * buildServer() creates and configures the Fastify instance but does NOT
 * start listening. This separation allows tests to create the server without
 * binding a port, and the entry point (main.ts) to bind the port separately.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { Redis } from 'ioredis';

import { config } from './config.js';
import { checkDbHealth } from './db/index.js';

import { authRoutes }       from './routes/auth.js';
import { characterRoutes }  from './routes/characters.js';
import { catalogueRoutes }  from './routes/catalogue.js';
import { userDataRoutes }   from './routes/userData.js';
import { healthRoutes }     from './routes/health.js';

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
    ajv: {
      customOptions: {
        removeAdditional: 'all',   // strip unknown fields from request bodies
        coerceTypes:      false,   // don't silently coerce types (fail instead)
      },
    },
  });

  // ── Security headers ──────────────────────────────────────────────────────
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'", 'https://hcaptcha.com', 'https://*.hcaptcha.com'],
        styleSrc:    ["'self'", "'unsafe-inline'", 'https://hcaptcha.com', 'https://*.hcaptcha.com'],
        frameSrc:    ['https://hcaptcha.com', 'https://*.hcaptcha.com'],
        connectSrc:  ["'self'", 'https://hcaptcha.com', 'https://*.hcaptcha.com'],
        imgSrc:      ["'self'", 'data:'],
        fontSrc:     ["'self'"],
        objectSrc:   ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,  // required for some browser APIs
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
  // 64KB is more than enough for any API request in this app.
  // Prevents DoS via oversized payloads.
  server.addContentTypeParser(
    'application/json',
    { parseAs: 'string', bodyLimit: 65536 },
    (req, body, done) => {
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        const error = err as Error;
        done(new Error('Invalid JSON: ' + error.message), undefined);
      }
    },
  );

  // ── Global error handler ──────────────────────────────────────────────────
  server.setErrorHandler((error, req, reply) => {
    // Log the full error server-side (with stack trace)
    req.log.error({ err: error }, 'Request error');

    // Determine the status code
    const statusCode = error.statusCode ?? 500;

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
  await server.register(userDataRoutes,  { prefix: '/api/v1/session' });

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
    };
  }
}
