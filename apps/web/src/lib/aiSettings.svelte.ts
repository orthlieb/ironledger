// =============================================================================
// Iron Ledger — AI settings store (Svelte 5 module-level $state)
//
// Persists per-browser Claude API config to localStorage: API key, model, and
// a global setup-instructions string that's prefilled into every recording.
//
// Client-side storage tradeoff: any code with execution on the origin (XSS,
// rogue extension) can read the key. Fine for a single-user creative tool
// where the key is scoped to the user's own Anthropic account; would not be
// acceptable for a shared/enterprise deploy.
// =============================================================================

const KEY_STORAGE = 'ironledger:ai:apiKey';
const MODEL_STORAGE = 'ironledger:ai:model';
const SETUP_STORAGE = 'ironledger:ai:setup';
const PREFACE_STORAGE = 'ironledger:ai:preface';

export type AIModelId = 'claude-haiku-4-5' | 'claude-sonnet-5' | 'claude-opus-4-8';

export interface AIModelInfo {
	id: AIModelId;
	label: string;
	tagline: string;
}

/** Ordered list for the settings dropdown (cheapest first). */
export const AI_MODELS: AIModelInfo[] = [
	{ id: 'claude-haiku-4-5', label: 'Haiku 4.5', tagline: 'cheap, fast' },
	{ id: 'claude-sonnet-5', label: 'Sonnet 5', tagline: 'balanced prose' },
	{ id: 'claude-opus-4-8', label: 'Opus 4.8', tagline: 'highest quality' },
];

const DEFAULT_MODEL: AIModelId = 'claude-haiku-4-5';

const DEFAULT_SETUP =
	'Rewrite the following session log as prose in third-person past tense. ' +
	'Match the tone of Ironsworn fiction — grim, weighty, sparing with adjectives. ' +
	'Keep character names and place names exactly as written. ' +
	'Do not invent events that aren’t in the log.';

function readString(key: string, fallback: string): string {
	if (typeof window === 'undefined') return fallback;
	return localStorage.getItem(key) ?? fallback;
}

function readBool(key: string, fallback: boolean): boolean {
	if (typeof window === 'undefined') return fallback;
	const raw = localStorage.getItem(key);
	if (raw === null) return fallback;
	return raw === 'true';
}

function isModelId(v: string | null): v is AIModelId {
	return v === 'claude-haiku-4-5' || v === 'claude-sonnet-5' || v === 'claude-opus-4-8';
}

function readModel(): AIModelId {
	if (typeof window === 'undefined') return DEFAULT_MODEL;
	const raw = localStorage.getItem(MODEL_STORAGE);
	return isModelId(raw) ? raw : DEFAULT_MODEL;
}

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------

let _apiKey = $state(readString(KEY_STORAGE, ''));
let _model = $state<AIModelId>(readModel());
let _setup = $state(readString(SETUP_STORAGE, DEFAULT_SETUP));
// Whether to prepend the "Cast & setting" preface (character/foe/expedition) to
// the prompt. Default on; persisted only when turned off.
let _includePreface = $state(readBool(PREFACE_STORAGE, true));

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------

export function getApiKey(): string {
	return _apiKey;
}
export function getModel(): AIModelId {
	return _model;
}
export function getSetup(): string {
	return _setup;
}
export function getDefaultSetup(): string {
	return DEFAULT_SETUP;
}
export function hasApiKey(): boolean {
	return _apiKey.trim().length > 0;
}
export function getIncludePreface(): boolean {
	return _includePreface;
}

// ---------------------------------------------------------------------------
// Setters (persist to localStorage)
// ---------------------------------------------------------------------------

export function setApiKey(v: string): void {
	_apiKey = v;
	if (typeof window === 'undefined') return;
	if (v) localStorage.setItem(KEY_STORAGE, v);
	else localStorage.removeItem(KEY_STORAGE);
}

export function setModel(v: AIModelId): void {
	_model = v;
	if (typeof window === 'undefined') return;
	if (v === DEFAULT_MODEL) localStorage.removeItem(MODEL_STORAGE);
	else localStorage.setItem(MODEL_STORAGE, v);
}

export function setSetup(v: string): void {
	_setup = v;
	if (typeof window === 'undefined') return;
	if (v === DEFAULT_SETUP) localStorage.removeItem(SETUP_STORAGE);
	else localStorage.setItem(SETUP_STORAGE, v);
}

export function setIncludePreface(v: boolean): void {
	_includePreface = v;
	if (typeof window === 'undefined') return;
	// Default is true — only persist the non-default (off) state.
	if (v) localStorage.removeItem(PREFACE_STORAGE);
	else localStorage.setItem(PREFACE_STORAGE, 'false');
}

// ---------------------------------------------------------------------------
// Test — verify the key works with a 1-token request.
// Returns { ok: true } on success or { ok: false, message } with a friendly
// diagnostic (401 -> bad key, 429 -> rate limit, network -> connection).
// ---------------------------------------------------------------------------

export async function testApiKey(
	key: string,
	model: AIModelId,
): Promise<{ ok: true } | { ok: false; message: string }> {
	if (!key.trim()) return { ok: false, message: 'Key is empty.' };
	try {
		const res = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'x-api-key': key,
				'anthropic-version': '2023-06-01',
				'anthropic-dangerous-direct-browser-access': 'true',
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				model,
				max_tokens: 1,
				messages: [{ role: 'user', content: 'hi' }],
			}),
		});
		if (res.ok) return { ok: true };
		if (res.status === 401) return { ok: false, message: 'Key rejected (401). Check the value.' };
		if (res.status === 429) return { ok: false, message: 'Rate-limited (429). Try again shortly.' };
		if (res.status === 400) {
			// Could be a bad model id or malformed request — surface the API's message.
			try {
				const body = (await res.json()) as { error?: { message?: string } };
				return { ok: false, message: body.error?.message ?? `Bad request (400).` };
			} catch {
				return { ok: false, message: `Bad request (400).` };
			}
		}
		return { ok: false, message: `HTTP ${res.status}.` };
	} catch (err) {
		return { ok: false, message: err instanceof Error ? err.message : 'Network error.' };
	}
}
