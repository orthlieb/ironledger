// =============================================================================
// Iron Ledger — Claude streaming client (direct-browser)
//
// Minimal SSE reader for the Anthropic Messages API. We don't use the official
// SDK to avoid pulling ~1MB into the browser bundle; the wire format is a
// small subset we can parse by hand.
//
// Wire events we care about:
//   • content_block_delta with delta.type = 'text_delta' → append delta.text
//   • message_stop → end of stream
//   • error → surface the error message to the caller
// =============================================================================

import type { AIModelId } from './aiSettings.svelte.js';

export interface StreamOptions {
	apiKey: string;
	model: AIModelId;
	system: string;
	user: string;
	signal: AbortSignal;
	/** Called on every text delta with the accumulated prose so far. */
	onText: (accumulated: string, delta: string) => void;
	/** Called once when the stream ends cleanly. */
	onDone?: (accumulated: string) => void;
	/** Called if the stream errors or the abort signal fires. */
	onError?: (message: string) => void;
	/** Optional cap; defaults to 4000 (a few pages of prose). */
	maxTokens?: number;
}

/**
 * Stream a completion from Claude directly to the browser.
 * Returns a promise that resolves when the stream finishes (cleanly or via
 * abort). Errors are reported via onError, not thrown, so callers can await
 * without try/catch.
 */
export async function streamStory(opts: StreamOptions): Promise<void> {
	const { apiKey, model, system, user, signal, onText, onDone, onError, maxTokens = 4000 } = opts;

	let accumulated = '';
	try {
		const res = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			signal,
			headers: {
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
				'anthropic-dangerous-direct-browser-access': 'true',
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				model,
				max_tokens: maxTokens,
				stream: true,
				system,
				messages: [{ role: 'user', content: user }],
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
			onError?.(msg);
			return;
		}

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			// SSE frames are separated by blank lines. Parse and consume each.
			let sep;
			while ((sep = buffer.indexOf('\n\n')) !== -1) {
				const frame = buffer.slice(0, sep);
				buffer = buffer.slice(sep + 2);
				handleFrame(frame);
			}
		}

		onDone?.(accumulated);
	} catch (err) {
		if ((err as { name?: string }).name === 'AbortError') {
			// User pressed Stop; keep whatever we streamed and treat as done.
			onDone?.(accumulated);
			return;
		}
		onError?.(err instanceof Error ? err.message : 'Stream failed.');
	}

	function handleFrame(frame: string) {
		let dataLine = '';
		for (const line of frame.split('\n')) {
			if (line.startsWith('data:')) dataLine = line.slice(5).trim();
		}
		if (!dataLine || dataLine === '[DONE]') return;
		let payload: {
			type?: string;
			delta?: { type?: string; text?: string };
			error?: { message?: string };
		};
		try {
			payload = JSON.parse(dataLine);
		} catch {
			return;
		}
		if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta') {
			const chunk = payload.delta.text ?? '';
			accumulated += chunk;
			onText(accumulated, chunk);
			return;
		}
		if (payload.type === 'error' && payload.error?.message) {
			onError?.(payload.error.message);
			return;
		}
	}
}
