/**
 * Security hardening regression tests.
 *
 * These pin down the server-side protections added alongside the public
 * launch — they exist to catch regressions, not to exercise happy paths
 * (which auth.test.ts covers). Every assertion below corresponds to a
 * concrete attack an attacker would try.
 *
 *   - Password entropy gate (#12): refuse low-entropy passwords even
 *     when they pass the length + HIBP checks.
 *   - Image-URL validation (#2): /session/communities, /session/npcs,
 *     /session/expeditions all refuse javascript:, data:text/html,
 *     oversized payloads, and anything outside the webp/png/jpeg/gif
 *     allowlist.
 *   - Login timing parity (#3): login against an unknown email runs a
 *     real Argon2id verify, not a fast-fail parse error. We can't
 *     assert exact ms in CI, but we can assert both paths take at
 *     least the Argon2 floor (~20ms on test infra).
 *
 * Swagger-prod gating (#13) isn't tested here — it's a build-time
 * conditional on NODE_ENV=production, and the test harness runs in
 * NODE_ENV=test by design.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminDb } from '../../src/db/index.js';
import { users, securityEvents } from '../../src/db/schema.js';
import { eq, sql } from 'drizzle-orm';

if (!adminDb) throw new Error('adminDb is required — set DATABASE_ADMIN_URL');

const { sendVerificationEmail } = await import('../../src/lib/mailer.js');
const auth = await import('../../src/services/authService.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function post(path: string, body: unknown, cookies = '') {
  return global.testServer.inject({
    method: 'POST',
    url: path,
    headers: {
      'content-type': 'application/json',
      ...(cookies ? { cookie: cookies } : {}),
    },
    payload: JSON.stringify(body),
  });
}

async function patch(path: string, body: unknown, authHeader?: string) {
  return global.testServer.inject({
    method: 'PATCH',
    url: path,
    headers: {
      'content-type': 'application/json',
      ...(authHeader ? { authorization: authHeader } : {}),
    },
    payload: JSON.stringify(body),
  });
}

async function cleanupUser(email: string) {
  await adminDb!.delete(users).where(eq(users.email, email));
}

/** Register + verify a user, return their access token. */
async function registerAndVerify(email: string, password: string): Promise<string> {
  await post('/api/v1/auth/register', { email, password, captchaToken: 'test' });
  await new Promise((r) => setTimeout(r, 50));

  const calls = vi.mocked(sendVerificationEmail).mock.calls;
  const rawToken = calls[calls.length - 1]![1];

  // Verifying signs no one in: log in (through the service, so setup doesn't
  // spend the log-in route's rate limit) for the token.
  await post('/api/v1/auth/verify-email', { token: rawToken });
  return (await auth.login({ email, password })).accessToken;
}

// ---------------------------------------------------------------------------
// #12 — Password entropy gate
// ---------------------------------------------------------------------------

describe('password entropy gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a 12-char password with only 1 distinct character', async () => {
    const res = await post('/api/v1/auth/register', {
      email: 'sec-zxc1@example.com',
      password: 'aaaaaaaaaaaa',
      captchaToken: 'test',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/distinct characters|repetitive/i);
  });

  it('rejects a password with only 4 distinct characters', async () => {
    const res = await post('/api/v1/auth/register', {
      email: 'sec-zxc2@example.com',
      password: 'abababababab', // 12 chars, 2 distinct
      captchaToken: 'test',
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts a 12-char password with ≥ 5 distinct characters', async () => {
    const email = `sec-accept@example.com`;
    const res = await post('/api/v1/auth/register', {
      email,
      password: 'Kx7!m-Wz-P9a',
      captchaToken: 'test',
    });
    expect(res.statusCode).toBe(202);
    await cleanupUser(email);
  });
});

// ---------------------------------------------------------------------------
// #2 — imageUrl validation on Communities/NPCs/Expeditions
// ---------------------------------------------------------------------------

describe('imageUrl validation', () => {
  const email = 'sec-img-tests@example.com';
  const pw = 'ValidP@ssw0rd-xy';
  let bearer = '';

  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanupUser(email);
    const token = await registerAndVerify(email, pw);
    bearer = `Bearer ${token}`;
  });

  // Rotate through the three endpoints that accept portraits.
  const endpoints: Array<[string, string]> = [
    ['/api/v1/session/communities', 'communities'],
    ['/api/v1/session/npcs', 'npcs'],
    ['/api/v1/session/expeditions', 'expeditions'],
  ];

  for (const [path, key] of endpoints) {
    describe(path, () => {
      it('rejects javascript: URLs', async () => {
        const res = await patch(
          path,
          {
            [key]: [{ id: '1', name: 'x', imageUrl: 'javascript:alert(1)' }],
          },
          bearer,
        );
        expect(res.statusCode).toBe(400);
      });

      it('rejects data: URLs with non-image MIME', async () => {
        const payload =
          'data:text/html;base64,' + Buffer.from('<script>x</script>').toString('base64');
        const res = await patch(
          path,
          {
            [key]: [{ id: '1', name: 'x', imageUrl: payload }],
          },
          bearer,
        );
        expect(res.statusCode).toBe(400);
      });

      it('rejects oversized data URLs', async () => {
        // Valid prefix + ~2MB of base64 chars — exceeds the 1.2MB cap.
        const huge = 'data:image/png;base64,' + 'A'.repeat(2_000_000);
        const res = await patch(
          path,
          {
            [key]: [{ id: '1', name: 'x', imageUrl: huge }],
          },
          bearer,
        );
        // Nginx body cap can also 413 this in real traffic; the
        // Fastify test harness doesn't apply Nginx limits so we see
        // the validator's 400.
        expect([400, 413]).toContain(res.statusCode);
      });

      it('accepts a valid image/png data URL', async () => {
        // 1×1 transparent PNG.
        const okPng =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';
        const res = await patch(
          path,
          {
            [key]: [{ id: '1', name: 'x', imageUrl: okPng }],
          },
          bearer,
        );
        expect(res.statusCode).toBe(200);
      });

      it('accepts an https URL', async () => {
        const res = await patch(
          path,
          {
            [key]: [{ id: '1', name: 'x', imageUrl: 'https://example.com/pic.webp' }],
          },
          bearer,
        );
        expect(res.statusCode).toBe(200);
      });

      it('accepts records with no imageUrl at all', async () => {
        const res = await patch(
          path,
          {
            [key]: [{ id: '1', name: 'x' }],
          },
          bearer,
        );
        expect(res.statusCode).toBe(200);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// #3 — Login timing parity
// ---------------------------------------------------------------------------

describe('login timing parity', () => {
  const existing = 'sec-timing-existing@example.com';
  const pw = 'RealP@ssw0rd-xyz!';

  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanupUser(existing);
    await registerAndVerify(existing, pw);
  });

  it('unknown email runs a full Argon2 verify (no fast-fail)', async () => {
    // Argon2id with the configured memory cost (19456 KiB, time cost 2)
    // takes ~20-50ms to verify. A malformed-hash fast-fail would return
    // in <5ms. We assert the handler spends enough time that the real
    // verify path ran.
    const t0 = performance.now();
    const res = await post('/api/v1/auth/login', {
      email: 'sec-timing-nobody@example.com',
      password: 'WhateverPw123!',
      captchaToken: 'test',
    });
    const elapsed = performance.now() - t0;
    expect(res.statusCode).toBe(401);
    expect(elapsed).toBeGreaterThanOrEqual(15);
  });

  it('wrong password against a real email takes comparable time', async () => {
    const t0 = performance.now();
    const res = await post('/api/v1/auth/login', {
      email: existing,
      password: 'WrongPw123!-x',
      captchaToken: 'test',
    });
    const elapsed = performance.now() - t0;
    expect(res.statusCode).toBe(401);
    expect(elapsed).toBeGreaterThanOrEqual(15);
  });
});

// ---------------------------------------------------------------------------
// Client address: X-Forwarded-For is believed only from loopback
// ---------------------------------------------------------------------------

describe('client address (trustProxy: loopback)', () => {
  /** Ask for a password reset (logged with req.ip) and read back the logged address. */
  async function loggedIp(opts: { remoteAddress?: string; xff?: string }): Promise<string | null> {
    const email = `ip-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    await global.testServer.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      remoteAddress: opts.remoteAddress,
      headers: {
        'content-type': 'application/json',
        ...(opts.xff ? { 'x-forwarded-for': opts.xff } : {}),
      },
      payload: JSON.stringify({ email, captchaToken: 'test' }),
    });
    // The security log is written fire-and-forget: wait for the row.
    for (let i = 0; i < 40; i++) {
      const [row] = await adminDb!
        .select({ ip: securityEvents.ipAddress })
        .from(securityEvents)
        .where(sql`${securityEvents.metadata}->>'email' = ${email}`);
      if (row) return row.ip;
      await new Promise((r) => setTimeout(r, 25));
    }
    return null;
  }

  it('takes the visitor named by the loopback proxy (the web server, Nginx)', async () => {
    expect(await loggedIp({ remoteAddress: '127.0.0.1', xff: '203.0.113.7' })).toBe('203.0.113.7');
  });

  it('ignores addresses a client put in front of the real one', async () => {
    // Nginx appends the real address to whatever the client sent.
    expect(await loggedIp({ remoteAddress: '127.0.0.1', xff: '198.51.100.1, 203.0.113.7' })).toBe(
      '203.0.113.7',
    );
  });

  it("ignores the header from anywhere that isn't loopback", async () => {
    expect(await loggedIp({ remoteAddress: '192.0.2.50', xff: '203.0.113.7' })).toBe('192.0.2.50');
  });
});

// ---------------------------------------------------------------------------
// Entity ids: only letters, digits, _ and - on create (no "/" or "..")
// ---------------------------------------------------------------------------

describe('entity ids', () => {
  const email = 'sec-entity-ids@example.com';
  const pw = 'ValidP@ssw0rd-ids';
  let bearer = '';

  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanupUser(email);
    bearer = `Bearer ${await registerAndVerify(email, pw)}`;
  });

  const send = (method: 'POST' | 'PUT', url: string, body: unknown) =>
    global.testServer.inject({
      method,
      url,
      headers: { 'content-type': 'application/json', authorization: bearer },
      payload: JSON.stringify(body),
    });

  it.each(['../../admin/users/x/role', '..', 'a/b', 'a b', 'x'.repeat(65)])(
    'refuses to create an entity with id %j',
    async (id) => {
      const one = await send('POST', '/api/v1/session/npcs', { id, name: 'Bob' });
      expect(one.statusCode).toBe(400);
      const many = await send('PUT', '/api/v1/session/npcs/batch', {
        entities: [{ id, name: 'Bob' }],
      });
      expect(many.statusCode).toBe(400);
    },
  );

  it('creates one with a UUID or a plain token', async () => {
    const one = await send('POST', '/api/v1/session/npcs', {
      id: '0b6c1c7e-3c1e-4b8e-9a1e-2f2d3c4b5a69',
      name: 'Bob',
    });
    expect(one.statusCode).toBe(201);
    const many = await send('PUT', '/api/v1/session/npcs/batch', {
      entities: [{ id: 'npc_2-B', name: 'Ann' }],
    });
    expect(many.statusCode).toBe(200);
  });
});
