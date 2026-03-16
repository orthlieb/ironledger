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

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _expeditions: Expedition[] = $state([]);
let _loading                    = $state(false);
let _loaded                     = false;
let _saving                     = $state(false);

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
		const json = (await res.json()) as { expeditions: Expedition[] };
		_expeditions = json.expeditions ?? [];
		_loaded      = true;
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
	_expeditions = _expeditions.map((e) => e.id === updated.id ? updated : e);
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
	if (_saving) return; // prevent concurrent saves
	_saving = true;
	try {
		const res = await fetch('/api/session/expeditions', {
			method:      'PATCH',
			credentials: 'include',
			headers:     { 'Content-Type': 'application/json' },
			body:        JSON.stringify({ expeditions: _expeditions }),
		});
		if (!res.ok) {
			console.error('[expeditionStore] Persist failed:', res.status);
		}
	} catch (err) {
		console.error('[expeditionStore] Persist error:', err);
	} finally {
		_saving = false;
	}
}
