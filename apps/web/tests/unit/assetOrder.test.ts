/**
 * The asset picker's order: by category, then by name, whatever pack an
 * asset comes from.
 */
import { describe, it, expect } from 'vitest';
import { ASSET_CATEGORY_ORDER, compareAssets, sortAssets } from '../../src/lib/assetOrder.js';
import type { AssetDefinition } from '../../src/lib/types.js';

type Item = Pick<AssetDefinition, 'category' | 'name'>;
/** An asset with just what the order reads; the category may be one no type
 *  lists (a content pack's own). */
const a = (category: string, name: string) => ({ category, name }) as Item;
const names = (list: { name: string }[]) => list.map((x) => x.name);

describe('sortAssets', () => {
	it('puts each pack’s assets with their kind, not after the base ones', () => {
		// Load order: base, then Delve, then YRT.
		const loaded = [
			a('Combat Talent', 'Archer'),
			a('Companion', 'Hawk'),
			a('Companion', 'Young Wyvern'),
			a('Path', 'Alchemist'),
			a('Ritual', 'Augur'),
			a('Companion', 'Stone Lizard'), // Delve
			a('Touched', 'Touched, Feline'), // YRT
			a('Ritual', 'Cantrip'),
			a('Path', 'Bittercraft'),
		];
		expect(names(sortAssets(loaded))).toEqual([
			'Archer',
			'Hawk',
			'Stone Lizard',
			'Young Wyvern',
			'Alchemist',
			'Bittercraft',
			'Augur',
			'Cantrip',
			'Touched, Feline',
		]);
	});

	it('follows the category order, then sorts names ignoring case', () => {
		const sorted = sortAssets([
			a('Touched', 'Touched, Bovine'),
			a('Path', 'banner-Sworn'),
			a('Path', 'Alchemist'),
			a('Companion', 'Raven'),
		]);
		expect(sorted.map((x) => x.category)).toEqual(['Companion', 'Path', 'Path', 'Touched']);
		expect(names(sorted)).toEqual(['Raven', 'Alchemist', 'banner-Sworn', 'Touched, Bovine']);
	});

	it('puts a category it doesn’t know after the known ones, by name', () => {
		const sorted = sortAssets([
			a('Widget', 'Gear'),
			a('Gizmo', 'Cog'),
			a('Touched', 'Touched, Ovine'),
			a('Combat Talent', 'Brawler'),
		]);
		expect(names(sorted)).toEqual(['Brawler', 'Touched, Ovine', 'Cog', 'Gear']);
	});

	it('returns a copy and leaves the list it was given alone', () => {
		const loaded = [a('Ritual', 'Bind'), a('Companion', 'Horse')];
		const sorted = sortAssets(loaded);
		expect(sorted).not.toBe(loaded);
		expect(names(loaded)).toEqual(['Bind', 'Horse']);
	});
});

describe('compareAssets', () => {
	it('is 0 only for the same category and name', () => {
		expect(compareAssets(a('Path', 'Bonded'), a('Path', 'Bonded'))).toBe(0);
		expect(compareAssets(a('Path', 'Bonded'), a('Ritual', 'Bonded'))).toBeLessThan(0);
	});

	it('knows the five categories in order', () => {
		expect([...ASSET_CATEGORY_ORDER]).toEqual([
			'Combat Talent',
			'Companion',
			'Path',
			'Ritual',
			'Touched',
		]);
	});
});
