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
import {
	BUILDINGS,
	TEMPLATES,
	UNWALLED_BUILDINGS,
	building,
	pieces,
	settlement,
} from '../../src/lib/settlement-kit/layouts3d.js';
import {
	SETTLEMENT_BUILDINGS,
	UNWALLED_BUILDINGS as APP_UNWALLED_BUILDINGS,
} from '../../src/lib/settlementRecipe.js';
import {
	DEFAULT_DESIGN,
	church,
	clocktower,
	gableHouse,
	keep,
	makeDesign,
	onStilts,
	ringWall,
	roundHut,
	roundTower,
	squareTower,
	stiltHut,
	upgradeDesign,
} from '../../src/lib/settlement-kit/pieces3d.js';
import {
	FLAT_WALLS,
	GROUND_TYPES,
	LINE_MIX,
	TEXTURE_ROLES,
	paletteTone,
	patternDefs,
} from '../../src/lib/settlement-kit/patterns.js';
import { LAYERS, LINE_ROLES, renderLayered, place } from '../../src/lib/settlement-kit/render.js';
import { mixHex } from '../../src/lib/mapLayered.js';

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
	it("takes ground and walls from the recipe alone, never the culture's", () => {
		// A culture file that still says where it stands, and what wall it
		// builds, has no say: no ground unless the recipe asks, and a town
		// 'Usual for its size' in stone.
		const old = {
			key: 'old',
			name: 'Old',
			design: { ground: 'water', wall: 'reef' } as Partial<Design>,
			palette: PARCHMENT,
		};
		const roles = (svg: string) => [...svg.matchAll(/data-role="([\w-]+)"/g)].map((m) => m[1]);
		const plain = roles(generateSettlementSvg({ tier: 'town', culture: 'old', seed: 3 }, old));
		expect(plain).not.toContain('water');
		expect(plain).toContain('wall-stone-ring');
		expect(plain.some((x) => x?.startsWith('wall-reef'))).toBe(false);
		expect(
			roles(generateSettlementSvg({ tier: 'town', culture: 'old', seed: 3, ground: 'water' }, old)),
		).toContain('water');
		expect(recipeDesign(r({ ground: 'water' }), old)).not.toHaveProperty('ground', 'water');
	});
});

describe('wall patterns', () => {
	// Each pattern-filled wall type should emit a <pattern> def and a
	// pattern-filled wall path. Guards against a regression where the kit
	// quietly reverts to flat fills (which would read as "lost its texture").
	// Ring walls take a body tile (their courses, seams, canes, grooves,
	// speckles and grain are drawn as lines round the ring); square walls
	// keep the full tile.
	it.each([
		['stone', 'round', 'wall-stone-ring'],
		['stone', 'square', 'wall-stone'],
		['hedge', 'round', 'wall-hedge-ring'],
		['hedge', 'square', 'wall-hedge'],
		['reef', 'round', 'wall-reef-ring'],
		['reef', 'square', 'wall-reef'],
		['palisade', 'round', 'wall-wood-ring'],
		['palisade', 'square', 'wall-wood'],
		['earth', 'round', 'wall-earth-ring'],
		['earth', 'square', 'wall-earth'],
		['bone', 'round', 'wall-bone-ring'],
		['bone', 'square', 'wall-bone'],
	] as const)(
		'%s %s wall emits a <pattern> and uses url(#…) for its fill',
		(wall, wallShape, role) => {
			const svg = generateSettlementSvg(
				{ tier: 'village', culture: 'default', seed: 3, walls: wall, wallShape },
				null,
			);
			expect(svg, `${wall} should contain its pattern def`).toContain(`id="pat-${role}-`);
			expect(svg, `${wall} should use url(#…) for its wall fill`).toMatch(
				new RegExp(`data-role="${role}"[^/]*fill="url\\(#pat-${role}-`),
			);
		},
	);
	it.each([
		['wall-stone', 2],
		['wall-hedge', 2],
		['wall-reef', 2.5],
	] as const)('%s tile is drawn %s× larger via patternTransform', (role, scale) => {
		const { defs } = patternDefs([role], (r) => paletteTone(r, '#000000', (a) => a), 't');
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
	for (const steeple of ['square', 'round'] as const)
		for (const roof of towerRoofs)
			for (const crenel of [false, true])
				it(`steeple=${steeple} towerRoof=${roof}${crenel ? ' + crenel' : ''} renders a church and a clock tower`, () => {
					const D = { ...DEFAULT_DESIGN, steeple, towerRoof: roof, towerCrenel: crenel };
					expect(renders(church(D))).toBe(true);
					expect(renders(clocktower(D))).toBe(true);
				});
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

type WallType = NonNullable<NonNullable<Parameters<typeof ringWall>[1]>['type']>;

describe('ring wall texture', () => {
	const ringLines = (type: WallType) =>
		ringWall(DEFAULT_DESIGN, { type })
			.front.flatMap((it) => it.piece)
			.flatMap((p) => p.lines ?? []);
	it('draws stone courses and palisade seams round the ring', () => {
		// Course and seam lines are drawn at 0.45 (hatching and outlines aren't).
		for (const wall of ['stone', 'palisade'] as const)
			expect(ringLines(wall).filter((l) => l.w === 0.45).length, wall).toBeGreaterThan(40);
	});
	it('paints hedge canes and coral grooves round the ring in their own colours', () => {
		const roles = (type: WallType) => ringLines(type).flatMap((l) => (l.role ? [l.role] : []));
		expect(roles('hedge').filter((r) => r === 'wall-hedge-cane').length).toBeGreaterThan(20);
		expect(roles('reef').filter((r) => r === 'wall-reef-groove').length).toBeGreaterThan(20);
		expect(roles('reef')).toContain('wall-reef-vein');
		expect(roles('earth')).toContain('wall-earth-grit');
		expect(roles('earth')).toContain('wall-earth-pebble');
		expect(roles('bone').filter((r) => r === 'wall-bone-grain').length).toBeGreaterThan(20);
	});
	it('draws stone courses, palisade seams and bone seams as ink texture', () => {
		for (const wall of ['stone', 'palisade', 'bone'] as const) {
			const tex = ringLines(wall).filter((l) => l.role === 'ink-texture');
			expect(tex.length, wall).toBeGreaterThan(40);
		}
	});
});

/** Area a placed group covers as drawn (its silhouette path, holes out). */
const drawnArea = (items: ReturnType<typeof building>) => {
	const parts = items.flatMap((it) =>
		place(it.piece, { x: it.x ?? 0, y: it.y ?? 0, s: it.s ?? 1 }),
	);
	const { silhouette } = renderLayered(parts, { outline: 1.4, join: DEFAULT_DESIGN.join });
	let total = 0;
	for (const sub of silhouette.split('M').slice(1)) {
		const n = sub.replace(/[LZ]/g, ' ').trim().split(/\s+/).map(Number);
		for (let i = 0; i < n.length; i += 2) {
			const j = (i + 2) % n.length;
			total += (n[i]! * n[j + 1]! - n[j]! * n[i + 1]!) / 2;
		}
	}
	return Math.abs(total);
};

describe('buildings (the Buildings tab)', () => {
	const roles = (svg: string) =>
		new Set([...svg.matchAll(/data-role="([\w-]+)"/g)].map((m) => m[1]));
	it('offers the same buildings the app lists, in the same order', () => {
		expect(BUILDINGS).toEqual(Object.entries(SETTLEMENT_BUILDINGS));
	});
	it('keeps the reference row of pieces the icon bake draws by name', () => {
		const names = pieces(DEFAULT_DESIGN).map(([n]) => n);
		expect(names).toHaveLength(26);
		expect(names).toContain('Camp'); // a Settlement-builder size, not a building
		expect(BUILDINGS).toHaveLength(25);
	});
	it.each(BUILDINGS.map(([key]) => key))('draws %s on its own', (key) => {
		const svg = generateSettlementSvg(
			{ tier: 'stead', culture: 'default', seed: 5, building: key },
			null,
		);
		expect(svg).toMatch(/data-role="sil"[^>]* d="M/);
		expect(svg).toContain(`"Default ${key.replace(/-/g, ' ')}"`);
	});
	it('puts a wall of its own round a building, in the chosen shape', () => {
		const D = { ...DEFAULT_DESIGN };
		const walled = (walls: 'hedge' | 'none', wallShape: 'round' | 'square' = 'round') =>
			building('round-tower', { ...D, wallShape }, { walls, seed: 3 });
		expect(walled('none').some((it) => it.wall)).toBe(false);
		expect(walled('hedge').some((it) => it.wall)).toBe(true);
		const ring = generateSettlementSvg(
			{ tier: 'stead', culture: 'default', seed: 3, building: 'church', walls: 'hedge' },
			null,
		);
		expect(roles(ring)).toContain('wall-hedge-ring');
		const square = generateSettlementSvg(
			{
				tier: 'stead',
				culture: 'default',
				seed: 3,
				building: 'church',
				walls: 'palisade',
				wallShape: 'square',
			},
			null,
		);
		expect(roles(square)).toContain('wall-wood');
	});
	it.each([['wall', 'wall-stone']] as const)(
		'draws %s in its own material, never enclosed',
		(key, role) => {
			const svg = generateSettlementSvg(
				{ tier: 'stead', culture: 'default', seed: 3, building: key, walls: 'hedge' },
				null,
			);
			expect(roles(svg)).toContain(role);
			expect([...roles(svg)].some((r) => r.startsWith('wall-hedge'))).toBe(false);
		},
	);
	it('lays a lagoon under a building on water', () => {
		const on = (ground?: 'water') =>
			roles(
				generateSettlementSvg(
					{
						tier: 'stead',
						culture: 'default',
						seed: 3,
						building: 'windmill',
						...(ground ? { ground } : {}),
					},
					null,
				),
			);
		expect(on()).not.toContain('water');
		expect(on('water')).toContain('water');
	});
	it('sets a building on stilts — never the Wall, and never its terrain', () => {
		const deck = (items: ReturnType<typeof building>) =>
			items.some((it) => it.piece.some((p) => p.role === 'wood' && !p.terrain));
		const lowest = (items: ReturnType<typeof building>) =>
			Math.min(
				...items.flatMap((it) =>
					it.piece
						.filter((p) => p.role !== 'wood' && !p.terrain)
						.flatMap((p) => p.solid.flat().map(([, y]) => (it.y ?? 0) + y * (it.s ?? 1))),
				),
			);
		const house = building('gable-house', DEFAULT_DESIGN, { seed: 1 });
		const raised = building('gable-house', DEFAULT_DESIGN, { seed: 1, stilts: true });
		expect(deck(house)).toBe(false);
		expect(deck(raised)).toBe(true);
		expect(lowest(raised)).toBeGreaterThan(lowest(house) + 1);
		// The Wall stays on the ground.
		expect(building('wall', DEFAULT_DESIGN, { seed: 1, stilts: true })).toEqual(
			building('wall', DEFAULT_DESIGN, { seed: 1 }),
		);
		// A market's square stays on the ground; its stalls go up.
		const terrain = (items: ReturnType<typeof building>) =>
			items.flatMap((it) => it.piece.filter((p) => p.terrain).map((p) => p.solid));
		expect(terrain(building('market', DEFAULT_DESIGN, { seed: 1, stilts: true }))).toEqual(
			terrain(building('market', DEFAULT_DESIGN, { seed: 1 })),
		);
		// And the recipe carries it through to the drawing.
		const svg = (stilts?: boolean) =>
			generateSettlementSvg(
				{ tier: 'stead', culture: 'default', seed: 1, building: 'gable-house', stilts },
				null,
			);
		expect(svg(true)).not.toBe(svg());
	});
	it('agrees with the app on which buildings are never walled', () => {
		expect([...UNWALLED_BUILDINGS].sort()).toEqual([...APP_UNWALLED_BUILDINGS].sort());
	});
	it('ruins a building, and a reroll changes a house', () => {
		const at = (seed: number, ruin?: { decay: number }) =>
			generateSettlementSvg(
				{
					tier: 'stead',
					culture: 'default',
					seed,
					building: 'gable-house',
					...(ruin ? { ruin } : {}),
				},
				null,
			);
		expect(at(3, { decay: 0.6 })).not.toBe(at(3));
		expect(at(3)).toBe(at(3));
		expect(new Set([1, 2, 3, 4, 5].map((s) => at(s))).size).toBeGreaterThan(1);
		const tower = (seed: number) =>
			generateSettlementSvg(
				{ tier: 'stead', culture: 'default', seed, building: 'round-tower' },
				null,
			);
		expect(tower(1)).not.toBe(tower(2));
	});
	const ruin = (decay: number) => ({ decay, overgrowth: 0.4, burned: false });
	it('ruins a building on its own by degrees, recognisable well past halfway', () => {
		const steps = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
		for (const key of ['gable-house', 'church', 'keep', 'lighthouse'])
			for (const seed of [1, 2]) {
				const whole = drawnArea(building(key, DEFAULT_DESIGN, { seed }));
				const left = steps.map(
					(d) => drawnArea(building(key, DEFAULT_DESIGN, { seed, ruin: ruin(d) })) / whole,
				);
				const at = (d: number) => left[steps.indexOf(d)]!;
				const what = `${key} seed ${seed}: ${left.map((a) => a.toFixed(2)).join(' ')}`;
				// Barely touched at the light end, still half there at 0.5, all
				// but foundations at 1 —
				expect(at(0.1), what).toBeGreaterThan(0.8);
				expect(at(0.5), what).toBeGreaterThan(0.45);
				expect(at(1), what).toBeLessThan(0.4);
				// — and no cliff on the way: each step takes a little more (give
				// or take a stone), never a third of the building at once.
				for (let i = 1; i < steps.length; i++) {
					expect(left[i], what).toBeLessThan(left[i - 1]! * 1.08);
					expect(left[i - 1]! - left[i]!, what).toBeLessThan(0.35);
				}
			}
	});
	it('keeps paint on a wall, and drops what rides on a roof, and smoke', () => {
		const at = (key: string, decay: number) =>
			building(key, DEFAULT_DESIGN, { seed: 1, ruin: ruin(decay) }).flatMap((it) => it.piece);
		const top = (p: { solid: [number, number][][] }) =>
			Math.max(...p.solid.flat().map(([, y]) => y));
		const foot = (p: { solid: [number, number][][] }) =>
			Math.min(...p.solid.flat().map(([, y]) => y));
		// A lighthouse's red bands are roof-coloured paint on the tower, not a
		// roof: they stand with it once the cap has gone.
		expect(at('lighthouse', 0.6).some((p) => p.role === 'roof' && foot(p) > 4)).toBe(true);
		// The witch hut's chimney comes through its roof (its foot is above
		// the hut's walls, below the eaves): it falls with the roof.
		const hut = at('witch-hut', 0.5).filter(
			(p) => !p.terrain && p.role !== 'roof' && p.solid.length,
		);
		expect(Math.max(...hut.map(top))).toBeLessThan(17);
		// A ruin never smokes, even at the light end.
		expect(at('tavern', 0.1).some((p) => p.smoke)).toBe(false);
	});
	it('frames a ruin as its building was, not zoomed in on the stump', () => {
		const box = (key: string, decay?: number) => {
			const svg = generateSettlementSvg(
				{
					tier: 'stead',
					culture: 'default',
					seed: 4,
					building: key,
					...(decay ? { ruin: { decay } } : {}),
				},
				null,
			);
			return svg
				.match(/viewBox="([^"]+)"/)![1]!
				.split(' ')
				.map(Number);
		};
		for (const key of ['round-tower', 'keep', 'windmill', 'gable-house'])
			for (const decay of [0.3, 1]) {
				const [, y, w, h] = box(key);
				const [, ry, rw, rh] = box(key, decay);
				// At least the building's box (rubble may spill past it), its top
				// where the building's was. (A little slack: drawn sail spars
				// reach past the solids the frame is measured from.)
				expect(rw, `${key} @${decay}`).toBeGreaterThan(w! - 2);
				expect(rh, `${key} @${decay}`).toBeGreaterThan(h! - 2);
				expect(ry, `${key} @${decay}`).toBeLessThan(y! + 1);
			}
	});
	it("drops a mill's sails, and grows no ivy in mid-air", () => {
		for (const seed of [1, 2, 3, 4, 5, 6]) {
			const mill = building('windmill', DEFAULT_DESIGN, { seed, ruin: ruin(0.5) });
			expect(mill.some((it) => it.piece.some((p) => p.aloft))).toBe(false);
			for (const key of ['townhouse', 'tavern', 'windmill', 'workshop']) {
				// Ivy and bushes (in the marker colour) grow from the ground —
				// not from where an upper storey stood before it fell.
				const feet = building(key, DEFAULT_DESIGN, { seed, ruin: ruin(1) }).flatMap((it) =>
					it.piece
						.filter((p) => p.role === 'roof')
						.flatMap((p) => p.solid.map((poly) => Math.min(...poly.map(([, y]) => y)))),
				);
				for (const foot of feet) expect(foot, `${key} seed ${seed}`).toBeLessThan(2);
			}
		}
	});
});

describe('ruined settlements', () => {
	it('come down by degrees, each building at a decay of its own', () => {
		const ruin = (decay: number) => ({ decay, overgrowth: 0.4, burned: false });
		const steps = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
		for (const [tier, walls] of [
			['hamlet', 'none'],
			['village', 'none'],
			['town', 'stone'],
		] as const) {
			const whole = drawnArea(settlement(tier, DEFAULT_DESIGN, { seed: 1, walls }));
			const left = steps.map(
				(d) =>
					drawnArea(settlement(tier, DEFAULT_DESIGN, { seed: 1, walls, ruin: ruin(d) })) / whole,
			);
			const what = `${tier}: ${left.map((a) => a.toFixed(2)).join(' ')}`;
			// Barely touched at the light end — not most roofs and towers gone
			// at once — and well over half there at 0.5 …
			expect(left[0], what).toBeGreaterThan(0.85);
			expect(left[4], what).toBeGreaterThan(0.6);
			// … then a little more at every step, never a lurch.
			for (let i = 1; i < steps.length; i++) {
				expect(left[i], what).toBeLessThan(left[i - 1]! * 1.05);
				expect(left[i - 1]! - left[i]!, what).toBeLessThan(0.2);
			}
		}
	}, 60_000); // 33 settlements drawn: seconds, not milliseconds
	it('frames a ruined settlement as it was', () => {
		const box = (decay?: number) =>
			generateSettlementSvg(
				{ tier: 'village', culture: 'default', seed: 2, ...(decay ? { ruin: { decay } } : {}) },
				null,
			)
				.match(/viewBox="([^"]+)"/)![1]!
				.split(' ')
				.map(Number);
		const [, y, w, h] = box();
		for (const decay of [0.5, 1]) {
			const [, ry, rw, rh] = box(decay);
			expect(rw).toBeGreaterThan(w! - 2);
			expect(rh).toBeGreaterThan(h! - 2);
			expect(ry).toBeLessThan(y! + 1);
		}
	});
});

describe('ground', () => {
	const svgOf = (ground: string, extra: Record<string, unknown> = {}) =>
		generateSettlementSvg(
			{ tier: 'village', culture: 'default', seed: 3, ground, ...extra } as Parameters<
				typeof generateSettlementSvg
			>[0],
			null,
		);
	const rolesOf = (svg: string) => [...svg.matchAll(/data-role="([\w-]+)"/g)].map((m) => m[1]);
	it("draws no ground for 'none', and a lagoon on water", () => {
		const roles = rolesOf(svgOf('none'));
		expect(roles.some((r) => r.startsWith('ground-') || r === 'water')).toBe(false);
		expect(rolesOf(svgOf('water'))).toContain('water');
	});
	it.each(GROUND_TYPES)('lays a %s plane, textured, under a settlement and a building', (g) => {
		for (const svg of [svgOf(g), svgOf(g, { tier: 'stead', building: 'barn', walls: 'stone' })]) {
			expect(rolesOf(svg)).toContain(`ground-${g}`);
			expect(svg).toContain(`id="pat-ground-${g}-`);
			expect(svg).toMatch(new RegExp(`data-role="ground-${g}"[^/]*fill="url\\(#pat-ground-${g}-`));
		}
	});
	it.each(GROUND_TYPES)('draws a %s plane flat with Texture off', (g) => {
		const svg = generateSettlementSvg(
			{ tier: 'village', culture: 't', seed: 3, ground: g } as Parameters<
				typeof generateSettlementSvg
			>[0],
			{ key: 't', name: 'T', design: { texture: false }, palette: PARCHMENT },
		);
		expect(svg).toContain(`data-role="ground-${g}" fill="${FLAT_WALLS[`ground-${g}`]}"`);
	});
	it("centres a building's ground on the building, not on its banner", () => {
		// A round tower stands at x = 0 with its banner streaming off to one
		// side; its ground still centres on the tower.
		const [plane] = building('round-tower', DEFAULT_DESIGN, { seed: 5, ground: 'grass' });
		expect(Math.abs(plane.x ?? 0)).toBeLessThan(0.5);
	});
	it('keeps the ground pattern tiles compact', () => {
		for (const g of GROUND_TYPES) {
			const { defs } = patternDefs(
				[`ground-${g}`],
				(r) => paletteTone(r, '#000000', (a) => a),
				't',
			);
			expect(defs.length, g).toBeLessThan(6_000);
		}
	});
});

describe('texture', () => {
	const culture = (design: Partial<Design>) => ({
		key: 't',
		name: 'Texture test',
		design: { masonry: true, wallShape: 'round' as const, ...design },
		palette: PARCHMENT,
	});
	const town = (wall: WallType, texture?: boolean) =>
		generateSettlementSvg(
			{ tier: 'town', culture: 't', seed: 3, walls: wall },
			culture(texture === undefined ? {} : { texture }),
		);
	const roles = (svg: string) => [...svg.matchAll(/data-role="([\w-]+)"/g)].map((m) => m[1]);
	it('is on by default: masonry and ring line-work draw in their own layers', () => {
		expect(DEFAULT_DESIGN.texture).toBe(true);
		const stone = town('stone');
		expect(roles(stone)).toContain('ink-texture');
		expect(stone).toContain('<pattern');
		expect(stone).not.toContain('data-texture');
		expect(roles(town('hedge'))).toContain('wall-hedge-cane');
	});
	it.each(['stone', 'hedge', 'reef', 'palisade', 'earth', 'bone'] as const)(
		'off: a %s town draws no texture layers and flat walls',
		(wall) => {
			const svg = town(wall, false);
			expect(svg).toContain('data-texture="off"');
			expect(svg).not.toContain('<pattern');
			expect(svg).not.toContain('url(#');
			expect(roles(svg).filter((r) => TEXTURE_ROLES.has(r))).toEqual([]);
			const ring = roles(svg).find((r) => r.endsWith('-ring'));
			expect(ring, 'a ring wall').toBeDefined();
			expect(svg).toContain(`data-role="${ring}" fill="${FLAT_WALLS[ring!]}"`);
		},
	);
	it('leaves masonry its building materials when off: a stone barn stays stone', () => {
		const barn = (texture: boolean) =>
			pieces({ ...DEFAULT_DESIGN, masonry: true, texture }).find(([n]) => n === 'Barn')?.[1][0]
				.piece ?? [];
		expect(barn(false).some((p) => p.role === 'wood')).toBe(false);
	});
});

describe('masonry', () => {
	const lines = (parts: ReturnType<typeof roundTower>) =>
		parts.reduce((n, p) => n + (p.lines?.length ?? 0), 0);
	it.each([
		['round tower', (D: Design) => roundTower(D)],
		['keep', (D: Design) => keep(D)],
	])('lays stone courses on a %s', (_, piece) => {
		expect(lines(piece({ ...DEFAULT_DESIGN, masonry: true }))).toBeGreaterThan(
			lines(piece({ ...DEFAULT_DESIGN, masonry: false })),
		);
	});
	it('builds a masonry barn in stone, not planks', () => {
		const barn = (masonry: boolean) =>
			pieces({ ...DEFAULT_DESIGN, masonry }).find(([n]) => n === 'Barn')?.[1][0].piece ?? [];
		expect(barn(false).some((p) => p.role === 'wood')).toBe(true);
		expect(barn(true).some((p) => p.role === 'wood')).toBe(false);
	});
});

describe('variety (mixed builders)', () => {
	it('mixes the buildings of a culture with variety, and leaves one without alone', () => {
		const plain = settlement('city', DEFAULT_DESIGN, { seed: 3 });
		const zero = settlement('city', { ...DEFAULT_DESIGN, variety: 0 }, { seed: 3 });
		expect(JSON.stringify(zero)).toBe(JSON.stringify(plain));
		const mixed = settlement('city', { ...DEFAULT_DESIGN, variety: 1 }, { seed: 3 });
		expect(JSON.stringify(mixed)).not.toBe(JSON.stringify(plain));
	});
});

describe('gate towers', () => {
	it('stand astride the ring: the wall right of the gate draws after the tower', () => {
		// The stretch that meets the tower's right face is drawn last, so the
		// wall runs into the tower's side rather than out from behind it.
		const { front } = ringWall({ ...DEFAULT_DESIGN, gate: 'tower' }, { type: 'stone' });
		expect(front.at(-1)?.wall).toBe(true);
		expect(front.at(-2)?.wall).toBeFalsy(); // the gate tower
	});
});

describe('sharp parts', () => {
	type P = Parameters<typeof renderLayered>[0][number];
	const tri = (sharp: boolean): P[] =>
		place(
			[
				{
					solid: [
						[
							[0, 0],
							[10, 0],
							[0, 4],
						],
					],
					role: 'flag',
					sharp,
				},
			],
			{ s: 2 },
		);
	it('keep their corners whatever the join', () => {
		const soft = renderLayered(tri(true), { join: 'soft' }).layers;
		const crisp = renderLayered(tri(true), { join: 'sharp' }).layers;
		expect(soft.flag).toBe(crisp.flag);
		expect(soft.ink).toBe(crisp.ink);
		// …where an ordinary part is softened.
		expect(renderLayered(tri(false), { join: 'soft' }).layers.flag).not.toBe(crisp.flag);
	});
	it('flag cloth is sharp', () => {
		const cloth = roundTower(DEFAULT_DESIGN).filter((p) => p.role === 'flag');
		expect(cloth.length).toBeGreaterThan(0);
		expect(cloth.every((p) => p.sharp)).toBe(true);
	});
});

describe('render robustness', () => {
	it('ink stays an outline under the soft join (seed-42 house went solid black)', () => {
		// Clipper can return a mis-oriented outer ring after the soft-rounding
		// pass; under a non-zero fill the next union then filled its holes and
		// the ink covered the whole front and roof (ratio ≈ 0.88).
		const placed = place(gableHouse(makeDesign(42), { w: 18 }), { s: 3 });
		const { layers, silhouette } = renderLayered(placed, { outline: 0.4, join: 'soft' });
		// All the line-work: the ink and every part's (tinted) outline.
		const lines = Object.entries(layers)
			.filter(([l, d]) => d && (l === 'ink' || l.endsWith('-line')))
			.reduce((a, [, d]) => a + netArea(d), 0);
		expect(lines / netArea(silhouette)).toBeLessThan(0.5);
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

describe('tinted outlines', () => {
	const square = (role?: 'roof') =>
		place(
			[
				{
					solid: [
						[
							[0, 0],
							[10, 0],
							[10, 10],
							[0, 10],
						],
					],
					...(role ? { role } : {}),
				},
			],
			{ s: 2 },
		);
	it("draws a part's outline in its own layer, not in ink", () => {
		const { layers } = renderLayered(square(), { outline: 1.4 });
		expect(layers['wall-line']).toContain('M');
		expect(layers.ink).toBe('');
		expect(renderLayered(square('roof'), { outline: 1.4 }).layers['roof-line']).toContain('M');
	});
	it('colours each outline a darker shade of what it edges', () => {
		const svg = generateSettlementSvg(
			{ tier: 'stead', culture: 'default', seed: 4, building: 'gable-house' },
			null,
		);
		const fill = (role: string) => svg.match(new RegExp(`data-role="${role}" fill="(#\\w+)"`))?.[1];
		expect(fill('wall-line')).toBe(mixHex(PARCHMENT.wall, PARCHMENT.ink, LINE_MIX));
		expect(fill('roof-line')).toBe(mixHex(PARCHMENT.roof, PARCHMENT.ink, LINE_MIX));
		// The windows, doors and hatching stay ink.
		expect(fill('ink')).toBe(PARCHMENT.ink);
	});
	it('has an outline layer for every role a part is drawn in', () => {
		const items = [
			...pieces(DEFAULT_DESIGN).flatMap(([, it]) => it),
			...settlement('town', DEFAULT_DESIGN, { seed: 1, walls: 'stone', ground: 'grass' }),
			...settlement('village', DEFAULT_DESIGN, { seed: 1, walls: 'hedge', ground: 'water' }),
		];
		const roles = new Set(items.flatMap((it) => it.piece.map((p) => p.role ?? 'wall')));
		for (const role of roles) expect(LINE_ROLES, role).toContain(`${role}-line`);
		expect(LAYERS.indexOf('ink')).toBeGreaterThan(LAYERS.indexOf('roof-line'));
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
