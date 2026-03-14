/**
 * Asset catalogue store — module-level, fetched once and cached.
 *
 * Module-level $state variables are shared across all component instances,
 * so the fetch happens at most once per browser session.
 */
import type { AssetDefinition, RarityDefinition } from '$lib/types.js';

let _assets   = $state<AssetDefinition[]>([]);
let _rarities = $state<RarityDefinition[]>([]);
let _loading  = $state(false);
let _loaded   = false;

/** Fetch the catalogue from /api/catalogue (no-op if already loaded). */
export async function loadAssets(): Promise<void> {
	if (_loaded || _loading) return;
	_loading = true;
	try {
		const res = await fetch('/api/catalogue');
		if (!res.ok) throw new Error(`Catalogue fetch failed: ${res.status}`);
		const json = (await res.json()) as {
			assets:   AssetDefinition[];
			rarities: RarityDefinition[];
		};
		_assets   = json.assets;
		_rarities = json.rarities ?? [];
		_loaded   = true;
	} catch (err) {
		console.error('[assetStore] Failed to load catalogue:', err);
	} finally {
		_loading = false;
	}
}

/** All loaded asset definitions (reactive — reads tracked by $derived). */
export function getAssets(): AssetDefinition[] {
	return _assets;
}

export function isAssetsLoading(): boolean {
	return _loading;
}

/** Look up a single asset definition by id. */
export function findAsset(id: string): AssetDefinition | undefined {
	return _assets.find((a) => a.id === id);
}

/** Find the rarity associated with a given asset id (returns undefined if none). */
export function findRarityForAsset(assetId: string): RarityDefinition | undefined {
	return _rarities.find((r) => r.assetId === assetId);
}

/** Look up a rarity by its own id. */
export function findRarity(rarityId: string): RarityDefinition | undefined {
	return _rarities.find((r) => r.id === rarityId);
}
