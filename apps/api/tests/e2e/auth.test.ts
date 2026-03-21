/**
 * E2E tests for auth routes.
 *
 * Tests the full HTTP stack: request → route → service → DB → response.
 * Uses Fastify's inject() method — no real TCP port needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminDb } from '../../src/db/index.js';
import { users }   from '../../src/db/schema.js';
import { eq }      from 'drizzle-orm';

// adminDb bypasses RLS — required for cleanup because the app_user pool
// has its session GUC app.user_id reset to '' after any withUserContext
// transaction ends, causing silent zero-row deletes on subsequent queries.
if (!adminDb) throw new Error('adminDb is required — set DATABASE_ADMIN_URL');

const { sendVerificationEmail } = await import('../../src/lib/mailer.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = '/api/v1/auth';

async function post(path: string, body: unknown, cookies = '') {
  return global.testServer.inject({
    method:  'POST',
    url:     BASE + path,
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

  const calls    = vi.mocked(sendVerificationEmail).mock.calls;
  const rawToken = calls[calls.length - 1]![1];

  const res = await post('/verify-email', { token: rawToken });
  const body = res.json<{ accessToken: string }>();

  // Extract refresh token cookie
  const setCookie = res.headers['set-cookie'] as string | string[] | undefined;
  const cookieStr = Array.isArray(setCookie)
    ? setCookie.find((c) => c.startsWith('rt=')) ?? ''
    : (setCookie ?? '');
  const rt = cookieStr.split(';')[0] ?? '';   // "rt=<value>"

  return { accessToken: body.accessToken, refreshCookie: rt };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /register', () => {
  const email    = 'e2e-register@example.com';
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
      email: 'not-an-email', password, captchaToken: 'test',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for a short password', async () => {
    const res = await post('/register', {
      email, password: 'short', captchaToken: 'test',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 if captchaToken is missing', async () => {
    const res = await post('/register', { email, password });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /verify-email', () => {
  const email    = 'e2e-verify@example.com';
  const password = 'SuperSecurePass!42';

  beforeEach(async () => {
    await cleanupUser(email);
    vi.clearAllMocks();
  });

  it('returns 200 with accessToken and sets rt cookie', async () => {
    const { accessToken, refreshCookie } = await registerAndVerify(email, password);

    expect(accessToken).toBeTruthy();
    expect(refreshCookie).toMatch(/^rt=/);
  });

  it('returns 400 for an invalid token', async () => {
    const res = await post('/verify-email', { token: 'garbage' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 if the token is reused', async () => {
    await post('/register', { email, password, captchaToken: 'test' });
    await new Promise((r) => setTimeout(r, 50));

    const calls    = vi.mocked(sendVerificationEmail).mock.calls;
    const rawToken = calls[calls.length - 1]![1];

    await post('/verify-email', { token: rawToken });
    const res = await post('/verify-email', { token: rawToken });

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /login', () => {
  const email    = 'e2e-login@example.com';
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
    expect(Array.isArray(cookies) ? cookies.some((c) => c.startsWith('rt=')) : cookies).toBeTruthy();
  });

  it('returns 401 for wrong password', async () => {
    const res = await post('/login', {
      email, password: 'WrongPassword!99', captchaToken: 'test',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for unknown email', async () => {
    const res = await post('/login', {
      email: 'nobody@example.com', password, captchaToken: 'test',
    });
    expect(res.statusCode).toBe(401);
  });

  it('does not reveal whether the email exists (same error for both)', async () => {
    const wrongPass = await post('/login', {
      email, password: 'WrongPassword!99', captchaToken: 'test',
    });
    const unknownEmail = await post('/login', {
      email: 'nobody@example.com', password, captchaToken: 'test',
    });

    expect(wrongPass.statusCode).toBe(unknownEmail.statusCode);
    expect(wrongPass.json().message).toBe(unknownEmail.json().message);
  });
});

describe('POST /refresh', () => {
  const email    = 'e2e-refresh@example.com';
  const password = 'SuperSecurePass!42';

  beforeEach(async () => {
    await cleanupUser(email);
    vi.clearAllMocks();
  });

  it('issues new tokens and rotates the cookie', async () => {
    const { refreshCookie } = await registerAndVerify(email, password);

    const res  = await post('/refresh', {}, refreshCookie);
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
  const email    = 'e2e-logout@example.com';
  const password = 'SuperSecurePass!42';

  beforeEach(async () => {
    await cleanupUser(email);
    vi.clearAllMocks();
  });

  it('returns 200 and clears the rt cookie', async () => {
    const { accessToken, refreshCookie } = await registerAndVerify(email, password);

    const res = await global.testServer.inject({
      method:  'POST',
      url:     BASE + '/logout',
      headers: {
        'content-type':  'application/json',
        'authorization': `Bearer ${accessToken}`,
        'cookie':        refreshCookie,
      },
      // Logout takes no body, but content-type is set so we must send
      // valid JSON — our custom parser calls JSON.parse() on the raw body
      // and an empty string throws SyntaxError → 500.
      payload: '{}',
    });

    expect(res.statusCode).toBe(200);

    // Cookie should be cleared (maxAge=0 or expires in the past)
    const setCookie = res.headers['set-cookie'];
    const rtCookie  = Array.isArray(setCookie)
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
