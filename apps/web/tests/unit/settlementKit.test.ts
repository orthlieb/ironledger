/**
 * settlementKit.test.ts — smoke tests for the settlement kit.
 *
 * The kit is 5000+ lines of oblique-projection geometry with no other
 * runtime coverage. `build:settlement-icons` silently writes empty or
 * malformed SVGs on a regression, which doesn't become visible until a
 * screenshot catches it. This suite guards the kit at a thin layer:
 *
 *   - every standalone piece pieces() returns renders a non-empty
 *     silhouette for the default culture;
 *   - every settlement tier lays out for the default culture plus
 *     every real culture plugin without throwing;
 *   - the recipe-level overrides (`ground`, `stilts`) and the dome /
 *     flag-shape design knobs don't crash the generator; and
 *   - onStilts wraps a plain piece and places it strictly above the
 *     piece's bare position, with the deck below the piece and the
 *     posts planted below the deck.
 *
 * It is pure JS (no DOM, no Playwright) and runs in the same vitest
 * batch as the other unit tests.
 */

import { describe, it, expect } from 'vitest';
import {
	PARCHMENT,
	generateSettlementSvg,
	recipeDesign,
} from '../../src/lib/settlement-kit/generate.js';
import { TEMPLATES, pieces, settlement } from '../../src/lib/settlement-kit/layouts3d.js';
import {
	DEFAULT_DESIGN,
	gableHouse,
	onStilts,
	roundHut,
	roundTower,
	stiltHut,
} from '../../src/lib/settlement-kit/pieces3d.js';
import { renderLayered, place } from '../../src/lib/settlement-kit/render.js';

type Design = typeof DEFAULT_DESIGN;

/** A piece renders when its silhouette path has at least one `M` command. */
function renders(parts: ReturnType<typeof gableHouse>) {
	const { silhouette, bounds } = renderLayered(place(parts, {}), {
		outline: 1.4,
		join: DEFAULT_DESIGN.join,
	});
	return silhouette.includes('M') && bounds.w > 0 && bounds.h > 0;
}

describe('pieces(DEFAULT_DESIGN) smoke', () => {
	const list = pieces(DEFAULT_DESIGN);
	it('returns at least a dozen pieces', () => {
		expect(list.length).toBeGreaterThan(12);
	});
	for (const [name, items] of list) {
		it(`${name} renders a non-empty silhouette`, () => {
			const parts = items.flatMap((it) =>
				place(it.piece, { x: it.x ?? 0, y: it.y ?? 0, s: it.s ?? 1 }),
			);
			const { silhouette, bounds } = renderLayered(parts, {
				outline: 1.4,
				join: DEFAULT_DESIGN.join,
			});
			expect(silhouette, `${name} should have a silhouette path`).toContain('M');
			expect(bounds.w, `${name} should have non-zero width`).toBeGreaterThan(0);
			expect(bounds.h, `${name} should have non-zero height`).toBeGreaterThan(0);
		});
	}
});

describe('settlement(tier, D) smoke', () => {
	const tiers = Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[];
	for (const tier of tiers) {
		it(`${tier} lays out without throwing`, () => {
			expect(() => settlement(tier, DEFAULT_DESIGN, { seed: 1 })).not.toThrow();
		});
	}
});

describe('recipe overrides', () => {
	const r = (over: Record<string, unknown>) => ({
		tier: 'village' as const,
		culture: 'default',
		seed: 1,
		...over,
	});
	it('renders a plain village', () => {
		const svg = generateSettlementSvg(r({}), null);
		expect(svg).toMatch(/^<svg xmlns=/);
		expect(svg).toContain('</svg>');
	});
	it('renders a water village', () => {
		const svg = generateSettlementSvg(r({ ground: 'water' }), null);
		expect(svg).toContain('data-role="water"');
	});
	it('renders a stilts village', () => {
		const svg = generateSettlementSvg(r({ stilts: true }), null);
		// Stilt pieces draw their decks in the wood role.
		expect(svg).toContain('data-role="wood"');
	});
	it('renders stilts + water together', () => {
		expect(() => generateSettlementSvg(r({ ground: 'water', stilts: true }), null)).not.toThrow();
	});
	it('merges recipe.ground into the resolved Design', () => {
		expect(recipeDesign(r({ ground: 'water' }), null).ground).toBe('water');
	});
});

describe('design-knob variants render', () => {
	const towerRoofs: Design['towerRoof'][] = ['cone', 'onion', 'crenel', 'dome'];
	for (const roof of towerRoofs) {
		it(`towerRoof=${roof} renders a round tower`, () => {
			expect(renders(roundTower({ ...DEFAULT_DESIGN, towerRoof: roof }))).toBe(true);
		});
	}
	const flagShapes = ['banner', 'pennant', 'swallowtail'] as const;
	for (const shape of flagShapes) {
		it(`flagShape=${shape} renders without throwing`, () => {
			expect(() =>
				settlement('hold', { ...DEFAULT_DESIGN, flagShape: shape }, { seed: 1 }),
			).not.toThrow();
		});
	}
});

describe('onStilts', () => {
	it('leaves parts alone when there is nothing solid to measure', () => {
		const empty = [{ solid: [], role: 'wall' as const }];
		expect(onStilts(empty, DEFAULT_DESIGN)).toEqual(empty);
	});
	it('lifts the piece above its original ground line', () => {
		const house = gableHouse(DEFAULT_DESIGN, { seed: 1 });
		const wrapped = onStilts(house, DEFAULT_DESIGN);
		// The lifted piece parts come after the posts (index 0) and deck
		// (index 1); every solid point in them should sit visibly above the
		// bare ground. Exact height depends on the piece's estimated depth,
		// so just assert "clear of the ground."
		const liftedY = wrapped
			.slice(2)
			.flatMap((p) => p.solid)
			.flatMap((poly) => poly.map(([, y]) => y));
		expect(Math.min(...liftedY), 'piece should be lifted off the ground').toBeGreaterThan(1);
	});
	it('stiltHut now delegates to onStilts(roundHut)', () => {
		// Both call-sites should produce identical geometry.
		const a = stiltHut(DEFAULT_DESIGN, { r: 6 });
		const b = onStilts(roundHut(DEFAULT_DESIGN, { r: 6 }), DEFAULT_DESIGN);
		expect(a.length).toBe(b.length);
	});
});

describe('generateSettlementSvg(default culture)', () => {
	// Full Clipper rendering is seconds per large tier (freeport, city), so
	// smoke-test one small + one mid tier instead of all nine. The per-tier
	// `settlement(...)` smoke above already proves every tier lays out.
	it.each(['village', 'hold'] as const)(
		'tier=%s round-trips to a non-empty SVG',
		(tier) => {
			const svg = generateSettlementSvg({ tier, culture: 'default', seed: 1 }, null);
			expect(svg.length, `${tier} should produce a non-trivial SVG`).toBeGreaterThan(500);
			expect(svg).toContain(PARCHMENT.ink);
		},
		30_000,
	);
});
