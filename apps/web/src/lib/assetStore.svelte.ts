/**
 * Asset catalogue store — module-level reactive state, client-only.
 *
 * Uses a timestamp-based TTL instead of a boolean `_loaded` flag so that
 * a page reload after an API restart always gets fresh data (TTL expires).
 * The `browser` guard prevents accidental SSR execution — server-rendered
 * templates see empty arrays and hydrate correctly once the client fetches.
 */
import { browser } from '$app/environment';
import type { AssetDefinition, CustomFieldDef, RarityDefinition } from '$lib/types.js';
import { isSourceEnabled } from '$lib/expansionStore.svelte.js';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let _assets      = $state<AssetDefinition[]>([]);
let _rarities    = $state<RarityDefinition[]>([]);
let _loading     = $state(false);
let _lastFetched = 0; // epoch ms of last successful fetch

/** Lazy cache: global counter id → canonical CustomFieldDef. Rebuilt
 *  whenever _assets changes (set null in loadAssets/resetAssets). */
let _globalCounterDefs: Map<string, CustomFieldDef> | null = null;

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
		_assets             = json.assets;
		_rarities           = json.rarities ?? [];
		_lastFetched        = Date.now();
		_globalCounterDefs  = null;
	} catch (err) {
		console.error('[assetStore] Failed to load catalogue:', err);
	} finally {
		_loading = false;
	}
}

/** Force the store to refetch on next loadAssets() call (useful in dev after API restarts). */
export function resetAssets(): void {
	_assets             = [];
	_rarities           = [];
	_lastFetched        = 0;
	_globalCounterDefs  = null;
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

// ---------------------------------------------------------------------------
// Global counter registry
//
// Counters with `global: true` are shared across all assets that declare a
// CustomFieldDef with the same id (e.g. `mana` is declared on every Conclave
// Ritual). The VALUE lives on the character (globalValues), but the DEFINITION
// (default, maxValue, icon) currently lives per-asset — leaving room for drift.
//
// We treat the FIRST-encountered definition for a given id as canonical and
// console.error on any subsequent declaration that disagrees on
// default/maxValue/icon. Render code looks up the canonical def via
// getGlobalCounterDef() so the same counter shows with the same cap/icon
// regardless of which asset card surfaces it.
// ---------------------------------------------------------------------------

function buildGlobalCounterRegistry(): Map<string, CustomFieldDef> {
	const reg  = new Map<string, CustomFieldDef>();
	const seen = new Map<string, string>(); // counter id → asset id that first declared it
	for (const a of _assets) {
		for (const cf of a.customFields ?? []) {
			if (!cf.global) continue;
			const existing = reg.get(cf.id);
			if (!existing) {
				reg.set(cf.id, cf);
				seen.set(cf.id, a.id);
				continue;
			}
			// Already registered — verify the new declaration agrees on the
			// shared properties. Label may legitimately differ across assets
			// (a counter's display label is contextual), so it isn't checked.
			const sameMax     = JSON.stringify(existing.maxValue) === JSON.stringify(cf.maxValue);
			const sameDefault = existing.default === cf.default;
			const sameIcon    = existing.icon === cf.icon;
			if (!sameMax || !sameDefault || !sameIcon) {
				const firstAsset = seen.get(cf.id);
				console.error(
					`[assetStore] Global counter "${cf.id}" has inconsistent declarations:\n` +
					`  ${firstAsset}: default=${existing.default}, max=${JSON.stringify(existing.maxValue)}, icon=${existing.icon}\n` +
					`  ${a.id}: default=${cf.default}, max=${JSON.stringify(cf.maxValue)}, icon=${cf.icon}\n` +
					`Using first declaration as canonical.`,
				);
			}
		}
	}
	return reg;
}

/** Canonical CustomFieldDef for a global counter, or undefined if no asset
 *  declares it. Render code should prefer this over the per-asset declaration
 *  so the same counter renders consistently across all asset surfaces. */
export function getGlobalCounterDef(fieldId: string): CustomFieldDef | undefined {
	if (!_globalCounterDefs) _globalCounterDefs = buildGlobalCounterRegistry();
	return _globalCounterDefs.get(fieldId);
}

/** All known global counter ids (for import reconciliation). */
export function getGlobalCounterIds(): string[] {
	if (!_globalCounterDefs) _globalCounterDefs = buildGlobalCounterRegistry();
	return Array.from(_globalCounterDefs.keys());
}

// Auto-start loading as soon as the module is imported on the client.
// This eliminates the "Loading…" flash caused by waiting for component effects to run.
if (browser) loadAssets();
