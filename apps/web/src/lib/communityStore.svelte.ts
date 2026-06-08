// =============================================================================
// Iron Ledger — Community Store (Svelte 5 module-level $state)
//
// Global community/NPC state for all characters.
// Stored server-side in the user_data table (communities column).
//
// Provides:
//   • loadCommunities()              — fetch on page load (idempotent)
//   • getCommunities()               — reactive list of all communities
//   • addCommunity(c)                — append + persist
//   • updateCommunity(c)             — replace one + persist
//   • removeCommunity(id)            — delete one + persist
// =============================================================================

import type { Community } from '$lib/types.js';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _communities: Community[] = $state([]);
let _loading = $state(false);
let _loaded = false;
let _saving = $state(false);

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Load communities from the server (idempotent — only fetches once per session).
 * Call this on page mount before displaying the Community tab.
 */
export async function loadCommunities(): Promise<void> {
	if (_loaded || _loading) return;
	_loading = true;
	try {
		const res = await fetch('/api/session', { credentials: 'include' });
		if (!res.ok) throw new Error(`Session fetch failed: ${res.status}`);
		const json = (await res.json()) as { communities: unknown };
		// Guard against legacy rows where the JSONB column was persisted as
		// `{}` instead of `[]` — `?? []` only rescues null/undefined.
		_communities = Array.isArray(json.communities) ? (json.communities as Community[]) : [];
		_loaded = true;
	} catch (err) {
		console.error('[communityStore] Failed to load communities:', err);
	} finally {
		_loading = false;
	}
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/** All communities, in insertion order. Reactive. */
export function getCommunities(): Community[] {
	return _communities;
}

export function isCommunityLoading(): boolean {
	return _loading;
}

export function isCommunitySaving(): boolean {
	return _saving;
}

// ---------------------------------------------------------------------------
// Mutations (each one optimistically updates local state then persists)
// ---------------------------------------------------------------------------

/** Append a new community and persist. */
export async function addCommunity(c: Community): Promise<void> {
	_communities = [..._communities, c];
	await persist();
}

/** Replace one community by id and persist. */
export async function updateCommunity(updated: Community): Promise<void> {
	_communities = _communities.map((c) => (c.id === updated.id ? updated : c));
	await persist();
}

/** Replace one community by id WITHOUT persisting. Pair with
    persistCommunitiesNow() to debounce rapid text edits. */
export function updateCommunityLocal(updated: Community): void {
	_communities = _communities.map((c) => (c.id === updated.id ? updated : c));
}
/** Force a save of the current community list (debounce-friendly partner). */
export async function persistCommunitiesNow(): Promise<void> {
	await persist();
}

/** Remove one community by id and persist. */
export async function removeCommunity(id: string): Promise<void> {
	_communities = _communities.filter((c) => c.id !== id);
	await persist();
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function persist(): Promise<void> {
	if (_saving) return; // prevent concurrent saves
	_saving = true;
	try {
		const res = await fetch('/api/session/communities', {
			method: 'PATCH',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ communities: _communities }),
		});
		if (!res.ok) {
			console.error('[communityStore] Persist failed:', res.status);
		}
	} catch (err) {
		console.error('[communityStore] Persist error:', err);
	} finally {
		_saving = false;
	}
}
