/**
 * assetOrder — the order the asset picker lists assets in: by category, then
 * by name.
 *
 * Each content pack's file lists its own assets, so in load order Delve's
 * Stone Lizard came after every base asset and YRT's paths and rituals after
 * the Touched. Sorting puts each asset with its kind.
 */
import type { AssetDefinition } from './types.js';

/** The categories in order. The picker's filter chips follow it too. A
 *  category not listed (a content pack's own) comes after these, by name. */
export const ASSET_CATEGORY_ORDER: readonly string[] = [
	'Combat Talent',
	'Companion',
	'Path',
	'Ritual',
	'Touched',
];

function categoryRank(category: string): number {
	const i = ASSET_CATEGORY_ORDER.indexOf(category);
	return i < 0 ? ASSET_CATEGORY_ORDER.length : i;
}

/** Compare by category (in ASSET_CATEGORY_ORDER), then by name. */
export function compareAssets(
	a: Pick<AssetDefinition, 'category' | 'name'>,
	b: Pick<AssetDefinition, 'category' | 'name'>,
): number {
	return (
		categoryRank(a.category) - categoryRank(b.category) ||
		a.category.localeCompare(b.category) ||
		a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
	);
}

/** A sorted copy: by category, then by name. */
export function sortAssets<T extends Pick<AssetDefinition, 'category' | 'name'>>(assets: T[]): T[] {
	return [...assets].sort(compareAssets);
}
