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
	toLayeredSvg,
} from '../../src/lib/settlement-kit/generate.js';
import {
	BUILDINGS,
	TEMPLATES,
	building,
	pieces,
	settlement,
} from '../../src/lib/settlement-kit/layouts3d.js';
import { SETTLEMENT_BUILDINGS } from '../../src/lib/settlementRecipe.js';
import {
	DEFAULT_DESIGN,
	cathedral,
	church,
	clocktower,
	gableHouse,
	keep,
	makeDesign,
	onStilts,
	lookoutTower,
	ringWall,
	roundHut,
	roundTower,
	sideHouse,
	squareTower,
	stiltHut,
	townhouse,
	upgradeDesign,
	well,
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
import { ruinPlaced } from '../../src/lib/settlement-kit/ruins3d.js';
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
	it("takes ground, walls and their shape from the recipe alone, never the culture's", () => {
		// A culture file that still says where it stands, and what wall it
		// builds in what shape, has no say: no ground and no wall unless the
		// recipe asks — whatever the settlement's size — and a round one
		// unless the recipe says square.
		const old = {
			key: 'old',
			name: 'Old',
			design: { ground: 'water', wall: 'reef', wallShape: 'square' } as Partial<Design>,
			palette: PARCHMENT,
		};
		const roles = (svg: string) => [...svg.matchAll(/data-role="([\w-]+)"/g)].map((m) => m[1]);
		const plain = roles(generateSettlementSvg({ tier: 'town', culture: 'old', seed: 3 }, old));
		expect(plain).not.toContain('water');
		expect(plain.some((x) => x?.endsWith('-ring'))).toBe(false);
		expect(
			roles(generateSettlementSvg({ tier: 'town', culture: 'old', seed: 3, walls: 'stone' }, old)),
		).toContain('wall-stone-ring');
		expect(
			roles(generateSettlementSvg({ tier: 'town', culture: 'old', seed: 3, ground: 'water' }, old)),
		).toContain('water');
		expect(
			roles(
				generateSettlementSvg(
					{ tier: 'town', culture: 'old', seed: 3, walls: 'stone', wallShape: 'square' },
					old,
				),
			),
		).toContain('wall-stone');
		expect(recipeDesign(r({ ground: 'water' }), old)).not.toHaveProperty('ground', 'water');
		expect(recipeDesign(r({}), old)).not.toHaveProperty('wallShape');
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

describe('piece details', () => {
	const xs = (p: { solid: [number, number][][] }) => p.solid.flat().map(([x]) => x);
	const ys = (p: { solid: [number, number][][] }) => p.solid.flat().map(([, y]) => y);
	it("seats a spire's holy symbol behind its cap, so the post never shows down it", () => {
		const parts = squareTower(
			{ ...DEFAULT_DESIGN, towerRoof: 'cone', towerCrenel: false },
			{ finial: true },
		);
		const cap = parts.findIndex((p) => p.role === 'roof' && p.shadeLines?.length);
		const symbol = parts.findIndex((p) => p.free?.length);
		expect(symbol).toBeGreaterThanOrEqual(0);
		expect(symbol).toBeLessThan(cap);
	});
	it('crenellates a bare square top all round, its walk below the crenels', () => {
		const parts = squareTower({ ...DEFAULT_DESIGN, towerRoof: 'none', towerCrenel: true });
		const front = parts.at(-1)!;
		const walk = parts.find(
			(p) =>
				!p.shaded && p.solid.length === 1 && p.solid[0].length === 4 && Math.min(...ys(p)) > 28,
		)!;
		expect(walk, 'the walk').toBeDefined();
		// The front edge of the walk sits below the front merlons' notches.
		expect(Math.min(...ys(walk))).toBeLessThan(Math.max(...ys(front)) - 2);
		// The left wall's inner face, in shadow, runs along the walk's left rim.
		const left = parts.find((p) => p.shaded && Math.min(...xs(p)) <= Math.min(...xs(walk)) + 0.01);
		expect(left, 'a left wall').toBeDefined();
		expect(Math.max(...xs(left!))).toBeLessThan(Math.max(...xs(walk)) / 2);
	});
	it("shows a side-on roof's back slope where it overhangs the gable end", () => {
		const parts = sideHouse(DEFAULT_DESIGN);
		const back = parts[0];
		const gable = parts.find((p) => p.shaded && p.role !== 'roof')!;
		expect(back.role).toBe('roof');
		expect(Math.max(...xs(back))).toBeGreaterThan(Math.max(...xs(gable)));
	});
	it.each([
		['a barracks', { ...DEFAULT_DESIGN }, 'barracks'],
		["a masonry culture's house", { ...DEFAULT_DESIGN, masonry: true }, 'house'],
	] as const)('runs stone courses back along the gable end of %s', (_, D, kind) => {
		const parts = sideHouse(D, { kind });
		const gable = parts.find((p) => p.shaded && p.role !== 'roof')!;
		expect(gable.lines?.some((l) => l.role === 'ink-texture')).toBe(true);
		const plain = sideHouse(DEFAULT_DESIGN).find((p) => p.shaded && p.role !== 'roof')!;
		expect(plain.lines?.some((l) => l.role === 'ink-texture')).toBe(false);
	});
	it.each([
		['gable house', gableHouse],
		['keep', keep],
		['square tower', squareTower],
		['cathedral', cathedral],
		['townhouse', townhouse],
	] as const)("carries a masonry culture's stone round the %s's side wall", (_, make) => {
		const stoned = (masonry: boolean) =>
			make({ ...DEFAULT_DESIGN, masonry }).some(
				(p) => p.shaded && p.role !== 'roof' && p.lines?.some((l) => l.role === 'ink-texture'),
			);
		expect(stoned(true)).toBe(true);
		expect(stoned(false)).toBe(false);
	});
	it.each(['round', 'square'] as const)(
		'fences a %s enclosure with posts and rails — open, crisp, no towers',
		(shape) => {
			const { back, front } = ringWall(DEFAULT_DESIGN, { type: 'fence', shape, rx: 30, ry: 12 });
			expect(back.length).toBeGreaterThan(0);
			expect(front.length).toBeGreaterThan(0);
			const parts = [...back, ...front].flatMap((it) => it.piece);
			// Timber, kept crisp so the thin rails survive the soft join.
			expect(parts.every((p) => p.role === 'wood' && p.sharp)).toBe(true);
			// Every item is the fence's own: no ring towers or gate tower.
			expect([...back, ...front].every((it) => it.wall)).toBe(true);
			// And it's low: nothing much above the rails.
			const top = Math.max(...parts.flatMap((p) => p.solid.flat().map(([, y]) => y)));
			expect(top).toBeLessThan(shape === 'square' ? 40 : 20);
		},
	);
	it('draws a fenced settlement and a fenced building', () => {
		const roles = (svg: string) => [...svg.matchAll(/data-role="([\w-]+)"/g)].map((m) => m[1]);
		const town = generateSettlementSvg(
			{ tier: 'hamlet', culture: 'default', seed: 3, walls: 'fence' },
			null,
		);
		expect(roles(town)).toContain('wood');
		// No wall material: a fence is timber, not a ring of stone or stakes.
		expect(roles(town).some((r) => /^wall-(stone|wood|hedge|reef|earth|bone)/.test(r))).toBe(false);
		const barn = building('barn', DEFAULT_DESIGN, { walls: 'fence', seed: 2 });
		expect(barn.some((it) => it.wall)).toBe(true);
	});
	it('stands a lookout tower on four legs, a roof over its cabin', () => {
		const parts = lookoutTower({ ...DEFAULT_DESIGN, flags: false });
		const legs = parts.filter((p) => p.role === 'wood' && p.solid.length === 2);
		expect(legs.length).toBeGreaterThanOrEqual(2); // the back pair, the front pair
		expect(parts.at(-1)?.role).toBe('roof');
		expect(parts.some((p) => p.free?.length)).toBe(true); // the ladder
		expect(lookoutTower({ ...DEFAULT_DESIGN, flags: true }).some((p) => p.role === 'flag')).toBe(
			true,
		);
	});
	it('lays a farmstead: a barn and a house in a fence, on no floor of its own', () => {
		const [, items] = pieces(DEFAULT_DESIGN).find(([n]) => n === 'Farmstead')!;
		expect(items.some((it) => it.piece.some((p) => p.terrain))).toBe(false);
		expect(items.filter((it) => it.wall).length).toBe(4); // the fence's four runs
		expect(items.filter((it) => !it.wall).length).toBe(2); // the barn, the house
	});
	it("lays a masonry culture's well curb in small stones", () => {
		const curb = (masonry: boolean) => well({ ...DEFAULT_DESIGN, masonry })[0];
		expect(curb(true).lines?.some((l) => l.role === 'ink-texture')).toBe(true);
		expect(curb(false).lines ?? []).toEqual([]);
	});
	it.each([0.2, 0.35, 0.5, 0.8])(
		'leaves no bare flagpole on a ruined tower (decay %s)',
		(decay) => {
			const tower = roundTower({ ...DEFAULT_DESIGN, towerRoof: 'onion', flags: true });
			expect(tower.some((p) => p.role === 'flag' && !p.solid.length)).toBe(true);
			const [ruin] = ruinPlaced([{ piece: tower }], {
				decay,
				overgrowth: 0,
				burned: false,
				single: true,
				seed: 1,
			});
			expect(ruin.piece.some((p) => p.role === 'flag')).toBe(false);
			// Nor a line left standing clear of everything: a dome's spike
			// goes with its dome.
			expect(ruin.piece.filter((p) => !p.solid.length && p.free?.length && !p.mask)).toEqual([]);
		},
	);
	it.each(['workshop', 'tavern'] as const)('gives a %s round chimneys', (kind) => {
		const parts = sideHouse(DEFAULT_DESIGN, { kind });
		const stacks = parts.slice(
			1,
			parts.findIndex((p) => p.shaded && p.role !== 'roof'),
		);
		expect(stacks.length).toBeGreaterThan(0);
		for (const p of stacks.filter((q) => !q.smoke))
			for (const poly of p.solid) expect(poly.length, 'a drum, not a box').toBeGreaterThan(8);
	});
	it('stands the reference pieces on a ground when asked, as buildings are', () => {
		const row = pieces(DEFAULT_DESIGN, { ground: 'grass' });
		expect(row).toHaveLength(pieces(DEFAULT_DESIGN).length);
		for (const [name, items] of row)
			expect(
				items[0].piece.map((p) => p.role),
				name,
			).toEqual(['ground-grass']);
	});
});

/** The pieces added from the reference list (and the Buildings tab's). */
const PROTOTYPES = [
	'Lookout tower',
	'Farmstead',
	'L-plan house',
	'Town hall',
	'Octagonal tower',
	'Tower house',
	'Tiered tower',
];

describe('newer pieces', () => {
	it.each(PROTOTYPES)('draws a %s, in any culture', (name) => {
		for (const D of [DEFAULT_DESIGN, makeDesign(7), makeDesign(42)]) {
			const [, items] = pieces(D).find(([n]) => n === name)!;
			const parts = items.flatMap((it) =>
				place(it.piece, { x: it.x ?? 0, y: it.y ?? 0, s: it.s ?? 1 }),
			);
			const { layers } = renderLayered(parts, { join: D.join });
			expect(layers.wall || layers.wood, `${name} has walls or timber`).toBeTruthy();
		}
	});

	const TOWERS = ['Octagonal tower', 'Tower house', 'Tiered tower', 'Town hall'];
	const drawn = (D: typeof DEFAULT_DESIGN, name: string) => {
		const [, items] = pieces(D).find(([n]) => n === name)!;
		return items.flatMap((it) => place(it.piece, { x: it.x ?? 0, y: it.y ?? 0, s: it.s ?? 1 }));
	};
	it.each(TOWERS)("tops a %s with the culture's tower cap", (name) => {
		const cone = drawn({ ...DEFAULT_DESIGN, towerRoof: 'cone' }, name);
		const caps = (['onion', 'dome', 'lancet'] as const).map((towerRoof) =>
			JSON.stringify(drawn({ ...DEFAULT_DESIGN, towerRoof }, name)),
		);
		expect(caps).not.toContain(JSON.stringify(cone));
		expect(new Set(caps).size, 'each cap its own').toBe(3);
	});
	it('keeps the lookout tower its pyramid roof, whatever the cap', () => {
		const cone = drawn({ ...DEFAULT_DESIGN, towerRoof: 'cone' }, 'Lookout tower');
		for (const towerRoof of ['onion', 'dome', 'lancet', 'none'] as const)
			expect(drawn({ ...DEFAULT_DESIGN, towerRoof }, 'Lookout tower'), towerRoof).toEqual(cone);
	});
	it('crenellates the octagonal tower as a round tower: bare, or under a cap', () => {
		const oct = (towerRoof: 'none' | 'dome', towerCrenel: boolean) =>
			drawn({ ...DEFAULT_DESIGN, towerRoof, towerCrenel }, 'Octagonal tower');
		expect(oct('none', false).some((p) => p.role === 'roof')).toBe(false); // a bare walk
		expect(oct('none', false)).toEqual(oct('none', true)); // no cap: always crenellated
		const banded = oct('dome', true),
			plain = oct('dome', false);
		expect(banded.some((p) => p.role === 'roof')).toBe(true);
		// The parapet band under the dome, its crenels slots in it.
		expect(banded.length).toBeGreaterThan(plain.length);
		expect(banded.flatMap((p) => p.fills ?? []).length).toBeGreaterThan(
			plain.flatMap((p) => p.fills ?? []).length,
		);
	});
	it.each(['onion', 'dome', 'lancet', 'cone'] as const)(
		'leaves no %s cap or flag hanging in the air over a ruined new tower',
		(towerRoof) => {
			for (const name of [...TOWERS, 'Lookout tower']) {
				const piece = drawn({ ...DEFAULT_DESIGN, towerRoof, flags: true }, name);
				const [ruin] = ruinPlaced([{ piece }], {
					decay: 0.6,
					overgrowth: 0,
					burned: false,
					single: true,
					seed: 1,
				});
				expect(
					ruin.piece.some((p) => p.role === 'flag'),
					name,
				).toBe(false);
				expect(
					ruin.piece.filter((p) => !p.solid.length && p.free?.length && !p.mask),
					name,
				).toEqual([]);
			}
		},
	);
});

describe('buildings (the Buildings tab)', () => {
	const roles = (svg: string) =>
		new Set([...svg.matchAll(/data-role="([\w-]+)"/g)].map((m) => m[1]));
	it('offers the same buildings the app lists, in the same order', () => {
		expect(BUILDINGS).toEqual(Object.entries(SETTLEMENT_BUILDINGS));
	});
	it('keeps the reference row of pieces the icon bake draws by name', () => {
		const names = pieces(DEFAULT_DESIGN).map(([n]) => n);
		expect(names).toHaveLength(32);
		expect(names).toContain('Camp'); // a Settlement-builder size, not a building
		// The newer pieces, on the Buildings tab too.
		expect(BUILDINGS.map(([, n]) => n)).toEqual(expect.arrayContaining(PROTOTYPES));
		expect(names).not.toContain('Wall'); // retired: the Stone wall icons draw wallRun()
		expect(BUILDINGS).toHaveLength(31);
		expect(BUILDINGS.map(([key]) => key)).not.toContain('wall');
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
			building('round-tower', D, { walls, wallShape, seed: 3 });
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
	it('sets a building on stilts — never its terrain', () => {
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
	it('tag what each building is built of: stone for the landmarks, timber or masonry for homes', () => {
		const built = (D: Design) =>
			settlement('town', D, { seed: 1 })
				.filter((it) => !it.wall && it.piece.some((p) => !p.terrain))
				.map((it) => it.built);
		const timber = built(DEFAULT_DESIGN);
		expect(timber).toContain('stone'); // church, keep, towers
		expect(timber).toContain('timber'); // houses
		// A culture that builds in masonry has stone houses too.
		const masonry = built({ ...DEFAULT_DESIGN, masonry: true });
		expect(masonry.filter((b) => b === 'timber').length).toBeLessThan(
			timber.filter((b) => b === 'timber').length,
		);
	});
	it('let stone outlast timber at the same decay — but not a building on its own', () => {
		const ruin = { decay: 0.5, overgrowth: 0.4, burned: false, seed: 3 };
		const tower = roundTower(DEFAULT_DESIGN);
		const as = (built: 'stone' | 'timber', o: typeof ruin & { single?: boolean } = ruin) =>
			ruinPlaced([{ piece: tower, built }], o);
		// Same piece, same seed: only what it's built of differs.
		expect(drawnArea(as('stone'))).toBeGreaterThan(drawnArea(as('timber')) * 1.1);
		// The Buildings tab draws exactly its slider's decay.
		const single = { ...ruin, single: true };
		expect(as('stone', single)).toEqual(
			as('timber', single).map((it) => ({ ...it, built: 'stone' })),
		);
	});
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
		design: { masonry: true, ...design },
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

describe('hatching', () => {
	const items = settlement('town', DEFAULT_DESIGN, { walls: 'stone', seed: 3 });
	const svg = (hatching?: boolean) =>
		toLayeredSvg('t', items, PARCHMENT, hatching === undefined ? {} : { hatching });
	const layer = (svg: string, role: string) =>
		svg.match(new RegExp(`data-role="${role}"[^>]* d="([^"]*)"`))?.[1] ?? '';
	it("is off for IronLedger's icons: shaded faces by colour alone", () => {
		const off = svg();
		expect(off).toBe(svg(false));
		// Fewer ink strokes than hatched: the hatch is gone…
		expect(layer(off, 'ink').length).toBeLessThan(layer(svg(true), 'ink').length * 0.8);
		// …but not the shading.
		for (const role of ['wall-shade', 'roof-shade']) expect(layer(off, role), role).not.toBe('');
	});
	it("is the drawing's, not a culture's", () => {
		expect(DEFAULT_DESIGN).not.toHaveProperty('hatching');
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
		// The cloth: the flag's part with a shape (its pole is only a line).
		const cloth = roundTower(DEFAULT_DESIGN).filter((p) => p.role === 'flag' && p.solid.length);
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
