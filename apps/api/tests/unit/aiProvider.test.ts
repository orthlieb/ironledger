import { describe, it, expect, vi, afterEach } from 'vitest';
import { testProvider, streamProvider } from '../../src/services/aiProvider.js';

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

/**
 * Build a fake fetch that returns a streaming Response whose body emits the
 * given raw chunks (as strings). Used to drive streamProvider through the
 * real SSE parser with controlled wire bytes.
 */
function stubStreamingFetch(chunks: string[]) {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  const res = new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));
}

describe('streamProvider — SSE line-ending handling', () => {
  it('gemini: parses CRLF-terminated SSE frames (regression: \\r\\n\\r\\n was skipped)', async () => {
    // Gemini terminates frames with \r\n\r\n, not \n\n. If readSse only looks
    // for \n\n it silently drops every frame — the original bug behind #75.
    stubStreamingFetch([
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}],"role":"model"},"index":0}]}\r\n\r\n',
      'data: {"candidates":[{"content":{"parts":[{"text":", world"}],"role":"model"},"index":0}]}\r\n\r\n',
    ]);
    const out: string[] = [];
    for await (const chunk of streamProvider('gemini', {
      apiKey: 'k',
      model: 'gemini-flash-latest',
      system: '',
      user: 'hi',
      signal: new AbortController().signal,
    })) {
      out.push(chunk);
    }
    expect(out.join('')).toBe('Hello, world');
  });

  it('claude: parses LF-terminated SSE frames (unaffected by the CRLF fix)', async () => {
    stubStreamingFetch([
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Once"}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" upon"}}\n\n',
    ]);
    const out: string[] = [];
    for await (const chunk of streamProvider('claude', {
      apiKey: 'k',
      model: 'claude-haiku-4-5',
      system: '',
      user: 'hi',
      signal: new AbortController().signal,
    })) {
      out.push(chunk);
    }
    expect(out.join('')).toBe('Once upon');
  });
});
