// =============================================================================
// Settlement kit — 3/4-view layouts
//
// Settlement templates (stead → freeport, from the YRT settlement-type
// oracle) laid out from the pieces3d.js pieces for one culture
// (`Design`). `walls` overrides the ring wall; 'auto' follows each
// template's rule applied to the culture's own wall type.
// =============================================================================

import { rng } from './geom.js';
import { ruinPlaced } from './ruins3d.js';
import {
	belfry,
	camp,
	caravel,
	cathedral,
	church,
	clocktower,
	gableHouse,
	gatehouse,
	keep,
	lagoon,
	lighthouse,
	market,
	mine,
	moundHut,
	onStilts,
	pavilion,
	pier,
	ringWall,
	roundHut,
	roundTower,
	sideHouse,
	squareFootprint,
	stiltHut,
	tent,
	townhouse,
	wallSegment,
	well,
	witchHut,
	windmill,
} from './pieces3d.js';

/** @typedef {import('./pieces3d.js').Design} Design */
/** @typedef {import('./pieces3d.js').Placed} Placed */
/** @typedef {'auto' | 'none' | 'stone' | 'palisade' | 'earth' | 'hedge' | 'bone' | 'reef'} Walls */

/**
 * Per-building Design jitter: each house re-rolls a few visual knobs
 * (pitch, concave, flourish, and 15% of the time window / door style)
 * within a small range of the culture's base. The culture's enum choices
 * (houseForm, towerRoof, etc.) still dominate. Keeps a row of houses from
 * looking like 10 identical copies.
 * @param {Design} D
 * @param {() => number} r
 * @returns {Design}
 */
function jitterDesign(D, r) {
	const clamp = (/** @type {number} */ x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
	const WINDOWS = /** @type {Design['window'][]} */ ([
		'square',
		'arched',
		'slit',
		'round',
		'lancet',
	]);
	const DOORS = /** @type {Design['door'][]} */ ([
		'arched',
		'arched',
		'arched',
		'square',
		'lancet',
	]);
	return {
		...D,
		pitch: clamp(D.pitch + (r() - 0.5) * 0.3, 0.4, 1.2),
		concave: clamp(D.concave + (r() - 0.5) * 0.08, 0, 0.3),
		flourish: clamp(D.flourish + (r() - 0.5) * 0.2),
		window: r() < 0.15 ? WINDOWS[Math.floor(r() * WINDOWS.length)] : D.window,
		door: r() < 0.15 ? DOORS[Math.floor(r() * DOORS.length)] : D.door,
	};
}

/**
 * A building's own look in a mixed culture — a freeport's patchwork of
 * builders. With the culture's `variety` as its chance, a building rolls
 * its own tower cap, crenellated top, corbel, steeple shape, roof pitch and
 * sweep, storeys, windows and doors instead of the culture's (and house()
 * then rolls a house type from MIXED_HOUSES). At `variety` 0 it
 * draws no random numbers, so an unmixed culture lays out as it always has.
 * @param {Design} D
 * @param {() => number} r
 * @returns {Design}
 */
function mixDesign(D, r) {
	if (!(D.variety > 0) || r() >= D.variety) return D;
	const pick = (/** @type {any[]} */ xs) => xs[Math.floor(r() * xs.length)];
	const roof = /** @type {Design['towerRoof']} */ (
		pick(['none', 'cone', 'cone', 'onion', 'dome', 'lancet'])
	);
	return {
		...D,
		towerRoof: roof,
		towerCrenel: roof === 'none' || r() < 0.4,
		towerCorbel: r() < 0.5 ? 0 : 0.1 + r() * 0.25,
		steeple: r() < 0.4 ? 'round' : 'square',
		spire: 1.4 + r() * 1.6,
		pitch: 0.45 + r() * 0.7,
		concave: r() < 0.6 ? 0 : 0.05 + r() * 0.2,
		gable: r(),
		window: pick(['square', 'arched', 'slit', 'round', 'lancet']),
		door: pick(['arched', 'square', 'lancet']),
		masonry: r() < 0.4,
		storeys: r(),
	};
}

/** House types a mixed culture's builders choose among (gable-front and
 *  side-on houses twice as often as the rest). */
const MIXED_HOUSES = /** @type {const} */ ([
	'gable',
	'gable',
	'side',
	'side',
	'townhouse',
	'longhouse',
	'hut',
	'dome',
]);

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
	const own = mixDesign(D, r);
	const mixed = own !== D;
	D = jitterDesign(own, r);
	const seed = Math.floor(r() * 1e6);
	if (!trade || r() >= D.industry) {
		// A mixed culture's builder picks the type of house too.
		if (mixed) {
			const kind = MIXED_HOUSES[Math.floor(r() * MIXED_HOUSES.length)];
			if (kind === 'townhouse') return townhouse(D, { floors: 2 + Math.floor(r() * 2) });
			if (kind === 'longhouse') return sideHouse(D, { w: w * 1.55, seed, kind: 'longhouse' });
			if (kind === 'hut') return roundHut(D, { r: w * 0.32 });
			if (kind === 'dome') return gableHouse({ ...D, towerRoof: 'dome' }, { w: w * 0.75, seed });
			const flat = D.towerRoof === 'dome' ? { ...D, towerRoof: /** @type {const} */ ('cone') } : D;
			return kind === 'gable'
				? gableHouse(flat, { w: w * 0.75, seed })
				: sideHouse(flat, { w, seed });
		}
		if (D.houseForm === 'round') return roundHut(D, { r: w * 0.32 });
		if (D.houseForm === 'mound') return moundHut(D, { r: w * 0.42 });
		if (D.houseForm === 'stilt') return stiltHut(D, { r: w * 0.3 });
		// Timber cultures can mix in round huts and Norse longhouses.
		if (r() < D.huts) return roundHut(D, { r: w * 0.32 });
		if (r() < D.longhouse) return sideHouse(D, { w: w * 1.55, seed, kind: 'longhouse' });
	} else return sideHouse(D, { w: w + 8, seed, kind: r() < 0.5 ? 'warehouse' : 'workshop' });
	// Dome culture: every dwelling is a dome house (sideHouse keeps its gable,
	// so always route through gableHouse where the dome branch lives).
	if (D.towerRoof === 'dome') return gableHouse(D, { w: w * 0.75, seed });
	return r() < D.gable ? gableHouse(D, { w: w * 0.75, seed }) : sideHouse(D, { w, seed });
}

/**
 * Horizontal extent and height of a piece (from its silhouettes), so a
 * layout can pack buildings by their real footprint.
 * @param {import('./render.js').Part[]} piece
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
 */
/**
 * A settlement template (one per tier).
 * @typedef {object} Template
 * @property {string} label
 * @property {string} pop
 * @property {string} note
 * @property {number} rx building area half-width (the wall sits ~20–30% outside it)
 * @property {number} ry building area half-depth
 * @property {number} n ordinary dwellings, before the culture's scale
 * @property {number} rank -1 below village · 0 village · 1 town · 2 city · 3 capital
 * @property {'none' | 'village' | 'outpost' | 'fortified' | 'culture'} walls
 * @property {'none' | 'tower' | 'full'} shrine
 * @property {boolean} [keep] always has a keep, whatever the culture says
 * @property {string[]} extras special buildings, see EXTRAS
 * @property {boolean} [harbor]
 * @property {number} [wallH] wall height
 * @property {number} [towers] ring-tower share of the culture's count
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

/** Special buildings a template can call for. @type {Record<string, (D: Design) => import('./render.js').Part[]>} */
const EXTRAS = {
	barn: (D) => sideHouse(D, { seed: 21, kind: 'barn' }),
	tavern: (D) => sideHouse(D, { seed: 22, kind: 'tavern' }),
	barracks: (D) => sideHouse(D, { seed: 23, kind: 'barracks' }),
	warehouse: (D) => sideHouse(D, { seed: 24, kind: 'warehouse' }),
	workshop: (D) => sideHouse(D, { seed: 25, kind: 'workshop' }),
	windmill: (D) => windmill(D),
	well: (D) => well(D),
	watchtower: (D) =>
		roundTower(D, { r: 6, h: 34, roof: D.towerRoof === 'onion' ? 'onion' : 'none' }),
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
 * `ruin` turns it into a ruin (see ruins3d.js).
 * `stilts` lifts every inside-the-walls piece onto a timber-post deck —
 * think a lagoon settlement over water or dune boardwalks over sand. The
 * ring wall and the ground stay on the ground.
 * @param {{walls?: Walls, seed?: number, harbor?: 'none' | 'side', ruin?: import('./ruins3d.js').RuinOptions | null, stilts?: boolean}} [o]
 * @returns {Placed[]}
 */
export function settlement(tier, D, o = {}) {
	const T = TEMPLATES[tier];
	if (tier === 'camp') return camp(D).items;
	const r = rng((o.seed ?? 1) * 7919 + Object.keys(TEMPLATES).indexOf(tier));
	const wall = wallFor(T, o.walls ?? 'auto', D);
	const { rx, ry, rank } = T;
	// The wall encloses the building area with room to spare — grown below
	// if the culture's buildings are too big for the template (trolls'
	// scale-1.7 barracks would otherwise burst out of an outpost's ring).
	let wrx = rx * 1.2,
		wry = ry * 1.3;
	const square = D.wallShape === 'square';
	let { W, dv } = squareFootprint(wrx, wry);
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
	const add = (/** @type {import('./render.js').Part[]} */ piece, /** @type {number} */ s) => {
		const b = extent(piece);
		items.push({ pieces: [{ piece, s }], x0: b.x0 * s, x1: b.x1 * s, h: b.y1 * s });
	};
	// Bigger builders (giants) put up fewer, larger buildings.
	const count = Math.max(1, Math.round(T.n / D.scale));
	for (let i = 0; i < count; i++) add(house(D, r, 14 + r() * 8, rank >= 1), 0.85 * D.scale);
	for (const key of T.extras) {
		// Cultures without trade or industry (trolls, giants, elves…) build no
		// warehouses or workshops, whatever the template's size calls for.
		if (D.industry === 0 && (key === 'warehouse' || key === 'workshop')) continue;
		add(EXTRAS[key](D), (EXTRA_SCALE[key] ?? 0.85) * (key === 'well' ? 1 : D.scale));
	}
	const towerH = 20 + 4 * Math.max(0, rank + 1);
	// No church and no holy symbol: no bell tower either (trolls, giants).
	if (T.shrine !== 'none' && (D.church || D.symbol !== 'none')) {
		if (D.church && T.shrine === 'full')
			add(
				church(mixDesign(D, r), { w: rank > 0 ? 26 : 20, seed: 3 }),
				rank >= 2 ? 0.9 : rank > 0 ? 0.8 : 0.72,
			);
		else add(belfry(mixDesign(D, r), { finial: true, w: rank > 0 ? 9 : 8, h: towerH }), 0.9);
	}
	if (hasKeep) add(keep(D), rank >= 3 ? 1.05 : rank === 2 ? 0.9 : 0.75);
	// Free-standing towers — towns (and holds) roll 1d2, cities and up 1d3,
	// walled or not. Heights vary so a skyline of towers doesn't read as
	// copies.
	if (rank >= 1) {
		const towers = 1 + Math.floor(r() * (rank >= 2 ? 3 : 2));
		for (let i = 0; i < towers; i++)
			add(roundTower(mixDesign(D, r), { r: 5 + r() * 1.5, h: 32 + r() * 14 }), 0.9);
	}
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
	const widest = Math.max(0, ...items.map(width), marketItem ? width(marketItem) : 0);
	// Grow the enclosure (keeping its proportions) until the widest building
	// fits its widest row and six rows hold everything; capped at 2×.
	for (let g = 0; g < 12; g++) {
		const rs = rowsFor(6);
		const roomiest = Math.max(...rs.map((row) => row.half * 2));
		if (roomiest >= widest && rs.reduce((c, row) => c + row.half * 2, 0) >= total) break;
		wrx *= 1.06;
		wry *= 1.06;
		({ W, dv } = squareFootprint(wrx, wry));
	}
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
	/** Ground points every placed building stands on (front corners and the
	 *  foot of its receding side) — the wall is fitted around these. @type {[number, number][]} */
	const footprint = [];
	// Perspective: back rows stay full size, front rows grow toward 1 +
	// PERSP_SPREAD. Shrinking the back instead would trim the icon's top
	// (the tallest buildings sit in back rows), and since line widths don't
	// scale with pieces the fitted icon would read heavier. One-row layouts
	// (steads, outposts) have no depth to convey.
	const PERSP_SPREAD = 0.18;
	const rowScaleFor = (/** @type {number} */ ri) => (n > 1 ? 1 + PERSP_SPREAD * (ri / (n - 1)) : 1);
	rows.forEach((row, ri) => {
		const list = assigned[ri];
		// Shuffle within the row so heights don't step monotonically.
		for (let i = list.length - 1; i > 0; i--) {
			const j = Math.floor(r() * (i + 1));
			[list[i], list[j]] = [list[j], list[i]];
		}
		if (marketItem && ri === midRow) list.splice(Math.floor(list.length / 2), 0, marketItem);
		if (!list.length) return;
		const rs = rowScaleFor(ri);
		const wScaled = (/** @type {Item} */ it) => (it.x1 - it.x0) * rs + SPACE;
		const sum = list.reduce((t, it) => t + wScaled(it), 0);
		// Even gaps; if the row is over-full, the overlap is shared evenly too.
		const gap = (row.half * 2 - sum) / (list.length + 1);
		let x = row.cx - row.half + gap;
		for (const it of list) {
			const jx = (r() - 0.5) * Math.min(Math.max(gap, 0) * 0.5, 2),
				jy = (r() - 0.5) * 1.2;
			const ox = x + SPACE / 2 - it.x0 * rs + jx,
				oy = row.y + jy;
			for (const p of it.pieces)
				inside.push({
					...p,
					x: (p.x ?? 0) * rs + ox,
					y: (p.y ?? 0) * rs + oy,
					s: (p.s ?? 1) * rs,
				});
			if (it.ground) ground.push({ ...it.ground, x: ox, y: oy, s: (it.ground.s ?? 1) * rs });
			footprint.push(
				[ox + it.x0 * rs, oy],
				[ox + it.x1 * rs, oy],
				[ox + it.x1 * rs, oy + (it.x1 - it.x0) * rs * 0.25],
			);
			x += wScaled(it) + gap;
		}
	});
	// Stilt-settlement: wrap every inside piece on its own deck + posts.
	if (o.stilts)
		for (let i = 0; i < inside.length; i++)
			inside[i] = { ...inside[i], piece: onStilts(inside[i].piece, D) };
	inside.sort((a, b) => (b.y ?? 0) - (a.y ?? 0));
	// Now the town is laid out, fit the wall to it: grow the enclosure
	// (keeping its proportions and centre) until every footprint point is
	// inside, with room for the wall's own thickness and towers.
	const fits = (/** @type {[number, number]} */ [x, y]) => {
		if (!square) return (x / (wrx - 3)) ** 2 + (y / (wry - 1.5)) ** 2 <= 1;
		const t = y / dv[1]; // 0 = front wall … 1 = back wall
		return t >= 0 && t <= 1 && Math.abs(x - t * dv[0]) <= W / 2 - 3;
	};
	if (wall !== 'none')
		for (let g = 0; g < 40 && !footprint.every(fits); g++) {
			wrx *= 1.04;
			wry *= 1.04;
			({ W, dv } = squareFootprint(wrx, wry));
		}
	const port =
		T.harbor || (o.harbor === 'side' && rank >= 0)
			? harbor(D, wrx, wry, square ? W / 2 + dv[0] * 0.4 : wrx, square ? dv[1] * 0.4 : 0)
			: { water: [], piers: [] };
	// Water-dwellers (merrow) build in a lagoon. The lagoon is the base
	// plane for everything else, so it goes with port.water at the back of
	// the stacking order — if it were in `ground` (drawn after `ring.back`)
	// the back half of the ring wall would be painted over by it.
	if (D.ground === 'water')
		port.water.push({
			piece: lagoon(wrx * 1.15, wry * 1.25),
			x: square ? dv[0] * 0.5 : 0,
			y: square ? dv[1] * 0.5 : 0,
		});
	/** @param {import('./ruins3d.js').RuinPlaced[]} list */
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
	return finish([...port.water, ...ring.back, ...ground, ...inside, ...ring.front, ...port.piers]);
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
	/** @type {import('./geom.js').Poly} */
	const sea = [];
	for (let i = 0; i < 48; i++) {
		const a = (i / 48) * Math.PI * 2;
		sea.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
	}
	/** @type {import('./render.js').Line[]} */
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

/**
 * Smallest drawn size (√(width × height) of the outline) for a standalone
 * piece. Line widths don't scale with a placed piece, so a small piece drawn
 * at 1× (a tent, a well) would read heavy-lined beside the rest once fitted
 * to the same icon frame; pieces under this size are scaled up to it.
 */
const MIN_PIECE_SIZE = 26;

/** Scale a placed group (sizes and positions) up to MIN_PIECE_SIZE. @param {Placed[]} items */
function normalized(items) {
	let x0 = Infinity,
		x1 = -Infinity,
		y0 = Infinity,
		y1 = -Infinity;
	for (const it of items)
		for (const p of it.piece)
			for (const poly of p.solid)
				for (const [x, y] of poly) {
					const s = it.s ?? 1,
						X = (it.x ?? 0) + x * s,
						Y = (it.y ?? 0) + y * s;
					x0 = Math.min(x0, X);
					x1 = Math.max(x1, X);
					y0 = Math.min(y0, Y);
					y1 = Math.max(y1, Y);
				}
	const size = Math.sqrt(Math.max(0, x1 - x0) * Math.max(0, y1 - y0));
	if (!(size > 0) || size >= MIN_PIECE_SIZE) return items;
	const k = MIN_PIECE_SIZE / size;
	return items.map((it) => ({
		...it,
		s: (it.s ?? 1) * k,
		x: (it.x ?? 0) * k,
		y: (it.y ?? 0) * k,
	}));
}

/** Single pieces for the reference row. @param {Design} D @returns {[string, Placed[]][]} */
export function pieces(D) {
	return /** @type {[string, Placed[]][]} */ (rawPieces(D)).map(([n, items]) => [
		n,
		normalized(items),
	]);
}

/** @param {Design} D @returns {[string, Placed[]][]} */
function rawPieces(D) {
	return [
		['Gable house', [{ piece: gableHouse(D, { seed: 4 }) }]],
		['Side house', [{ piece: sideHouse(D, { seed: 5 }) }]],
		['Round tower', [{ piece: roundTower(D) }]],
		['Bell tower', [{ piece: belfry(D, { finial: true }) }]],
		['Church', [{ piece: church(D) }]],
		['Keep', [{ piece: keep(D) }]],
		[
			'Market',
			(() => {
				// Drawn larger on its own so its line weight matches the other
				// single pieces (line widths don't scale with a placed piece).
				const m = market(D),
					S = 1.7;
				return [{ piece: m.ground }, ...m.items].map((it) => ({
					...it,
					s: (it.s ?? 1) * S,
					x: (it.x ?? 0) * S,
					y: (it.y ?? 0) * S,
				}));
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
		['Cathedral', [{ piece: cathedral(D) }]],
		['Clock tower', [{ piece: clocktower(D) }]],
		['Tent', [{ piece: tent(D) }]],
		['Pavilion', [{ piece: pavilion(D) }]],
		['Gatehouse', [{ piece: gatehouse(D) }]],
		['Wooden gate', [{ piece: gatehouse(D, { wood: true }) }]],
		['Witch hut', [{ piece: witchHut(D) }]],
		['Wall', [{ piece: wallSegment(D) }]],
		['Wall tower', [{ piece: wallSegment(D, { tower: true }) }]],
		['Palisade', [{ piece: wallSegment(D, { wood: true }) }]],
		['Dock', dock(D, { ship: true })],
		['Pier', dock(D)],
	];
}

/**
 * A harbour on its own: the round sea with a pier, and (with `ship`) the
 * caravel moored behind it.
 * @param {Design} D
 * @param {{ship?: boolean}} [o]
 * @returns {Placed[]}
 */
export function dock(D, o = {}) {
	const h = harbor(D, 34, 12, 0, 0);
	return [...h.water, ...h.piers.filter((p) => o.ship || !('ship' in p))];
}
