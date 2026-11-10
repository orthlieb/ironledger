// =============================================================================
// Iron Ledger — Extension registry + expansion toggle store
// (Svelte 5 module-level $state)
//
// Extensions are discovered from /api/catalogue/extensions (the build-time
// manifest, served by the API), so adding an expansion needs no code here.
// Each carries metadata (id, name, defaultEnabled) and an on/off choice kept
// on the user's account (GET / PATCH /api/session/extensions), so every
// device they sign in on agrees.
//
//   • An extension defaults to its manifest `defaultEnabled` until the user
//     toggles it; the choice is then stored on their account.
//   • Choices made before they moved to the account (this browser's
//     localStorage, `ironledger:expansion:<id>`) are carried up once, for
//     extensions the account has no choice for yet, then dropped.
//   • Turning an expansion off hides catalogue items tagged with that source
//     from pickers/browsers only. `find*` lookups stay unfiltered so existing
//     user records (log entries, owned assets, sites, denizens) keep rendering.
//   • `base` is core content — always enabled, never toggleable.
// =============================================================================

import type { ExtensionInfo } from '#lib/types.js';

/** Where a browser kept its choices before they moved to the account. */
const legacyKey = (id: string) => `ironledger:expansion:${id}`;

/** An on/off choice per extension id; an id missing takes its default. */
type Choices = Record<string, boolean>;

/** Registry: extension metadata, hydrated from /api/catalogue/extensions. */
let _registry = $state<ExtensionInfo[]>([]);
/** Per-id enabled state (reactive). */
let _enabled = $state<Record<string, boolean>>({});
/** The user's choices, from their account. */
let _choices: Choices = {};

// ---------------------------------------------------------------------------
// The account's choices
// ---------------------------------------------------------------------------

/** The signed-in user's choices, or null when there's no account to ask
 *  (signed out) or it can't be reached. */
async function fetchChoices(): Promise<Choices | null> {
	try {
		const res = await fetch('/api/session/extensions');
		if (!res.ok) return null;
		return ((await res.json()) as { extensions?: Choices }).extensions ?? {};
	} catch {
		return null;
	}
}

/** Store some choices on the account (null clears one to its default);
 *  the account's choices after, or null if the write failed. */
async function saveChoices(patch: Record<string, boolean | null>): Promise<Choices | null> {
	try {
		const res = await fetch('/api/session/extensions', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ extensions: patch }),
			// A toggle then a reload (or closing the tab) still saves.
			keepalive: true,
		});
		if (!res.ok) return null;
		return ((await res.json()) as { extensions?: Choices }).extensions ?? null;
	} catch {
		return null;
	}
}

/** This browser's choices from before they moved to the account. */
function legacyChoices(list: ExtensionInfo[]): Choices {
	const out: Choices = {};
	if (typeof window === 'undefined') return out;
	try {
		for (const e of list) {
			const v = localStorage.getItem(legacyKey(e.id));
			if (v === 'on' || v === 'off') out[e.id] = v === 'on';
		}
	} catch {
		// Storage blocked: nothing to carry up.
	}
	return out;
}

function dropLegacy(ids: string[]): void {
	try {
		for (const id of ids) localStorage.removeItem(legacyKey(id));
	} catch {
		// Storage blocked: nothing kept to drop.
	}
}

/** The account's choices, with this browser's older ones carried up for
 *  extensions it has none for (then dropped from the browser). Signed out
 *  or unreachable: the browser's older ones, if any, for now. */
async function accountChoices(list: ExtensionInfo[]): Promise<Choices> {
	const legacy = legacyChoices(list);
	const mine = await fetchChoices();
	if (!mine) return legacy;
	const up = Object.fromEntries(Object.entries(legacy).filter(([id]) => !(id in mine)));
	if (Object.keys(up).length === 0) {
		dropLegacy(Object.keys(legacy));
		return mine;
	}
	const saved = await saveChoices(up);
	if (!saved) return { ...up, ...mine };
	dropLegacy(Object.keys(legacy));
	return saved;
}

// ---------------------------------------------------------------------------
// Registry hydration
// ---------------------------------------------------------------------------

/** Populate the registry + enabled map from the served extension list and
 *  the user's choices (an extension with none takes its default). */
export function registerExtensions(list: ExtensionInfo[], choices: Choices = _choices): void {
	_registry = [...list].sort((a, b) => a.order - b.order);
	_choices = choices;
	const next: Record<string, boolean> = {};
	for (const e of _registry) next[e.id] = choices[e.id] ?? e.defaultEnabled;
	_enabled = next;
}

let _loaded = false;
/** Fetch + register the extension list and the user's choices. Idempotent
 *  per page load (signing in or out reloads the page). */
export async function loadExtensions(): Promise<void> {
	if (_loaded) return;
	_loaded = true;
	try {
		const res = await fetch('/api/catalogue/extensions');
		if (!res.ok) {
			_loaded = false;
			return;
		}
		const list = (await res.json()) as ExtensionInfo[];
		registerExtensions(list, await accountChoices(list));
	} catch {
		_loaded = false; // allow a later retry
	}
}

/** All registered extensions, in display order. */
export function getExtensions(): ExtensionInfo[] {
	return _registry;
}
/** Toggleable extensions — everything but core `base`, in display order. */
export function getToggleableExtensions(): ExtensionInfo[] {
	return _registry.filter((e) => e.id !== 'base');
}

// ---------------------------------------------------------------------------
// Enabled predicates — pickers + content filters call these
// ---------------------------------------------------------------------------

/** Single predicate usable across moves/oracles/foes/assets. */
export function isSourceEnabled(source: string | undefined): boolean {
	// Unknown/missing source is core — always enabled.
	if (!source || source === 'base') return true;
	// Registered → the reactive map (reading `_enabled` keeps this reactive
	// across registerExtensions()). Not yet hydrated → enabled; the stores
	// that filter by it await loadExtensions() first.
	if (source in _enabled) return _enabled[source];
	return true;
}

// ---------------------------------------------------------------------------
// Setters — update reactive state and store the choice on the account
// ---------------------------------------------------------------------------

export function setExtensionEnabled(id: string, on: boolean): void {
	_choices = { ..._choices, [id]: on };
	_enabled = { ..._enabled, [id]: on };
	void saveChoices({ [id]: on }).then((saved) => {
		if (!saved) console.error(`[extensions] couldn't save ${id} ${on ? 'on' : 'off'}`);
	});
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Human-readable label for a catalogue source — picker chips + badges. */
export function sourceLabel(source: string): string {
	if (source === 'base') return 'Core';
	return _registry.find((e) => e.id === source)?.name ?? String(source);
}

/** Oracle keys hidden by any currently-enabled extension. Reactive on
 *  `_registry` + `_enabled`, so oracle pickers re-filter when the user
 *  toggles an expansion. Union of:
 *   • `suppressesOracles` — pure hides (e.g. Lodestar's Core: Descriptor
 *     supersedes Delve's Feature Aspect at the character-concept level).
 *   • `supersedesOracles` keys — hides implied by a keyed rewrite (asking
 *     for the base key gets the replacement, so showing both would be
 *     confusing). */
export function suppressedOracleKeys(): Set<string> {
	const out = new Set<string>();
	for (const e of _registry) {
		if (!isSourceEnabled(e.id)) continue;
		for (const k of e.suppressesOracles ?? []) out.add(k);
		for (const k of Object.keys(e.supersedesOracles ?? {})) out.add(k);
	}
	return out;
}

/** Resolve a possibly-superseded oracle key. Walks enabled extensions in
 *  manifest order (lower `order` wins) and returns the first replacement
 *  found, else the input. Consumers that used to write
 *      isSourceEnabled('yrt') ? 'yrtRegion' : 'region'
 *  now write `resolveOracleKey('region')`. */
export function resolveOracleKey(key: string): string {
	for (const e of _registry) {
		if (!isSourceEnabled(e.id)) continue;
		const rep = e.supersedesOracles?.[key];
		if (rep) return rep;
	}
	return key;
}

/** Culture keys hidden from the settlement builder by an enabled
 *  extension's `supersedesCultures` (YRT hides Elves for Verdani). */
export function supersededCultureKeys(): Set<string> {
	const out = new Set<string>();
	for (const e of _registry) {
		if (!isSourceEnabled(e.id)) continue;
		for (const k of Object.keys(e.supersedesCultures ?? {})) out.add(k);
	}
	return out;
}

/** Resolve a possibly-superseded culture key, like resolveOracleKey. */
export function resolveCultureKey(key: string): string {
	for (const e of _registry) {
		if (!isSourceEnabled(e.id)) continue;
		const rep = e.supersedesCultures?.[key];
		if (rep) return rep;
	}
	return key;
}
