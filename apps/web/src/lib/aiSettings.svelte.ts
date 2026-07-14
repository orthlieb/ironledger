// =============================================================================
// Iron Ledger — AI storyteller settings (server-backed)
//
// Provider config (key/model/setup) now lives on the server with the API key
// encrypted at rest; this store is a reactive client cache of the server config
// view (keys elided to `hasKey`). Mutations POST/PUT to /api/ai/*. The only
// thing still kept client-side is the "include preface" UI toggle (not a secret).
// =============================================================================

export type AiProvider = 'claude' | 'chatgpt' | 'gemini';
export const AI_PROVIDERS: AiProvider[] = ['claude', 'chatgpt', 'gemini'];
export const PROVIDER_LABEL: Record<AiProvider, string> = {
	claude: 'Claude',
	chatgpt: 'ChatGPT',
	gemini: 'Gemini',
};

/** Per-provider key placeholder + where-to-get-a-key help (shown in the config dialog). */
export interface ProviderHelp {
	placeholder: string;
	help: string;
}
export const PROVIDER_HELP: Record<AiProvider, ProviderHelp> = {
	claude: {
		placeholder: 'sk-ant-…',
		help: 'Create a key at console.anthropic.com → API Keys. It starts with “sk-ant-”.',
	},
	chatgpt: {
		placeholder: 'sk-…',
		help: 'Create a key at platform.openai.com/api-keys. It starts with “sk-”.',
	},
	gemini: {
		placeholder: 'AIza…',
		help: 'Create a key at aistudio.google.com/apikey. It usually starts with “AIza”.',
	},
};

export interface ModelOption {
	id: string;
	label: string;
	tagline: string;
}

/** Per-provider model dropdowns (cheapest first). */
export const MODELS: Record<AiProvider, ModelOption[]> = {
	claude: [
		{ id: 'claude-haiku-4-5', label: 'Haiku 4.5', tagline: 'cheap, fast' },
		{ id: 'claude-sonnet-5', label: 'Sonnet 5', tagline: 'balanced prose' },
		{ id: 'claude-opus-4-8', label: 'Opus 4.8', tagline: 'highest quality' },
	],
	chatgpt: [
		{ id: 'gpt-4o-mini', label: 'GPT-4o mini', tagline: 'cheap, fast' },
		{ id: 'gpt-4o', label: 'GPT-4o', tagline: 'balanced prose' },
	],
	gemini: [
		{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tagline: 'cheap, fast' },
		{ id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tagline: 'higher quality' },
		{ id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', tagline: 'previous gen' },
	],
};

export const DEFAULT_MODEL: Record<AiProvider, string> = {
	claude: 'claude-haiku-4-5',
	chatgpt: 'gpt-4o-mini',
	gemini: 'gemini-2.5-flash',
};

// The default system prompt — only used internally as the fallback for the
// global setup preference below.
const DEFAULT_SETUP =
	'Rewrite the following session log as prose in third-person past tense. ' +
	'Match the tone of Ironsworn fiction — grim, weighty, sparing with adjectives. ' +
	'Keep character names and place names exactly as written. ' +
	'Do not invent events that aren’t in the log.';

// ---------------------------------------------------------------------------
// Server config cache
// ---------------------------------------------------------------------------

export interface ProviderConfigView {
	model: string | null;
	hasKey: boolean;
}
export interface AiConfigView {
	activeProvider: AiProvider | null;
	providers: Record<AiProvider, ProviderConfigView>;
}

let _config = $state<AiConfigView | null>(null);
let _loaded = false;

/** Fetch the server config once (or force a refresh). */
export async function loadAiConfig(force = false): Promise<void> {
	if (typeof window === 'undefined') return;
	if (_loaded && !force) return;
	_loaded = true;
	try {
		const res = await fetch('/api/ai/config');
		if (res.ok) _config = (await res.json()) as AiConfigView;
	} catch {
		/* leave cache as-is */
	}
}

export function getActiveProvider(): AiProvider | null {
	return _config?.activeProvider ?? null;
}
export function providerView(provider: AiProvider): ProviderConfigView {
	return _config?.providers[provider] ?? { model: null, hasKey: false };
}
/** True when a storyteller is selected and has a key — story generation is available. */
export function hasActiveStoryteller(): boolean {
	const p = _config?.activeProvider;
	return !!p && !!_config?.providers[p]?.hasKey;
}

// ---------------------------------------------------------------------------
// Mutations (server) — each refreshes the cache
// ---------------------------------------------------------------------------

export async function setActiveProvider(provider: AiProvider | 'none'): Promise<void> {
	await fetch('/api/ai/active', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ provider }),
	});
	await loadAiConfig(true);
}

export async function saveProviderConfig(
	provider: AiProvider,
	patch: { model: string; key?: string },
): Promise<void> {
	await fetch(`/api/ai/provider/${provider}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(patch),
	});
	await loadAiConfig(true);
}

export async function clearProviderKey(provider: AiProvider): Promise<void> {
	await fetch(`/api/ai/provider/${provider}/key`, { method: 'DELETE' });
	await loadAiConfig(true);
}

export async function testProviderKey(
	provider: AiProvider,
): Promise<{ ok: true } | { ok: false; message: string }> {
	try {
		const res = await fetch(`/api/ai/test/${provider}`, { method: 'POST' });
		if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
		return (await res.json()) as { ok: true } | { ok: false; message: string };
	} catch (err) {
		return { ok: false, message: err instanceof Error ? err.message : 'Test failed.' };
	}
}

// ---------------------------------------------------------------------------
// Setup instructions — a global client-side UI preference (not a secret, and
// not per-provider): the system prompt sent for every story, whichever
// storyteller is active.
// ---------------------------------------------------------------------------

const SETUP_STORAGE = 'ironledger:ai:setup';

function readSetup(): string {
	if (typeof window === 'undefined') return DEFAULT_SETUP;
	const raw = localStorage.getItem(SETUP_STORAGE);
	return raw === null ? DEFAULT_SETUP : raw;
}

let _setup = $state(readSetup());

export function getSetup(): string {
	return _setup;
}
export function setSetup(v: string): void {
	_setup = v;
	if (typeof window === 'undefined') return;
	// Empty or default → clear the override so DEFAULT_SETUP tracks future edits.
	if (v === '' || v === DEFAULT_SETUP) localStorage.removeItem(SETUP_STORAGE);
	else localStorage.setItem(SETUP_STORAGE, v);
}

// ---------------------------------------------------------------------------
// Include-preface toggle — a client-side UI preference (not a secret)
// ---------------------------------------------------------------------------

const PREFACE_STORAGE = 'ironledger:ai:preface';

function readBool(key: string, fallback: boolean): boolean {
	if (typeof window === 'undefined') return fallback;
	const raw = localStorage.getItem(key);
	if (raw === null) return fallback;
	return raw === 'true';
}

let _includePreface = $state(readBool(PREFACE_STORAGE, true));

export function getIncludePreface(): boolean {
	return _includePreface;
}
export function setIncludePreface(v: boolean): void {
	_includePreface = v;
	if (typeof window === 'undefined') return;
	if (v) localStorage.removeItem(PREFACE_STORAGE);
	else localStorage.setItem(PREFACE_STORAGE, 'false');
}
