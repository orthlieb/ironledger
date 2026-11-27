/**
 * assetCategories — the asset categories' order and colours, in one place.
 *
 * The picker lists assets by category, then by name. Each content pack's
 * file lists its own assets, so in load order Delve's Stone Lizard came
 * after every base asset and YRT's paths and rituals after the Touched.
 * Sorting puts each asset with its kind.
 *
 * The colours tint an asset's card, its tab on the sheet, its tile in the
 * picker and the picker's filter chips.
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

/** Each category's colour, as a CSS value. */
export const ASSET_CATEGORY_COLOR: Readonly<Record<string, string>> = {
	'Combat Talent': 'var(--color-iron)',
	Companion: 'var(--color-heart)',
	Path: 'var(--color-edge)',
	Ritual: 'var(--color-mana)',
	Touched: 'var(--color-touched)',
};

/** A category's colour; a category not listed (a content pack's own, or
 *  none) gets the muted text colour. */
export function assetCategoryColor(category: string | undefined): string {
	return (category && ASSET_CATEGORY_COLOR[category]) || 'var(--text-muted)';
}

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
