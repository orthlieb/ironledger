/**
 * Asset catalogue store — module-level reactive state, client-only.
 *
 * Uses a timestamp-based TTL instead of a boolean `_loaded` flag so that
 * a page reload after an API restart always gets fresh data (TTL expires).
 * The `browser` guard prevents accidental SSR execution — server-rendered
 * templates see empty arrays and hydrate correctly once the client fetches.
 */
import { browser } from '$app/environment';
import type { AssetDefinition, RarityDefinition } from '$lib/types.js';
import { isSourceEnabled } from '$lib/expansionStore.svelte.js';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let _assets      = $state<AssetDefinition[]>([]);
let _rarities    = $state<RarityDefinition[]>([]);
let _loading     = $state(false);
let _lastFetched = 0; // epoch ms of last successful fetch

/** Fetch the catalogue from /api/catalogue.
 *  No-op on server or if a fetch is already in-flight.
 *  Re-fetches automatically after CACHE_TTL_MS (handles API restarts in dev). */
export async function loadAssets(): Promise<void> {
	if (!browser || _loading) return;
	if (_lastFetched && Date.now() - _lastFetched < CACHE_TTL_MS) return;
	_loading = true;
	try {
		const res = await fetch('/api/catalogue');
		if (!res.ok) throw new Error(`Catalogue fetch failed: ${res.status}`);
		const json = (await res.json()) as {
			assets:   AssetDefinition[];
			rarities: RarityDefinition[];
		};
		_assets      = json.assets;
		_rarities    = json.rarities ?? [];
		_lastFetched = Date.now();
	} catch (err) {
		console.error('[assetStore] Failed to load catalogue:', err);
	} finally {
		_loading = false;
	}
}

/** Force the store to refetch on next loadAssets() call (useful in dev after API restarts). */
export function resetAssets(): void {
	_assets      = [];
	_rarities    = [];
	_lastFetched = 0;
}

/** All loaded asset definitions (unfiltered — for render-time resolution). */
export function getAssets(): AssetDefinition[] {
	return _assets;
}

/** Assets whose source is currently enabled. Used by the AssetPicker. */
export function getVisibleAssets(): AssetDefinition[] {
	return _assets.filter((a) => isSourceEnabled(a.source));
}

/** All loaded rarities (unfiltered). */
export function getRarities(): RarityDefinition[] {
	return _rarities;
}

/** Rarities whose source is currently enabled. Used by the acquire-rarity picker. */
export function getVisibleRarities(): RarityDefinition[] {
	return _rarities.filter((r) => isSourceEnabled(r.source));
}

export function isAssetsLoading(): boolean {
	return _loading;
}

/** Look up a single asset definition by id. Never filtered. */
export function findAsset(id: string): AssetDefinition | undefined {
	return _assets.find((a) => a.id === id);
}

/** All rarities pinned to a given asset id (unfiltered — render layer applies source gating). */
export function findRaritiesForAsset(assetId: string): RarityDefinition[] {
	return _rarities.filter((r) => r.assetId === assetId);
}

/** Look up a rarity by its own id. Never filtered. */
export function findRarity(rarityId: string): RarityDefinition | undefined {
	return _rarities.find((r) => r.id === rarityId);
}

// Auto-start loading as soon as the module is imported on the client.
// This eliminates the "Loading…" flash caused by waiting for component effects to run.
if (browser) loadAssets();
