/**
 * Admin routes — user management and system stats.
 *
 * All routes require authentication + admin role.
 * Only an admin can promote/demote users — there is no self-registration
 * path to admin. The seed script creates the initial admin.
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { authenticate } from '../middleware/authenticate.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import * as adminService from '../services/adminService.js';
import * as broadcastService from '../services/broadcastService.js';
import * as inviteService from '../services/inviteService.js';
import * as maintenanceService from '../services/maintenanceService.js';
import * as registrationLockService from '../services/registrationLockService.js';
import * as registrationQuotaService from '../services/registrationQuotaService.js';
import { sendInviteEmail } from '../lib/mailer.js';
import { logSecurityEvent } from '../middleware/securityLogger.js';
import { config } from '../config.js';
import type { FastifyReply } from 'fastify';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const userIdParam = z.object({
  id: z.string().uuid('Invalid user ID'),
});

const setRoleBody = z.object({
  role: z.enum(['user', 'admin']),
});

const setSuspendBody = z.object({
  suspended: z.boolean(),
});

const maintenanceBody = z.object({
  message:              z.string().min(1).max(500),
  minutesUntilShutdown: z.number().int().min(0).max(1440),
});

const registrationLockBody = z.object({
  message: z.string().min(1).max(500),
});

const auditQuery = z.object({
  search: z.string().optional(),
});

const timeseriesQuery = z.object({
  timeframe: z.enum(['1hr', '1day', '7day', '30day']).optional().default('1day'),
});

const logsQuery = z.object({
  file:  z.enum(['api-out', 'api-error', 'web-out', 'web-error']),
  lines: z.coerce.number().int().min(1).max(2000).default(200),
});

const createInviteBody = z.object({
  email:       z.string().email('Invalid email address').max(254),
  displayName: z.string().trim().max(80).optional(),
});

const inviteIdParam = z.object({
  id: z.string().uuid('Invalid invite ID'),
});

const broadcastBody = z.object({
  message:  z.string().trim().min(1, 'Message is required').max(500),
  severity: z.enum(['info', 'warning']).default('info'),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const adminRoutes: FastifyPluginAsyncZod = async (server) => {
  // Both hooks run on every route in this plugin
  server.addHook('preHandler', authenticate);
  server.addHook('preHandler', requireAdmin);

  // ── GET / ── List all users ─────────────────────────────────────────────
  server.get('/', async (_req, reply) => {
    const result = await adminService.listUsers().catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── GET /stats ── System health stats ───────────────────────────────────
  server.get('/stats', async (_req, reply) => {
    const result = await adminService.getStats().catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── DELETE /users/:id ── Delete user + all data ─────────────────────────
  server.delete('/users/:id', {
    schema: {
      params: userIdParam,
    },
  }, async (req, reply) => {
    // Prevent admin from deleting themselves
    if (req.params.id === req.user!.id) {
      return reply.status(400).send({
        statusCode: 400,
        error:      'Bad Request',
        message:    'Cannot delete your own account',
      });
    }

    await adminService.deleteUser(req.params.id, req.user!.id, req.ip).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(204).send();
  });

  // ── PATCH /users/:id/role ── Promote/demote user ────────────────────────
  server.patch('/users/:id/role', {
    schema: {
      params: userIdParam,
      body:   setRoleBody,
    },
  }, async (req, reply) => {
    // Prevent admin from demoting themselves
    if (req.params.id === req.user!.id) {
      return reply.status(400).send({
        statusCode: 400,
        error:      'Bad Request',
        message:    'Cannot change your own role',
      });
    }

    await adminService.setUserRole(req.params.id, req.body.role, req.user!.id, req.ip).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(204).send();
  });

  // ── PATCH /users/:id/suspend ── Suspend / unsuspend user ────────────────
  server.patch('/users/:id/suspend', {
    schema: {
      params: userIdParam,
      body:   setSuspendBody,
    },
  }, async (req, reply) => {
    // Prevent admin from suspending themselves
    if (req.params.id === req.user!.id) {
      return reply.status(400).send({
        statusCode: 400,
        error:      'Bad Request',
        message:    'Cannot suspend your own account',
      });
    }

    if (req.body.suspended) {
      await adminService.suspendUser(req.params.id, req.user!.id, req.ip).catch(handleError(reply));
    } else {
      await adminService.unsuspendUser(req.params.id, req.user!.id, req.ip).catch(handleError(reply));
    }
    if (reply.sent) return;
    return reply.status(204).send();
  });

  // ── GET /audit ── Audit log ───────────────────────────────────────────
  server.get('/audit', {
    schema: {
      querystring: auditQuery,
    },
  }, async (req, reply) => {
    const result = await adminService.getAuditLog(100, req.query.search || undefined).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── DELETE /audit ── Clear audit log ────────────────────────────────
  server.delete('/audit', async (req, reply) => {
    await adminService.clearAuditLog(req.user!.id, req.ip).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(204).send();
  });

  // ── GET /stats/timeseries ── User growth & activity timeseries ──────────
  server.get('/stats/timeseries', {
    schema: {
      querystring: timeseriesQuery,
    },
  }, async (req, reply) => {
    const result = await adminService.getUserTimeseries(req.query.timeframe).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── GET /logs ── Tail a PM2 log file ────────────────────────────────
  // Whitelist prevents path traversal — only these four filenames are valid
  // (enforced by the Zod enum in logsQuery).
  server.get('/logs', {
    schema: {
      querystring: logsQuery,
    },
  }, async (req, reply) => {
    const { file, lines } = req.query;
    const logPath = join(config.LOG_DIR, `${file}.log`);

    if (!existsSync(logPath)) {
      return reply.status(200).send({ available: false, file, lines: [] });
    }

    try {
      const raw  = await readFile(logPath, 'utf-8');
      const all  = raw.split('\n').filter((l) => l.trim().length > 0);
      const tail = all.slice(-lines);
      return reply.status(200).send({ available: true, file, lines: tail });
    } catch (err) {
      req.log.error(err, 'Failed to read log file');
      return reply.status(200).send({ available: false, file, lines: [] });
    }
  });

  // ── POST /maintenance ── Enable maintenance mode ────────────────────
  server.post('/maintenance', {
    schema: {
      body: maintenanceBody,
    },
  }, async (req, reply) => {
    const result = await maintenanceService.enableMaintenance(
      req.body.message,
      req.body.minutesUntilShutdown,
      req.user!.id,
      req.ip,
    ).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── DELETE /maintenance ── Disable maintenance mode ─────────────────
  server.delete('/maintenance', async (req, reply) => {
    await maintenanceService.disableMaintenance(req.user!.id, req.ip).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(200).send({ enabled: false });
  });

  // ── GET /maintenance/status ── Maintenance status (admin) ───────────
  server.get('/maintenance/status', async (_req, reply) => {
    const result = await maintenanceService.getStatus().catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── POST /registration-lock ── Enable registration lock ─────────────
  server.post('/registration-lock', {
    schema: {
      body: registrationLockBody,
    },
  }, async (req, reply) => {
    const result = await registrationLockService.lockRegistration(
      req.body.message,
      req.user!.id,
      req.ip,
    ).catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── DELETE /registration-lock ── Disable registration lock ──────────
  server.delete('/registration-lock', async (req, reply) => {
    await registrationLockService.unlockRegistration(req.user!.id, req.ip).catch(handleError(reply));
    if (reply.sent) return;
    return reply.status(200).send({ locked: false });
  });

  // ── POST /invites ── Create an invitation ────────────────────────────
  server.post('/invites', {
    schema: {
      body: createInviteBody,
    },
  }, async (req, reply) => {
    const result = await inviteService.createInvite({
      email:       req.body.email,
      displayName: req.body.displayName,
      invitedBy:   req.user!.id,
    }).catch(handleError(reply));
    if (!result || reply.sent) return;

    const { invite, rawToken } = result;
    const url = `${config.APP_URL}/invite/${rawToken}`;

    // Fire-and-forget email (same pattern as sendVerificationEmail in auth).
    // The URL is always returned to the admin so copy-paste still works if
    // delivery fails.
    void sendInviteEmail(invite.email, invite.displayName, rawToken).catch((err) => {
      req.log.error({ err, inviteId: invite.id }, 'sendInviteEmail failed');
    });

    logSecurityEvent({
      eventType: 'admin_create_invite',
      req,
      userId:    req.user!.id,
      metadata:  { inviteId: invite.id, email: invite.email },
    });

    return reply.status(201).send({ invite, url });
  });

  // ── GET /invites ── List invitations ─────────────────────────────────
  server.get('/invites', async (_req, reply) => {
    const result = await inviteService.listInvites().catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── DELETE /invites/:id ── Revoke an invitation ──────────────────────
  server.delete('/invites/:id', {
    schema: {
      params: inviteIdParam,
    },
  }, async (req, reply) => {
    const result = await inviteService.revokeInvite(req.params.id).catch(handleError(reply));
    if (!result || reply.sent) return;

    logSecurityEvent({
      eventType: 'admin_revoke_invite',
      req,
      userId:    req.user!.id,
      metadata:  { inviteId: result.id, email: result.email },
    });

    return reply.status(200).send(result);
  });

  // ── POST /broadcast ── Post or update the banner ──────────────────────
  server.post('/broadcast', {
    schema: {
      body: broadcastBody,
    },
  }, async (req, reply) => {
    try {
      const status = await broadcastService.postBroadcast(
        req.body.message,
        req.body.severity,
        req.user!.id,
        req.ip,
      );
      return reply.status(200).send(status);
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  // ── DELETE /broadcast ── Clear the banner ─────────────────────────────
  server.delete('/broadcast', async (req, reply) => {
    try {
      await broadcastService.clearBroadcast(req.user!.id, req.ip);
      return reply.status(204).send();
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  // ── GET /broadcast/status ── Admin view of current banner ─────────────
  server.get('/broadcast/status', async (_req, reply) => {
    try {
      const status = await broadcastService.getStatus();
      return reply.status(200).send(status);
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  // ── GET /registration-lock/status ── Registration lock status ────────
  server.get('/registration-lock/status', async (_req, reply) => {
    const result = await registrationLockService.getStatus().catch(handleError(reply));
    if (!result || reply.sent) return;
    return reply.status(200).send(result);
  });

  // ── GET /registration-quota/status ── Daily signup quota status ───────
  server.get('/registration-quota/status', async (_req, reply) => {
    try {
      const status = await registrationQuotaService.getStatus();
      return reply.status(200).send(status);
    } catch (err) {
      return handleError(reply)(err);
    }
  });

  // ── PUT /registration-quota ── Set the daily cap ──────────────────────
  server.put('/registration-quota', {
    schema: {
      body: z.object({
        daily: z.number().int().min(1).max(10_000).nullable(),
      }),
    },
  }, async (req, reply) => {
    try {
      const status = await registrationQuotaService.setQuota(
        req.body.daily,
        req.user!.id,
        req.ip,
      );
      return reply.status(200).send(status);
    } catch (err) {
      return handleError(reply)(err);
    }
  });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
