// =============================================================================
// Iron Ledger — Encounter Store (Svelte 5 module-level $state)
//
// Global (non-character) combat encounter state.
// Mirrors the old app's localStorage['oracle-combats'] but stored server-side
// in the user_data table.
//
// Provides:
//   • loadEncounters()              — fetch on page load (idempotent)
//   • getEncounters()               — reactive list of all encounters
//   • addEncounter(enc)             — append + persist
//   • updateEncounter(enc)          — replace one + persist
//   • removeEncounter(id)           — delete one + persist
// =============================================================================

import type { FoeEncounter } from '$lib/types.js';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _encounters: FoeEncounter[] = $state([]);
let _loading                     = $state(false);
let _loaded                      = false;
let _saving                      = $state(false);

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Load encounters from the server (idempotent — only fetches once per session).
 * Call this on page mount before displaying the Foes tab.
 */
export async function loadEncounters(): Promise<void> {
	if (_loaded || _loading) return;
	_loading = true;
	try {
		const res = await fetch('/api/session', { credentials: 'include' });
		if (!res.ok) throw new Error(`Session fetch failed: ${res.status}`);
		const json = (await res.json()) as { encounters: FoeEncounter[] };
		_encounters = json.encounters ?? [];
		_loaded     = true;
	} catch (err) {
		console.error('[encounterStore] Failed to load encounters:', err);
	} finally {
		_loading = false;
	}
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/** All encounters, in insertion order. Reactive. */
export function getEncounters(): FoeEncounter[] {
	return _encounters;
}

export function isEncounterLoading(): boolean {
	return _loading;
}

export function isEncounterSaving(): boolean {
	return _saving;
}

// ---------------------------------------------------------------------------
// Mutations (each one optimistically updates local state then persists)
// ---------------------------------------------------------------------------

/** Append a new encounter and persist. */
export async function addEncounter(enc: FoeEncounter): Promise<void> {
	_encounters = [..._encounters, enc];
	await persist();
}

/** Replace one encounter by id and persist. */
export async function updateEncounter(updated: FoeEncounter): Promise<void> {
	_encounters = _encounters.map((e) => e.id === updated.id ? updated : e);
	await persist();
}

/** Remove one encounter by id and persist. */
export async function removeEncounter(id: string): Promise<void> {
	_encounters = _encounters.filter((e) => e.id !== id);
	await persist();
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function persist(): Promise<void> {
	if (_saving) return; // prevent concurrent saves
	_saving = true;
	try {
		const res = await fetch('/api/session/encounters', {
			method:      'PATCH',
			credentials: 'include',
			headers:     { 'Content-Type': 'application/json' },
			body:        JSON.stringify({ encounters: _encounters }),
		});
		if (!res.ok) {
			console.error('[encounterStore] Persist failed:', res.status);
		}
	} catch (err) {
		console.error('[encounterStore] Persist error:', err);
	} finally {
		_saving = false;
	}
}
