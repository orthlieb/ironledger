/**
 * assetMatcherStore — loads the asset-move-refs index and provides a helper
 * to find which of a character's enabled asset abilities reference a given move.
 */

import type { CharacterAsset, AssetDefinition } from '$lib/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssetAbilityRef {
	index: number;
	moves: string[];
}

export interface AssetMoveRef {
	id:        string;
	abilities: AssetAbilityRef[];
	allMoves:  string[];
}

export interface RelevantAbility {
	assetId:      string;
	assetName:    string;
	category:     string;
	abilityIndex: number;
	abilityText:  string;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _refs    = $state<AssetMoveRef[]>([]);
let _loaded  = false;
let _loading = false;

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/** Fetch asset-move-refs from the server (no-op if already loaded). */
export async function loadAssetMoveRefs(): Promise<void> {
	if (_loaded || _loading) return;
	_loading = true;
	try {
		const res = await fetch('/api/catalogue/asset-move-refs');
		if (!res.ok) throw new Error(`asset-move-refs fetch failed: ${res.status}`);
		const json = (await res.json()) as AssetMoveRef[];
		_refs   = json;
		_loaded = true;
	} catch (err) {
		console.error('[assetMatcherStore] Failed to load asset-move-refs:', err);
	} finally {
		_loading = false;
	}
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Returns the list of enabled asset abilities that reference the given move ID.
 *
 * Filtering rules:
 *  1. Character must own the asset.
 *  2. The specific ability must be enabled in the character's data.
 *  3. The ability must reference `moveId` in asset-move-refs.json.
 *
 * @param moveId          The move ID to match (e.g. "move/strike")
 * @param characterAssets The character's owned assets from CharacterData.assets
 * @param findAsset       Lookup function from assetStore (findAsset)
 */
export function getRelevantAbilities(
	moveId:          string,
	characterAssets: CharacterAsset[],
	findAssetFn:     (id: string) => AssetDefinition | undefined,
): RelevantAbility[] {
	if (!moveId || !characterAssets.length || !_refs.length) return [];

	const results: RelevantAbility[] = [];

	for (const charAsset of characterAssets) {
		// Find the move-refs entry for this asset
		const ref = _refs.find((r) => r.id === charAsset.assetId);
		if (!ref) continue;

		// Quick check: does this asset reference this move at all?
		if (!ref.allMoves.includes(moveId)) continue;

		// Find ability entries that reference this move
		for (const abilityRef of ref.abilities) {
			if (!abilityRef.moves.includes(moveId)) continue;

			// Check character has this ability enabled
			const enabled = charAsset.abilities[abilityRef.index] ?? false;
			if (!enabled) continue;

			// Look up the asset definition for name + ability text
			const def = findAssetFn(charAsset.assetId);
			if (!def) continue;

			const ability = def.abilities[abilityRef.index];
			if (!ability) continue;

			results.push({
				assetId:      charAsset.assetId,
				assetName:    def.name,
				category:     def.category,
				abilityIndex: abilityRef.index,
				abilityText:  ability.text,
			});
		}
	}

	return results;
}

/** Reactive accessor for raw refs (for debugging / future use). */
export function getAssetMoveRefs(): AssetMoveRef[] {
	return _refs;
}
