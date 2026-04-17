// =============================================================================
// Iron Ledger — Character Store (Svelte 5 module-level $state)
//
// Central source of truth for all character state: the character list,
// per-character initiative, and party-wide supply.  Mirrors the
// encounterStore / expeditionStore pattern but uses per-character REST
// endpoints (PUT /api/characters/:id) rather than a single JSONB blob.
//
// Provides:
//   • loadCharacters(hasActiveFoe?)     — fetch + init on page load (idempotent)
//   • getCharacters()                   — reactive list (insertion order)
//   • getInitiativeMap()                — reactive per-char initiative (0=none,1=char,2=foe)
//   • getPartySupply()                  — reactive party-wide supply
//   • isCharacterLoading()
//   • createCharacter(name?, data?)     — API create + prepend
//   • deleteCharacter(id)               — API delete + filter
//   • persistCharacterNow(id, patch)    — optimistic update + immediate API write
//                                         (called by CharacterSheet after its own 1500ms debounce)
//   • setInitiative(charId, value)      — update map + persist immediately
//   • clearAllInitiative()              — wipe all initiative + persist
//   • setPartySupply(val)               — update all chars.supply + persist each
//   • syncPartySupply()                 — recompute _partySupply from current chars
//   • rebuildInitiativeMap(hasActiveFoe)— re-derive initiative map from chars (used after import)
// =============================================================================

import type { CharacterFull } from '$lib/api.js';
import { characters as api } from '$lib/api.js';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _characters: CharacterFull[]          = $state([]);
let _loading                               = $state(false);
let _loaded                                = false;
let _initiativeMap: Record<string, number> = $state({});
let _partySupply: number | null            = $state(null);

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Load characters from the server (idempotent — only fetches once per session).
 * Pass hasActiveFoe so the initiative guard can skip stale foe-has-initiative values.
 */
export async function loadCharacters(hasActiveFoe = false): Promise<void> {
	if (_loaded || _loading) return;
	_loading = true;
	try {
		const list = await api.list();
		_characters = list;

		// Initialise party supply to the max across all loaded characters
		if (list.length > 0) {
			_partySupply = Math.max(...list.map(c => (c.data as Record<string, unknown>).supply as number ?? 3));
		}

		// Restore initiative from each character's saved data.
		// Guard: skip initiative === 2 (foe has initiative) if no active foes exist —
		// the auto-save debounce may not have fired before the previous logout.
		rebuildInitiativeMap(hasActiveFoe);

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

/** Per-character initiative map. 0 = none, 1 = character has it, 2 = foe has it. */
export function getInitiativeMap(): Record<string, number> {
	return _initiativeMap;
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

/** Delete a character by id — removes from list and clears their initiative. */
export async function deleteCharacter(id: string): Promise<void> {
	await api.remove(id);
	_characters = _characters.filter(c => c.id !== id);
	if (id in _initiativeMap) {
		const m = { ..._initiativeMap };
		delete m[id];
		_initiativeMap = m;
	}
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

// ---------------------------------------------------------------------------
// Initiative
// ---------------------------------------------------------------------------

/**
 * Set initiative for one character.
 * value: 0 = clear, 1 = character has it, 2 = foe has it.
 * Persists data.initiative immediately (no debounce — initiative is small and critical).
 */
export function setInitiative(charId: string, value: number): void {
	const m = { ..._initiativeMap };
	if (value === 0) {
		delete m[charId];
	} else {
		m[charId] = value;
	}
	_initiativeMap = m;

	// Mirror into the character data and save immediately
	const char = _characters.find(c => c.id === charId);
	if (char) {
		const newData: Record<string, unknown> = {
			...(char.data as Record<string, unknown>),
			initiative: value || undefined,
		};
		_characters = _characters.map(c => c.id === charId ? { ...c, data: newData } : c);
		api.update(charId, { data: newData }).catch(() => {});
	}
}

/** Clear all initiative and persist each affected character. */
export function clearAllInitiative(): void {
	const charIds = Object.keys(_initiativeMap);
	_initiativeMap = {};
	for (const charId of charIds) {
		const char = _characters.find(c => c.id === charId);
		if (char) {
			const newData: Record<string, unknown> = {
				...(char.data as Record<string, unknown>),
				initiative: undefined,
			};
			_characters = _characters.map(c => c.id === charId ? { ...c, data: newData } : c);
			api.update(charId, { data: newData }).catch(() => {});
		}
	}
}

/**
 * Re-derive the initiative map from current character data.
 * Used after load and after import.
 */
export function rebuildInitiativeMap(hasActiveFoe = false): void {
	const map: Record<string, number> = {};
	for (const c of _characters) {
		const v = (c.data as Record<string, unknown>).initiative as number | undefined;
		if (v === 1) map[c.id] = v;
		else if (v === 2 && hasActiveFoe) map[c.id] = v;
	}
	_initiativeMap = map;
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

/**
 * Recompute _partySupply from the current characters array.
 * Called after bulk imports where supply values may vary across characters.
 */
export function syncPartySupply(): void {
	if (_characters.length === 0) return;
	_partySupply = Math.max(
		..._characters.map(c => (c.data as Record<string, unknown>).supply as number ?? 3),
	);
}
