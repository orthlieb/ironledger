// =============================================================================
// Iron Ledger — story streaming client (server-proxied)
//
// The browser no longer talks to a provider directly — it POSTs the prompt to
// our own /api/ai/generate, which looks up the active provider + decrypted key
// server-side and streams back a normalized SSE of `{ text }` deltas, then
// `{ done: true }` or `{ error }`. No API key or provider-specific parsing here.
// =============================================================================

export interface StreamOptions {
	/** The user prompt (preface + serialized events). */
	user: string;
	/** Optional system-prompt override; defaults to the provider's stored setup. */
	system?: string;
	signal: AbortSignal;
	/** Called on every delta with the accumulated prose so far. */
	onText: (accumulated: string, delta: string) => void;
	/** Called once when the stream ends cleanly (or on abort, with partial text). */
	onDone?: (accumulated: string) => void;
	/** Called if generation errors. */
	onError?: (message: string) => void;
	/** When true, ask the server to emit wire-level diagnostic frames. */
	debug?: boolean;
	/** Called for each debug frame from the server (only fires when debug:true). */
	onDebug?: (msg: string) => void;
	maxTokens?: number;
}

/** Stream a story from the server. Resolves when the stream finishes or aborts. */
export async function streamStory(opts: StreamOptions): Promise<void> {
	const { user, system, signal, onText, onDone, onError, onDebug, debug, maxTokens } = opts;

	let accumulated = '';
	try {
		const res = await fetch('/api/ai/generate', {
			method: 'POST',
			signal,
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				user,
				...(system !== undefined ? { system } : {}),
				...(maxTokens ? { maxTokens } : {}),
				...(debug ? { debug: true } : {}),
			}),
		});

		if (!res.ok || !res.body) {
			// A 401 means the whole session lapsed (the access token expired and the
			// silent refresh failed) — not an AI-specific failure. Give a clear
			// re-login message instead of the raw "Not authenticated".
			if (res.status === 401) {
				onError?.('Your session has expired. Please sign in again, then retry.');
				return;
			}
			let msg = `HTTP ${res.status}`;
			try {
				const body = (await res.json()) as { error?: string; message?: string };
				if (body.error) msg = body.error;
				else if (body.message) msg = body.message;
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

			let sep: number;
			while ((sep = buffer.indexOf('\n\n')) !== -1) {
				const frame = buffer.slice(0, sep);
				buffer = buffer.slice(sep + 2);
				const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
				if (!dataLine) continue;
				const data = dataLine.slice(5).trim();
				if (!data) continue;

				let payload: { text?: string; done?: boolean; error?: string; debug?: string };
				try {
					payload = JSON.parse(data);
				} catch {
					continue;
				}
				if (typeof payload.text === 'string') {
					accumulated += payload.text;
					onText(accumulated, payload.text);
				} else if (typeof payload.debug === 'string') {
					onDebug?.(payload.debug);
				} else if (payload.error) {
					onError?.(payload.error);
					return;
				}
				// `{ done: true }` — the loop ends when the reader closes.
			}
		}

		onDone?.(accumulated);
	} catch (err) {
		if ((err as { name?: string }).name === 'AbortError') {
			onDone?.(accumulated); // user pressed Stop — keep what streamed
			return;
		}
		onError?.(err instanceof Error ? err.message : 'Stream failed.');
	}
}
