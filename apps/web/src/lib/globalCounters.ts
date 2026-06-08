// =============================================================================
// Global counter registry — pure catalogue-level helpers.
//
// Lives in a non-`.svelte.ts` module (no Svelte rune dependency, no SvelteKit
// `$app/*` imports) so the catalogue validator is unit-testable without
// spinning up a SvelteKit environment. assetStore.svelte.ts re-exports the
// pieces consumers care about.
// =============================================================================
import type { AssetDefinition, CustomFieldDef } from '$lib/types.js';

/**
 * Iterate `assets` in order and return a map of global-counter id → canonical
 * CustomFieldDef (the first declaration wins). When a later asset declares
 * the same global id with a different default, maxValue, or icon, `onMismatch`
 * is called with a human-readable message (defaults to console.error). Label
 * is allowed to differ across assets — a counter's display label is contextual.
 */
export function buildGlobalCounterRegistry(
	assets: AssetDefinition[],
	onMismatch: (msg: string) => void = (m) => console.error(m),
): Map<string, CustomFieldDef> {
	const reg = new Map<string, CustomFieldDef>();
	const seen = new Map<string, string>(); // counter id → asset id that first declared it
	for (const a of assets) {
		for (const cf of a.customFields ?? []) {
			if (!cf.global) continue;
			const existing = reg.get(cf.id);
			if (!existing) {
				reg.set(cf.id, cf);
				seen.set(cf.id, a.id);
				continue;
			}
			const sameMax = JSON.stringify(existing.maxValue) === JSON.stringify(cf.maxValue);
			const sameDefault = existing.default === cf.default;
			const sameIcon = existing.icon === cf.icon;
			if (!sameMax || !sameDefault || !sameIcon) {
				const firstAsset = seen.get(cf.id);
				onMismatch(
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
