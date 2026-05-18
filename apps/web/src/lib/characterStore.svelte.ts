// =============================================================================
// Iron Ledger — Character Store (Svelte 5 module-level $state)
//
// Central source of truth for the character list and party-wide supply.
// Per-character initiative lives on `data.initiative` and is read/written
// directly through the proxied character via the home UI.
//
// Provides:
//   • loadCharacters()                  — fetch + init on page load (idempotent)
//   • getCharacters()                   — reactive list (insertion order)
//   • getPartySupply()                  — reactive party-wide supply
//   • isCharacterLoading()
//   • createCharacter(name?, data?)     — API create + prepend
//   • deleteCharacter(id)               — API delete + filter
//   • persistCharacterNow(id, patch)    — optimistic update + immediate API write
//   • flushCharacterToApi(id)           — push current store state to API (no array rewrite)
//   • setPartySupply(val)               — update all chars.supply + persist each
// =============================================================================

import type { CharacterFull } from '$lib/api.js';
import { characters as api } from '$lib/api.js';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _characters: CharacterFull[] = $state([]);
let _loading                     = $state(false);
let _loaded                      = false;
let _partySupply: number | null  = $state(null);

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/** Load characters from the server (idempotent — only fetches once per session). */
export async function loadCharacters(): Promise<void> {
	if (_loaded || _loading) return;
	_loading = true;
	try {
		const list = await api.list();
		_characters = list;

		// Initialise party supply to the max across all loaded characters.
		if (list.length > 0) {
			_partySupply = Math.max(...list.map(c => (c.data as Record<string, unknown>).supply as number ?? 3));
		}

		_loaded = true;
	} catch (err) {
		console.error('[characterStore] Failed to load characters:', err);
		throw err; // re-throw so caller can display an error
	} finally {
		_loading = false;
	}
}

// ---------------------------------------------------------------------------
// Accessors (reactive — safe to call in $derived / $effect)
// ---------------------------------------------------------------------------

/** All characters, in insertion order. Reactive. */
export function getCharacters(): CharacterFull[] {
	return _characters;
}

export function isCharacterLoading(): boolean {
	return _loading;
}

/** Party-wide supply value (null until first character loads). */
export function getPartySupply(): number | null {
	return _partySupply;
}

// ---------------------------------------------------------------------------
// Create / Delete
// ---------------------------------------------------------------------------

/**
 * Create a new character via the API, prepend to the list, and return it.
 * Accepts optional name and initial data for import use-cases.
 */
export async function createCharacter(
	name: string = 'New Character',
	initialData: Record<string, unknown> = {},
): Promise<CharacterFull> {
	const newChar = await api.create(name, initialData);
	_characters = [newChar, ..._characters];
	// Initialise party supply if this is the first character
	if (_partySupply === null) {
		_partySupply = (newChar.data as Record<string, unknown>).supply as number ?? 3;
	}
	return newChar;
}

/** Delete a character by id. */
export async function deleteCharacter(id: string): Promise<void> {
	await api.remove(id);
	_characters = _characters.filter(c => c.id !== id);
}

// ---------------------------------------------------------------------------
// Persist
// ---------------------------------------------------------------------------

/**
 * Optimistically update _characters and immediately write to the API.
 * Called by CharacterSheet after its own 1500 ms debounce fires, and by
 * page-level bus-drain handlers when CharacterSheet is not mounted.
 */
export function persistCharacterNow(
	id: string,
	patch: { name?: string; data: Record<string, unknown> },
): void {
	_characters = _characters.map(c =>
		c.id === id ? { ...c, name: patch.name ?? c.name, data: patch.data } : c,
	);
	api.update(id, patch).catch(err =>
		console.error('[characterStore] Save failed:', err),
	);
}

/**
 * Push the in-memory character's current state to the API, without touching
 * the in-memory store (it's assumed to already be the source of truth).
 * Used by v2 where the UI binds directly to the store and a debounced effect
 * fires this on edits.
 */
export function flushCharacterToApi(id: string): void {
	const c = _characters.find(c => c.id === id);
	if (!c) return;
	const data = $state.snapshot(c.data) as Record<string, unknown>;
	api.update(id, { name: c.name, data }).catch(err =>
		console.error('[characterStore] Save failed:', err),
	);
}

// ---------------------------------------------------------------------------
// Party supply
// ---------------------------------------------------------------------------

/**
 * Set the party-wide supply value — echoes to every character's data.supply
 * and persists each immediately.
 */
export function setPartySupply(val: number): void {
	_partySupply = val;
	for (const c of _characters) {
		const newData: Record<string, unknown> = {
			...(c.data as Record<string, unknown>),
			supply: val,
		};
		// Optimistic update in one pass then fire API (avoid stacking map calls)
		api.update(c.id, { data: newData }).catch(() => {});
	}
	// Single reactive assignment covers all chars
	_characters = _characters.map(c => ({
		...c,
		data: { ...(c.data as Record<string, unknown>), supply: val },
	}));
}

