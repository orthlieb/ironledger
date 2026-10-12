// =============================================================================
// Settlement kit — wall patterns
//
// Material-specific repeating fills for wall-roled pieces. Baked into every
// generated SVG as <pattern> elements in <defs>; the wall polygon then uses
// fill="url(#pat-wall-stone)" (etc.) in place of a flat colour. This saves
// Clipper the work of unioning dozens of brick-course lines per piece, and
// gives every material a readable body texture.
//
// Every material has fixed colours of its own (MATERIALS), whatever the
// culture's palette — stone is always grey, a hedge green and brown, coral
// and bone white and grey, a palisade and an earth bank brown. A pattern
// definition is purely a string producer: given a Paint (the palette ink and
// the tile's light-or-shade `tone`) it returns the contents of a <pattern>
// element; patternDefs() adds the wrapper.
//
// Colours are baked into the pattern string at output time, so each render
// needs its own defs; pattern ids are suffixed per render (via `scope`) so
// two icons on the same page don't collide. The main app's map draws icons
// through the same defs (mapLayered.ts), so the kit, the app and the
// playground can never drift apart.
// =============================================================================

import { rng } from './geom.js';

/**
 * How a pattern is shaded: the culture palette's `ink`, and `tone`, which
 * maps a material colour to this tile's lighting — as-is on a lit face, mixed
 * toward ink on a shaded one. Values may be any CSS colour expression: hex in
 * generated files and the app, var() / color-mix() in the playground.
 * @typedef {{ink: string, tone: (colour: string) => string}} Paint
 */

/**
 * @typedef {object} PatternDef
 * @property {number} w tile width in world units
 * @property {number} h tile height in world units
 * @property {number} [scale] drawn this many times larger on the wall (a
 *   patternTransform, so strokes scale too); `w` / `h` are pre-scale
 * @property {(paint: Paint) => string} body inner XML for the `<pattern>`
 *   element (`<rect>`, `<path>`, `<circle>` …), with colours baked in
 */

/** Fixed material colours, whatever the culture's palette. */
export const MATERIALS = {
	stone: { body: '#C9C7C2', joint: '#86837D' },
	hedge: { body: '#7F9B5B', mass: '#5F7D43', leaf: '#4D6A33', rib: '#A9C283', cane: '#6E4B2C' },
	coral: { body: '#F0EEE8', wall: '#9E9B94', groove: '#C4C1BA' },
	bone: { body: '#EFEBE1', grain: '#B8B3A8' },
	wood: { body: '#A57549', seam: '#6A4426', grain: '#8A5E37' },
	earth: { body: '#8E6B46', dark: '#5E4429', light: '#B38E63' },
};

/** Grey running-bond masonry: offset courses, one horizontal line per course
 *  and staggered vertical joints. The stroke is 0.3 world units to match the
 *  kit's hairline details at marker size. */
/** @type {PatternDef} */
const stone = {
	w: 4.4,
	h: 4.8,
	scale: 2,
	body: ({ tone }) =>
		`<rect width="4.4" height="4.8" style="fill:${tone(MATERIALS.stone.body)}"/>` +
		`<path style="stroke:${tone(MATERIALS.stone.joint)};stroke-width:0.3;fill:none" d="` +
		// Horizontal courses at y=0 and y=2.4
		'M0 0h4.4M0 2.4h4.4' +
		// Vertical joints: course 0 at x=0, 4.4; course 1 at x=2.2
		'M0 0v2.4M4.4 0v2.4M2.2 2.4v2.4' +
		'"/>',
};

// ─── Hedge: brambles and leaves ──────────────────────────────────────────────
// The hedge tile is drawn procedurally, once at load: arching bramble canes
// (root → tip) studded with prickles that lean back toward the root, compound
// leaves of three or five pointed leaflets along them, and a scatter of faint
// leaflets behind for the hedge's leafy mass. Anything that crosses the tile
// edge is repeated a tile over, so the pattern runs on seamlessly.

/** @typedef {[number, number]} P2 */

/** Bramble tile size in world units (square, so it suits any face). */
const HEDGE = 9;

/** @param {number} n */
const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Point and unit tangent at t on a cubic Bézier.
 * @param {P2[]} c
 * @param {number} t
 * @returns {{pt: P2, tan: P2}}
 */
function bezier(c, t) {
	const u = 1 - t;
	const [p0, p1, p2, p3] = c;
	/** @type {(i: 0 | 1) => number} */
	const at = (i) =>
		u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i];
	/** @type {(i: 0 | 1) => number} */
	const dt = (i) =>
		3 * u * u * (p1[i] - p0[i]) + 6 * u * t * (p2[i] - p1[i]) + 3 * t * t * (p3[i] - p2[i]);
	const l = Math.hypot(dt(0), dt(1));
	return { pt: [at(0), at(1)], tan: [dt(0) / l, dt(1) / l] };
}

/**
 * Bézier parameters every `step` units of arc length along a cubic, skipping
 * the root and the very tip.
 * @param {P2[]} c
 * @param {number} step
 */
function stepsAlong(c, step) {
	/** @type {number[]} */
	const ts = [];
	let run = 0,
		prev = bezier(c, 0.08).pt;
	for (let t = 0.08; t <= 0.96; t += 0.002) {
		const { pt } = bezier(c, t);
		run += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
		prev = pt;
		if (run >= step) {
			ts.push(t);
			run = 0;
		}
	}
	return ts;
}

/**
 * Path data (absolute x y pairs only) plus a copy shifted a tile over for
 * every edge it comes within `pad` of (its stroke's half-width), so it
 * continues in the neighbouring tile.
 * @param {string} d
 * @param {number} size tile size
 * @param {number} [pad]
 * @returns {string}
 */
function wrapped(d, size, pad = 0) {
	const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
	const xs = nums.filter((_, i) => i % 2 === 0);
	const ys = nums.filter((_, i) => i % 2 === 1);
	/** @param {number[]} vs */
	const shifts = (vs) => [
		0,
		...(Math.min(...vs) - pad < 0 ? [size] : []),
		...(Math.max(...vs) + pad > size ? [-size] : []),
	];
	const dxs = shifts(xs),
		dys = shifts(ys);
	let out = '';
	for (const dx of dxs)
		for (const dy of dys) {
			let i = 0;
			out += d.replace(/-?\d+(\.\d+)?/g, (m) => String(r1(Number(m) + (i++ % 2 ? dy : dx))));
		}
	return out;
}

/** @param {P2[]} pts @returns {string} */
const pairs = (pts) => pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(' ');

/**
 * Pointed ovate leaflet from `o` along angle `a`: its blade and midrib.
 * @param {P2} o
 * @param {number} a radians
 * @param {number} len
 * @returns {{blade: string, rib: string}}
 */
function leaflet(o, a, len) {
	const c = Math.cos(a),
		s = Math.sin(a);
	/** @type {(p: P2) => P2} */
	const tr = ([x, y]) => [o[0] + x * c - y * s, o[1] + x * s + y * c];
	const w = len * 0.3;
	const P = /** @type {P2[]} */ ([
		[0, 0],
		[len * 0.15, -w],
		[len * 0.7, -w * 1.05],
		[len, 0],
		[len * 0.7, w * 1.05],
		[len * 0.15, w],
	]).map(tr);
	return {
		blade: `M${pairs([P[0]])}C${pairs([P[1], P[2], P[3]])}C${pairs([P[4], P[5], P[0]])}Z`,
		rib: `M${pairs([tr([len * 0.12, 0])])}L${pairs([tr([len * 0.8, 0])])}`,
	};
}

/** Draw the bramble tile's path data, layer by layer. */
function brambleTile() {
	const wrap = (/** @type {string} */ d) => wrapped(d, HEDGE, 0.15);
	// Root → tip; the second runs off the right edge, the third arches back
	// over the top edge, so canes cross the seams in both directions.
	/** @type {P2[][]} */
	const canes = [
		[
			[0.3, 8.6],
			[1.0, 2.6],
			[5.6, 1.6],
			[7.2, 5.6],
		],
		[
			[5.0, 9.4],
			[5.8, 5.6],
			[9.6, 4.6],
			[10.6, 7.8],
		],
		[
			[8.6, 3.6],
			[8.2, 0.0],
			[4.4, -0.8],
			[3.0, 1.8],
		],
		[
			[2.2, 9.6],
			[2.6, 7.4],
			[4.4, 6.8],
			[5.0, 8.0],
		],
	];
	let cane = '',
		thorns = '',
		leaves = '',
		ribs = '';
	canes.forEach((c, ci) => {
		cane += wrap(`M${pairs([c[0]])}C${pairs(c.slice(1))}`);
		// Prickles every 0.85 units, alternating sides, leaning back to the root.
		stepsAlong(c, 0.85).forEach((t, i) => {
			const { pt, tan } = bezier(c, t);
			const side = i % 2 ? 1 : -1;
			/** @type {(along: number, out: number) => P2} */
			const at = (along, out) => [
				pt[0] + tan[0] * along - tan[1] * side * out,
				pt[1] + tan[1] * along + tan[0] * side * out,
			];
			thorns += wrap(`M${pairs([at(-0.17, 0)])}L${pairs([at(-0.26, 0.42), at(0.17, 0)])}Z`);
		});
		// Compound leaves on short stalks: a five-leaflet one mid-cane, threes
		// either side (the low cane carries just one).
		(ci === 3 ? [0.55] : [0.3, 0.62, 0.9]).forEach((t, i) => {
			const { pt, tan } = bezier(c, t);
			const a0 = Math.atan2(tan[1], tan[0]) + ((ci + i) % 2 ? 0.9 : -0.9);
			/** @type {P2} */
			const stalk = [pt[0] + Math.cos(a0) * 0.35, pt[1] + Math.sin(a0) * 0.35];
			const fan = i === 1 ? [-1.3, -0.65, 0, 0.65, 1.3] : [-0.8, 0, 0.8];
			for (const da of fan) {
				const l = leaflet(stalk, a0 + da, 1.6 * (da === 0 ? 1 : 0.8 - Math.abs(da) * 0.1));
				leaves += wrap(l.blade);
				ribs += wrap(l.rib);
			}
		});
	});
	// The leafy mass behind: faint leaflets scattered at random.
	const rand = rng(7);
	let mass = '';
	for (let i = 0; i < 26; i++) {
		const o = /** @type {P2} */ ([rand() * HEDGE, rand() * HEDGE]);
		mass += wrap(leaflet(o, rand() * Math.PI * 2, 1.1 + rand() * 0.6).blade);
	}
	return { mass, leaves, ribs, cane, thorns };
}
const BRAMBLE = brambleTile();

/** Bramble hedge, green and brown: a leafy mass, compound leaves with pale
 *  midribs, and brown thorny canes arching through — see brambleTile(). */
/** @type {PatternDef} */
const hedge = {
	w: HEDGE,
	h: HEDGE,
	scale: 2,
	body: ({ tone }) => {
		const m = MATERIALS.hedge;
		return (
			`<rect width="${HEDGE}" height="${HEDGE}" style="fill:${tone(m.body)}"/>` +
			`<path style="fill:${tone(m.mass)};fill-opacity:0.6" d="${BRAMBLE.mass}"/>` +
			`<path style="fill:${tone(m.leaf)}" d="${BRAMBLE.leaves}"/>` +
			`<path style="stroke:${tone(m.rib)};stroke-width:0.1;fill:none;stroke-opacity:0.8" d="${BRAMBLE.ribs}"/>` +
			`<path style="stroke:${tone(m.cane)};stroke-width:0.26;fill:none;stroke-linecap:round" d="${BRAMBLE.cane}"/>` +
			`<path style="fill:${tone(m.cane)}" d="${BRAMBLE.thorns}"/>`
		);
	},
};

// ─── Reef: brain coral ───────────────────────────────────────────────────────
// A maze carved on a wrap-around grid by a randomized depth-first search —
// long winding corridors with few branches, like a brain coral's meanders.
// Nodes are jittered and every turn is smoothed into a curve; each corridor
// is drawn as an ink band with a wall-coloured core, so it reads as two thin
// walls with a faint groove between, tile edges included.

/** Brain-coral tile size in world units, and its maze grid. */
const CORAL = 12,
	CORAL_N = 8,
	CORAL_CELL = CORAL / CORAL_N,
	/** Corridor width as a share of the cell: neighbouring walls nearly touch. */
	CORAL_BAND = CORAL_CELL * 0.85;

/** The maze's centre-line path data. */
function brainCoralTile() {
	const N = CORAL_N,
		c = CORAL_CELL;
	const rand = rng(3);
	/** @type {P2[]} */
	const pos = [];
	for (let i = 0; i < N; i++)
		for (let j = 0; j < N; j++)
			pos.push([(i + 0.5 + (rand() - 0.5) * 0.45) * c, (j + 0.5 + (rand() - 0.5) * 0.45) * c]);
	/** Links per node: the neighbour and the tile shift that puts it alongside. */
	/** @type {{id: number, shift: P2}[][]} */
	const links = pos.map(() => []);
	const seen = new Set([0]);
	const stack = [0];
	while (stack.length) {
		const id = stack[stack.length - 1];
		const i = Math.floor(id / N),
			j = id % N;
		const open = /** @type {P2[]} */ ([
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1],
		])
			.map(([di, dj]) => {
				const ni = i + di,
					nj = j + dj;
				const wrapI = ni < 0 ? -CORAL : ni >= N ? CORAL : 0;
				const wrapJ = nj < 0 ? -CORAL : nj >= N ? CORAL : 0;
				return {
					id: ((ni + N) % N) * N + ((nj + N) % N),
					shift: /** @type {P2} */ ([wrapI, wrapJ]),
				};
			})
			.filter((o) => !seen.has(o.id));
		if (!open.length) {
			stack.pop();
			continue;
		}
		const o = open[Math.floor(rand() * open.length)];
		seen.add(o.id);
		links[id].push(o);
		links[o.id].push({ id, shift: [-o.shift[0], -o.shift[1]] });
		stack.push(o.id);
	}
	// Each node draws its half of every corridor out to the link midpoints:
	// a dead end straight, a turn as a curve, extra branches from its middle.
	let d = '';
	const wrap = (/** @type {string} */ path) => wrapped(path, CORAL, CORAL_BAND / 2 + 0.1);
	pos.forEach((p, id) => {
		const mids = links[id].map(
			({ id: q, shift }) =>
				/** @type {P2} */ ([(p[0] + pos[q][0] + shift[0]) / 2, (p[1] + pos[q][1] + shift[1]) / 2]),
		);
		if (mids.length === 1) {
			d += wrap(`M${pairs([p])}L${pairs([mids[0]])}`);
			return;
		}
		d += wrap(`M${pairs([mids[0]])}Q${pairs([p, mids[1]])}`);
		/** @type {P2} */
		const hub = [
			0.25 * mids[0][0] + 0.5 * p[0] + 0.25 * mids[1][0],
			0.25 * mids[0][1] + 0.5 * p[1] + 0.25 * mids[1][1],
		];
		for (const m of mids.slice(2)) d += wrap(`M${pairs([hub])}L${pairs([m])}`);
	});
	return d;
}
const CORAL_MAZE = brainCoralTile();

/** Brain coral, white and grey: winding double-walled corridors — see
 *  brainCoralTile(). */
/** @type {PatternDef} */
const reef = {
	w: CORAL,
	h: CORAL,
	scale: 2.5,
	body: ({ tone }) => {
		const m = MATERIALS.coral;
		const line = 'fill:none;stroke-linecap:round;stroke-linejoin:round';
		return (
			`<rect width="${CORAL}" height="${CORAL}" style="fill:${tone(m.body)}"/>` +
			`<path style="stroke:${tone(m.wall)};stroke-width:${r1(CORAL_BAND)};${line}" d="${CORAL_MAZE}"/>` +
			`<path style="stroke:${tone(m.body)};stroke-width:${r1(CORAL_BAND - 0.3)};${line}" d="${CORAL_MAZE}"/>` +
			`<path style="stroke:${tone(m.groove)};stroke-width:0.14;${line}" d="${CORAL_MAZE}"/>`
		);
	},
};

// ─── Palisade, earth bank, bone ──────────────────────────────────────────────

/** Palisade, brown: one stake per tile — a dark seam either side and a few
 *  grain strokes — so the pickets come from the fill, not from a Clipper
 *  stroke per stake. The wall's top edge carries the matching sharpened tips. */
/** @type {PatternDef} */
const wood = {
	w: 3.2,
	h: 6,
	body: ({ tone }) => {
		const m = MATERIALS.wood;
		return (
			`<rect width="3.2" height="6" style="fill:${tone(m.body)}"/>` +
			`<path style="stroke:${tone(m.grain)};stroke-width:0.18;fill:none;stroke-linecap:round" d="M1.2 0.4v2M2 3.1v2.4M0.9 4v1.3"/>` +
			`<path style="stroke:${tone(m.seam)};stroke-width:0.45;fill:none" d="M0 0v6M3.2 0v6"/>`
		);
	},
};

/**
 * Seamless speckles: `n` dots in two tones on a square tile, repeated across
 * any edge they overlap.
 * @param {number} size
 * @param {number} n
 * @param {number} seed
 */
function speckles(size, n, seed) {
	const rand = rng(seed);
	/** @type {string[]} */
	const dark = [];
	/** @type {string[]} */
	const light = [];
	/** Each speckle once, `[x, y, r, dark?]` — for ring walls (ringTextures.js). */
	/** @type {[number, number, number, boolean][]} */
	const dots = [];
	for (let i = 0; i < n; i++) {
		const x = rand() * size,
			y = rand() * size,
			r = 0.18 + rand() * 0.3;
		const isDark = rand() < 0.65;
		const out = isDark ? dark : light;
		dots.push([x, y, r, isDark]);
		for (const dx of [0, ...(x - r < 0 ? [size] : []), ...(x + r > size ? [-size] : [])])
			for (const dy of [0, ...(y - r < 0 ? [size] : []), ...(y + r > size ? [-size] : [])])
				out.push(`<circle cx="${r1(x + dx)}" cy="${r1(y + dy)}" r="${r1(r)}"/>`);
	}
	return { dark: dark.join(''), light: light.join(''), dots };
}
const DIRT = speckles(6, 18, 11);

/** Earth bank, brown: speckled dirt — dark grit and paler pebbles. */
/** @type {PatternDef} */
const earth = {
	w: 6,
	h: 6,
	body: ({ tone }) => {
		const m = MATERIALS.earth;
		return (
			`<rect width="6" height="6" style="fill:${tone(m.body)}"/>` +
			`<g style="fill:${tone(m.dark)}">${DIRT.dark}</g>` +
			`<g style="fill:${tone(m.light)}">${DIRT.light}</g>`
		);
	},
};

/** Bone's grain strokes and pores (`[x, y, r]`), in its 7-unit tile. */
const BONE_GRAIN = 'M0.6 1.4Q2 1 3.4 1.5M4.2 3.6Q5.4 3.2 6.5 3.8M1.2 5.4Q2.4 5 3.6 5.6';
/** @type {[number, number, number][]} */
const BONE_PORES = [
	[5.3, 1.2, 0.22],
	[2.2, 3.3, 0.18],
	[5.6, 5.9, 0.2],
];

/** Bone, white and grey: faint grain strokes and a few pores. */
/** @type {PatternDef} */
const bone = {
	w: 7,
	h: 7,
	body: ({ tone }) => {
		const m = MATERIALS.bone;
		return (
			`<rect width="7" height="7" style="fill:${tone(m.body)}"/>` +
			`<path style="stroke:${tone(m.grain)};stroke-width:0.18;fill:none;stroke-linecap:round" d="${BONE_GRAIN}"/>` +
			`<g style="fill:${tone(m.grain)}">${BONE_PORES.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`
		);
	},
};

// ─── Ring walls: the body alone ──────────────────────────────────────────────
// A ring wall curves away from the viewer, so a flat tile's courses can't
// follow it. Stone and palisade rings draw their courses / plank seams as
// lines that run round the ring (ringWall in pieces3d.js), and take these
// tiles for the body: the material's colour, and the planks' grain.

/** Ring-wall stone: the masonry's body, its courses drawn as lines. */
/** @type {PatternDef} */
const stoneRing = {
	w: 4,
	h: 4,
	body: ({ tone }) => `<rect width="4" height="4" style="fill:${tone(MATERIALS.stone.body)}"/>`,
};

/** Ring-wall palisade: the planks' body and grain, its seams drawn as lines. */
/** @type {PatternDef} */
const woodRing = {
	w: 3.2,
	h: 6,
	body: ({ tone }) => {
		const m = MATERIALS.wood;
		return (
			`<rect width="3.2" height="6" style="fill:${tone(m.body)}"/>` +
			`<path style="stroke:${tone(m.grain)};stroke-width:0.18;fill:none;stroke-linecap:round" d="M1.2 0.4v2M2 3.1v2.4M0.9 4v1.3"/>`
		);
	},
};

/** Ring-wall hedge: the leafy body — mass, leaves and midribs, which an
 *  irregular texture needn't bend — while the long bramble canes are drawn
 *  as lines round the ring (RING_TEXTURES), arching with the wall. */
/** @type {PatternDef} */
const hedgeRing = {
	w: HEDGE,
	h: HEDGE,
	scale: 2,
	body: ({ tone }) => {
		const m = MATERIALS.hedge;
		return (
			`<rect width="${HEDGE}" height="${HEDGE}" style="fill:${tone(m.body)}"/>` +
			`<path style="fill:${tone(m.mass)};fill-opacity:0.6" d="${BRAMBLE.mass}"/>` +
			`<path style="fill:${tone(m.leaf)}" d="${BRAMBLE.leaves}"/>` +
			`<path style="stroke:${tone(m.rib)};stroke-width:0.1;fill:none;stroke-opacity:0.8" d="${BRAMBLE.ribs}"/>`
		);
	},
};

/** Ring-wall coral: the white-and-grey body; the maze's grooves are drawn
 *  as lines round the ring (RING_TEXTURES). */
/** @type {PatternDef} */
const reefRing = {
	w: 4,
	h: 4,
	body: ({ tone }) => `<rect width="4" height="4" style="fill:${tone(MATERIALS.coral.body)}"/>`,
};

/**
 * The hedge and coral tiles' own path data, for ring walls that lay it
 * round the ring as lines (ringTextures.js): tile size in tile units, the
 * tile's patternTransform scale, and the paths.
 */
export const TILE_ART = {
	hedge: { tile: HEDGE, scale: 2, cane: BRAMBLE.cane },
	coral: { tile: CORAL, scale: 2.5, maze: CORAL_MAZE, band: CORAL_BAND },
	// A ring wall's dirt: its own wider speckle field (12 tile units at 2× =
	// 12 world units, 72 specks), so no small tile repeats in rows round it.
	earth: { tile: 12, scale: 2, dots: speckles(12, 72, 23).dots },
	bone: { tile: 7, scale: 1, grain: BONE_GRAIN, pores: BONE_PORES },
};

// ─── Ground planes ───────────────────────────────────────────────────────────
// What a settlement or building stands on (a recipe's `ground`): a plane under the
// whole of it (groundPlane() in pieces3d.js) in a fixed colour with its own
// texture, as the wall materials have. Water is the lagoon (the `water`
// role, with ink waves); 'none' draws no plane at all.

/** Ground colours, fixed like the wall materials'. */
export const GROUND_COLOURS = {
	dirt: { body: '#B39874', dark: '#8C7253', light: '#CDB693' },
	grass: { body: '#A9BA7C', blade: '#7A9455', light: '#C2D097' },
	farmland: {
		wheat: '#D8C27E',
		chaff: '#BFA45E',
		crop: '#A6B66F',
		row: '#7F9450',
		soil: '#A88A60',
		furrow: '#86693F',
		hedge: '#6F7A4A',
	},
	sand: { body: '#E6D3A1', grain: '#C9B07A', light: '#F2E5C4', ripple: '#CDB582' },
	rock: { body: '#B2ABA0', crack: '#827C71', pebble: '#9A9387', light: '#CDC7BD' },
	snow: { body: '#F2F5F7', drift: '#CCD7E1', speck: '#DCE4EB' },
	ice: { body: '#D3E6EF', crack: '#97B9CB', sheen: '#F5FAFC', deep: '#BCD6E3' },
	lava: { body: '#4B3B36', crust: '#3A2E2B', glow: '#D9542A', core: '#F5A03A' },
	marsh: { body: '#8F9A69', pool: '#8EAAB2', rim: '#6F8A86', reed: '#56633A', mud: '#76704F' },
};

/** `n` points in a `size` tile, `margin` clear of its edges — so whatever
 *  is drawn at them never crosses a seam. @param {number} size
 *  @param {number} n @param {number} seed @param {number} margin */
function scatter(size, n, seed, margin) {
	const rand = rng(seed);
	/** @type {[number, number][]} */
	const out = [];
	for (let i = 0; i < n; i++)
		out.push([
			r1(margin + rand() * (size - 2 * margin)),
			r1(margin + rand() * (size - 2 * margin)),
		]);
	return out;
}

const DIRT_GROUND = speckles(8, 20, 41);
/** Dirt: bare brown earth, speckled. @type {PatternDef} */
const dirtGround = {
	w: 8,
	h: 8,
	scale: 1.5,
	body: ({ tone }) => {
		const m = GROUND_COLOURS.dirt;
		return (
			`<rect width="8" height="8" style="fill:${tone(m.body)}"/>` +
			`<g style="fill:${tone(m.dark)}">${DIRT_GROUND.dark}</g>` +
			`<g style="fill:${tone(m.light)}">${DIRT_GROUND.light}</g>`
		);
	},
};

const GRASS_TUFTS = scatter(9, 6, 43, 1.3)
	.map(([x, y]) => `M${x} ${y}l-0.55 -1.1M${x} ${y}v-1.35M${x} ${y}l0.55 -1.1`)
	.join('');
const GRASS_LIGHT = speckles(9, 8, 47);
/** Grass: green sward with tufts of blades. @type {PatternDef} */
const grassGround = {
	w: 9,
	h: 9,
	scale: 1.5,
	body: ({ tone }) => {
		const m = GROUND_COLOURS.grass;
		return (
			`<rect width="9" height="9" style="fill:${tone(m.body)}"/>` +
			`<g style="fill:${tone(m.light)}">${GRASS_LIGHT.dark}${GRASS_LIGHT.light}</g>` +
			`<path style="stroke:${tone(m.blade)};stroke-width:0.24;fill:none;stroke-linecap:round" d="${GRASS_TUFTS}"/>`
		);
	},
};

/** Furrow lines across a field from x0 to x1, y0 to y1, `gap` apart. */
const furrows = (
	/** @type {number} */ x0,
	/** @type {number} */ x1,
	/** @type {number} */ y0,
	/** @type {number} */ y1,
	gap = 0.9,
) => {
	let d = '';
	for (let y = y0 + gap / 2; y < y1; y += gap) d += `M${r1(x0 + 0.3)} ${r1(y)}H${r1(x1 - 0.3)}`;
	return d;
};
/** Farmland: a patchwork of fields — wheat, a green crop in rows, ploughed
 *  soil — furrowed across (rows that run away from the viewer read as
 *  lines across in this view), with dark hedgerows between. @type {PatternDef} */
const farmGround = {
	w: 18,
	h: 10,
	// Fields larger than the other grounds' texture: a patchwork reads as
	// fields only when each is a good few houses wide.
	scale: 2.2,
	body: ({ tone }) => {
		const m = GROUND_COLOURS.farmland;
		/** @param {string} c @param {number} x @param {number} y @param {number} w @param {number} h */
		const field = (c, x, y, w, h) =>
			`<rect x="${x}" y="${y}" width="${w}" height="${h}" style="fill:${tone(c)}"/>`;
		/** @param {string} c @param {string} d @param {number} [w] */
		const lines = (c, d, w = 0.2) =>
			`<path style="stroke:${tone(c)};stroke-width:${w};fill:none;stroke-linecap:round" d="${d}"/>`;
		return (
			field(m.wheat, 0, 0, 10, 5) +
			field(m.crop, 10, 0, 8, 5) +
			field(m.soil, 0, 5, 6, 5) +
			field(m.wheat, 6, 5, 12, 5) +
			lines(m.chaff, furrows(0, 10, 0, 5) + furrows(6, 18, 5, 10)) +
			lines(m.row, furrows(10, 18, 0, 5, 1.1), 0.35) +
			lines(m.furrow, furrows(0, 6, 5, 10, 0.7), 0.25) +
			// Hedgerows on the tile's top and left edges and between fields
			// (the next tile draws the bottom and right ones).
			lines(m.hedge, 'M0 0H18M0 5H18M0 0V10M10 0V5M6 5V10', 0.4)
		);
	},
};

const SAND_GRAIN = speckles(10, 26, 59);
/** Sand: pale desert, stippled, with a few wind ripples. @type {PatternDef} */
const sandGround = {
	w: 10,
	h: 10,
	scale: 1.5,
	body: ({ tone }) => {
		const m = GROUND_COLOURS.sand;
		return (
			`<rect width="10" height="10" style="fill:${tone(m.body)}"/>` +
			`<g style="fill:${tone(m.grain)}">${SAND_GRAIN.dark}</g>` +
			`<g style="fill:${tone(m.light)}">${SAND_GRAIN.light}</g>` +
			`<path style="stroke:${tone(m.ripple)};stroke-width:0.24;fill:none;stroke-linecap:round" d="M1.4 3.2q1.7 -0.9 3.4 0M5.4 7.4q1.6 -0.8 3.2 0M2.2 8.3q1.1 -0.5 2.2 0"/>`
		);
	},
};

/** Rock: grey stone ground, cracked, with pebbles catching the light. @type {PatternDef} */
const rockGround = {
	w: 10,
	h: 10,
	scale: 1.5,
	body: ({ tone }) => {
		const m = GROUND_COLOURS.rock;
		const pebbles = scatter(10, 5, 61, 1.2);
		return (
			`<rect width="10" height="10" style="fill:${tone(m.body)}"/>` +
			`<path style="stroke:${tone(m.crack)};stroke-width:0.22;fill:none;stroke-linecap:round;stroke-linejoin:round" d="M0.8 2.4l1.5 0.8l0.9 -0.7l1.4 1.2M5.6 6.1l1.2 -0.9l1.1 0.5l1.1 -0.8M1.6 7.6l1.3 0.6l0.6 1"/>` +
			`<g style="fill:${tone(m.pebble)}">${pebbles.map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="${0.45 + (i % 3) * 0.15}" ry="${0.3 + (i % 2) * 0.1}"/>`).join('')}</g>` +
			`<g style="fill:${tone(m.light)}">${pebbles.map(([x, y]) => `<circle cx="${r1(x - 0.15)}" cy="${r1(y - 0.1)}" r="0.14"/>`).join('')}</g>`
		);
	},
};

const SNOW_SPECKS = speckles(12, 10, 67);
/** Snow: near-white, with a few soft blue-grey drifts. @type {PatternDef} */
const snowGround = {
	w: 12,
	h: 12,
	scale: 1.5,
	body: ({ tone }) => {
		const m = GROUND_COLOURS.snow;
		return (
			`<rect width="12" height="12" style="fill:${tone(m.body)}"/>` +
			`<g style="fill:${tone(m.speck)}">${SNOW_SPECKS.dark}${SNOW_SPECKS.light}</g>` +
			`<path style="stroke:${tone(m.drift)};stroke-width:0.35;fill:none;stroke-linecap:round" d="M1.5 3.6q2.2 -1.2 4.4 0M6.6 8.8q2.1 -1.1 4.2 0M2.2 10.2q1.2 -0.6 2.4 0"/>`
		);
	},
};

const MARSH_REEDS = scatter(12, 5, 71, 1.4)
	.map(([x, y]) => `M${x} ${y}l-0.35 -1.3M${r1(x + 0.3)} ${y}v-1.6M${r1(x + 0.6)} ${y}l0.35 -1.2`)
	.join('');
const MARSH_MUD = speckles(12, 12, 73);
/** Marsh: olive bog with pools of water and tufts of reeds. @type {PatternDef} */
const marshGround = {
	w: 12,
	h: 12,
	scale: 1.5,
	body: ({ tone }) => {
		const m = GROUND_COLOURS.marsh;
		return (
			`<rect width="12" height="12" style="fill:${tone(m.body)}"/>` +
			`<g style="fill:${tone(m.mud)}">${MARSH_MUD.dark}</g>` +
			`<g style="fill:${tone(m.pool)};stroke:${tone(m.rim)};stroke-width:0.2"><ellipse cx="3.6" cy="4.2" rx="2.2" ry="0.9"/><ellipse cx="8.4" cy="9" rx="1.7" ry="0.7"/></g>` +
			`<path style="stroke:${tone(m.reed)};stroke-width:0.22;fill:none;stroke-linecap:round" d="${MARSH_REEDS}"/>`
		);
	},
};

/** Ice: pale blue sheet, hairline cracks and streaks of sheen. @type {PatternDef} */
const iceGround = {
	w: 12,
	h: 12,
	scale: 1.5,
	body: ({ tone }) => {
		const m = GROUND_COLOURS.ice;
		return (
			`<rect width="12" height="12" style="fill:${tone(m.body)}"/>` +
			`<g style="fill:${tone(m.deep)}"><ellipse cx="8.6" cy="4.6" rx="2.2" ry="0.8"/><ellipse cx="3" cy="9.6" rx="1.6" ry="0.6"/></g>` +
			`<path style="stroke:${tone(m.crack)};stroke-width:0.2;fill:none;stroke-linecap:round;stroke-linejoin:round" d="M1.2 2.6l1.8 1.1l1.2 -0.5l1.6 1.4M6.4 7.4l1.5 -0.6l1 0.9l1.6 -0.4M2.4 6.6l1.1 1.3l-0.4 0.9"/>` +
			`<path style="stroke:${tone(m.sheen)};stroke-width:0.35;fill:none;stroke-linecap:round" d="M7.4 1.8l1.6 -0.9M8.3 2.7l1 -0.6M1.8 5.2l1.4 -0.8M6.6 10.6l1.4 -0.8"/>`
		);
	},
};

const LAVA_CRUST = speckles(12, 14, 79);
/** Lava: dark basalt crust split by glowing fissures, with a pool or two of
 *  molten rock. @type {PatternDef} */
const lavaGround = {
	w: 12,
	h: 12,
	scale: 1.5,
	body: ({ tone }) => {
		const m = GROUND_COLOURS.lava;
		const veins =
			'M1 3.2l2 0.7l1.4 -0.9l2.2 1.1l1.6 -0.6M5.2 8.6l1.8 -0.7l1.2 0.8l2 -0.5M1.6 9.8l1.3 -0.8';
		return (
			`<rect width="12" height="12" style="fill:${tone(m.body)}"/>` +
			`<g style="fill:${tone(m.crust)}">${LAVA_CRUST.dark}${LAVA_CRUST.light}</g>` +
			`<path style="stroke:${tone(m.glow)};stroke-width:0.6;fill:none;stroke-linecap:round;stroke-linejoin:round" d="${veins}"/>` +
			`<path style="stroke:${tone(m.core)};stroke-width:0.2;fill:none;stroke-linecap:round;stroke-linejoin:round" d="${veins}"/>` +
			`<ellipse cx="9" cy="2.6" rx="1.5" ry="0.6" style="fill:${tone(m.glow)}"/>` +
			`<ellipse cx="9" cy="2.6" rx="0.8" ry="0.3" style="fill:${tone(m.core)}"/>`
		);
	},
};

/** The ground types that draw a textured plane, each its pattern role
 *  `ground-<type>` — 'none' draws none, and water is the lagoon. */
export const GROUND_TYPES = [
	'dirt',
	'grass',
	'farmland',
	'sand',
	'rock',
	'snow',
	'ice',
	'marsh',
	'lava',
];

/** A flat tile in one fixed colour — for tinted lines (ringTextures.js),
 *  which paint in a material's own colour rather than ink.
 *  @param {string} colour @returns {PatternDef} */
function flat(colour) {
	return {
		w: 4,
		h: 4,
		body: ({ tone }) => `<rect width="4" height="4" style="fill:${tone(colour)}"/>`,
	};
}

/** @type {Record<string, PatternDef>} */
export const PATTERNS = {
	'wall-stone': stone,
	'wall-stone-shade': stone,
	'wall-hedge': hedge,
	'wall-hedge-shade': hedge,
	'wall-reef': reef,
	'wall-reef-shade': reef,
	'wall-wood': wood,
	'wall-wood-shade': wood,
	'wall-earth': earth,
	'wall-earth-shade': earth,
	'wall-bone': bone,
	'wall-bone-shade': bone,
	'wall-stone-ring': stoneRing,
	'wall-stone-ring-shade': stoneRing,
	'wall-wood-ring': woodRing,
	'wall-wood-ring-shade': woodRing,
	'wall-hedge-ring': hedgeRing,
	'wall-hedge-ring-shade': hedgeRing,
	'wall-reef-ring': reefRing,
	'wall-reef-ring-shade': reefRing,
	'wall-hedge-cane': flat(MATERIALS.hedge.cane),
	'wall-reef-groove': flat(MATERIALS.coral.wall),
	'wall-reef-vein': flat(MATERIALS.coral.groove),
	'wall-earth-ring': flat(MATERIALS.earth.body),
	'wall-earth-ring-shade': flat(MATERIALS.earth.body),
	'wall-bone-ring': flat(MATERIALS.bone.body),
	'wall-bone-ring-shade': flat(MATERIALS.bone.body),
	'wall-earth-grit': flat(MATERIALS.earth.dark),
	'wall-earth-pebble': flat(MATERIALS.earth.light),
	'wall-bone-grain': flat(MATERIALS.bone.grain),
	'ground-dirt': dirtGround,
	'ground-dirt-shade': dirtGround,
	'ground-grass': grassGround,
	'ground-grass-shade': grassGround,
	'ground-farmland': farmGround,
	'ground-farmland-shade': farmGround,
	'ground-sand': sandGround,
	'ground-sand-shade': sandGround,
	'ground-rock': rockGround,
	'ground-rock-shade': rockGround,
	'ground-snow': snowGround,
	'ground-snow-shade': snowGround,
	'ground-marsh': marshGround,
	'ground-marsh-shade': marshGround,
	'ground-ice': iceGround,
	'ground-ice-shade': iceGround,
	'ground-lava': lavaGround,
	'ground-lava-shade': lavaGround,
};

/** How much of each colour a -shade tile keeps (the rest is ink) — the
 *  same as the generic wall-shade. */
export const PATTERN_SHADE = 0.8;

/**
 * The Paint for a pattern role from a palette's ink colour (hex): a -shade
 * tile mixes every colour PATTERN_SHADE of the way back from ink.
 * @param {string} role
 * @param {string} ink
 * @param {(a: string, b: string, t: number) => string} mix `t` of a, the rest b
 * @returns {Paint}
 */
export function paletteTone(role, ink, mix) {
	const shade = role.endsWith('-shade');
	return { ink, tone: (c) => (shade ? mix(c, ink, PATTERN_SHADE) : c) };
}

/** Below this many screen pixels per icon unit, patterned walls draw flat:
 *  a texture finer than a pixel only muddies the wall (or, at worst, fails
 *  to paint at all). */
export const PATTERN_MIN_PX = 0.35;

/** Flat colour of each patterned wall (and ground plane) — its material at
 *  a glance, for an icon drawn too small for the pattern to resolve.
 *  @type {Record<string, string>} */
export const FLAT_WALLS = {
	'wall-stone': '#BEBCB6',
	'wall-hedge': '#6A8749',
	'wall-reef': '#DEDCD6',
	'wall-wood': '#9A6B42',
	'wall-earth': '#8A6843',
	'wall-bone': '#E9E5DB',
	'wall-stone-ring': '#BEBCB6',
	'wall-wood-ring': '#9A6B42',
	'wall-hedge-ring': '#6A8749',
	'wall-reef-ring': '#DEDCD6',
	'wall-earth-ring': '#8A6843',
	'wall-bone-ring': '#E9E5DB',
	// The ground planes, too.
	'ground-dirt': '#AE9370',
	'ground-grass': '#A2B476',
	'ground-farmland': '#C6B577',
	'ground-sand': '#E1CD9C',
	'ground-rock': '#AAA398',
	'ground-snow': '#EEF2F5',
	'ground-marsh': '#8E9A6C',
	'ground-ice': '#CFE2EB',
	'ground-lava': '#6E3A2A',
};

/** Layers of line-work texture: the tinted lines laid round ring walls
 *  (ringTextures.js), and `ink-texture` — masonry courses, barn planks and
 *  the stone, palisade and bone wall seams, drawn in ink. A culture with
 *  Texture off draws none of them, and an icon drawn too small for its
 *  patterns leaves them out too: they're the same sub-pixel texture, and
 *  would only speckle the flat wall. */
export const TEXTURE_ROLES = new Set([
	'ink-texture',
	'wall-hedge-cane',
	'wall-reef-groove',
	'wall-reef-vein',
	'wall-earth-grit',
	'wall-earth-pebble',
	'wall-bone-grain',
]);

/**
 * Flat fill for a patterned wall role; a -shade role mixes toward ink like
 * the shade tiles do.
 * @param {string} role
 * @param {string} ink
 * @param {(a: string, b: string, t: number) => string} mix `t` of a, the rest b
 */
export function flatWall(role, ink, mix) {
	const base = FLAT_WALLS[role.replace(/-shade$/, '')] ?? FLAT_WALLS['wall-stone'];
	return role.endsWith('-shade') ? mix(base, ink, PATTERN_SHADE) : base;
}

/** Role names of walls that use a pattern fill (both base and -shade). */
export const PATTERN_ROLES = new Set(Object.keys(PATTERNS));

/** How much of a part's own colour its outline keeps, the rest ink: an
 *  outline is a darker shade of what it edges, not near-black. */
export const LINE_MIX = 0.45;

/**
 * Colour of a `<role>-line` layer (render.js LINE_ROLES): the outline of
 * the parts drawn in `role`, a darker shade of that role's colour — of its
 * flat material colour for a patterned wall or ground.
 * @param {string} lineRole
 * @param {Record<string, string>} colours flat colour per role, as drawn
 *   (roof following the marker), with `ink`
 * @param {(a: string, b: string, t: number) => string} mix `t` of a, the rest b
 * @returns {string}
 */
export function lineColour(lineRole, colours, mix) {
	const role = lineRole.replace(/-line$/, '');
	const base = PATTERN_ROLES.has(role)
		? flatWall(role, colours.ink, mix)
		: (colours[role] ?? colours.ink);
	return mix(base, colours.ink, LINE_MIX);
}

/**
 * Build a `<defs>` fragment with the patterns the icon needs. `scope` is
 * suffixed on each pattern id so two icons in the same document don't
 * collide; pass a stable per-icon string (slug, cache key).
 * @param {Iterable<string>} usedRoles roles actually referenced in the icon
 * @param {(role: string) => Paint} paintFor the Paint for a pattern role
 *   (its `tone` shading the -shade roles)
 * @param {string} scope unique-ish per icon
 * @returns {{defs: string, url: (role: string) => string}}
 */
export function patternDefs(usedRoles, paintFor, scope) {
	const roles = [...new Set(usedRoles)].filter((r) => PATTERN_ROLES.has(r));
	if (!roles.length) return { defs: '', url: () => '' };
	const id = (/** @type {string} */ role) => `pat-${role}-${scope}`;
	const defs = roles
		.map((role) => {
			const p = PATTERNS[role];
			return (
				`<pattern id="${id(role)}" width="${p.w}" height="${p.h}" ` +
				`patternUnits="userSpaceOnUse"` +
				(p.scale ? ` patternTransform="scale(${p.scale})"` : '') +
				`>${p.body(paintFor(role))}</pattern>`
			);
		})
		.join('');
	return {
		defs: `<defs>${defs}</defs>`,
		url: (role) => (PATTERN_ROLES.has(role) ? `url(#${id(role)})` : ''),
	};
}
