/**
 * Health route — used by the deploy script and any uptime monitoring.
 *
 * GET /health returns:
 *   200 { status: 'ok',      db: 'ok', redis: 'ok'    }
 *   503 { status: 'degraded', db: 'error', redis: 'ok' }
 *
 * This replaces the inline health check in server.ts (which is removed
 * once this route is registered).
 */

import type { FastifyInstance } from 'fastify';
import { checkDbHealth } from '../db/index.js';
import { redis } from '../server.js';

export async function healthRoutes(server: FastifyInstance): Promise<void> {
  server.get('/health', async (req, reply) => {
    const [dbOk, redisOk] = await Promise.all([
      checkDbHealth(),
      redis.ping().then(() => true).catch(() => false),
    ]);

    const healthy = dbOk && redisOk;

    return reply.status(healthy ? 200 : 503).send({
      status:    healthy ? 'ok' : 'degraded',
      db:        dbOk    ? 'ok' : 'error',
      redis:     redisOk ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      version:   process.env['npm_package_version'] ?? 'unknown',
    });
  });
}
