/**
 * Unit tests for lib/hibp.ts — HaveIBeenPwned k-anonymity check.
 *
 * Mocks the global fetch so no real HTTP calls are made. We verify:
 *   - SHA-1 prefix-only is sent to HIBP (first 5 chars of the upper-cased hash)
 *   - The local suffix match correctly identifies pwned vs clean passwords
 *   - The HIBP API key is forwarded when configured
 *   - The function fails OPEN (returns 0) on any error — network, timeout,
 *     or non-2xx — so HIBP outages don't block registration
 *   - assertPasswordNotPwned throws PwnedPasswordError when count > 0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

// Config mock — flipped between suites for the API-key vs no-key cases.
const configState = {
  HIBP_API_KEY: '' as string | undefined,
};
vi.mock('../../src/config.js', () => ({
  get config() {
    return configState;
  },
}));

import { getPwnedCount, assertPasswordNotPwned, PwnedPasswordError } from '../../src/lib/hibp.js';

const sha1Hex = (s: string) => createHash('sha1').update(s).digest('hex').toUpperCase();

beforeEach(() => {
  vi.restoreAllMocks();
  configState.HIBP_API_KEY = undefined;
});

describe('getPwnedCount', () => {
  it('returns the breach count when the hash suffix appears in the HIBP response', async () => {
    const hash = sha1Hex('hunter2');
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `${suffix}:42\r\nABCDEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:7`,
    });
    vi.stubGlobal('fetch', fetchMock);

    const count = await getPwnedCount('hunter2');
    expect(count).toBe(42);

    // Verify only the prefix was sent.
    const url = fetchMock.mock.calls[0][0];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${prefix}`);
    // Suffix must NOT appear anywhere in the URL or headers.
    const init = fetchMock.mock.calls[0][1];
    expect(JSON.stringify({ url, init })).not.toContain(suffix);
  });

  it('returns 0 when the suffix is not present in the HIBP response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1\r\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:2',
      }),
    );
    const count = await getPwnedCount('a-fresh-unbreached-passphrase-9421');
    expect(count).toBe(0);
  });

  it('sends the Add-Padding header on every request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);
    await getPwnedCount('whatever');
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['Add-Padding']).toBe('true');
    expect(headers['hibp-api-key']).toBeUndefined();
  });

  it('forwards hibp-api-key when configured', async () => {
    configState.HIBP_API_KEY = 'secret-api-key-xyz';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);
    await getPwnedCount('whatever');
    expect(fetchMock.mock.calls[0][1].headers['hibp-api-key']).toBe('secret-api-key-xyz');
  });

  it('fails open (returns 0) when HIBP responds non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => '' }));
    expect(await getPwnedCount('anything')).toBe(0);
  });

  it('fails open (returns 0) when fetch rejects (network error / timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    expect(await getPwnedCount('anything')).toBe(0);
  });
});

describe('assertPasswordNotPwned', () => {
  it('resolves silently when count is 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '' }));
    await expect(assertPasswordNotPwned('clean')).resolves.toBeUndefined();
  });

  it('throws PwnedPasswordError with the count when count > 0', async () => {
    const hash = sha1Hex('p@ssw0rd');
    const suffix = hash.slice(5);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `${suffix}:1234`,
      }),
    );
    const err = await assertPasswordNotPwned('p@ssw0rd').catch((e) => e);
    expect(err).toBeInstanceOf(PwnedPasswordError);
    expect(err.message).toMatch(/1,234 data breaches/);
  });

  it('uses singular "breach" when count is exactly 1', async () => {
    const hash = sha1Hex('one-hit');
    const suffix = hash.slice(5);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => `${suffix}:1` }),
    );
    const err = await assertPasswordNotPwned('one-hit').catch((e) => e);
    expect(err.message).toMatch(/1 data breach\b/);
    expect(err.message).not.toMatch(/breaches/);
  });
});

describe('PwnedPasswordError', () => {
  it('is a real Error subclass with the right name', () => {
    const e = new PwnedPasswordError('boom');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('PwnedPasswordError');
    expect(e.message).toBe('boom');
  });
});
