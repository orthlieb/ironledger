// =============================================================================
// Iron Ledger — Extension registry + expansion toggle store
// (Svelte 5 module-level $state)
//
// Extensions are discovered from /api/catalogue/extensions (the build-time
// manifest, served by the API), so adding an expansion needs no code here.
// Each carries metadata (id, name, defaultEnabled) and a per-browser on/off
// toggle persisted to localStorage under `ironledger:expansion:<id>`.
//
//   • An extension defaults to its manifest `defaultEnabled` until the user
//     toggles it; the choice then persists explicitly ('on' / 'off').
//   • Turning an expansion off hides catalogue items tagged with that source
//     from pickers/browsers only. `find*` lookups stay unfiltered so existing
//     user records (log entries, owned assets, sites, denizens) keep rendering.
//   • `base` is core content — always enabled, never toggleable.
// =============================================================================

import type { ExtensionInfo } from '$lib/types.js';

const key = (id: string) => `ironledger:expansion:${id}`;

/** Registry: extension metadata, hydrated from /api/catalogue/extensions. */
let _registry = $state<ExtensionInfo[]>([]);
/** Per-id enabled state (reactive). */
let _enabled = $state<Record<string, boolean>>({});

function readEnabled(id: string, defaultEnabled: boolean): boolean {
	if (typeof window === 'undefined') return defaultEnabled;
	const v = localStorage.getItem(key(id));
	// Explicit choice wins; otherwise the extension's manifest default.
	return v === 'on' ? true : v === 'off' ? false : defaultEnabled;
}
function writeEnabled(id: string, on: boolean): void {
	if (typeof window === 'undefined') return;
	// Store explicitly (not remove-when-on) so a default-off extension can be
	// turned on and persist.
	localStorage.setItem(key(id), on ? 'on' : 'off');
}

// ---------------------------------------------------------------------------
// Registry hydration
// ---------------------------------------------------------------------------

/** Populate the registry + enabled map from the served extension list. */
export function registerExtensions(list: ExtensionInfo[]): void {
	_registry = [...list].sort((a, b) => a.order - b.order);
	const next: Record<string, boolean> = {};
	for (const e of _registry) next[e.id] = readEnabled(e.id, e.defaultEnabled);
	_enabled = next;
}

let _loaded = false;
/** Fetch + register the extension list. Idempotent per session. */
export async function loadExtensions(): Promise<void> {
	if (_loaded) return;
	_loaded = true;
	try {
		const res = await fetch('/api/catalogue/extensions');
		if (res.ok) registerExtensions((await res.json()) as ExtensionInfo[]);
		else _loaded = false;
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
	// Registered → the reactive map. Not yet hydrated → read localStorage
	// directly (default: enabled) so early content filtering still works.
	// Reading `_enabled` keeps this reactive across registerExtensions().
	if (source in _enabled) return _enabled[source];
	if (typeof window === 'undefined') return true;
	return localStorage.getItem(key(source)) !== 'off';
}

// ---------------------------------------------------------------------------
// Setters — persist to localStorage and update reactive state
// ---------------------------------------------------------------------------

export function setExtensionEnabled(id: string, on: boolean): void {
	_enabled = { ..._enabled, [id]: on };
	writeEnabled(id, on);
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
