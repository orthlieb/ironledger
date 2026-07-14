/**
 * Server-side AI provider calls. The browser never talks to Anthropic / OpenAI
 * / Google directly (it never has the key); the API makes the call and streams
 * a normalized text stream back. Each provider parses its own wire format and
 * yields plain text chunks through the same `streamProvider` interface.
 */
import type { AiProvider } from './aiConfigService.js';

export interface StreamParams {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  signal: AbortSignal;
  maxTokens?: number;
}

/**
 * Read an SSE body line-by-line and hand each `data:` payload to `onData`.
 * Shared by every provider — they differ only in how they shape the payload.
 * `onData` may yield extracted text; a return of `'[DONE]'` marker is ignored.
 */
async function* readSse(
  res: Response,
  pick: (data: string) => string | null,
): AsyncGenerator<string> {
  if (!res.body) throw new Error('No response body.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      // A frame may carry multiple `data:` lines (rare); concatenate them.
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        const text = pick(data);
        if (text) yield text;
      }
    }
  }
}

/** Turn a failed fetch Response into a helpful Error, reading the body once. */
async function errorFromResponse(
  res: Response,
  pickMessage: (body: unknown) => string | undefined,
) {
  let msg = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    const picked = pickMessage(body);
    if (picked) msg = picked;
  } catch {
    /* keep msg */
  }
  return new Error(msg);
}

// ── Claude (Anthropic Messages API) ─────────────────────────────────────────
async function* streamClaude(p: StreamParams): AsyncGenerator<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: p.signal,
    headers: {
      'x-api-key': p.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: p.model,
      max_tokens: p.maxTokens ?? 4000,
      stream: true,
      system: p.system,
      messages: [{ role: 'user', content: p.user }],
    }),
  });
  if (!res.ok) {
    throw await errorFromResponse(
      res,
      (b) => (b as { error?: { message?: string } })?.error?.message,
    );
  }
  yield* readSse(res, (data) => {
    let payload: {
      type?: string;
      delta?: { type?: string; text?: string };
      error?: { message?: string };
    };
    try {
      payload = JSON.parse(data);
    } catch {
      return null;
    }
    if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta') {
      return payload.delta.text ?? null;
    }
    if (payload.type === 'error' && payload.error?.message) throw new Error(payload.error.message);
    return null;
  });
}

// ── ChatGPT (OpenAI Chat Completions API) ───────────────────────────────────
async function* streamOpenAI(p: StreamParams): AsyncGenerator<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: p.signal,
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: p.model,
      stream: true,
      max_tokens: p.maxTokens ?? 4000,
      messages: [
        ...(p.system ? [{ role: 'system', content: p.system }] : []),
        { role: 'user', content: p.user },
      ],
    }),
  });
  if (!res.ok) {
    throw await errorFromResponse(
      res,
      (b) => (b as { error?: { message?: string } })?.error?.message,
    );
  }
  yield* readSse(res, (data) => {
    let payload: { choices?: { delta?: { content?: string } }[] };
    try {
      payload = JSON.parse(data);
    } catch {
      return null;
    }
    return payload.choices?.[0]?.delta?.content ?? null;
  });
}

// ── Gemini (Google Generative Language API) ─────────────────────────────────
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function* streamGemini(p: StreamParams): AsyncGenerator<string> {
  const url = `${GEMINI_BASE}/${encodeURIComponent(p.model)}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, {
    method: 'POST',
    signal: p.signal,
    headers: {
      'x-goog-api-key': p.apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ...(p.system ? { systemInstruction: { parts: [{ text: p.system }] } } : {}),
      contents: [{ role: 'user', parts: [{ text: p.user }] }],
      generationConfig: { maxOutputTokens: p.maxTokens ?? 4000 },
    }),
  });
  if (!res.ok) {
    throw await errorFromResponse(
      res,
      (b) => (b as { error?: { message?: string } })?.error?.message,
    );
  }
  yield* readSse(res, (data) => {
    let payload: {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      error?: { message?: string };
    };
    try {
      payload = JSON.parse(data);
    } catch {
      return null;
    }
    if (payload.error?.message) throw new Error(payload.error.message);
    return payload.candidates?.[0]?.content?.parts?.map((x) => x.text ?? '').join('') || null;
  });
}

/** Dispatch to the right provider's streaming generator. */
export function streamProvider(provider: AiProvider, p: StreamParams): AsyncGenerator<string> {
  switch (provider) {
    case 'claude':
      return streamClaude(p);
    case 'chatgpt':
      return streamOpenAI(p);
    case 'gemini':
      return streamGemini(p);
  }
}

// ── Key validation (a cheap 1-token request per provider) ───────────────────

type TestResult = { ok: true } | { ok: false; message: string };

/** Best-effort provider error message from a failed response body (read once). */
async function providerErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message;
  } catch {
    return undefined;
  }
}

function classifyStatus(status: number, detail?: string): TestResult {
  // The provider's own message is the most accurate — invalid key, model not
  // found for this key, credits depleted, quota exceeded, etc. Prefer it, and
  // fall back to a friendly per-status message only when the body has none.
  if (detail) return { ok: false, message: detail };
  if (status === 401 || status === 403)
    return { ok: false, message: `Key rejected (${status}). Check the value.` };
  if (status === 429) return { ok: false, message: 'Rate-limited or out of quota (429).' };
  if (status === 404) return { ok: false, message: 'Model not found (404). Check the model name.' };
  if (status === 400) return { ok: false, message: 'Bad request (400).' };
  return { ok: false, message: `HTTP ${status}.` };
}

export async function testProvider(
  provider: AiProvider,
  apiKey: string,
  model: string,
): Promise<TestResult> {
  try {
    if (provider === 'claude') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      });
      if (res.ok) return { ok: true };
      return classifyStatus(res.status, await providerErrorMessage(res));
    }

    if (provider === 'chatgpt') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      if (res.ok) return { ok: true };
      return classifyStatus(res.status, await providerErrorMessage(res));
    }

    // gemini
    const res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        generationConfig: { maxOutputTokens: 1 },
      }),
    });
    if (res.ok) return { ok: true };
    return classifyStatus(res.status, await providerErrorMessage(res));
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Network error.' };
  }
}
