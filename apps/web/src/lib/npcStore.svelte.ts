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
import { makeEntitySync } from '$lib/entitySync.js';
import { fetchSession } from '$lib/sessionData.js';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _npcs: Npc[] = $state([]);
let _loading = $state(false);
let _loaded = false;
let _saving = $state(false);

// Per-entity sync engine — diffs the live list against the server snapshot and
// issues one request per changed NPC instead of re-sending the whole list.
const _sync = makeEntitySync<Npc>('npcs', () => _npcs, 'npcStore');

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
		const json = await fetchSession();
		// Guard against legacy rows where the JSONB column was persisted as
		// `{}` instead of `[]` — `?? []` only rescues null/undefined.
		_npcs = Array.isArray(json.npcs) ? (json.npcs as Npc[]) : [];
		_sync.reset(_npcs);
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
	_npcs = _npcs.map((n) => (n.id === updated.id ? updated : n));
	await persist();
}

/** Replace one NPC by id WITHOUT persisting. Pair with persistNpcsNow()
    when the caller is debouncing the API write. */
export function updateNpcLocal(updated: Npc): void {
	_npcs = _npcs.map((n) => (n.id === updated.id ? updated : n));
}
/** Force a save of the current NPC list (debounce-friendly partner). */
export async function persistNpcsNow(): Promise<void> {
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
	_saving = true;
	try {
		await _sync.persist();
	} finally {
		_saving = false;
	}
}
