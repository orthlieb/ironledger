import { describe, it, expect, vi, afterEach } from 'vitest';
import { testProvider } from '../../src/services/aiProvider.js';

/** Build a fake fetch that returns one canned Response. */
function stubFetch(status: number, body: unknown) {
  const res = new Response(status === 200 ? '{}' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));
}

afterEach(() => vi.unstubAllGlobals());

describe('testProvider — error surfacing', () => {
  it('reports success on a 200', async () => {
    stubFetch(200, {});
    expect(await testProvider('gemini', 'k', 'gemini-flash-latest')).toEqual({ ok: true });
  });

  it('surfaces the provider message on a 404 (bad/unavailable model)', async () => {
    const message =
      'models/gemini-1.5-pro is not found for API version v1beta, or is not supported for generateContent.';
    stubFetch(404, { error: { code: 404, message } });
    const result = await testProvider('gemini', 'k', 'gemini-1.5-pro');
    expect(result).toEqual({ ok: false, message });
  });

  it('falls back to a helpful 404 message when the body has none', async () => {
    stubFetch(404, {});
    const result = await testProvider('gemini', 'k', 'nope');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/model name/i);
  });

  it('surfaces the provider message on a 400 (e.g. invalid key)', async () => {
    const message = 'API key not valid. Please pass a valid API key.';
    stubFetch(400, { error: { message } });
    expect(await testProvider('gemini', 'bad', 'gemini-flash-latest')).toEqual({
      ok: false,
      message,
    });
  });

  it('surfaces the provider message on a 429 (e.g. depleted credits, not just rate-limit)', async () => {
    const message = 'Your prepayment credits are depleted. Please go to AI Studio to add billing.';
    stubFetch(429, { error: { code: 429, message } });
    expect(await testProvider('gemini', 'k', 'gemini-flash-latest')).toEqual({
      ok: false,
      message,
    });
  });

  it('falls back to a friendly message for a bodyless 401', async () => {
    stubFetch(401, {});
    const result = await testProvider('chatgpt', 'bad', 'gpt-4o-mini');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/key rejected/i);
  });
});
