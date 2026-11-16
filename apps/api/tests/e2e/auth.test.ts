/**
 * E2E tests for auth routes.
 *
 * Tests the full HTTP stack: request → route → service → DB → response.
 * Uses Fastify's inject() method — no real TCP port needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminDb } from '../../src/db/index.js';
import { users } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

// adminDb bypasses RLS — required for cleanup because the app_user pool
// has its session GUC app.user_id reset to '' after any withUserContext
// transaction ends, causing silent zero-row deletes on subsequent queries.
if (!adminDb) throw new Error('adminDb is required — set DATABASE_ADMIN_URL');

const { sendVerificationEmail } = await import('../../src/lib/mailer.js');
const { redis } = await import('../../src/server.js');
const auth = await import('../../src/services/authService.js');

// The auth routes allow a few calls per window per address (log-in 5 per
// 15 minutes, resend and reset 3 an hour, by default), and every request here
// comes from 127.0.0.1: start each test with clean counts, as separate real
// clients would.
beforeEach(async () => {
  const keys = await redis.keys('fastify-rate-limit-*');
  if (keys.length > 0) await redis.del(...keys);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = '/api/v1/auth';

async function post(path: string, body: unknown, cookies = '') {
  return global.testServer.inject({
    method: 'POST',
    url: BASE + path,
    headers: {
      'content-type': 'application/json',
      ...(cookies ? { cookie: cookies } : {}),
    },
    payload: JSON.stringify(body),
  });
}

async function cleanupUser(email: string) {
  await adminDb!.delete(users).where(eq(users.email, email));
}

async function registerAndVerify(email: string, password: string) {
  await post('/register', { email, password, captchaToken: 'test' });
  await new Promise((r) => setTimeout(r, 50));

  const calls = vi.mocked(sendVerificationEmail).mock.calls;
  const rawToken = calls[calls.length - 1]![1];

  // Verifying signs no one in: log in (through the service, so setup doesn't
  // spend the log-in route's rate limit) for the session.
  await post('/verify-email', { token: rawToken });
  const session = await auth.login({ email, password });

  return { accessToken: session.accessToken, refreshCookie: `rt=${session.refreshToken}` };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /register', () => {
  const email = 'e2e-register@example.com';
  const password = 'SuperSecurePass!42';

  beforeEach(async () => {
    await cleanupUser(email);
    vi.clearAllMocks();
  });

  it('returns 202 for a new email', async () => {
    const res = await post('/register', { email, password, captchaToken: 'test' });
    expect(res.statusCode).toBe(202);
  });

  it('returns 202 even for duplicate emails (no enumeration)', async () => {
    await post('/register', { email, password, captchaToken: 'test' });
    const res = await post('/register', { email, password, captchaToken: 'test' });
    expect(res.statusCode).toBe(202);
  });

  it('returns 400 for an invalid email', async () => {
    const res = await post('/register', {
      email: 'not-an-email',
      password,
      captchaToken: 'test',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for a short password', async () => {
    const res = await post('/register', {
      email,
      password: 'short',
      captchaToken: 'test',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 if captchaToken is missing', async () => {
    const res = await post('/register', { email, password });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /verify-email', () => {
  const email = 'e2e-verify@example.com';
  const password = 'SuperSecurePass!42';

  beforeEach(async () => {
    await cleanupUser(email);
    vi.clearAllMocks();
  });

  it('returns 200 and signs no one in (no token, no cookie)', async () => {
    await post('/register', { email, password, captchaToken: 'test' });
    await new Promise((r) => setTimeout(r, 50));
    const calls = vi.mocked(sendVerificationEmail).mock.calls;

    const res = await post('/verify-email', { token: calls[calls.length - 1]![1] });

    expect(res.statusCode).toBe(200);
    expect(res.json()).not.toHaveProperty('accessToken');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('returns 400 for an invalid token', async () => {
    const res = await post('/verify-email', { token: 'garbage' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 if the token is reused', async () => {
    await post('/register', { email, password, captchaToken: 'test' });
    await new Promise((r) => setTimeout(r, 50));

    const calls = vi.mocked(sendVerificationEmail).mock.calls;
    const rawToken = calls[calls.length - 1]![1];

    await post('/verify-email', { token: rawToken });
    const res = await post('/verify-email', { token: rawToken });

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /login', () => {
  const email = 'e2e-login@example.com';
  const password = 'SuperSecurePass!42';

  beforeEach(async () => {
    await cleanupUser(email);
    vi.clearAllMocks();
    await registerAndVerify(email, password);
  });

  it('returns 200 with accessToken and rt cookie', async () => {
    const res = await post('/login', { email, password, captchaToken: 'test' });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ accessToken: string }>();
    expect(body.accessToken).toBeTruthy();

    const cookies = res.headers['set-cookie'];
    expect(
      Array.isArray(cookies) ? cookies.some((c) => c.startsWith('rt=')) : cookies,
    ).toBeTruthy();
  });

  it('returns 401 for wrong password', async () => {
    const res = await post('/login', {
      email,
      password: 'WrongPassword!99',
      captchaToken: 'test',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for unknown email', async () => {
    const res = await post('/login', {
      email: 'nobody@example.com',
      password,
      captchaToken: 'test',
    });
    expect(res.statusCode).toBe(401);
  });

  it('does not reveal whether the email exists (same error for both)', async () => {
    const wrongPass = await post('/login', {
      email,
      password: 'WrongPassword!99',
      captchaToken: 'test',
    });
    const unknownEmail = await post('/login', {
      email: 'nobody@example.com',
      password,
      captchaToken: 'test',
    });

    expect(wrongPass.statusCode).toBe(unknownEmail.statusCode);
    expect(wrongPass.json().message).toBe(unknownEmail.json().message);
  });
});

describe('POST /login, unverified', () => {
  const email = 'e2e-unverified@example.com';
  const password = 'SuperSecurePass!42';

  beforeEach(async () => {
    await cleanupUser(email);
    vi.clearAllMocks();
  });

  it('returns 403 with code EMAIL_UNVERIFIED, so the page can offer a new link', async () => {
    await post('/register', { email, password, captchaToken: 'test' });
    const res = await post('/login', { email, password, captchaToken: 'test' });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('EMAIL_UNVERIFIED');
  });
});

describe('POST /resend-verification', () => {
  const email = 'e2e-resend@example.com';
  const password = 'SuperSecurePass!42';

  beforeEach(async () => {
    await cleanupUser(email);
    vi.clearAllMocks();
  });

  it('returns 202 and sends a new link to an unverified account', async () => {
    await post('/register', { email, password, captchaToken: 'test' });
    await new Promise((r) => setTimeout(r, 50));
    const [u] = await adminDb!.select({ id: users.id }).from(users).where(eq(users.email, email));
    await redis.del(`verify_resend:${u!.id}`); // as if a minute had passed

    const res = await post('/resend-verification', { email, captchaToken: 'test' });
    await new Promise((r) => setTimeout(r, 50));

    expect(res.statusCode).toBe(202);
    expect(sendVerificationEmail).toHaveBeenCalledTimes(2);
  });

  it('gives the same answer for an address with no account (no enumeration)', async () => {
    await post('/register', { email, password, captchaToken: 'test' });
    const known = await post('/resend-verification', { email, captchaToken: 'test' });
    const unknown = await post('/resend-verification', {
      email: 'nobody@example.com',
      captchaToken: 'test',
    });

    expect(unknown.statusCode).toBe(202);
    expect(unknown.json()).toEqual(known.json());
  });

  it('returns 400 if captchaToken is missing', async () => {
    const res = await post('/resend-verification', { email });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /delete-account', () => {
  const email = 'e2e-delete@example.com';
  const password = 'SuperSecurePass!42';

  beforeEach(async () => {
    await cleanupUser(email);
    vi.clearAllMocks();
  });

  async function postAuthed(path: string, body: unknown, accessToken: string) {
    return global.testServer.inject({
      method: 'POST',
      url: BASE + path,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      payload: JSON.stringify(body),
    });
  }

  it('needs a signed-in user', async () => {
    const res = await post('/delete-account', { password });
    expect(res.statusCode).toBe(401);
  });

  it('refuses a wrong password, then deletes with the right one', async () => {
    const { accessToken } = await registerAndVerify(email, password);

    const wrong = await postAuthed('/delete-account', { password: 'Nope!Nope!Nope1' }, accessToken);
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().code).toBe('WRONG_PASSWORD');

    const ok = await postAuthed('/delete-account', { password }, accessToken);
    expect(ok.statusCode).toBe(200);
    expect(await adminDb!.select().from(users).where(eq(users.email, email))).toHaveLength(0);

    // The account is gone, so it can't sign in again.
    const login = await post('/login', { email, password, captchaToken: 'test' });
    expect(login.statusCode).toBe(401);
  });
});

describe('POST /refresh', () => {
  const email = 'e2e-refresh@example.com';
  const password = 'SuperSecurePass!42';

  beforeEach(async () => {
    await cleanupUser(email);
    vi.clearAllMocks();
  });

  it('issues new tokens and rotates the cookie', async () => {
    const { refreshCookie } = await registerAndVerify(email, password);

    const res = await post('/refresh', {}, refreshCookie);
    expect(res.statusCode).toBe(200);

    const body = res.json<{ accessToken: string }>();
    expect(body.accessToken).toBeTruthy();
  });

  it('returns 401 with no cookie', async () => {
    const res = await post('/refresh', {});
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /logout', () => {
  const email = 'e2e-logout@example.com';
  const password = 'SuperSecurePass!42';

  beforeEach(async () => {
    await cleanupUser(email);
    vi.clearAllMocks();
  });

  it('returns 200 and clears the rt cookie', async () => {
    const { accessToken, refreshCookie } = await registerAndVerify(email, password);

    const res = await global.testServer.inject({
      method: 'POST',
      url: BASE + '/logout',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
        cookie: refreshCookie,
      },
      // Logout takes no body, but content-type is set so we must send
      // valid JSON — our custom parser calls JSON.parse() on the raw body
      // and an empty string throws SyntaxError → 500.
      payload: '{}',
    });

    expect(res.statusCode).toBe(200);

    // Cookie should be cleared (maxAge=0 or expires in the past)
    const setCookie = res.headers['set-cookie'];
    const rtCookie = Array.isArray(setCookie)
      ? setCookie.find((c) => c.startsWith('rt='))
      : setCookie;
    expect(rtCookie).toMatch(/max-age=0|expires=.*1970/i);
  });
});

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await global.testServer.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });
});
