// =============================================================================
// Iron Ledger — Expedition Store (Svelte 5 module-level $state)
//
// Global (non-character) journey & delve site state.
// Mirrors the encounterStore pattern but for expeditions, stored server-side
// in the user_data table.
//
// Provides:
//   • loadExpeditions()              — fetch on page load (idempotent)
//   • getExpeditions()               — reactive list of all expeditions
//   • addExpedition(exp)             — append + persist
//   • updateExpedition(exp)          — replace one + persist
//   • removeExpedition(id)           — delete one + persist
// =============================================================================

import type { Expedition } from '$lib/types.js';
import { makeEntitySync } from '$lib/entitySync.js';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _expeditions: Expedition[] = $state([]);
let _loading = $state(false);
let _loaded = false;
let _saving = $state(false);

// Per-entity sync engine — diffs the live list against the server snapshot and
// issues one request per changed expedition instead of re-sending the whole list.
const _sync = makeEntitySync<Expedition>('expeditions', () => _expeditions, 'expeditionStore');

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Load expeditions from the server (idempotent — only fetches once per session).
 * Call this on page mount before displaying the Expeditions tab.
 */
export async function loadExpeditions(): Promise<void> {
	if (_loaded || _loading) return;
	_loading = true;
	try {
		const res = await fetch('/api/session', { credentials: 'include' });
		if (!res.ok) throw new Error(`Session fetch failed: ${res.status}`);
		const json = (await res.json()) as { expeditions: unknown };
		// Guard against legacy rows where the JSONB column was persisted as
		// `{}` instead of `[]` — `?? []` only rescues null/undefined.
		_expeditions = Array.isArray(json.expeditions) ? (json.expeditions as Expedition[]) : [];
		_sync.reset(_expeditions);
		_loaded = true;
	} catch (err) {
		console.error('[expeditionStore] Failed to load expeditions:', err);
	} finally {
		_loading = false;
	}
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/** All expeditions, in insertion order. Reactive. */
export function getExpeditions(): Expedition[] {
	return _expeditions;
}

export function isExpeditionLoading(): boolean {
	return _loading;
}

export function isExpeditionSaving(): boolean {
	return _saving;
}

// ---------------------------------------------------------------------------
// Mutations (each one optimistically updates local state then persists)
// ---------------------------------------------------------------------------

/** Append a new expedition and persist. */
export async function addExpedition(exp: Expedition): Promise<void> {
	_expeditions = [..._expeditions, exp];
	await persist();
}

/** Replace one expedition by id and persist. */
export async function updateExpedition(updated: Expedition): Promise<void> {
	_expeditions = _expeditions.map((e) => (e.id === updated.id ? updated : e));
	await persist();
}

/** Replace one expedition by id WITHOUT persisting. Use this when the caller
 *  is debouncing the API write — pair with persistExpeditionsNow(). */
export function updateExpeditionLocal(updated: Expedition): void {
	_expeditions = _expeditions.map((e) => (e.id === updated.id ? updated : e));
}

/** Force a save of the current encounter set. Used by debounced callers
 *  (ExpeditionsArea) after they've already updated local state. */
export async function persistExpeditionsNow(): Promise<void> {
	await persist();
}

/** Remove one expedition by id and persist. */
export async function removeExpedition(id: string): Promise<void> {
	_expeditions = _expeditions.filter((e) => e.id !== id);
	await persist();
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function persist(): Promise<void> {
	_saving = true;
	try {
		await _sync.persist();
	} finally {
		_saving = false;
	}
}
