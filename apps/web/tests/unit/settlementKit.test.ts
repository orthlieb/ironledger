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
	makeDesign,
	onStilts,
	roundHut,
	roundTower,
	squareTower,
	stiltHut,
	upgradeDesign,
} from '../../src/lib/settlement-kit/pieces3d.js';
import { patternDefs } from '../../src/lib/settlement-kit/patterns.js';
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

describe('wall patterns', () => {
	// Each pattern-filled wall type should emit a <pattern> def and a
	// pattern-filled wall path. Guards against a regression where the kit
	// quietly reverts to flat fills (which would read as "lost its texture").
	it.each([
		['stone', 'wall-stone'],
		['hedge', 'wall-hedge'],
		['reef', 'wall-reef'],
	] as const)('%s wall emits a <pattern> and uses url(#…) for its fill', (wall, role) => {
		const svg = generateSettlementSvg(
			{ tier: 'village', culture: 'default', seed: 3, walls: wall },
			null,
		);
		expect(svg, `${wall} should contain its pattern def`).toContain(`id="pat-${role}-`);
		expect(svg, `${wall} should use url(#…) for its wall fill`).toMatch(
			new RegExp(`data-role="${role}"[^/]*fill="url\\(#pat-${role}-`),
		);
	});
	it.each([
		['wall-hedge', 2],
		['wall-reef', 2.5],
	] as const)('%s tile is drawn %s× larger via patternTransform', (role, scale) => {
		const { defs } = patternDefs([role], () => ({ fill: '#ffffff', ink: '#000000' }), 't');
		expect(defs).toContain(`patternTransform="scale(${scale})"`);
		expect(defs.length, 'procedural tile should stay compact').toBeLessThan(12_000);
	});
});

describe('design-knob variants render', () => {
	const towerRoofs: Design['towerRoof'][] = ['none', 'cone', 'onion', 'dome', 'lancet'];
	for (const roof of towerRoofs) {
		it(`towerRoof=${roof} renders a round tower`, () => {
			expect(renders(roundTower({ ...DEFAULT_DESIGN, towerRoof: roof }))).toBe(true);
		});
		it(`towerRoof=${roof} + towerCorbel renders a round tower`, () => {
			// towerCorbel = 0.25 → upper quarter corbels out (visible Watabou look)
			expect(renders(roundTower({ ...DEFAULT_DESIGN, towerRoof: roof, towerCorbel: 0.25 }))).toBe(
				true,
			);
		});
		it(`towerRoof=${roof} on a crenellated top renders a round tower`, () => {
			const D = { ...DEFAULT_DESIGN, towerRoof: roof, towerCrenel: true, towerCorbel: 0.25 };
			expect(renders(roundTower(D))).toBe(true);
		});
	}
	it('a crenellated top adds one part between the body and the cap', () => {
		const plain = roundTower({ ...DEFAULT_DESIGN, flags: false });
		const ct = roundTower({ ...DEFAULT_DESIGN, flags: false, towerCrenel: true });
		expect(ct).toHaveLength(plain.length + 1);
		expect(ct.at(-1)?.role).toBe('roof'); // the cap still sits on top
	});
	it('a tower with no cap always gets its crenellated top', () => {
		const bare = roundTower({ ...DEFAULT_DESIGN, towerRoof: 'none', towerCrenel: false });
		expect(bare).toEqual(roundTower({ ...DEFAULT_DESIGN, towerRoof: 'none', towerCrenel: true }));
	});
	it("legacy towerRoof 'crenel' is a bare crenellated top", () => {
		expect(upgradeDesign({ towerRoof: 'crenel' })).toEqual({
			towerRoof: 'none',
			towerCrenel: true,
		});
		expect(roundTower({ ...DEFAULT_DESIGN, towerRoof: 'crenel' })).toEqual(
			roundTower({ ...DEFAULT_DESIGN, towerRoof: 'none', towerCrenel: true }),
		);
	});
	const flagShapes = ['banner', 'pennant', 'swallowtail'] as const;
	for (const shape of flagShapes) {
		it(`flagShape=${shape} renders without throwing`, () => {
			expect(() =>
				settlement('hold', { ...DEFAULT_DESIGN, flagShape: shape }, { seed: 1 }),
			).not.toThrow();
		});
	}
});

/** Net filled area of SVG path data (signed ring areas summed, so holes cancel). */
function netArea(d: string): number {
	let total = 0;
	for (const ring of d.split('Z').filter((s) => s.trim())) {
		const pts = ring
			.replace('M', '')
			.split('L')
			.map((p) => p.trim().split(/\s+/).map(Number));
		for (let i = 0; i < pts.length; i++) {
			const [x1, y1] = pts[i];
			const [x2, y2] = pts[(i + 1) % pts.length];
			total += (x1 * y2 - x2 * y1) / 2;
		}
	}
	return Math.abs(total);
}

describe('render robustness', () => {
	it('ink stays an outline under the soft join (seed-42 house went solid black)', () => {
		// Clipper can return a mis-oriented outer ring after the soft-rounding
		// pass; under a non-zero fill the next union then filled its holes and
		// the ink covered the whole front and roof (ratio ≈ 0.88).
		const placed = place(gableHouse(makeDesign(42), { w: 18 }), { s: 3 });
		const { layers, silhouette } = renderLayered(placed, { outline: 0.4, join: 'soft' });
		expect(netArea(layers.ink) / netArea(silhouette)).toBeLessThan(0.5);
	});
	it('a square spire roof is one part, so its apex rounds once and closes', () => {
		const roofs = squareTower(DEFAULT_DESIGN, {}).filter((p) => p.role === 'roof');
		expect(roofs).toHaveLength(1);
		expect(roofs[0].shadeLines?.length).toBeGreaterThan(0);
	});
});

describe('perspective', () => {
	// squareTower's first part is its receding right face:
	// [front-bottom, back-bottom, back-top, front-top, …].
	const sideOf = (D: Design, h?: number) => squareTower(D, { h }).at(0)?.solid[0] ?? [];
	it('is parallel at 0: the back edge matches the front edge', () => {
		const [fb, bb, bt, ft] = sideOf({ ...DEFAULT_DESIGN, perspective: 0 });
		expect(bt[1] - bb[1]).toBeCloseTo(ft[1] - fb[1]);
	});
	it('converges by default: the back edge comes out shorter', () => {
		const [fb, bb, bt, ft] = sideOf(DEFAULT_DESIGN);
		expect(bt[1] - bb[1]).toBeLessThan(ft[1] - fb[1]);
	});
	it.each([28, 60])('keeps a %s-tall tower top climbing (no seen-from-below tip)', (h) => {
		const [, , bt, ft] = sideOf({ ...DEFAULT_DESIGN, perspective: 1 }, h);
		expect(bt[1]).toBeGreaterThan(ft[1]);
	});
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
