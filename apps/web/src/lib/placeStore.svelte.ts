// =============================================================================
// Iron Ledger — Place Store (Svelte 5 module-level $state)
//
// Global place state — inns, markets, remote locations (dire forest, ruin).
// Places are a distinct connection kind alongside communities and NPCs; they
// share the Community field set today but live in their own storage so future
// place-specific fields don't require a schema shuffle.
//
// Server-side each place is one row in user_entities (kind='place').
//
// Provides:
//   • loadPlaces()          — fetch on page load (idempotent)
//   • getPlaces()           — reactive list of all places
//   • addPlace(p)           — append + persist
//   • updatePlace(p)        — replace one + persist
//   • updatePlaceLocal(p)   — replace one without persisting (debounce)
//   • persistPlacesNow()    — flush pending updates now (debounce partner)
//   • removePlace(id)       — delete one + persist
// =============================================================================

import type { Place } from '$lib/types.js';
import { makeEntitySync } from '$lib/entitySync.js';
import { fetchSession } from '$lib/sessionData.js';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _places: Place[] = $state([]);
let _loading = $state(false);
let _loaded = false;
let _saving = $state(false);

// Per-entity sync engine — diffs the live list against the server snapshot and
// issues one request per changed place instead of re-sending the whole list.
const _sync = makeEntitySync<Place>('places', () => _places, 'placeStore');

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Load places from the server (idempotent — only fetches once per session).
 * Safe to call on legacy sessions predating the `places` column (defaults to []).
 */
export async function loadPlaces(): Promise<void> {
	if (_loaded || _loading) return;
	_loading = true;
	try {
		const json = await fetchSession();
		_places = Array.isArray(json.places) ? (json.places as Place[]) : [];
		_sync.reset(_places);
		_loaded = true;
	} catch (err) {
		console.error('[placeStore] Failed to load places:', err);
	} finally {
		_loading = false;
	}
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/** All places, in insertion order. Reactive. */
export function getPlaces(): Place[] {
	return _places;
}

export function isPlaceLoading(): boolean {
	return _loading;
}

export function isPlaceSaving(): boolean {
	return _saving;
}

// ---------------------------------------------------------------------------
// Mutations (optimistic — update local state then persist)
// ---------------------------------------------------------------------------

/** Append a new place and persist. */
export async function addPlace(p: Place): Promise<void> {
	_places = [..._places, p];
	await persist();
}

/** Replace one place by id and persist. */
export async function updatePlace(updated: Place): Promise<void> {
	_places = _places.map((p) => (p.id === updated.id ? updated : p));
	await persist();
}

/** Replace one place by id WITHOUT persisting. Pair with
    persistPlacesNow() to debounce rapid text edits. */
export function updatePlaceLocal(updated: Place): void {
	_places = _places.map((p) => (p.id === updated.id ? updated : p));
}

/** Force a save of the current place list (debounce-friendly partner). */
export async function persistPlacesNow(): Promise<void> {
	await persist();
}

/** Remove one place by id and persist. */
export async function removePlace(id: string): Promise<void> {
	_places = _places.filter((p) => p.id !== id);
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
