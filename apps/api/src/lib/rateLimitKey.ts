/**
 * What a request's rate limit counts against.
 *
 * The signed-in user, when the request carries a valid access token, so
 * players behind one address (a household, a phone carrier's NAT, the web
 * server's own calls before it forwarded addresses) don't share one limit.
 * Otherwise the client's IP address (`req.ip`, which honours X-Forwarded-For
 * only from loopback; see `trustProxy` in server.ts).
 *
 * The limiter runs on onRequest, before the route's `authenticate`, so the
 * token is verified here; a forged or expired one counts against the IP.
 */
import type { FastifyRequest } from 'fastify';
import { verifyAccessToken } from './tokens.js';

export async function rateLimitKey(req: FastifyRequest): Promise<string> {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const { sub } = await verifyAccessToken(header.slice(7).trim());
      if (sub) return `user:${sub}`;
    } catch {
      /* not a valid token: count it against the address */
    }
  }
  return `ip:${req.ip}`;
}
