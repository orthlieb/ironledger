/**
 * assetMatcherStore — finds which of a character's enabled asset abilities
 * reference a given move ID.
 *
 * Move refs are now embedded directly in each AssetDefinition.abilities[i].moves
 * (merged from the old asset-move-refs.json). No separate fetch is needed —
 * this module reads from the asset catalogue already loaded by assetStore.
 */

import type { CharacterAsset, AssetDefinition } from '$lib/types.js';

// ---------------------------------------------------------------------------
// Types (kept for backward-compat with MovesDialog imports)
// ---------------------------------------------------------------------------

export interface RelevantAbility {
	assetId:      string;
	assetName:    string;
	category:     string;
	abilityIndex: number;
	abilityText:  string;
}

// ---------------------------------------------------------------------------
// No-op shim — move refs are now in the asset catalogue (loaded by assetStore)
// ---------------------------------------------------------------------------

/** @deprecated No-op — move refs are now embedded in asset abilities. */
export async function loadAssetMoveRefs(): Promise<void> {
	// intentional no-op
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
 *  3. The ability's `moves` array (from JSON) must include `moveId`.
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
	if (!moveId || !characterAssets.length) return [];

	const results: RelevantAbility[] = [];

	for (const charAsset of characterAssets) {
		const def = findAssetFn(charAsset.assetId);
		if (!def) continue;

		for (let i = 0; i < def.abilities.length; i++) {
			const ability = def.abilities[i];
			if (!ability.moves?.includes(moveId)) continue;

			// Check character has this ability enabled.
			// Fall back to the asset definition's own `enabled` default when the
			// character's stored state is absent (e.g. newly acquired asset).
			const enabled = charAsset.abilities[i] ?? ability.enabled ?? false;
			if (!enabled) continue;

			results.push({
				assetId:      charAsset.assetId,
				assetName:    def.name,
				category:     def.category,
				abilityIndex: i,
				abilityText:  ability.text,
			});
		}
	}

	return results;
}
