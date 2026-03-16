/**
 * Admin authorization middleware.
 *
 * Must be used AFTER the `authenticate` middleware so that req.user is populated.
 * Rejects the request with 403 Forbidden if the user is not an admin.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

export async function requireAdmin(
  req:   FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (req.user?.role !== 'admin') {
    return reply.status(403).send({
      statusCode: 403,
      error:      'Forbidden',
      message:    'Admin access required',
    });
  }
}
