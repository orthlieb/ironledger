/**
 * settlementRecipe.test.ts — the marker recipe's validation, cache key,
 * label and fallback icon, for Buildings-tab buildings.
 */
import { describe, expect, it } from 'vitest';
import {
	SETTLEMENT_BUILDINGS,
	SETTLEMENT_GROUNDS,
	cleanSettlementRecipe,
	recipeKey,
	recipeLabel,
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
	it("accept every ground type, and drop one they don't know", () => {
		for (const ground of SETTLEMENT_GROUNDS)
			expect(cleanSettlementRecipe({ ...tower, ground })?.ground).toBe(ground);
		expect(cleanSettlementRecipe({ ...tower, ground: 'magma' })).not.toHaveProperty('ground');
		expect(SETTLEMENT_GROUNDS).toEqual([
			'none',
			'hex',
			'dirt',
			'grass',
			'farmland',
			'sand',
			'rock',
			'snow',
			'ice',
			'marsh',
			'lava',
			'water',
		]);
	});
	it('key apart from the settlement with the same knobs', () => {
		const { building: _, ...plain } = tower;
		expect(recipeKey(tower)).not.toBe(recipeKey(plain));
		expect(recipeKey(tower)).not.toBe(recipeKey({ ...tower, building: 'church' }));
	});
	it('are labelled by building — walled when enclosed — as settlements are by size', () => {
		const elves = { name: 'Elves' };
		expect(recipeLabel(tower, elves)).toBe('Elves Round tower, walled');
		expect(recipeLabel({ ...tower, walls: undefined }, elves)).toBe('Elves Round tower');
		// A wall building is never enclosed, whatever `walls` says.
		expect(recipeLabel({ ...tower, building: 'wall', ruin: { decay: 0.5 } }, elves)).toBe(
			'Ruined Elves Wall',
		);
		expect(
			recipeLabel({ tier: 'town', culture: 'x', seed: 1, ruin: { decay: 1, burned: true } }, null),
		).toBe('Burned Ironlander Town');
	});
	it('fall back to a core icon that exists, ruined or not', () => {
		const keys = new Set(MAP_ICON_LIST.map((i) => `${i.category}/${i.slug}`));
		for (const building of Object.keys(SETTLEMENT_BUILDINGS) as SettlementRecipe['building'][])
			for (const ruin of [undefined, { decay: 0.5 }]) {
				const icon = fallbackIcon({ ...tower, building, ...(ruin ? { ruin } : {}) });
				expect(keys.has(icon), `${building}${ruin ? ' ruined' : ''} → ${icon}`).toBe(true);
			}
	});
	it('give every building an icon of its own, not the generic house', () => {
		// A building missing from fallback.js BUILDING_ICONS would quietly
		// fall back to the house.
		for (const building of Object.keys(SETTLEMENT_BUILDINGS) as SettlementRecipe['building'][])
			if (building !== 'gable-house')
				expect(fallbackIcon({ ...tower, building }), building).not.toBe('settlement/house');
	});
});
