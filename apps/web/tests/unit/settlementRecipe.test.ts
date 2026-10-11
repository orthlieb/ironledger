/**
 * settlementRecipe.test.ts — the marker recipe's validation, cache key and
 * fallback icon, for Buildings-tab buildings.
 */
import { describe, expect, it } from 'vitest';
import {
	SETTLEMENT_BUILDINGS,
	cleanSettlementRecipe,
	recipeKey,
	type SettlementRecipe,
} from '../../src/lib/settlementRecipe.js';
import { fallbackIcon } from '../../src/lib/settlement-kit/fallback.js';
import { MAP_ICON_LIST } from '../../src/lib/generated/mapIconManifest.js';

const tower: SettlementRecipe = {
	tier: 'stead',
	culture: 'elves',
	seed: 12,
	building: 'round-tower',
	walls: 'hedge',
};

describe('building recipes', () => {
	it('survive validation, and an unknown building drops the recipe', () => {
		expect(cleanSettlementRecipe(tower)).toEqual(tower);
		expect(cleanSettlementRecipe({ ...tower, building: 'skyscraper' })).toBeUndefined();
		expect(cleanSettlementRecipe({ ...tower, building: 'toString' })).toBeUndefined();
	});
	it('key apart from the settlement with the same knobs', () => {
		const { building: _, ...plain } = tower;
		expect(recipeKey(tower)).not.toBe(recipeKey(plain));
		expect(recipeKey(tower)).not.toBe(recipeKey({ ...tower, building: 'church' }));
	});
	it('fall back to a core icon that exists, ruined or not', () => {
		const keys = new Set(MAP_ICON_LIST.map((i) => `${i.category}/${i.slug}`));
		for (const building of Object.keys(SETTLEMENT_BUILDINGS) as SettlementRecipe['building'][])
			for (const ruin of [undefined, { decay: 0.5 }]) {
				const icon = fallbackIcon({ ...tower, building, ...(ruin ? { ruin } : {}) });
				expect(keys.has(icon), `${building}${ruin ? ' ruined' : ''} → ${icon}`).toBe(true);
			}
	});
});
