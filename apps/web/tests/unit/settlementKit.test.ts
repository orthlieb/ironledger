/**
 * Settlement kit in the app: marker recipes and the generator entry point.
 */
import { describe, expect, it } from 'vitest';
import {
	cleanSettlementRecipe,
	recipeKey,
	sameRecipe,
	SETTLEMENT_TIERS,
	type SettlementRecipe,
} from '../../src/lib/settlementRecipe.js';
import {
	fallbackIcon,
	generateSettlementSvg,
	PARCHMENT,
	type Culture,
} from '../../src/lib/settlement-kit/generate.js';
import { MAP_ICONS } from '../../src/lib/generated/mapIconManifest.js';
import { parseLayeredSvg, parsePalette } from '../../src/lib/mapLayered.js';

const ELVES: Culture = {
	key: 'elves',
	name: 'Elves',
	source: 'base',
	design: { houseForm: 'round', towerBow: 1, wallBow: 1, wall: 'hedge' },
	palette: {
		wall: '#EEF0E2',
		roof: '#5E8C4A',
		wood: '#9C8A5E',
		earth: '#6F8A55',
		water: '#8FB0B8',
		ink: '#26301F',
		flag: '#D9A13B',
		halo: '#F3F5EA',
	},
};

describe('cleanSettlementRecipe', () => {
	it('keeps every valid field', () => {
		const r: SettlementRecipe = {
			tier: 'city',
			culture: 'nysis',
			seed: 4242,
			walls: 'stone',
			wallShape: 'square',
			harbor: true,
			ruin: { decay: 0.4, burned: true },
		};
		expect(cleanSettlementRecipe(r)).toEqual(r);
	});

	it('drops malformed optional fields but keeps the recipe', () => {
		expect(
			cleanSettlementRecipe({
				tier: 'town',
				culture: 'elves',
				seed: 7,
				walls: 'moat',
				wallShape: 'oval',
				harbor: 'yes',
				ruin: { decay: 3 },
			}),
		).toEqual({ tier: 'town', culture: 'elves', seed: 7 });
	});

	it('rejects a recipe without a valid tier, culture key or seed', () => {
		expect(
			cleanSettlementRecipe({ tier: 'metropolis', culture: 'elves', seed: 1 }),
		).toBeUndefined();
		expect(cleanSettlementRecipe({ tier: 'town', culture: '<b>', seed: 1 })).toBeUndefined();
		expect(cleanSettlementRecipe({ tier: 'town', culture: 'elves', seed: 1.5 })).toBeUndefined();
		expect(cleanSettlementRecipe({ tier: 'town', culture: 'elves', seed: -1 })).toBeUndefined();
		expect(cleanSettlementRecipe(null)).toBeUndefined();
		expect(cleanSettlementRecipe('town')).toBeUndefined();
	});

	it('recipeKey ignores field order and identifies same-drawing recipes', () => {
		const a: SettlementRecipe = { tier: 'town', culture: 'elves', seed: 3, harbor: true };
		const b = { seed: 3, harbor: true, culture: 'elves', tier: 'town' } as SettlementRecipe;
		expect(recipeKey(a)).toBe(recipeKey(b));
		expect(sameRecipe(a, b)).toBe(true);
		expect(sameRecipe(a, { ...a, seed: 4 })).toBe(false);
	});
});

describe('fallbackIcon', () => {
	it('maps every tier, ruined or not, to an icon that exists in the manifest', () => {
		// Drift guard: retiring or renaming a core settlement icon must not
		// leave a generated marker pointing at nothing.
		for (const tier of SETTLEMENT_TIERS) {
			for (const ruin of [undefined, { decay: 0.5 }]) {
				const key = fallbackIcon({ tier, culture: 'x', seed: 1, ruin });
				expect(MAP_ICONS[key], `${tier}${ruin ? ' (ruined)' : ''} → ${key}`).toBeDefined();
			}
		}
	});
});

describe('generateSettlementSvg', () => {
	const recipe: SettlementRecipe = { tier: 'hamlet', culture: 'elves', seed: 11 };

	it('is deterministic — the same recipe and culture give the same bytes', () => {
		expect(generateSettlementSvg(recipe, ELVES)).toBe(generateSettlementSvg(recipe, ELVES));
	});

	it('draws a layered icon in the culture palette', () => {
		const svg = generateSettlementSvg(recipe, ELVES);
		const roles = parseLayeredSvg(svg).map((p) => p.role);
		expect(roles).toContain('sil');
		expect(roles).toContain('roof');
		expect(roles).toContain('ink');
		const pal = parsePalette(svg.match(/data-palette="([^"]+)"/)?.[1]);
		expect(pal.roof).toBe(ELVES.palette.roof);
	});

	it('falls back to the default culture (Parchment) when the culture is missing', () => {
		const svg = generateSettlementSvg({ ...recipe, culture: 'gone' }, null);
		expect(parsePalette(svg.match(/data-palette="([^"]+)"/)?.[1])).toEqual(PARCHMENT);
	});

	it('changes with the seed', () => {
		expect(generateSettlementSvg({ ...recipe, seed: 12 }, ELVES)).not.toBe(
			generateSettlementSvg(recipe, ELVES),
		);
	});
});
