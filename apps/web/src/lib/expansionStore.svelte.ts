// =============================================================================
// Iron Ledger — Expansion toggle store (Svelte 5 module-level $state)
//
// Persists per-browser Delve / YRT expansion toggles to localStorage.
//
//   • Default: both ON (existing users see no change on first load).
//   • Setting the flag "off" hides catalogue items tagged with that source
//     from pickers/browsers only. `find*` lookups remain unfiltered so
//     existing user-created records (log entries, owned assets, sites,
//     denizens referencing a disabled-expansion foe) continue to render.
// =============================================================================

import type { CatalogueSource } from '$lib/types.js';

const DELVE_KEY = 'ironledger:expansion:delve';
const YRT_KEY = 'ironledger:expansion:yrt';

function readLocal(key: string): boolean {
	if (typeof window === 'undefined') return true;
	return localStorage.getItem(key) !== 'off';
}

// Hydrate synchronously from localStorage on first import (client-only guard lives in readLocal).
let _delveEnabled = $state(readLocal(DELVE_KEY));
let _yrtEnabled = $state(readLocal(YRT_KEY));

// ---------------------------------------------------------------------------
// Getters — function form (pickers + filters call these)
// ---------------------------------------------------------------------------

export function isDelveEnabled(): boolean {
	return _delveEnabled;
}
export function isYrtEnabled(): boolean {
	return _yrtEnabled;
}

/** Single predicate usable across moves/oracles/foes/assets. */
export function isSourceEnabled(source: CatalogueSource | string | undefined): boolean {
	// Unknown/missing source is treated as base — always enabled.
	// Defensive: any truthy-but-unknown string also defaults to enabled so new
	// expansions added before a toggle exists don't silently disappear.
	switch (source) {
		case 'delve':
			return _delveEnabled;
		case 'yrt':
			return _yrtEnabled;
		case 'base':
		case undefined:
		case '':
		default:
			return true;
	}
}

// ---------------------------------------------------------------------------
// Setters — persist to localStorage and update reactive state
// ---------------------------------------------------------------------------

function writeLocal(key: string, enabled: boolean): void {
	if (typeof window === 'undefined') return;
	if (enabled) localStorage.removeItem(key);
	else localStorage.setItem(key, 'off');
}

export function setDelveEnabled(enabled: boolean): void {
	_delveEnabled = enabled;
	writeLocal(DELVE_KEY, enabled);
}

export function setYrtEnabled(enabled: boolean): void {
	_yrtEnabled = enabled;
	writeLocal(YRT_KEY, enabled);
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Human-readable label for a catalogue source — used in picker chips and badges. */
export function sourceLabel(source: CatalogueSource | string): string {
	switch (source) {
		case 'base':
			return 'Core';
		case 'delve':
			return 'Delve';
		case 'yrt':
			return 'YRT';
		default:
			return String(source);
	}
}
