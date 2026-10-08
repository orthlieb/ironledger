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
	for (let i = 0; i < n; i++) {
		const x = rand() * size,
			y = rand() * size,
			r = 0.18 + rand() * 0.3;
		const out = rand() < 0.65 ? dark : light;
		for (const dx of [0, ...(x - r < 0 ? [size] : []), ...(x + r > size ? [-size] : [])])
			for (const dy of [0, ...(y - r < 0 ? [size] : []), ...(y + r > size ? [-size] : [])])
				out.push(`<circle cx="${r1(x + dx)}" cy="${r1(y + dy)}" r="${r1(r)}"/>`);
	}
	return { dark: dark.join(''), light: light.join('') };
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

/** Bone, white and grey: faint grain strokes and a few pores. */
/** @type {PatternDef} */
const bone = {
	w: 7,
	h: 7,
	body: ({ tone }) => {
		const m = MATERIALS.bone;
		return (
			`<rect width="7" height="7" style="fill:${tone(m.body)}"/>` +
			`<path style="stroke:${tone(m.grain)};stroke-width:0.18;fill:none;stroke-linecap:round" d="M0.6 1.4Q2 1 3.4 1.5M4.2 3.6Q5.4 3.2 6.5 3.8M1.2 5.4Q2.4 5 3.6 5.6"/>` +
			`<g style="fill:${tone(m.grain)}"><circle cx="5.3" cy="1.2" r="0.22"/><circle cx="2.2" cy="3.3" r="0.18"/><circle cx="5.6" cy="5.9" r="0.2"/></g>`
		);
	},
};

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

/** Role names of walls that use a pattern fill (both base and -shade). */
export const PATTERN_ROLES = new Set(Object.keys(PATTERNS));

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
