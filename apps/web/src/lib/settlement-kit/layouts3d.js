// =============================================================================
// Settlement kit — 3/4-view layouts
//
// Settlement templates (stead → freeport, from the YRT settlement-type
// oracle) laid out from the pieces3d.js pieces for one culture
// (`Design`). `walls` picks the ring wall (none unless asked) — the
// culture has no say in it, nor in the `ground` it stands on.
// =============================================================================

import { polyBounds, rng } from './geom.js';
import { ruinPlaced } from './ruins3d.js';
import {
	belfry,
	camp,
	caravel,
	cathedral,
	church,
	clocktower,
	gableHouse,
	groundPlane,
	keep,
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
/** @typedef {import('./geom.js').Pt} Pt */
/** @typedef {import('./geom.js').Poly} Poly */
/** @typedef {'none' | 'stone' | 'palisade' | 'earth' | 'hedge' | 'bone' | 'reef'} Walls */
/** A wall's shape — the recipe's, never the culture's. @typedef {'round' | 'square'} WallShape */

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
 * layout can pack buildings by their real footprint. Banners don't count:
 * a flag streams out over its neighbours rather than pushing them away,
 * and a tower's mustn't widen (or pull off-centre) the ground it stands on.
 * @param {import('./render.js').Part[]} piece
 */
function extent(piece) {
	const b = polyBounds(piece.flatMap((p) => (p.role === 'flag' ? [] : p.solid)));
	return {
		x0: Number.isFinite(b.x0) ? b.x0 : 0,
		x1: Number.isFinite(b.x1) ? b.x1 : 0,
		y1: Math.max(0, b.y1),
	};
}

/**
 * @typedef {'stead' | 'camp' | 'outpost' | 'hamlet' | 'village' | 'hold' | 'town' | 'city' | 'capital' | 'freeport'} Tier
 */
/**
 * A settlement template (one per tier).
 * @typedef {object} Template
 * @property {string} label
 * @property {string} pop
 * @property {number} rx building area half-width (the wall sits ~20–30% outside it)
 * @property {number} ry building area half-depth
 * @property {number} n ordinary dwellings, before the culture's scale
 * @property {number} rank -1 below village · 0 village · 1 town · 2 city · 3 capital
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
		rx: 28,
		ry: 9,
		n: 2,
		rank: -1,
		shrine: 'none',
		extras: ['barn', 'well'],
	},
	camp: {
		label: 'Camp',
		pop: '~20–200 (transient)',
		rx: 0,
		ry: 0,
		n: 0,
		rank: -1,
		shrine: 'none',
		extras: [],
	},
	outpost: {
		label: 'Outpost',
		pop: '20–100',
		rx: 22,
		ry: 8,
		n: 1,
		rank: -1,
		shrine: 'none',
		extras: ['watchtower', 'barracks'],
		wallH: 0.9,
		towers: 0,
	},
	hamlet: {
		label: 'Hamlet',
		pop: '20–100',
		rx: 24,
		ry: 9,
		n: 3,
		rank: -1,
		shrine: 'tower',
		extras: ['well'],
	},
	village: {
		label: 'Village',
		pop: '100–600',
		rx: 30,
		ry: 11,
		n: 4,
		rank: 0,
		shrine: 'full',
		extras: ['well', 'tavern', 'windmill'],
	},
	hold: {
		label: 'Hold',
		pop: '600–2,500',
		rx: 34,
		ry: 12,
		n: 4,
		rank: 1,
		shrine: 'full',
		keep: true,
		extras: ['barracks', 'workshop', 'barn'],
		wallH: 1.15,
		towers: 0.75,
	},
	town: {
		label: 'Town',
		pop: '600–2,500',
		rx: 38,
		ry: 13,
		n: 5,
		rank: 1,
		shrine: 'full',
		extras: ['tavern', 'warehouse'],
		towers: 0.5,
	},
	city: {
		label: 'City',
		pop: '2,500–6,000',
		rx: 48,
		ry: 17,
		n: 8,
		rank: 2,
		shrine: 'full',
		extras: ['tavern', 'warehouse', 'workshop'],
		wallH: 1.2,
		towers: 1,
	},
	capital: {
		label: 'Capital',
		pop: '6,000–10,000',
		rx: 58,
		ry: 21,
		n: 11,
		rank: 3,
		shrine: 'full',
		keep: true,
		extras: ['barracks', 'tavern', 'warehouse', 'workshop'],
		wallH: 1.35,
		towers: 1.5,
	},
	freeport: {
		label: 'Freeport',
		pop: '~15,900',
		rx: 62,
		ry: 22,
		n: 11,
		rank: 3,
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
/** What the extras are built of where it doesn't depend on the culture
 *  (the rest are stone if it builds in masonry, else timber).
 *  @type {Record<string, 'stone' | 'timber'>} */
const EXTRA_BUILT = { barracks: 'stone', windmill: 'stone', well: 'stone', watchtower: 'stone' };
const EXTRA_SCALE = /** @type {Record<string, number>} */ ({
	well: 1.6,
	windmill: 0.9,
	watchtower: 0.9,
});

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
 * `ground` is what it stands on (default none), `wallShape` its wall's
 * (round by default).
 * @param {{walls?: Walls, wallShape?: WallShape, seed?: number, harbor?: 'none' | 'side', ruin?: import('./ruins3d.js').RuinOptions | null, stilts?: boolean, ground?: Ground}} [o]
 * @returns {Placed[]}
 */
export function settlement(tier, D, o = {}) {
	const T = TEMPLATES[tier];
	if (tier === 'camp') return camp(D).items;
	const r = rng((o.seed ?? 1) * 7919 + Object.keys(TEMPLATES).indexOf(tier));
	const wall = o.walls ?? 'none';
	const { rx, ry, rank } = T;
	// The wall encloses the building area with room to spare — grown below
	// if the culture's buildings are too big for the template (trolls'
	// scale-1.7 barracks would otherwise burst out of an outpost's ring).
	let wrx = rx * 1.2,
		wry = ry * 1.3;
	const square = o.wallShape === 'square';
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
	/** @param {import('./render.js').Part[]} piece @param {number} s
	 *  @param {'stone' | 'timber'} built what it's built of (a ruin's stone outlasts its timber) */
	const add = (piece, s, built) => {
		const b = extent(piece);
		items.push({ pieces: [{ piece, s, built }], x0: b.x0 * s, x1: b.x1 * s, h: b.y1 * s });
	};
	/** A culture's everyday buildings: stone where it builds in masonry. */
	const common = D.masonry ? 'stone' : 'timber';
	// Bigger builders (giants) put up fewer, larger buildings.
	const count = Math.max(1, Math.round(T.n / D.scale));
	for (let i = 0; i < count; i++)
		add(
			house(D, r, 14 + r() * 8, rank >= 1),
			0.85 * D.scale,
			D.houseForm === 'timber' ? common : 'timber',
		);
	for (const key of T.extras) {
		// Cultures without trade or industry (trolls, giants, elves…) build no
		// warehouses or workshops, whatever the template's size calls for.
		if (D.industry === 0 && (key === 'warehouse' || key === 'workshop')) continue;
		add(
			EXTRAS[key](D),
			(EXTRA_SCALE[key] ?? 0.85) * (key === 'well' ? 1 : D.scale),
			EXTRA_BUILT[key] ?? common,
		);
	}
	const towerH = 20 + 4 * Math.max(0, rank + 1);
	// No church and no holy symbol: no bell tower either (trolls, giants).
	if (T.shrine !== 'none' && (D.church || D.symbol !== 'none')) {
		if (D.church && T.shrine === 'full')
			add(
				church(mixDesign(D, r), { w: rank > 0 ? 26 : 20, seed: 3 }),
				rank >= 2 ? 0.9 : rank > 0 ? 0.8 : 0.72,
				'stone',
			);
		else
			add(belfry(mixDesign(D, r), { finial: true, w: rank > 0 ? 9 : 8, h: towerH }), 0.9, 'stone');
	}
	if (hasKeep) add(keep(D), rank >= 3 ? 1.05 : rank === 2 ? 0.9 : 0.75, 'stone');
	// Free-standing towers — towns (and holds) roll 1d2, cities and up 1d3,
	// walled or not. Heights vary so a skyline of towers doesn't read as
	// copies.
	if (rank >= 1) {
		const towers = 1 + Math.floor(r() * (rank >= 2 ? 3 : 2));
		for (let i = 0; i < towers; i++)
			add(roundTower(mixDesign(D, r), { r: 5 + r() * 1.5, h: 32 + r() * 14 }), 0.9, 'stone');
	}
	/** The market square is held back and set in the middle of town. @type {Item | null} */
	let marketItem = null;
	if (hasMarket) {
		const mrx = rank >= 2 ? 17 : 14;
		const m = market(D, { rx: mrx, ry: rank >= 2 ? 6.5 : 5.5 });
		marketItem = {
			// Its stalls are timber.
			pieces: m.items.map((it) => ({ ...it, built: /** @type {const} */ ('timber') })),
			ground: { piece: m.ground },
			x0: -mrx - 1,
			x1: mrx + 1,
			h: 7,
		};
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
	// The ground it stands on — dirt, grass, farmland, sand, rock, snow,
	// ice, marsh, lava, or a lagoon. It's the base plane for everything
	// else, so it goes with port.water at the back of the stacking order —
	// if it were in `ground` (drawn after `ring.back`) the back half of the
	// ring wall would be painted over by it.
	const g = groundOf(o.ground);
	if (g) port.water.push(enclosureGround(g, square, wrx, wry));
	/** @param {import('./ruins3d.js').RuinPlaced[]} list */
	const finish = (list) => (o.ruin ? ruinPlaced(list, { ...o.ruin, seed: o.seed ?? 1 }) : list);
	if (wall === 'none') return finish([...port.water, ...ground, ...inside, ...port.piers]);
	const ring = ringWall(D, {
		rx: wrx,
		ry: wry,
		h: 9 * (T.wallH ?? 1),
		type: wall,
		shape: o.wallShape,
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
			{ piece: pier(len), x: shoreX - 3, y: py, built: 'timber' },
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

/** The bounds of a placed group's solids, as placed (banners aside).
 *  @param {Placed[]} items */
function placedBounds(items, flags = false) {
	let x0 = Infinity,
		x1 = -Infinity,
		y0 = Infinity,
		y1 = -Infinity;
	for (const it of items)
		for (const p of it.piece)
			// Banners don't count (see extent()), unless asked.
			for (const poly of p.role === 'flag' && !flags ? [] : p.solid)
				for (const [x, y] of poly) {
					const s = it.s ?? 1,
						X = (it.x ?? 0) + x * s,
						Y = (it.y ?? 0) + y * s;
					x0 = Math.min(x0, X);
					x1 = Math.max(x1, X);
					y0 = Math.min(y0, Y);
					y1 = Math.max(y1, Y);
				}
	return { x0, x1, y0, y1 };
}

/** A placed group's box as drawn, banners and all (y up) — what
 *  toLayeredSvg()'s `frame` takes. @param {Placed[]} items */
export function placedBox(items) {
	const box = placedBounds(items, true);
	return Number.isFinite(box.x0) ? box : null;
}

/** How much normalized() scales a placed group by (1: not at all).
 *  @param {Placed[]} items */
function normalScale(items) {
	const { x0, x1, y0, y1 } = placedBounds(items);
	const size = Math.sqrt(Math.max(0, x1 - x0) * Math.max(0, y1 - y0));
	return !(size > 0) || size >= MIN_PIECE_SIZE ? 1 : MIN_PIECE_SIZE / size;
}

/** Scale a placed group (sizes and positions) up to MIN_PIECE_SIZE.
 *  @param {Placed[]} items @param {number} [k] the scale, if already known */
function normalized(items, k = normalScale(items)) {
	if (k === 1) return items;
	return items.map((it) => ({
		...it,
		s: (it.s ?? 1) * k,
		x: (it.x ?? 0) * k,
		y: (it.y ?? 0) * k,
	}));
}

/**
 * A side-on house of a kind (sideHouse()), as a PIECES maker: its own seed
 * for the reference row, the caller's for a building.
 * @param {NonNullable<Parameters<typeof sideHouse>[1]>['kind']} kind
 * @param {number} seed0
 * @returns {(D: Design, seed?: number) => Placed[]}
 */
const side = (kind, seed0) => (D, s) => [{ piece: sideHouse(D, { seed: s ?? seed0, kind }) }];

/**
 * The single pieces, as [key, name, make]: the reference row (pieces()) and
 * the map's Buildings tab (building()). `make` draws the piece in a culture's
 * Design; a Buildings-tab `seed` varies a house's details and a tower's
 * height, and the reference row passes none. A null key is a reference
 * piece (drawn for the baked icons) the Buildings tab doesn't offer — a
 * camp is a Settlement-builder size.
 * @type {[string | null, string, (D: Design, seed?: number) => Placed[]][]}
 */
const PIECES = [
	['gable-house', 'Gable house', (D, s) => [{ piece: gableHouse(D, { seed: s ?? 4 }) }]],
	['side-house', 'Side house', side('house', 5)],
	[
		'round-tower',
		'Round tower',
		(D, s) => {
			if (s === undefined) return [{ piece: roundTower(D) }];
			// A settlement's free-standing towers vary in girth and height.
			const r = rng(s);
			return [{ piece: roundTower(D, { r: 5 + r() * 1.5, h: 32 + r() * 14 }) }];
		},
	],
	['bell-tower', 'Bell tower', (D) => [{ piece: belfry(D, { finial: true }) }]],
	['church', 'Church', (D, s) => [{ piece: church(D, { seed: s }) }]],
	['keep', 'Keep', (D) => [{ piece: keep(D) }]],
	[
		'market',
		'Market',
		(D) => {
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
		},
	],
	['longhouse', 'Longhouse', side('longhouse', 8)],
	['windmill', 'Windmill', (D) => [{ piece: windmill(D) }]],
	['townhouse', 'Townhouse', (D) => [{ piece: townhouse(D) }]],
	['barn', 'Barn', side('barn', 9)],
	['tavern', 'Tavern', side('tavern', 10)],
	['barracks', 'Barracks', side('barracks', 11)],
	['water-mill', 'Water mill', side('mill', 12)],
	[null, 'Camp', (D) => camp(D).items],
	['mine', 'Mine', (D) => [{ piece: mine(D) }]],
	['well', 'Well', (D) => [{ piece: well(D), s: 2.2 }]],
	['lighthouse', 'Lighthouse', (D) => [{ piece: lighthouse(D) }]],
	['warehouse', 'Warehouse', side('warehouse', 6)],
	['workshop', 'Workshop', side('workshop', 7)],
	['cathedral', 'Cathedral', (D) => [{ piece: cathedral(D) }]],
	['clock-tower', 'Clock tower', (D) => [{ piece: clocktower(D) }]],
	['tent', 'Tent', (D) => [{ piece: tent(D) }]],
	['pavilion', 'Pavilion', (D) => [{ piece: pavilion(D) }]],
	['witch-hut', 'Witch hut', (D) => [{ piece: witchHut(D) }]],
	['wall', 'Wall', (D) => [{ piece: wallSegment(D) }]],
];

/** Single pieces for the reference row. @param {Design} D @returns {[string, Placed[]][]} */
export function pieces(D) {
	return PIECES.map(([, name, make]) => [name, normalized(make(D))]);
}

/** The Buildings tab's buildings, as [key, name], in menu order. */
export const BUILDINGS = /** @type {[string, string][]} */ (
	PIECES.flatMap(([key, name]) => (key ? [[key, name]] : []))
);

/** Buildings never given a wall of their own: the wall, in its own stone. */
export const UNWALLED_BUILDINGS = new Set(['wall']);

/**
 * One building as a map icon — the Buildings tab: a single piece in the
 * culture's style, inside an optional wall of its own (`walls`, round or
 * `wallShape` square; never round UNWALLED_BUILDINGS), and optionally
 * ruined. `seed` rerolls it as a settlement varies its buildings: pitch,
 * sweep and ornament jittered, now and then other windows or doors, a
 * tower's height — and a mixed culture's builder rolls its own style.
 * @param {string} key one of BUILDINGS (unknown → a gable house)
 * @param {Design} D
 * `stilts` sets it on a timber-post deck, as a stilt settlement's
 * buildings are (never the Wall).
 * @param {{walls?: Walls, wallShape?: WallShape, seed?: number, ground?: Ground,
 *   stilts?: boolean, ruin?: import('./ruins3d.js').RuinOptions | null}} [o]
 * @returns {Placed[]}
 */
export function building(key, D, o = {}) {
	const seed = o.seed ?? 1;
	const r = rng(seed * 7919 + 4099);
	const own = jitterDesign(mixDesign(D, r), r);
	const walls = o.walls && o.walls !== 'none' ? o.walls : null;
	const make = (PIECES.find(([k]) => k === key) ?? PIECES[0])[2];
	let items = make(own, 1 + Math.floor(r() * 999_999));
	// On stilts: each part of it on a deck of its own, its terrain (a
	// market's square, a mine's mountain) left on the ground.
	if (o.stilts && !UNWALLED_BUILDINGS.has(key))
		items = items.map((it) => {
			const built = it.piece.filter((p) => !p.terrain);
			return built.length
				? { ...it, piece: [...it.piece.filter((p) => p.terrain), ...onStilts(built, own)] }
				: it;
		});
	const g = groundOf(o.ground);
	if (walls && !UNWALLED_BUILDINGS.has(key))
		items = enclosed(D, items, walls, o.wallShape === 'square', g);
	else if (g) {
		// A building stands on its ground — in a lagoon, on water — as a
		// settlement does (an enclosure lays its own, under the whole of it).
		const { x0, x1 } = placedExtent(items);
		// A narrow building (a tower) still gets a plane a fair width.
		const hw = Math.max(16, (x1 - x0) / 2 + 8);
		items = [{ piece: groundPlane(g, hw, hw * 0.4), x: (x0 + x1) / 2 }, ...items];
	}
	// A small building is scaled up to read with the rest — sized whole, so
	// its ruin is drawn at the same scale, not blown up as it crumbles.
	const k = normalScale(items);
	if (o.ruin) items = ruinPlaced(items, { ...o.ruin, seed, single: true });
	return normalized(items, k);
}

/** Horizontal extent of a placed group, banners aside (see extent()). @param {Placed[]} items */
function placedExtent(items) {
	let x0 = Infinity,
		x1 = -Infinity;
	for (const it of items) {
		const e = extent(it.piece),
			s = it.s ?? 1;
		x0 = Math.min(x0, (it.x ?? 0) + e.x0 * s);
		x1 = Math.max(x1, (it.x ?? 0) + e.x1 * s);
	}
	return Number.isFinite(x0) ? { x0, x1 } : { x0: 0, x1: 0 };
}

/**
 * A building inside a small wall of its own: a ring — or a square — fitted
 * round its footprint as a settlement's is,
 * with two towers where the wall type carries them. On water the lagoon is
 * a settlement's too: centred on the enclosure and sized to it, so a square
 * one's back walls and the building inside stand in the water, not behind
 * it.
 * @param {Design} D
 * @param {Placed[]} items
 * @param {Exclude<Walls, 'none'>} wall
 * @param {boolean} square a square enclosure, not a ring
 * @param {Exclude<Ground, 'none'> | null} g what it stands on
 * @returns {Placed[]}
 */
function enclosed(D, items, wall, square, g) {
	const { x0, x1 } = placedExtent(items);
	const w = x1 - x0;
	let wrx = Math.max(16, w / 2 + 6),
		wry = wrx * 0.42;
	let { W, dv } = squareFootprint(wrx, wry);
	// Where the building stands: a one-row settlement's row.
	const at = () =>
		square
			? [0.47 * dv[0] - (x0 + x1) / 2, 0.47 * dv[1] + 1]
			: [-(x0 + x1) / 2, wry * (0.5 - 0.57)];
	const fits = (/** @type {number} */ x, /** @type {number} */ y) => {
		if (!square) return (x / (wrx - 3)) ** 2 + (y / (wry - 1.5)) ** 2 <= 1;
		const t = y / dv[1]; // 0 = front wall … 1 = back wall
		return t >= 0 && t <= 1 && Math.abs(x - t * dv[0]) <= W / 2 - 3;
	};
	for (let g = 0; g < 40; g++) {
		const [ox, oy] = at();
		if (fits(x0 + ox, oy) && fits(x1 + ox, oy) && fits(x1 + ox, oy + w * 0.25)) break;
		wrx *= 1.04;
		wry *= 1.04;
		({ W, dv } = squareFootprint(wrx, wry));
	}
	const [ox, oy] = at();
	const ring = ringWall(D, {
		rx: wrx,
		ry: wry,
		h: 9,
		type: wall,
		shape: square ? 'square' : 'round',
		towers: Math.min(2, D.wallTowers),
	});
	return [
		...(g ? [enclosureGround(g, square, wrx, wry)] : []),
		...ring.back,
		...items.map((it) => ({ ...it, x: (it.x ?? 0) + ox, y: (it.y ?? 0) + oy })),
		...ring.front,
	];
}

/** @typedef {import('./pieces3d.js').Ground} Ground */

/**
 * The ground to lay, or null for none.
 * @param {Ground | undefined} ground
 * @returns {Exclude<Ground, 'none'> | null}
 */
function groundOf(ground) {
	return ground && ground !== 'none' ? ground : null;
}

/**
 * The ground a walled layout stands on — a lagoon, or a plane of another
 * ground type (groundPlane()). A ring gets an ellipse a little larger than
 * itself; a square enclosure — a parallelogram in this view, its sides
 * receding to the right — one wide and deep enough to take its front-left
 * and back-right corners too, so no wall stands off the ground.
 * @param {Exclude<Ground, 'none'>} kind
 * @param {boolean} square
 * @param {number} wrx
 * @param {number} wry
 * @returns {Placed}
 */
function enclosureGround(kind, square, wrx, wry) {
	if (!square) return { piece: groundPlane(kind, wrx * 1.15, wry * 1.25) };
	const { W, dv } = squareFootprint(wrx, wry);
	// An ellipse k× the parallelogram's half-width takes its far corners
	// (±half-width, ±half-depth) once its half-depth is ≥ that half-depth
	// ÷ √(1 − 1/k²) — 0.83 × the depth at k = 1.25; plus a margin, so the
	// corners stand in the water rather than on its edge.
	return {
		piece: groundPlane(kind, 1.25 * (W / 2 + dv[0] / 2) + 5, 0.9 * dv[1] + 5),
		x: dv[0] / 2,
		y: dv[1] / 2,
	};
}
