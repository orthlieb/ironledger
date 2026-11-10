/**
 * sessionExtensions.test.ts — the user's extension choices, kept per user.
 *
 * GET / PATCH /api/v1/session/extensions read and set them in
 * user_data.session_state.extensions: true / false sets one, null clears it
 * back to the extension's default, and ids a PATCH leaves out keep theirs.
 * A PATCH /session/state (the active selection, the open map) merges into
 * the same column, so it must leave the choices alone.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminDb } from '../../src/db/index.js';
import { users } from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';

if (!adminDb) throw new Error('adminDb is required — set DATABASE_ADMIN_URL');

const { sendVerificationEmail } = await import('../../src/lib/mailer.js');

const EMAIL = 'session-extensions@example.com';
const PASSWORD = 'ValidP@ssw0rd-xy';

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown, auth = '') {
  return global.testServer.inject({
    method,
    url,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(auth ? { authorization: auth } : {}),
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
}

/** Register + verify a fresh user; their bearer header. */
async function signUp(): Promise<string> {
  await adminDb!.delete(users).where(eq(users.email, EMAIL));
  await call('POST', '/api/v1/auth/register', {
    email: EMAIL,
    password: PASSWORD,
    captchaToken: 'test',
  });
  await new Promise((r) => setTimeout(r, 50));
  const calls = vi.mocked(sendVerificationEmail).mock.calls;
  const token = calls[calls.length - 1]![1];
  const res = await call('POST', '/api/v1/auth/verify-email', { token });
  return `Bearer ${res.json<{ accessToken: string }>().accessToken}`;
}

describe('session extension choices', () => {
  let bearer = '';
  beforeEach(async () => {
    vi.clearAllMocks();
    bearer = await signUp();
  });

  it('starts empty, and a PATCH sets, merges and clears per id', async () => {
    let res = await call('GET', '/api/v1/session/extensions', undefined, bearer);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ extensions: {} });

    res = await call(
      'PATCH',
      '/api/v1/session/extensions',
      { extensions: { yrt: true, delve: false } },
      bearer,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ extensions: { yrt: true, delve: false } });

    // Another id: the earlier choices stay.
    res = await call(
      'PATCH',
      '/api/v1/session/extensions',
      { extensions: { lodestar: false } },
      bearer,
    );
    expect(res.json()).toEqual({ extensions: { yrt: true, delve: false, lodestar: false } });

    // null clears one back to the default.
    res = await call(
      'PATCH',
      '/api/v1/session/extensions',
      { extensions: { delve: null } },
      bearer,
    );
    expect(res.json()).toEqual({ extensions: { yrt: true, lodestar: false } });

    res = await call('GET', '/api/v1/session/extensions', undefined, bearer);
    expect(res.json()).toEqual({ extensions: { yrt: true, lodestar: false } });
  });

  it('survives a session-state save', async () => {
    await call('PATCH', '/api/v1/session/extensions', { extensions: { yrt: true } }, bearer);
    const res = await call(
      'PATCH',
      '/api/v1/session/state',
      { sessionState: { charId: 'c1', foeId: '', expeditionId: '', activeMapId: 'm1' } },
      bearer,
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().sessionState).toMatchObject({ charId: 'c1', activeMapId: 'm1' });
    const ext = await call('GET', '/api/v1/session/extensions', undefined, bearer);
    expect(ext.json()).toEqual({ extensions: { yrt: true } });
  });

  it('rejects a bad id or value, and needs a user', async () => {
    let res = await call(
      'PATCH',
      '/api/v1/session/extensions',
      { extensions: { 'Not An Id': true } },
      bearer,
    );
    expect(res.statusCode).toBe(400);
    res = await call('PATCH', '/api/v1/session/extensions', { extensions: { yrt: 'on' } }, bearer);
    expect(res.statusCode).toBe(400);
    res = await call('GET', '/api/v1/session/extensions');
    expect(res.statusCode).toBe(401);
  });
});
