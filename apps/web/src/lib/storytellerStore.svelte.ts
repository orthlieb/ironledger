// =============================================================================
// Iron Ledger — Storyteller Store (Svelte 5 module-level $state)
//
// Manages the AI storyteller feature: enabled state, streaming requests,
// and the latest narration text. Watches for new log entries and sends
// game context to the /api/storyteller endpoint.
//
// Provides:
//   • isStorytellerEnabled() / setStorytellerEnabled()
//   • isStorytellerStreaming()
//   • getStorytellerText()
//   • requestNarration(ctx)  — fire a narration request with game context
//   • cancelNarration()      — abort in-flight request
// =============================================================================

// ---------------------------------------------------------------------------
// Persisted preference
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'il-storyteller-enabled';

function readEnabled(): boolean {
	if (typeof window === 'undefined') return false;
	return localStorage.getItem(STORAGE_KEY) === '1';
}

let _enabled   = $state(readEnabled());
let _streaming  = $state(false);
let _text       = $state('');
let _error      = $state('');
let _controller: AbortController | null = null;

// ---------------------------------------------------------------------------
// Public accessors
// ---------------------------------------------------------------------------

export function isStorytellerEnabled(): boolean { return _enabled; }

export function setStorytellerEnabled(on: boolean): void {
	_enabled = on;
	if (typeof window !== 'undefined') {
		if (on) localStorage.setItem(STORAGE_KEY, '1');
		else    localStorage.removeItem(STORAGE_KEY);
	}
}

export function isStorytellerStreaming(): boolean { return _streaming; }
export function getStorytellerText(): string { return _text; }
export function getStorytellerError(): string { return _error; }

export function cancelNarration(): void {
	_controller?.abort();
	_controller = null;
	_streaming = false;
}

// ---------------------------------------------------------------------------
// Context shape passed by the caller
// ---------------------------------------------------------------------------

export interface StorytellerContext {
	character?: Record<string, unknown>;
	foe?:       Record<string, unknown>;
	expedition?: Record<string, unknown>;
	recentLog:  string[];
	trigger:    string;
}

// ---------------------------------------------------------------------------
// Request narration
// ---------------------------------------------------------------------------

/**
 * Send game context to the storyteller API and stream the response.
 * Automatically cancels any in-flight request.
 */
export async function requestNarration(ctx: StorytellerContext): Promise<void> {
	if (!_enabled) return;

	// Abort any previous request
	cancelNarration();

	_streaming  = true;
	_text       = '';
	_error      = '';
	_controller = new AbortController();

	try {
		const res = await fetch('/api/storyteller', {
			method:      'POST',
			credentials: 'include',
			headers:     { 'Content-Type': 'application/json' },
			body:        JSON.stringify(ctx),
			signal:      _controller.signal,
		});

		if (!res.ok) {
			const msg = await res.text().catch(() => res.statusText);
			_error = `Storyteller error: ${msg}`;
			_streaming = false;
			return;
		}

		// Parse the Anthropic SSE stream for content_block_delta events
		const reader = res.body!.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			// Keep the last (possibly incomplete) line in the buffer
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				if (!line.startsWith('data: ')) continue;
				const payload = line.slice(6).trim();
				if (payload === '[DONE]') continue;

				try {
					const evt = JSON.parse(payload) as {
						type: string;
						delta?: { type?: string; text?: string };
					};
					if (evt.type === 'content_block_delta' && evt.delta?.text) {
						_text += evt.delta.text;
					}
				} catch {
					// Skip unparseable lines
				}
			}
		}
	} catch (err: unknown) {
		if ((err as Error).name !== 'AbortError') {
			_error = 'Failed to reach the storyteller service.';
			console.error('[storyteller] Stream error:', err);
		}
	} finally {
		_streaming  = false;
		_controller = null;
	}
}
