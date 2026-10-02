// =============================================================================
// Settlement kit — 3/4-view layouts (PROTOTYPE)
//
// Settlement templates (stead → freeport, from the YRT settlement-type
// oracle) laid out from the pieces3d.mjs pieces for one culture
// (`Design`). `walls` overrides the ring wall; 'auto' follows each
// template's rule applied to the culture's own wall type.
// =============================================================================

import { rng } from './geom.mjs';
import { ruinPlaced } from './ruins3d.mjs';
import {
	camp,
	caravel,
	church,
	gableHouse,
	keep,
	lagoon,
	lighthouse,
	market,
	mine,
	moundHut,
	pier,
	ringWall,
	roundHut,
	roundTower,
	sideHouse,
	squareFootprint,
	squareTower,
	stiltHut,
	townhouse,
	well,
	windmill,
} from './pieces3d.mjs';

/** @typedef {import('./pieces3d.mjs').Design} Design */
/** @typedef {import('./pieces3d.mjs').Placed} Placed */
/** @typedef {'auto' | 'none' | 'stone' | 'palisade' | 'earth' | 'hedge' | 'bone' | 'reef'} Walls */

/**
 * A dwelling in the culture's house form (timber, round hut, turf mound
 * or stilt hut), or — in towns and cities, at the culture's `industry` rate — a
 * warehouse or workshop.
 * @param {Design} D
 * @param {() => number} r
 * @param {number} w
 * @param {boolean} trade
 */
function house(D, r, w, trade) {
	const seed = Math.floor(r() * 1e6);
	if (!trade || r() >= D.industry) {
		if (D.houseForm === 'round') return roundHut(D, { r: w * 0.32 });
		if (D.houseForm === 'mound') return moundHut(D, { r: w * 0.42 });
		if (D.houseForm === 'stilt') return stiltHut(D, { r: w * 0.3 });
		// Timber cultures can mix in round huts and Norse longhouses.
		if (r() < D.huts) return roundHut(D, { r: w * 0.32 });
		if (r() < D.longhouse) return sideHouse(D, { w: w * 1.55, seed, kind: 'longhouse' });
	} else return sideHouse(D, { w: w + 8, seed, kind: r() < 0.5 ? 'warehouse' : 'workshop' });
	return r() < D.gable ? gableHouse(D, { w: w * 0.75, seed }) : sideHouse(D, { w, seed });
}

/**
 * Horizontal extent and height of a piece (from its silhouettes), so a
 * layout can pack buildings by their real footprint.
 * @param {import('./render.mjs').Part[]} piece
 */
function extent(piece) {
	let x0 = Infinity,
		x1 = -Infinity,
		y1 = 0;
	for (const p of piece)
		for (const poly of p.solid)
			for (const [x, y] of poly) {
				x0 = Math.min(x0, x);
				x1 = Math.max(x1, x);
				y1 = Math.max(y1, y);
			}
	return { x0: Number.isFinite(x0) ? x0 : 0, x1: Number.isFinite(x1) ? x1 : 0, y1 };
}

/**
 * @typedef {'stead' | 'camp' | 'outpost' | 'hamlet' | 'village' | 'hold' | 'town' | 'city' | 'capital' | 'freeport'} Tier
 * @typedef {{
 *   label: string, pop: string, note: string,
 *   rx: number, ry: number,    building area (the wall sits ~20–30% outside it)
 *   n: number,                 ordinary dwellings, before the culture's scale
 *   rank: number,              -1 below village · 0 village · 1 town · 2 city · 3 capital
 *   walls: 'none' | 'village' | 'outpost' | 'fortified' | 'culture',
 *   shrine: 'none' | 'tower' | 'full',
 *   keep?: boolean,            always has a keep, whatever the culture says
 *   extras: string[],          special buildings, see EXTRAS
 *   harbor?: boolean,
 *   wallH?: number, towers?: number,   wall height; ring-tower share of the culture's count
 * }} Template
 */

/**
 * Settlement templates, sized from the YRT "Settlement: Type" oracle
 * (extensions/yrt/oracles/settlement-type.json) and its map-placed tiers.
 * @type {Record<Tier, Template>}
 */
export const TEMPLATES = {
	stead: {
		label: 'Stead',
		pop: '~5–20',
		note: 'Tiny, self-sustaining: a few family dwellings',
		rx: 28,
		ry: 9,
		n: 2,
		rank: -1,
		walls: 'none',
		shrine: 'none',
		extras: ['barn', 'well'],
	},
	camp: {
		label: 'Camp',
		pop: '~20–200 (transient)',
		note: 'Temporary: nomads, soldiers or seasonal workers',
		rx: 0,
		ry: 0,
		n: 0,
		rank: -1,
		walls: 'none',
		shrine: 'none',
		extras: [],
	},
	outpost: {
		label: 'Outpost',
		pop: '20–100',
		note: 'Border or frontier post for defence, trade or exploration',
		rx: 22,
		ry: 8,
		n: 1,
		rank: -1,
		walls: 'outpost',
		shrine: 'none',
		extras: ['watchtower', 'barracks'],
		wallH: 0.9,
		towers: 0,
	},
	hamlet: {
		label: 'Hamlet',
		pop: '20–100',
		note: 'A few homes, limited services, informal leadership',
		rx: 24,
		ry: 9,
		n: 3,
		rank: -1,
		walls: 'none',
		shrine: 'tower',
		extras: ['well'],
	},
	village: {
		label: 'Village',
		pop: '100–600',
		note: 'Communal buildings and recognised leadership',
		rx: 30,
		ry: 11,
		n: 4,
		rank: 0,
		walls: 'village',
		shrine: 'full',
		extras: ['well', 'tavern', 'windmill'],
	},
	hold: {
		label: 'Hold',
		pop: '600–2,500',
		note: 'Large and fortified, with diverse trades',
		rx: 34,
		ry: 12,
		n: 4,
		rank: 1,
		walls: 'fortified',
		shrine: 'full',
		keep: true,
		extras: ['barracks', 'workshop', 'barn'],
		wallH: 1.15,
		towers: 0.75,
	},
	town: {
		label: 'Town',
		pop: '600–2,500',
		note: 'Established market town (Termin, Sveba)',
		rx: 38,
		ry: 13,
		n: 5,
		rank: 1,
		walls: 'culture',
		shrine: 'full',
		extras: ['tavern', 'warehouse'],
		towers: 0.5,
	},
	city: {
		label: 'City',
		pop: '2,500–6,000',
		note: 'Ostrea, Piscis, Fluenti, Materton, Mons',
		rx: 48,
		ry: 17,
		n: 8,
		rank: 2,
		walls: 'culture',
		shrine: 'full',
		extras: ['tavern', 'warehouse', 'workshop'],
		wallH: 1.2,
		towers: 1,
	},
	capital: {
		label: 'Capital',
		pop: '6,000–10,000',
		note: 'Seat of a country (Typpe)',
		rx: 58,
		ry: 21,
		n: 11,
		rank: 3,
		walls: 'culture',
		shrine: 'full',
		keep: true,
		extras: ['barracks', 'tavern', 'warehouse', 'workshop'],
		wallH: 1.35,
		towers: 1.5,
	},
	freeport: {
		label: 'Freeport',
		pop: '~15,900',
		note: 'Sui generis: bigger than everything, and fed by ship (always has a harbour)',
		rx: 62,
		ry: 22,
		n: 11,
		rank: 3,
		walls: 'culture',
		shrine: 'full',
		harbor: true,
		extras: ['warehouse', 'warehouse', 'warehouse', 'tavern', 'workshop', 'workshop'],
		wallH: 1.3,
		towers: 1.25,
	},
};

/** Special buildings a template can call for. @type {Record<string, (D: Design) => import('./render.mjs').Part[]>} */
const EXTRAS = {
	barn: (D) => sideHouse(D, { seed: 21, kind: 'barn' }),
	tavern: (D) => sideHouse(D, { seed: 22, kind: 'tavern' }),
	barracks: (D) => sideHouse(D, { seed: 23, kind: 'barracks' }),
	warehouse: (D) => sideHouse(D, { seed: 24, kind: 'warehouse' }),
	workshop: (D) => sideHouse(D, { seed: 25, kind: 'workshop' }),
	windmill: (D) => windmill(D),
	well: (D) => well(D),
	watchtower: (D) =>
		roundTower(D, { r: 6, h: 34, roof: D.towerRoof === 'onion' ? 'onion' : 'crenel' }),
};
const EXTRA_SCALE = /** @type {Record<string, number>} */ ({
	well: 1.6,
	windmill: 0.9,
	watchtower: 0.9,
});

/**
 * Which wall a template gets: the drawing override wins; otherwise the
 * template's rule applied to the culture's own wall.
 * @param {Template} T
 * @param {Walls} walls
 * @param {Design} D
 * @returns {Exclude<Walls, 'auto'>}
 */
function wallFor(T, walls, D) {
	if (walls !== 'auto') return walls;
	switch (T.walls) {
		case 'none':
		case 'village':
			return 'none';
		case 'outpost':
			// A frontier post is always enclosed; cultures without walls stake one.
			return D.wall === 'none' ? 'palisade' : D.wall;
		case 'fortified':
			return D.wall === 'none' || D.wall === 'hedge' ? 'stone' : D.wall;
		default:
			// D.wall may itself be 'none' — trolls, for one, build no walls.
			return D.wall;
	}
}

/**
 * Lay out a settlement of the given tier, back → front.
 * @param {Tier} tier
 * @param {Design} D
 * `harbor: 'side'` puts the sea along the right of the settlement with a
 * pier and a caravel at dock (Freeport always has one).
 * `ruin` turns it into a ruin (see ruins3d.mjs).
 * @param {{walls?: Walls, seed?: number, harbor?: 'none' | 'side', ruin?: import('./ruins3d.mjs').RuinOptions | null}} [o]
 * @returns {Placed[]}
 */
export function settlement(tier, D, o = {}) {
	const T = TEMPLATES[tier];
	if (tier === 'camp') return camp(D).items;
	const r = rng((o.seed ?? 1) * 7919 + Object.keys(TEMPLATES).indexOf(tier));
	const wall = wallFor(T, o.walls ?? 'auto', D);
	const { rx, ry, rank } = T;
	// The wall encloses the building area with room to spare.
	const wrx = rx * 1.2,
		wry = ry * 1.3;
	const square = D.wallShape === 'square';
	const { W, dv } = squareFootprint(wrx, wry);
	const hasMarket = rank >= 0 && (D.market === 'all' || (D.market === 'town' && rank >= 1));
	const hasKeep =
		T.keep ||
		(rank >= 0 &&
			(D.keep === 'all' || (D.keep === 'town' && rank >= 1) || (D.keep === 'city' && rank >= 2)));
	/**
	 * Everything that stands inside the walls, measured so it can be packed
	 * into rows: horizontal extent and height in world units, after scale.
	 * @typedef {{pieces: Placed[], ground?: Placed, x0: number, x1: number, h: number}} Item
	 * @type {Item[]}
	 */
	const items = [];
	const add = (/** @type {import('./render.mjs').Part[]} */ piece, /** @type {number} */ s) => {
		const b = extent(piece);
		items.push({ pieces: [{ piece, s }], x0: b.x0 * s, x1: b.x1 * s, h: b.y1 * s });
	};
	// Bigger builders (giants) put up fewer, larger buildings.
	const count = Math.max(1, Math.round(T.n / D.scale));
	for (let i = 0; i < count; i++) add(house(D, r, 14 + r() * 8, rank >= 1), 0.85 * D.scale);
	for (const key of T.extras)
		add(EXTRAS[key](D), (EXTRA_SCALE[key] ?? 0.85) * (key === 'well' ? 1 : D.scale));
	const towerH = 20 + 4 * Math.max(0, rank + 1);
	// No church and no holy symbol: no bell tower either (trolls, giants).
	if (T.shrine !== 'none' && (D.church || D.symbol !== 'none')) {
		if (D.church && T.shrine === 'full')
			add(church(D, { w: rank > 0 ? 26 : 20, seed: 3 }), rank >= 2 ? 0.9 : rank > 0 ? 0.8 : 0.72);
		else add(squareTower(D, { finial: true, w: rank > 0 ? 9 : 8, h: towerH }), 0.9);
	}
	if (hasKeep) add(keep(D), rank >= 3 ? 1.05 : rank === 2 ? 0.9 : 0.75);
	// A lone city watchtower only where the culture fortifies at all.
	else if (rank >= 2 && D.wall !== 'none') add(roundTower(D, { r: 6, h: 40 }), 0.9);
	/** The market square is held back and set in the middle of town. @type {Item | null} */
	let marketItem = null;
	if (hasMarket) {
		const mrx = rank >= 2 ? 17 : 14;
		const m = market(D, { rx: mrx, ry: rank >= 2 ? 6.5 : 5.5 });
		marketItem = { pieces: m.items, ground: { piece: m.ground }, x0: -mrx - 1, x1: mrx + 1, h: 7 };
	}

	// Rows from back to front, each with its centre line and usable width
	// (a round wall is narrower toward its back and front).
	const rowsFor = (/** @type {number} */ n) =>
		Array.from({ length: n }, (_, k) => {
			const f = n === 1 ? 0.5 : k / (n - 1); // 0 = back … 1 = front
			if (square) {
				const t = 0.8 - f * 0.66;
				return { y: t * dv[1] + 1, cx: t * dv[0], half: W / 2 - 3 };
			}
			const y = wry * (0.5 - f * 1.14);
			return { y, cx: 0, half: Math.max(6, wrx * Math.sqrt(Math.max(0, 1 - (y / wry) ** 2)) - 3) };
		});
	const SPACE = 2;
	const width = (/** @type {Item} */ it) => it.x1 - it.x0 + SPACE;
	const total = items.reduce((t, it) => t + width(it), 0) + (marketItem ? width(marketItem) : 0);
	// As few rows as will hold everything, up to six.
	let n = 1;
	while (n < 6 && rowsFor(n).reduce((c, row) => c + row.half * 2, 0) < total) n++;
	const rows = rowsFor(n);
	const capacity = rows.reduce((c, row) => c + row.half * 2, 0);
	// Tallest first, so they land in the back rows; fill each row to the
	// same share of its width so no row is crammed while another is empty.
	items.sort((p, q) => q.h - p.h);
	/** @type {Item[][]} */
	const assigned = rows.map(() => []);
	let k = 0,
		used = 0;
	for (const it of items) {
		const target = rows[k].half * 2 * Math.min(1, total / capacity);
		if (k < n - 1 && used > 0 && used + width(it) / 2 > target) {
			k++;
			used = 0;
		}
		assigned[k].push(it);
		used += width(it);
	}
	// The market goes in the centre of the middle row, clear of the gate.
	const midRow = Math.floor((n - 1) / 2);
	/** @type {Placed[]} */
	const inside = [];
	/** @type {Placed[]} */
	const ground = [];
	// Water-dwellers (merrow) build in a lagoon.
	if (D.ground === 'water')
		ground.push({
			piece: lagoon(wrx * 1.15, wry * 1.25),
			x: square ? dv[0] * 0.5 : 0,
			y: square ? dv[1] * 0.5 : 0,
		});
	rows.forEach((row, ri) => {
		const list = assigned[ri];
		// Shuffle within the row so heights don't step monotonically.
		for (let i = list.length - 1; i > 0; i--) {
			const j = Math.floor(r() * (i + 1));
			[list[i], list[j]] = [list[j], list[i]];
		}
		if (marketItem && ri === midRow) list.splice(Math.floor(list.length / 2), 0, marketItem);
		if (!list.length) return;
		const sum = list.reduce((t, it) => t + width(it), 0);
		// Even gaps; if the row is over-full, the overlap is shared evenly too.
		const gap = (row.half * 2 - sum) / (list.length + 1);
		let x = row.cx - row.half + gap;
		for (const it of list) {
			const jx = (r() - 0.5) * Math.min(Math.max(gap, 0) * 0.5, 2),
				jy = (r() - 0.5) * 1.2;
			const ox = x + SPACE / 2 - it.x0 + jx,
				oy = row.y + jy;
			for (const p of it.pieces) inside.push({ ...p, x: (p.x ?? 0) + ox, y: (p.y ?? 0) + oy });
			if (it.ground) ground.push({ ...it.ground, x: ox, y: oy });
			x += width(it) + gap;
		}
	});
	inside.sort((a, b) => (b.y ?? 0) - (a.y ?? 0));
	const port =
		T.harbor || (o.harbor === 'side' && rank >= 0)
			? harbor(D, wrx, wry, square ? W / 2 + dv[0] * 0.4 : wrx, square ? dv[1] * 0.4 : 0)
			: { water: [], piers: [] };
	/** @param {import('./ruins3d.mjs').RuinPlaced[]} list */
	const finish = (list) => (o.ruin ? ruinPlaced(list, { ...o.ruin, seed: o.seed ?? 1 }) : list);
	if (wall === 'none') return finish([...port.water, ...ground, ...inside, ...port.piers]);
	const ring = ringWall(D, {
		rx: wrx,
		ry: wry,
		h: 9 * (T.wallH ?? 1),
		type: wall,
		shape: D.wallShape,
		towers: Math.round(D.wallTowers * (T.towers ?? 0.5)),
	});
	// The enclosure's wall faces breach rather than crumble (towers crumble).
	const faces = square ? 2 : 1;
	const mark = (/** @type {Placed[]} */ list) =>
		list.map((it, i) => (i < faces ? { ...it, wall: true } : it));
	return finish([
		...port.water,
		...mark(ring.back),
		...ground,
		...inside,
		...mark(ring.front),
		...port.piers,
	]);
}

/**
 * Harbour along the right side of a settlement: a round sea, a timber pier
 * running out from the wall line, and a caravel moored alongside it.
 * @param {Design} D
 * @param {number} wrx
 * @param {number} wry
 * @param {number} shoreX where the town's right edge meets the water
 * @param {number} shoreY the depth of that edge
 * @returns {{water: Placed[], piers: Placed[]}}
 */
function harbor(D, wrx, wry, shoreX, shoreY) {
	const ship = Math.min(1.9, Math.max(1.2, wrx / 34));
	// Just enough sea to hold the pier and the ship: a pier about the
	// ship's length, the ship moored behind it, and a margin of water round both.
	const len = 25 * ship,
		py = shoreY - wry * 0.4,
		sx = shoreX + len * 0.55,
		sy = py + 5.5;
	const cx = shoreX + len * 0.55,
		cy = py + 2,
		rx = len * 0.62 + 6,
		ry = 9 + ship * 1.5;
	/** @type {import('./geom.mjs').Poly} */
	const sea = [];
	for (let i = 0; i < 48; i++) {
		const a = (i / 48) * Math.PI * 2;
		sea.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
	}
	/** @type {import('./render.mjs').Line[]} */
	const waves = [];
	const r = rng(31);
	for (let i = 0; i < 12; i++) {
		const a = r() * Math.PI * 2,
			d = 0.35 + r() * 0.5;
		const x = cx + Math.cos(a) * rx * d,
			y = cy + Math.sin(a) * ry * d;
		waves.push({
			pts: [
				[x - 2.2, y],
				[x - 1.1, y + 0.5],
				[x, y],
				[x + 1.1, y + 0.5],
				[x + 2.2, y],
			],
			w: 0.5,
		});
	}
	return {
		water: [{ piece: [{ solid: [sea], role: 'water', lines: waves, terrain: true }] }],
		piers: [
			// Moored on the far side of the pier, so the pier runs in front of her hull.
			{ piece: caravel(D), x: sx, y: sy, s: ship, ship: true },
			{ piece: pier(len), x: shoreX - 3, y: py },
		],
	};
}

/** Single pieces for the reference row. @param {Design} D @returns {[string, Placed[]][]} */
export function pieces(D) {
	return [
		['Gable house', [{ piece: gableHouse(D, { seed: 4 }) }]],
		['Side house', [{ piece: sideHouse(D, { seed: 5 }) }]],
		['Round tower', [{ piece: roundTower(D) }]],
		['Bell tower', [{ piece: squareTower(D, { finial: true }) }]],
		['Church', [{ piece: church(D) }]],
		['Keep', [{ piece: keep(D) }]],
		[
			'Market',
			(() => {
				const m = market(D);
				return [{ piece: m.ground }, ...m.items];
			})(),
		],
		['Longhouse', [{ piece: sideHouse(D, { seed: 8, kind: 'longhouse' }) }]],
		['Windmill', [{ piece: windmill(D) }]],
		['Townhouse', [{ piece: townhouse(D) }]],
		['Barn', [{ piece: sideHouse(D, { seed: 9, kind: 'barn' }) }]],
		['Tavern', [{ piece: sideHouse(D, { seed: 10, kind: 'tavern' }) }]],
		['Barracks', [{ piece: sideHouse(D, { seed: 11, kind: 'barracks' }) }]],
		['Water mill', [{ piece: sideHouse(D, { seed: 12, kind: 'mill' }) }]],
		['Camp', camp(D).items],
		['Mine', [{ piece: mine(D) }]],
		['Well', [{ piece: well(D), s: 2.2 }]],
		['Lighthouse', [{ piece: lighthouse(D) }]],
		['Caravel', [{ piece: caravel(D) }]],
		['Warehouse', [{ piece: sideHouse(D, { seed: 6, kind: 'warehouse' }) }]],
		['Workshop', [{ piece: sideHouse(D, { seed: 7, kind: 'workshop' }) }]],
	];
}
