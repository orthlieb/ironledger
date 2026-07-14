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
  /** Optional diagnostic sink — providers call this with wire-level info the
   *  route relays to the client as {debug:string} SSE frames. Only used when
   *  the request body sets debug:true (a temporary switch until Gemini works). */
  onDebug?: (msg: string) => void;
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
  const dbg = p.onDebug;
  dbg?.(`model=${p.model} maxTokens=${p.maxTokens ?? 4000}`);
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
      generationConfig: {
        // 2.5-generation models have thinking on by default and draw its
        // tokens from maxOutputTokens. Give the budget plenty of headroom so
        // thinking + output both fit comfortably — earlier we tried disabling
        // thinking with thinkingBudget:0 and Gemini responded by opening an
        // empty SSE stream (200 text/event-stream, 0 frames), so we let the
        // model decide its own thinking budget instead.
        maxOutputTokens: p.maxTokens ?? 8000,
      },
    }),
  });
  dbg?.(`http ${res.status} ${res.headers.get('content-type') ?? ''}`);
  if (!res.ok) {
    // Read the body once so we can echo it to debug AND raise a useful error.
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      /* ignore */
    }
    dbg?.(`error body: ${bodyText.slice(0, 800)}`);
    let msg = `HTTP ${res.status}`;
    try {
      const j = JSON.parse(bodyText) as { error?: { message?: string } };
      if (j.error?.message) msg = j.error.message;
    } catch {
      /* keep msg */
    }
    throw new Error(msg);
  }

  // Track fin state so we can raise a helpful error when the stream ends with
  // no text (safety filter, MAX_TOKENS exhaustion, blocked prompt, etc.).
  let framesSeen = 0;
  let textEmitted = 0;
  let lastFinishReason = '';
  let promptBlockReason = '';
  // Raw-byte diagnostic: when Gemini opens a 200 stream and closes it with
  // no frames, our frame parser is silent. Peek the first few chunks so
  // debug output shows what actually came off the wire — SSE, NDJSON, empty.
  let rawChunks = 0;
  let rawTotalBytes = 0;
  const rawSample: string[] = [];
  const rawTap = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      rawChunks++;
      rawTotalBytes += chunk.byteLength;
      if (rawChunks <= 3) {
        const decoder = new TextDecoder();
        rawSample.push(decoder.decode(chunk).slice(0, 400));
      }
      controller.enqueue(chunk);
    },
    flush() {
      dbg?.(
        `raw stream: chunks=${rawChunks} bytes=${rawTotalBytes}` +
          (rawSample.length ? ` first=${JSON.stringify(rawSample[0])}` : ''),
      );
    },
  });
  const tapped = new Response(res.body?.pipeThrough(rawTap) ?? null, {
    headers: res.headers,
    status: res.status,
  });

  for await (const chunk of readSse(tapped, (data) => {
    framesSeen++;
    if (framesSeen <= 3) dbg?.(`frame#${framesSeen}: ${data.slice(0, 600)}`);
    let payload: {
      candidates?: {
        content?: { parts?: { text?: string }[] };
        finishReason?: string;
        safetyRatings?: unknown;
      }[];
      promptFeedback?: { blockReason?: string };
      error?: { message?: string };
    };
    try {
      payload = JSON.parse(data);
    } catch (e) {
      dbg?.(`parse error: ${(e as Error).message} on: ${data.slice(0, 200)}`);
      return null;
    }
    if (payload.error?.message) throw new Error(payload.error.message);
    if (payload.promptFeedback?.blockReason) {
      promptBlockReason = payload.promptFeedback.blockReason;
      dbg?.(`promptFeedback.blockReason=${promptBlockReason}`);
    }
    const cand = payload.candidates?.[0];
    if (cand?.finishReason) {
      lastFinishReason = cand.finishReason;
      dbg?.(`finishReason=${lastFinishReason}`);
    }
    const text = cand?.content?.parts?.map((x) => x.text ?? '').join('') || null;
    if (text) dbg?.(`+text ${text.length}c: ${text.slice(0, 120).replace(/\n/g, '\\n')}`);
    return text;
  })) {
    textEmitted += chunk.length;
    yield chunk;
  }
  dbg?.(
    `stream end: frames=${framesSeen} textChars=${textEmitted} finish=${lastFinishReason || '(none)'}`,
  );
  if (textEmitted === 0) {
    if (promptBlockReason) {
      throw new Error(`Gemini blocked the prompt: ${promptBlockReason}.`);
    }
    if (lastFinishReason && lastFinishReason !== 'STOP') {
      throw new Error(
        `Gemini stopped with finishReason=${lastFinishReason} and produced no text. ` +
          (lastFinishReason === 'SAFETY'
            ? 'The safety filter rejected the response.'
            : lastFinishReason === 'MAX_TOKENS'
              ? 'Raise maxTokens or shorten the prompt.'
              : ''),
      );
    }
    if (framesSeen === 0) throw new Error('Gemini closed the stream with no data.');
    throw new Error(
      `Gemini returned ${framesSeen} frame(s) but no text (finish=${lastFinishReason || 'none'}).`,
    );
  }
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
