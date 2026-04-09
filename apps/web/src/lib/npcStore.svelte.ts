// =============================================================================
// Iron Ledger — NPC Store (Svelte 5 module-level $state)
//
// Global standalone NPC state. NPCs are independent of communities so they
// can travel freely across the world.
// Stored server-side in the user_data table (npcs column).
//
// Provides:
//   • loadNpcs()              — fetch on page load (idempotent)
//   • getNpcs()               — reactive list of all NPCs
//   • addNpc(n)               — append + persist
//   • updateNpc(n)            — replace one + persist
//   • removeNpc(id)           — delete one + persist
// =============================================================================

import type { Npc } from '$lib/types.js';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _npcs: Npc[] = $state([]);
let _loading      = $state(false);
let _loaded       = false;
let _saving       = $state(false);

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Load NPCs from the server (idempotent — only fetches once per session).
 * Call this on page mount before displaying the Communities tab.
 */
export async function loadNpcs(): Promise<void> {
	if (_loaded || _loading) return;
	_loading = true;
	try {
		const res = await fetch('/api/session', { credentials: 'include' });
		if (!res.ok) throw new Error(`Session fetch failed: ${res.status}`);
		const json = (await res.json()) as { npcs: unknown };
		// Guard against legacy rows where the JSONB column was persisted as
		// `{}` instead of `[]` — `?? []` only rescues null/undefined.
		_npcs   = Array.isArray(json.npcs) ? (json.npcs as Npc[]) : [];
		_loaded = true;
	} catch (err) {
		console.error('[npcStore] Failed to load NPCs:', err);
	} finally {
		_loading = false;
	}
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/** All NPCs, in insertion order. Reactive. */
export function getNpcs(): Npc[] {
	return _npcs;
}

export function isNpcLoading(): boolean {
	return _loading;
}

export function isNpcSaving(): boolean {
	return _saving;
}

// ---------------------------------------------------------------------------
// Mutations (each one optimistically updates local state then persists)
// ---------------------------------------------------------------------------

/** Append a new NPC and persist. */
export async function addNpc(n: Npc): Promise<void> {
	_npcs = [..._npcs, n];
	await persist();
}

/** Replace one NPC by id and persist. */
export async function updateNpc(updated: Npc): Promise<void> {
	_npcs = _npcs.map((n) => n.id === updated.id ? updated : n);
	await persist();
}

/** Remove one NPC by id and persist. */
export async function removeNpc(id: string): Promise<void> {
	_npcs = _npcs.filter((n) => n.id !== id);
	await persist();
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function persist(): Promise<void> {
	if (_saving) return; // prevent concurrent saves
	_saving = true;
	try {
		const res = await fetch('/api/session/npcs', {
			method:      'PATCH',
			credentials: 'include',
			headers:     { 'Content-Type': 'application/json' },
			body:        JSON.stringify({ npcs: _npcs }),
		});
		if (!res.ok) {
			console.error('[npcStore] Persist failed:', res.status);
		}
	} catch (err) {
		console.error('[npcStore] Persist error:', err);
	} finally {
		_saving = false;
	}
}
