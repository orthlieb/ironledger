/**
 * Server-side AI provider calls. The browser no longer talks to Anthropic /
 * OpenAI directly (it never has the key); the API makes the call and streams a
 * normalized text stream back. Phase 1 implements Claude; ChatGPT lands in a
 * later phase behind the same interface.
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

/** Stream Claude prose as plain text chunks (parses Anthropic's SSE). */
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

  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) msg = body.error.message;
    } catch {
      /* keep msg */
    }
    throw new Error(msg);
  }

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
      const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      const data = dataLine.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let payload: {
        type?: string;
        delta?: { type?: string; text?: string };
        error?: { message?: string };
      };
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }
      if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta') {
        yield payload.delta.text ?? '';
      } else if (payload.type === 'error' && payload.error?.message) {
        throw new Error(payload.error.message);
      }
    }
  }
}

/** Dispatch to the right provider. Throws for a not-yet-supported provider. */
export function streamProvider(provider: AiProvider, p: StreamParams): AsyncGenerator<string> {
  if (provider === 'claude') return streamClaude(p);
  throw new Error(`Provider "${provider}" is not supported yet.`);
}

/** Lightweight key check (1-token request). */
export async function testProvider(
  provider: AiProvider,
  apiKey: string,
  model: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (provider !== 'claude')
    return { ok: false, message: `Provider "${provider}" is not supported yet.` };
  try {
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
    if (res.status === 401) return { ok: false, message: 'Key rejected (401). Check the value.' };
    if (res.status === 429) return { ok: false, message: 'Rate-limited (429). Try again shortly.' };
    if (res.status === 400) {
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        return { ok: false, message: body.error?.message ?? 'Bad request (400).' };
      } catch {
        return { ok: false, message: 'Bad request (400).' };
      }
    }
    return { ok: false, message: `HTTP ${res.status}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Network error.' };
  }
}
