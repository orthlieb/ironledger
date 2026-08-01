// =============================================================================
// Iron Ledger — Entity-store factory (Svelte 5 module-level $state)
//
// The four standalone session collections — NPCs, Places, Communities,
// Expeditions — are all backed by the same shape: a reactive list, load-once
// hydration from the session blob, per-entity diffed persistence via
// makeEntitySync, and add/update/remove mutations. Each store was a
// line-for-line copy differing only in the entity type, the session-JSON key,
// and the log tag. This factory is the single source of truth; each store
// module is a thin facade that re-exports these under its named exports
// (loadNpcs, getNpcs, addNpc, …) so existing call sites are unchanged.
//
// `$state` lives inside the factory function: it's invoked exactly once per
// store module at import time, so the reactive list persists for the module's
// lifetime, and a getter that reads it tracks fine-grained dependencies in the
// caller's reactive context exactly as the old module-level `$state` did.
// =============================================================================

import { makeEntitySync } from '$lib/entitySync.js';
import { fetchSession } from '$lib/sessionData.js';

export interface EntityStore<T> {
	/** Load from the server once per session (idempotent). */
	load(): Promise<void>;
	/** Reactive list of all entities, in insertion order. */
	get(): T[];
	isLoading(): boolean;
	isSaving(): boolean;
	/** Append + persist. */
	add(item: T): Promise<void>;
	/** Replace one by id + persist. */
	update(updated: T): Promise<void>;
	/** Replace one by id WITHOUT persisting (pair with persistNow when the
	 *  caller is debouncing the write). */
	updateLocal(updated: T): void;
	/** Force a save of the current list (debounce-friendly partner). */
	persistNow(): Promise<void>;
	/** Remove one by id + persist. */
	remove(id: string): Promise<void>;
}

/**
 * Build a session-collection store.
 *
 * @param key  session-JSON property + entitySync collection name
 *             (`'npcs' | 'places' | 'communities' | 'expeditions'`)
 * @param tag  log/debug tag, e.g. `'npcStore'`
 */
export function makeEntityStore<T extends { id: string }>(
	key: string,
	tag: string,
): EntityStore<T> {
	let _items = $state<T[]>([]);
	let _loading = $state(false);
	let _loaded = false;
	let _saving = $state(false);

	// Per-entity sync engine — diffs the live list against the server snapshot
	// and issues one request per changed entity instead of the whole list.
	const _sync = makeEntitySync<T>(key, () => _items, tag);

	async function persist(): Promise<void> {
		_saving = true;
		try {
			await _sync.persist();
		} finally {
			_saving = false;
		}
	}

	async function load(): Promise<void> {
		if (_loaded || _loading) return;
		_loading = true;
		try {
			const json = (await fetchSession()) as Record<string, unknown>;
			// Guard against legacy rows where the JSONB column was persisted as
			// `{}` instead of `[]` — a plain `?? []` only rescues null/undefined.
			const raw = json[key];
			_items = Array.isArray(raw) ? (raw as T[]) : [];
			_sync.reset(_items);
			_loaded = true;
		} catch (err) {
			console.error(`[${tag}] Failed to load ${key}:`, err);
		} finally {
			_loading = false;
		}
	}

	return {
		load,
		get: () => _items,
		isLoading: () => _loading,
		isSaving: () => _saving,
		async add(item: T) {
			_items = [..._items, item];
			await persist();
		},
		async update(updated: T) {
			_items = _items.map((x) => (x.id === updated.id ? updated : x));
			await persist();
		},
		updateLocal(updated: T) {
			_items = _items.map((x) => (x.id === updated.id ? updated : x));
		},
		async persistNow() {
			await persist();
		},
		async remove(id: string) {
			_items = _items.filter((x) => x.id !== id);
			await persist();
		},
	};
}
