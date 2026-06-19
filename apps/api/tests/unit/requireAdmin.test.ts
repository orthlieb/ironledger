/**
 * Unit tests for middleware/requireAdmin.ts.
 *
 * The middleware is a thin guard: if req.user.role !== 'admin', it returns
 * 403 via reply.status(403).send(...). Otherwise it does nothing (next runs).
 * We fake just enough of FastifyRequest/FastifyReply to drive both branches.
 */

import { describe, it, expect, vi } from 'vitest';
import { requireAdmin } from '../../src/middleware/requireAdmin.js';

function makeReply() {
  const send = vi.fn();
  const status = vi.fn(() => ({ send }));
  return { status, send };
}

describe('requireAdmin', () => {
  it('passes through (no reply.status call) when req.user.role === "admin"', async () => {
    const reply = makeReply();
    const req = { user: { role: 'admin' } } as never;
    await requireAdmin(req, reply as never);
    expect(reply.status).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('responds 403 with the standard error body when req.user.role === "user"', async () => {
    const reply = makeReply();
    const req = { user: { role: 'user' } } as never;
    await requireAdmin(req, reply as never);
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Admin access required',
    });
  });

  it('responds 403 when req.user is undefined entirely (unauthenticated)', async () => {
    const reply = makeReply();
    const req = {} as never;
    await requireAdmin(req, reply as never);
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, error: 'Forbidden' }),
    );
  });

  it('responds 403 when role is missing on req.user', async () => {
    const reply = makeReply();
    const req = { user: { id: 'u1' } } as never;
    await requireAdmin(req, reply as never);
    expect(reply.status).toHaveBeenCalledWith(403);
  });
});
