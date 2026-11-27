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
//   • isCharacterLoading()
//   • createCharacter(name?, data?)     — API create + prepend
//   • deleteCharacter(id)               — API delete + filter
//   • persistCharacterNow(id, patch)    — optimistic update + immediate API write
//   • flushCharacterToApi(id)           — push current store state to API (no array rewrite)
//   • setPartySupply(val)               — update all chars.supply + persist each
// =============================================================================

import type { CharacterFull } from '#lib/api.js';
import { characters as api } from '#lib/api.js';
import { hydrateCharacterInPlace } from '#lib/character.js';
import { allCharacterFields } from '#lib/characterFields.svelte.js';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _characters: CharacterFull[] = $state([]);
let _loading = $state(false);
let _loaded = false;
/** First load finished (ok or not) — reactive, unlike `_loaded`: until it
 *  has, the Characters area shows the loading spinner, not its empty state. */
let _settled = $state(false);
let _partySupply: number | null = $state(null);

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/** Load characters from the server (idempotent — only fetches once per session). */
export async function loadCharacters(): Promise<void> {
	if (_loaded || _loading) return;
	_loading = true;
	try {
		const list = await api.list();
		// Ensure every loaded character has all default fields so downstream
		// bind:value directives never receive undefined.
		for (const char of list) {
			hydrateCharacterInPlace(char.data as Record<string, unknown>);
		}
		_characters = list;

		// Initialise party supply to the max across all loaded characters.
		if (list.length > 0) {
			_partySupply = Math.max(
				...list.map((c) => ((c.data as Record<string, unknown>).supply as number) ?? 5),
			);
		}

		_loaded = true;
	} catch (err) {
		console.error('[characterStore] Failed to load characters:', err);
		throw err; // re-throw so caller can display an error
	} finally {
		_loading = false;
		_settled = true;
	}
}

// ---------------------------------------------------------------------------
// Accessors (reactive — safe to call in $derived / $effect)
// ---------------------------------------------------------------------------

/** All characters, in insertion order. Reactive. */
export function getCharacters(): CharacterFull[] {
	return _characters;
}

/** Whether the first load has finished, whether it worked or not. */
export function isCharacterLoaded(): boolean {
	return _settled;
}

export function isCharacterLoading(): boolean {
	return _loading;
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
	// If there's an established party supply, the new char should always start at
	// at least that level — bump it up BEFORE the API create call.  This avoids
	// calling setPartySupply() (which fires N concurrent PATCHes for all existing
	// chars) in the common "new char inherits party supply" case.
	//
	//   • Button press (no supply in initialData): inherit party supply
	//   • Import with lower supply: raise to party supply
	//   • Import with higher supply: keep as-is (setPartySupply will sync others)
	//
	// Distinguish `undefined` (button press — want to inherit) from a provided
	// value (import — may be below party and need raising). Collapsing both
	// through `?? DEFAULT_CHARACTER.supply` breaks inheritance whenever the
	// party sits below that default (e.g. supply 4 against a default of 5).
	const providedSupply = initialData.supply as number | undefined;
	let dataForApi = initialData;
	if (providedSupply === undefined) {
		if (_partySupply !== null) {
			dataForApi = { ...initialData, supply: _partySupply };
		}
	} else if (_partySupply !== null && providedSupply < _partySupply) {
		dataForApi = { ...initialData, supply: _partySupply };
	}

	// Party fields (a content pack's `scope: "party"`) hold one value the
	// whole party shares: a new character takes the party's, whatever it
	// brought.
	const party = partyFieldValues();
	if (Object.keys(party).length) {
		const fields = (dataForApi.fields as Record<string, string> | undefined) ?? {};
		dataForApi = { ...dataForApi, fields: { ...fields, ...party } };
	}

	const newChar = await api.create(name, dataForApi);
	// Hydrate defaults so bind:value directives never receive undefined.
	hydrateCharacterInPlace(newChar.data as Record<string, unknown>);
	_characters = [newChar, ..._characters];
	// Sync party supply:
	//   - First character: set party supply from it.
	//   - Imported char with higher supply: raise all existing chars to match
	//     (setPartySupply fires N PATCHes, but this is intentional — the whole
	//     party gets a supply boost).
	//   - New char with lower or equal supply: already handled above by bumping
	//     the char's initial supply, so no further sync needed.
	const newCharSupply = ((newChar.data as Record<string, unknown>).supply as number) ?? 5;
	if (_partySupply === null) {
		_partySupply = newCharSupply;
	} else if (newCharSupply > _partySupply) {
		setPartySupply(newCharSupply);
	}
	return newChar;
}

/** The ids of the party fields content packs declare. */
function partyFieldIds(): string[] {
	return allCharacterFields()
		.filter((f) => f.scope === 'party')
		.map((f) => f.id);
}

/** The party's values for its party fields, from any character that has
 *  them (every character holds the same ones). Empty with no characters. */
export function partyFieldValues(): Record<string, string> {
	const out: Record<string, string> = {};
	for (const id of partyFieldIds()) {
		for (const c of _characters) {
			const v = (
				(c.data as Record<string, unknown>).fields as Record<string, string> | undefined
			)?.[id];
			if (v !== undefined) {
				out[id] = v;
				break;
			}
		}
	}
	return out;
}

/**
 * Set party field values on every character and persist each, as
 * setPartySupply does for supply: a party value is one the whole party
 * shares (docs/command-language.md → Scopes).
 */
export function setPartyFields(values: Record<string, string>): void {
	if (!Object.keys(values).length) return;
	const withValues = (data: Record<string, unknown>) => ({
		...data,
		fields: { ...((data.fields as Record<string, string> | undefined) ?? {}), ...values },
	});
	for (const c of _characters)
		api.update(c.id, { data: withValues(c.data as Record<string, unknown>) }).catch(() => {});
	_characters = _characters.map((c) => ({
		...c,
		data: withValues(c.data as Record<string, unknown>) as typeof c.data,
	}));
}

/** Delete a character by id. */
export async function deleteCharacter(id: string): Promise<void> {
	await api.remove(id);
	_characters = _characters.filter((c) => c.id !== id);
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
	_characters = _characters.map((c) =>
		c.id === id ? { ...c, name: patch.name ?? c.name, data: patch.data } : c,
	);
	api.update(id, patch).catch((err) => console.error('[characterStore] Save failed:', err));
}

/**
 * Push the in-memory character's current state to the API, without touching
 * the in-memory store (it's assumed to already be the source of truth).
 * Used by v2 where the UI binds directly to the store and a debounced effect
 * fires this on edits.
 */
export function flushCharacterToApi(id: string): void {
	const c = _characters.find((c) => c.id === id);
	if (!c) return;
	const data = $state.snapshot(c.data) as Record<string, unknown>;
	api
		.update(id, { name: c.name, data })
		.catch((err) => console.error('[characterStore] Save failed:', err));
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
	_characters = _characters.map((c) => ({
		...c,
		data: { ...(c.data as Record<string, unknown>), supply: val },
	}));
}
