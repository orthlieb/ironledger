/**
 * Admin routes — user management and system stats.
 *
 * All routes require authentication + admin role.
 * Only an admin can promote/demote users — there is no self-registration
 * path to admin. The seed script creates the initial admin.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import * as adminService from '../services/adminService.js';
import * as maintenanceService from '../services/maintenanceService.js';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const userIdParam = z.object({
  id: z.string().uuid('Invalid user ID'),
});

const setRoleBody = z.object({
  role: z.enum(['user', 'admin']),
});

const maintenanceBody = z.object({
  message:              z.string().min(1).max(500),
  minutesUntilShutdown: z.number().int().min(0).max(1440),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function adminRoutes(server: FastifyInstance): Promise<void> {
  // Both hooks run on every route in this plugin
  server.addHook('preHandler', authenticate);
  server.addHook('preHandler', requireAdmin);

  // ── GET / ── List all users ─────────────────────────────────────────────
  server.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
    const result = await adminService.listUsers().catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── GET /stats ── System health stats ───────────────────────────────────
  server.get('/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    const result = await adminService.getStats().catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── DELETE /users/:id ── Delete user + all data ─────────────────────────
  server.delete('/users/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const params = parseBody(userIdParam, req.params, reply);
    if (!params) return;

    // Prevent admin from deleting themselves
    if (params.id === req.user!.id) {
      return reply.status(400).send({
        statusCode: 400,
        error:      'Bad Request',
        message:    'Cannot delete your own account',
      });
    }

    await adminService.deleteUser(params.id, req.user!.id, req.ip).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(204).send();
  });

  // ── PATCH /users/:id/role ── Promote/demote user ────────────────────────
  server.patch('/users/:id/role', async (req: FastifyRequest, reply: FastifyReply) => {
    const params = parseBody(userIdParam, req.params, reply);
    if (!params) return;

    const body = parseBody(setRoleBody, req.body, reply);
    if (!body) return;

    // Prevent admin from demoting themselves
    if (params.id === req.user!.id) {
      return reply.status(400).send({
        statusCode: 400,
        error:      'Bad Request',
        message:    'Cannot change your own role',
      });
    }

    await adminService.setUserRole(params.id, body.role, req.user!.id, req.ip).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(204).send();
  });

  // ── GET /audit ── Audit log ───────────────────────────────────────────
  server.get('/audit', async (req: FastifyRequest, reply: FastifyReply) => {
    const { search } = req.query as { search?: string };
    const result = await adminService.getAuditLog(100, search || undefined).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── DELETE /audit ── Clear audit log ────────────────────────────────
  server.delete('/audit', async (req: FastifyRequest, reply: FastifyReply) => {
    await adminService.clearAuditLog(req.user!.id, req.ip).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(204).send();
  });

  // ── POST /maintenance ── Enable maintenance mode ────────────────────
  server.post('/maintenance', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = parseBody(maintenanceBody, req.body, reply);
    if (!body) return;

    const result = await maintenanceService.enableMaintenance(
      body.message,
      body.minutesUntilShutdown,
      req.user!.id,
      req.ip,
    ).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── DELETE /maintenance ── Disable maintenance mode ─────────────────
  server.delete('/maintenance', async (req: FastifyRequest, reply: FastifyReply) => {
    await maintenanceService.disableMaintenance(req.user!.id, req.ip).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(200).send({ enabled: false });
  });

  // ── GET /maintenance/status ── Maintenance status (admin) ───────────
  server.get('/maintenance/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    const result = await maintenanceService.getStatus().catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
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
    const e = err as { statusCode?: number; code?: string; message?: string };
    const statusCode = e.statusCode ?? 500;
    reply.status(statusCode).send({
      statusCode,
      error:   statusCode === 404 ? 'Not Found' : 'Internal Server Error',
      message: statusCode < 500 ? (e.message ?? 'Error') : 'An unexpected error occurred',
    });
  };
}
