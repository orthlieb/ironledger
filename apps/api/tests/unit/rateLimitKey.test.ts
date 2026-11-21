import { describe, it, expect } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { rateLimitKey } from '../../src/lib/rateLimitKey.js';
import { signAccessToken } from '../../src/lib/tokens.js';

const req = (authorization?: string) =>
  ({ headers: authorization ? { authorization } : {}, ip: '203.0.113.7' }) as FastifyRequest;

describe('rateLimitKey', () => {
  it('counts a signed-in request against the user, whatever its address', async () => {
    const token = await signAccessToken('6f1d2c1e-0000-4000-8000-000000000001', 'a@b.c', 'user');
    expect(await rateLimitKey(req(`Bearer ${token}`))).toBe(
      'user:6f1d2c1e-0000-4000-8000-000000000001',
    );
  });

  it('counts an anonymous request against its address', async () => {
    expect(await rateLimitKey(req())).toBe('ip:203.0.113.7');
  });

  it('counts a forged or garbled token against the address, not a made-up user', async () => {
    const token = await signAccessToken('6f1d2c1e-0000-4000-8000-000000000001', 'a@b.c', 'user');
    const [h, , s] = token.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ sub: 'someone-else' })).toString('base64url')}.${s}`;
    expect(await rateLimitKey(req(`Bearer ${forged}`))).toBe('ip:203.0.113.7');
    expect(await rateLimitKey(req('Bearer not-a-jwt'))).toBe('ip:203.0.113.7');
  });
});
