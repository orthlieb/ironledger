// =============================================================================
// Settlement kit — 3/4-view pieces
//
// Oblique projection: depth runs up-and-right along `depthVec(d)`. Light
// comes from the upper left, so right-facing faces (side walls, right roof
// slopes, the right flank of a cylinder or cone) are shaded: they get the
// darker role colour in renderLayered() plus hatching `lines`.
//
// A `Design` (the "culture") is shared by every piece in a settlement so a
// village, town and city of one people look related. makeDesign() rolls it
// from a seed: sizes average several draws so they cluster around the
// middle, flags are weighted coin-flips, and a few rules tie them together.
// =============================================================================

import { archOpening, circle, crenellated, lancet, rect, rng } from './geom.js';
import { place } from './render.js';

/** @typedef {import('./render.js').Part} Part */
/** @typedef {import('./render.js').Line} Line */
/** @typedef {import('./geom.js').Poly} Poly */
/** @typedef {import('./geom.js').Pt} Pt */

/** Bow of a line, -1 … 1: positive swoops inward (concave), negative bulges
 *  outward (convex), 0 is straight. @typedef {number} Bow */

/**
 * A culture's drawing style, shared by every piece in a settlement.
 * @typedef {object} Design
 * @property {number} pitch roof height ÷ house width
 * @property {number} depth house depth ÷ width
 * @property {number} gable share of houses with the gable to the front (0..1)
 * @property {number} concave how far roof edges sag inward (0 = straight)
 * @property {number} storeys chance a house has a second storey (0..1)
 * @property {'square' | 'arched' | 'slit' | 'round' | 'lancet'} window
 * @property {'arched' | 'square' | 'lancet'} door house / vernacular door
 *   shape — arched (default, round-headed Romanesque), square (plain
 *   lintel), lancet (pointed Gothic arch). Specialty structures (keep,
 *   cathedral, pavilion) keep their own thematic door style.
 * @property {boolean} manyDoors
 * @property {'none' | 'cone' | 'onion' | 'dome' | 'lancet' | 'crenel'} towerRoof the
 *   cap on a tower. `none` leaves the crenellated top bare (a roofless tower
 *   always gets one); `dome` culture replaces every pitched roof — gable
 *   houses and tower caps alike — with a stone half-sphere; `lancet` caps
 *   towers with a pointed (ogival) dome. `crenel` is the legacy spelling of
 *   `none` + `towerCrenel` (see upgradeDesign()).
 * @property {'square' | 'round'} steeple the shape of the landmark towers —
 *   church and cathedral towers, the clock tower, a village bell tower. Either
 *   takes the culture's cap and crenellated top.
 * @property {boolean} towerCrenel a crenellated top on towers: a short
 *   parapet ring corbelled out on its own 45° slope, with the cap (if any)
 *   sitting on it and the flag on whichever is uppermost.
 * @property {number} spire spire / cone height ÷ tower width
 * @property {number} taper tower walls lean in by this share of the radius
 * @property {number} perspective how strongly the receding faces of box-like
 *   buildings (houses, square towers, keep, cathedral, gates, stalls, tents)
 *   converge: 0 = parallel oblique, 0.5 default, 1 strong. Round pieces,
 *   walls and the pier stay parallel.
 * @property {number} towerCorbel 0..1: share of the tower's height occupied
 *   by the corbelled parapet, measured down from the top. 0 = no corbel
 *   (default, straight walls), 0.25 = upper quarter corbels out (Watabou
 *   look), 1 = the whole tower is the 45° slope. Orthogonal to towerRoof:
 *   any cap can sit on a corbelled body.
 * @property {boolean} flags
 * @property {number} flagLen
 * @property {number} flagFolds
 * @property {'banner' | 'pennant' | 'swallowtail'} [flagShape] rectangular
 *   banner (default), a tapered pennant that comes to a single point, or a
 *   split pennant with a swallowtail notch at the trailing end
 * @property {number} hatch hatch spacing (smaller = darker shade)
 * @property {'none' | 'stone' | 'palisade' | 'hedge' | 'bone' | 'earth' | 'reef'} wall the
 *   culture's usual town wall
 * @property {number} wallH wall height factor
 * @property {boolean} merlons crenellated parapet on stone walls
 * @property {number} wallTowers towers around a city ring (towns get half)
 * @property {'tower' | 'twin' | 'jawbone'} gate gate tower, arch between two towers, or
 *   whale-jaw arch
 * @property {'timber' | 'round' | 'mound' | 'stilt'} houseForm framed houses, round huts,
 *   turf mounds, or huts on stilts
 * @property {'land' | 'water'} ground what the settlement stands on (water: a lagoon with
 *   waves)
 * @property {number} stature building height factor (small folk < 1 < giants)
 * @property {number} scale building size factor; bigger means fewer of them
 * @property {number} flourish ornament: finials, eave knobs, ridge cresting, extra flags
 *   (0..1)
 * @property {boolean} masonry stone courses on house walls
 * @property {number} longhouse share of timber dwellings that are Norse longhouses (0..1)
 * @property {number} huts share of timber dwellings that are round huts (0..1)
 * @property {'round' | 'square'} wallShape
 * @property {number} industry share of town/city buildings that are warehouses or
 *   workshops
 * @property {boolean} church a full church (nave + bell tower) rather than a lone bell
 *   tower
 * @property {'none' | 'orb' | 'sun' | 'spike' | 'cross' | 'horns' | 'wheel' | 'claw' | 'trident'} symbol
 *   finial atop temple towers
 * @property {'none' | 'city' | 'town' | 'all'} keep smallest settlement with a castle keep
 * @property {'none' | 'town' | 'all'} market smallest settlement with a market square
 * @property {'sharp' | 'round' | 'soft'} join line joins: mitred, rounded, or rounded +
 *   softened corners
 * @property {Bow} towerBow tower sides, -1 … 1: concave (> 0) swoops inward, flaring at
 *   the foot and narrowing as they rise (elven); convex (< 0) bulges outward
 * @property {Bow} wallBow walls, -1 … 1: concave (> 0) dips the tops between towers and
 *   flares the foot (elven); convex (< 0) crests the tops
 */

/** Default culture (Shift-click equivalent). @type {Design} */
export const DEFAULT_DESIGN = {
	pitch: 0.75,
	depth: 0.8,
	gable: 0.5,
	concave: 0,
	storeys: 0.3,
	window: 'square',
	door: 'arched',
	manyDoors: false,
	towerRoof: 'cone',
	spire: 2.2,
	taper: 0.04,
	towerCorbel: 0,
	towerCrenel: false,
	steeple: 'square',
	perspective: 0.5,
	flags: true,
	flagLen: 11,
	flagFolds: 3,
	flagShape: 'pennant',
	hatch: 1.4,
	wall: 'stone',
	wallH: 1,
	merlons: true,
	wallTowers: 4,
	gate: 'tower',
	wallShape: 'round',
	industry: 0.2,
	church: true,
	symbol: 'orb',
	keep: 'city',
	market: 'town',
	houseForm: 'timber',
	ground: 'land',
	stature: 1,
	scale: 1,
	flourish: 0,
	masonry: false,
	longhouse: 0,
	huts: 0,
	join: 'soft',
	towerBow: 0,
	wallBow: 0,
};

/** Roll a culture. @param {number} seed @returns {Design} */
export function makeDesign(seed) {
	const r = rng(seed);
	const avg = () => (r() + r() + r()) / 3; // bell-ish: extremes are rare
	const pick = (/** @type {any[]} */ xs) => xs[Math.floor(r() * xs.length)];
	/** @type {Design} */
	const D = {
		pitch: 0.45 + avg() * 0.7,
		depth: 0.55 + avg() * 0.5,
		gable: r(),
		concave: r() < 0.45 ? 0 : 0.06 + avg() * 0.16,
		storeys: avg() * 0.8,
		window: pick(['square', 'arched', 'slit', 'round', 'lancet']),
		// Arched is the medieval baseline; square and lancet are the oddities.
		door: pick(['arched', 'arched', 'arched', 'square', 'lancet']),
		manyDoors: r() < 0.3,
		towerRoof: pick([
			'cone',
			'cone',
			'cone',
			'onion',
			'onion',
			'none',
			'none',
			'dome',
			'dome',
			'lancet',
			'lancet',
		]),
		spire: 1.3 + avg() * 1.7,
		taper: avg() * 0.14,
		// Most cultures (~70%) build straight walls (towerCorbel = 0). The
		// rest get a corbel occupying 10-35% of the tower's upper height.
		towerCorbel: r() < 0.7 ? 0 : 0.1 + avg() * 0.25,
		towerCrenel: false, // rolled below, after the draws they must not shift
		steeple: 'square',
		perspective: 0.5,
		flags: r() < 0.75,
		flagLen: 8 + avg() * 9,
		flagFolds: 2 + Math.floor(r() * 3),
		flagShape: pick(['pennant', 'pennant', 'pennant', 'banner', 'banner', 'swallowtail']),
		hatch: 1.25 + avg() * 0.45,
		wall: pick([
			'stone',
			'stone',
			'stone',
			'palisade',
			'palisade',
			'earth',
			'hedge',
			'bone',
			'reef',
		]),
		wallH: 0.75 + avg() * 0.6,
		merlons: r() < 0.75,
		wallTowers: 2 + Math.floor(avg() * 5),
		gate: pick(['tower', 'tower', 'twin', 'twin', 'jawbone']),
		wallShape: r() < 0.5 ? 'round' : 'square',
		industry: avg() * 0.45,
		church: r() < 0.85,
		symbol: pick([
			'none',
			'orb',
			'orb',
			'sun',
			'sun',
			'spike',
			'horns',
			'wheel',
			'claw',
			'trident',
			'cross',
		]),
		keep: pick(['none', 'city', 'city', 'town', 'all']),
		market: pick(['none', 'town', 'town', 'all']),
		houseForm: pick(['timber', 'timber', 'timber', 'timber', 'round', 'round', 'mound', 'stilt']),
		ground: r() < 0.12 ? 'water' : 'land',
		stature: 0.8 + avg() * 0.4,
		scale: 0.85 + avg() * 0.35,
		flourish: avg(),
		masonry: r() < 0.3,
		longhouse: r() < 0.3 ? avg() : 0,
		huts: r() < 0.25 ? avg() * 0.6 : 0,
		join: r() < 0.15 ? 'sharp' : r() < 0.7 ? 'round' : 'soft',
		towerBow: r() < 0.6 ? 0 : (r() - 0.35) * 1.4,
		wallBow: 0,
	};
	// Linked rules, so a culture hangs together:
	// low-pitched builders fortify their towers rather than roofing them,
	if (D.pitch < 0.6 && D.towerRoof === 'cone') D.towerRoof = 'none';
	// onion domes come with concave (swept) roofs on the houses too,
	if (D.towerRoof === 'onion' && D.concave === 0) D.concave = 0.12;
	// and tall steep roofs go with tall spires.
	if (D.pitch > 0.95) D.spire = Math.max(D.spire, 2.4);
	// Towers and the walls between them usually bow alike.
	if (r() < 0.7) D.wallBow = D.towerBow;
	// Roofless towers are crenellated; about a third of capped ones are too.
	D.towerCrenel = D.towerRoof === 'none' || r() < 0.35;
	// Fortifying builders always crenellate their walls.
	if (D.towerCrenel) D.merlons = true;
	// About a quarter of cultures raise round steeples.
	D.steeple = r() < 0.25 ? 'round' : 'square';
	return D;
}

/**
 * Bring a stored design (a culture plugin, an imported playground export)
 * up to date: the legacy `towerRoof: 'crenel'` becomes a bare crenellated
 * top (`towerRoof: 'none'`, `towerCrenel: true`).
 * @template {Partial<Design>} T
 * @param {T} D
 * @returns {T}
 */
export function upgradeDesign(D) {
	return D.towerRoof === 'crenel' ? { ...D, towerRoof: 'none', towerCrenel: true } : D;
}

/**
 * A tower's top, factored into a crenellated top (on / off) and the cap on
 * it. No cap means a bare crenellated top, so a tower never ends flat.
 * @param {Design} D
 * @param {{roof?: Design['towerRoof'], crenel?: boolean}} o per-tower overrides
 */
function towerTop(D, o) {
	const want = o.roof ?? D.towerRoof;
	const roof = want === 'crenel' ? 'none' : want;
	return {
		roof,
		crenel: roof === 'none' || want === 'crenel' || (o.crenel ?? D.towerCrenel ?? false),
	};
}

/** Palisade stake width (world units) — the wall-wood plank pattern's tile
 *  is this at the generator's 2× scale, so stakes and planks line up. */
const STAKE = 1.6;

/** Hatch/detail stroke weight (world units). */
export const THIN = 0.6;

/** Depth axis in screen space — tightened cab-oblique (~34° above
 *  horizontal, length ≈ 0.90). Previously `[0.62, 0.42]` (length ≈ 0.75)
 *  which read flat at marker scale; the 20 % deeper vector exposes more of
 *  each shaded right-flank so the oblique projection actually reads 3D.
 *  A short-lived `view: 'iso'` toggle lived here (coefficients 1.4 / 0.95)
 *  but was reverted — the extra depth didn't read as a meaningfully different
 *  rendering at marker scale; the per-marker `scale` slider does the heavy
 *  lifting for "I want this icon bigger / more legible".
 *  @param {number} d @returns {Pt} */
const depthVec = (d) => [d * 0.75, d * 0.5];

/** @param {Pt} a @param {Pt} b @returns {Pt} */
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];

/**
 * Edge from a to b that sags toward `toward` by `amt` (quadratic curve).
 * @param {Pt} a
 * @param {Pt} b
 * @param {Pt} toward
 * @param {number} amt
 * @returns {Poly} points from a to b inclusive
 */
function sag(a, b, toward, amt, n = 8) {
	if (!amt) return [a, b];
	const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
	const c = [m[0] + (toward[0] - m[0]) * amt * 2, m[1] + (toward[1] - m[1]) * amt * 2];
	/** @type {Poly} */
	const out = [];
	for (let i = 0; i <= n; i++) {
		const t = i / n,
			u = 1 - t;
		out.push([
			u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
			u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
		]);
	}
	return out;
}

/**
 * How far a bow setting bends a line: positive swoops inward (concave),
 * negative bulges outward (convex), 0 is straight.
 * @param {Bow} b
 */
const bowAmt = (b) => {
	const v = Math.max(-1, Math.min(1, Number(b) || 0));
	return v > 0 ? v * 0.24 : v * 0.13;
};
/** The culture's wall-top bow (spanH, wall edges). @param {Design} D */
const bow = (D) => bowAmt(D.wallBow);

/**
 * Wall-top height across one span between two posts (towers / gate), t ∈
 * [0, 1]: concave walls dip between their towers, convex ones crest.
 * @param {Design} D @param {number} h @param {number} t
 */
const spanH = (D, h, t) => h * (1 - bow(D) * 2 * Math.sin(Math.PI * t));

/**
 * A concave flare at the foot of a wall face (elven walls, `wallBow` > 0): the face sweeps outward by `o` from height `s` down to the
 * ground, like a tower's flared base. Returned as a polygon to union with
 * the face, between base points p and q.
 * @param {Pt} p @param {Pt} q @param {Pt} o outward offset at the foot @param {number} s
 * @returns {Poly}
 */
function flareSkirt(p, q, o, s) {
	/** @type {Pt} */ const ps = [p[0], p[1] + s];
	/** @type {Pt} */ const qs = [q[0], q[1] + s];
	return [ps, ...sag(ps, add(p, o), p, 0.35).slice(1), ...sag(add(q, o), qs, q, 0.35)];
}

/**
 * One heap of an earthwork's crest: a rounded dome on an elliptical
 * footprint (its front edge curving toward the viewer), plus meridians over
 * its right flank, bunching toward the edge like a lit dome.
 * @param {number} cx @param {number} cy foot centre
 * @param {number} R footprint radius @param {number} hm height
 * @returns {{poly: Poly, lines: Line[]}}
 */
function domeHeap(cx, cy, R, hm) {
	const foot = R * 0.34;
	/** @type {Poly} */
	const poly = [
		...ell(cx, cy, R, foot, 180, 360, 16),
		...ell(cx, cy, R, hm, 0, 180, 18).slice(1, -1),
	];
	/** @type {Line[]} */
	const lines = [];
	for (let th = 40; th < 90; th += 12) {
		const k = Math.sin((th * Math.PI) / 180);
		/** @type {Poly} */
		const pts = [];
		// From the crest only half way down the flank.
		for (let i = 0; i <= 6; i++) {
			const t = ((0.5 + (0.5 * i) / 6) * Math.PI) / 2;
			pts.push([
				cx + R * k * Math.cos(t),
				cy - foot * Math.sqrt(1 - k * k) * Math.cos(t) + hm * Math.sin(t),
			]);
		}
		lines.push({ pts, w: THIN });
	}
	return { poly, lines };
}

/**
 * An earthwork bulwark: one continuous bank — `body`, its lower course —
 * crested by overlapping heaps at the given foot points ([x, y, height]).
 * Everything is one part, so the heaps fuse with the bank under a single
 * outline and read as heaped earth rather than separate mounds.
 * @param {Design} D
 * @param {[number, number, number][]} feet
 * @param {Poly} body
 * @param {Partial<Part>} look role / shading for the whole bank
 * @returns {Part[]}
 */
function bulwark(D, feet, body, look) {
	const jit = (/** @type {number} */ x, /** @type {number} */ y) =>
		Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
	const heaps = feet.map(([x, y, h]) => {
		const j = jit(x, y);
		return domeHeap(x, y, 4.8 + j * 1.2, h * (0.85 + 0.3 * j));
	});
	// Same winding for every outline, so overlaps union rather than cancel.
	const ccw = (/** @type {Poly} */ poly) => {
		let area = 0;
		for (let i = 0; i < poly.length; i++) {
			const [x0, y0] = poly[i],
				[x1, y1] = poly[(i + 1) % poly.length];
			area += x0 * y1 - x1 * y0;
		}
		return area < 0 ? [...poly].reverse() : poly;
	};
	return [
		{
			...look,
			solid: [body, ...heaps.map((m) => m.poly)].map(ccw),
			lines: [...(look.lines ?? []), ...heaps.flatMap((m) => m.lines)],
		},
	];
}

/** Ellipse arc points (degrees). */
function ell(
	/** @type {number} */ cx,
	/** @type {number} */ cy,
	/** @type {number} */ rx,
	/** @type {number} */ ry,
	/** @type {number} */ a0,
	/** @type {number} */ a1,
	n = 24,
) {
	/** @type {Poly} */
	const out = [];
	for (let i = 0; i <= n; i++) {
		const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
		out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
	}
	return out;
}

/**
 * Parallel hatch lines covering a polygon's bounding box; the renderer
 * clips them to the face.
 * @param {Poly} poly
 * @param {number} angle degrees
 * @param {number} spacing
 * @returns {Line[]}
 */
function hatch(poly, angle, spacing, w = THIN) {
	const xs = poly.map((p) => p[0]),
		ys = poly.map((p) => p[1]);
	const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
		cy = (Math.min(...ys) + Math.max(...ys)) / 2;
	const R = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
	const a = (angle * Math.PI) / 180;
	const [dx, dy] = [Math.cos(a), Math.sin(a)];
	const [nx, ny] = [-dy, dx];
	/** @type {Line[]} */
	const out = [];
	for (let t = -R; t <= R; t += spacing)
		out.push({
			pts: [
				[cx + nx * t - dx * R, cy + ny * t - dy * R],
				[cx + nx * t + dx * R, cy + ny * t + dy * R],
			],
			w,
		});
	return out;
}

/** Weight of the shading hatch on round bodies, cones and domes — about half
 *  the outline, so it still reads once an icon is fitted to a marker. */
const SHADE_W = 1.1;

/**
 * Diagonal hatching for a round body's shaded flank (tower, well, mill).
 * Pass it as the part's `shadeLines` so its `shadeArea` clips it to the flank.
 * @param {number} r body radius
 * @param {number} y0
 * @param {number} y1
 * @param {number} spacing
 * @returns {Line[]}
 */
function cylinderHatch(r, y0, y1, spacing) {
	return hatch(rect(-r, y0, 2 * r, y1 - y0), 55, spacing, SHADE_W);
}

/**
 * Horizontal hatching for the shaded flank of a cone or dome (as `shadeLines`).
 * @param {number} cx
 * @param {number} r
 * @param {number} y0
 * @param {number} y1
 * @param {number} spacing
 * @returns {Line[]}
 */
function capHatch(cx, r, y0, y1, spacing) {
	return hatch(rect(cx - r, y0, 2 * r, y1 - y0), 0, spacing * 0.8, SHADE_W);
}

/**
 * Shift a window's base y so it sits WHOLLY below (preferred) or wholly
 * above a tower's corbel bend, never straddling the 45° slope. Returns
 * `wantY` unchanged when the tower has no corbel or when the natural
 * placement already clears the slope.
 * @param {number} wantY ideal bottom-y of the window
 * @param {number} winH window's full height in world units
 * @param {number} belt y of the slope's bottom (corbelBelt)
 * @param {number} ov slope's height = outward projection (corbelOv)
 */
function clearCorbel(wantY, winH, belt, ov, margin = 1) {
	if (ov <= 0.01) return wantY;
	if (wantY + winH + margin <= belt) return wantY; // already wholly below
	if (wantY >= belt + ov + margin) return wantY; // already wholly above
	// Prefer the lower wall if there's room between the window and the ground.
	const yBelow = belt - winH - margin;
	if (yBelow >= 2) return yBelow;
	// Otherwise push onto the corbelled upper section.
	return belt + ov + margin;
}

/** Window opening in the culture's style. */
function opening(
	/** @type {Design} */ D,
	/** @type {number} */ cx,
	/** @type {number} */ y,
	s = 3.2,
) {
	switch (D.window) {
		case 'arched':
			return archOpening(cx, y, s * 0.85, s * 1.5);
		case 'lancet':
			return lancet(cx, y, s * 0.85, s * 1.6);
		case 'slit':
			return rect(cx - s * 0.2, y, s * 0.4, s * 1.4);
		case 'round':
			return circle(cx, y + s / 2, s * 0.45);
		default:
			return rect(cx - s / 2, y, s, s);
	}
}

/** Door opening in the culture's style — same signature as archOpening so
 * it drops into facade / vernacular callers. 'lancet' is a pointed Gothic
 * arch; 'square' is a plain lintel. */
function doorway(
	/** @type {Design} */ D,
	/** @type {number} */ cx,
	/** @type {number} */ y,
	/** @type {number} */ w,
	/** @type {number} */ h,
) {
	switch (D.door) {
		case 'square':
			return rect(cx - w / 2, y, w, h);
		case 'lancet':
			return lancet(cx, y, w, h);
		default:
			return archOpening(cx, y, w, h);
	}
}

/**
 * Lay out a front wall's openings in evenly spaced slots so doors and
 * windows can never overlap: one door (or every other slot for
 * `manyDoors` cultures) on the ground floor, windows elsewhere, and a
 * window per slot on an upper storey.
 * @param {Design} D
 * @param {number} x0
 * @param {number} x1
 * @param {number} h total wall height
 * @param {boolean} two has an upper storey
 * @param {() => number} r
 * @returns {Poly[]}
 */
function facade(D, x0, x1, h, two, r) {
	const n = Math.max(2, Math.round((x1 - x0) / 6.5));
	const slot = (x1 - x0) / n;
	const xs = Array.from({ length: n }, (_, i) => x0 + slot * (i + 0.5));
	const fh = two ? h / 1.65 : h;
	const doorW = Math.min(4, slot * 0.62),
		doorH = Math.min(7, fh * 0.75),
		win = Math.min(3.2, slot * 0.5);
	const doors = D.manyDoors
		? new Set(xs.map((_, i) => i).filter((i) => n === 2 || i % 2 === 0))
		: new Set([Math.floor(r() * n)]);
	/** @type {Poly[]} */
	const out = xs.map((x, i) =>
		doors.has(i) ? doorway(D, x, 0, doorW, doorH) : opening(D, x, fh * 0.36, win),
	);
	if (two) for (const x of xs) out.push(opening(D, x, fh + (h - fh) * 0.28, win));
	return out;
}

/** Onion-dome profile: [height fraction, radius ÷ base radius]. */
const ONION = [
	[0, 0.8],
	[0.12, 1.12],
	[0.3, 1.32],
	[0.5, 1.18],
	[0.68, 0.78],
	[0.84, 0.3],
	[0.94, 0.09],
	[1, 0],
];

/** Catmull-Rom through ONION. @param {number} t 0..1 */
function onionRadius(t) {
	let i = 1;
	while (i < ONION.length - 1 && t > ONION[i][0]) i++;
	const p0 = ONION[Math.max(0, i - 2)][1],
		p1 = ONION[i - 1][1],
		p2 = ONION[i][1],
		p3 = ONION[Math.min(ONION.length - 1, i + 1)][1];
	const u = (t - ONION[i - 1][0]) / (ONION[i][0] - ONION[i - 1][0]);
	return Math.max(
		0,
		0.5 *
			(2 * p1 +
				(p2 - p0) * u +
				(2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
				(3 * p1 - p0 - 3 * p2 + p3) * u * u * u),
	);
}

/**
 * Onion dome on a neck, hatched horizontally on its shaded right flank,
 * with a ball-and-spike finial.
 * @param {Design} D
 * @param {number} cx
 * @param {number} y base of the neck
 * @param {number} r base radius (the bulge is ~1.3×)
 * @returns {{parts: Part[], tip: Pt}}
 */
function onionDome(D, cx, y, r) {
	const rh = r * (2 + D.spire * 0.3),
		ry = 0.34,
		N = 28;
	/** @type {Poly} */
	const right = [];
	for (let i = 0; i <= N; i++) {
		const t = i / N;
		right.push([cx + r * onionRadius(t), y + rh * t]);
	}
	const neck = r * ONION[0][1];
	/** @type {Poly} */
	const outline = [
		...ell(cx, y, neck, neck * ry, 180, 360),
		...right.slice(1),
		...right
			.slice(1, -1)
			.reverse()
			.map(([x, yy]) => /** @type {Pt} */ ([2 * cx - x, yy])),
	];
	const top = y + rh;
	return {
		parts: [
			{
				solid: [outline],
				role: 'roof',
				shadeArea: rect(cx + r * 0.3, y - r, r * 2, rh + r * 2),
				shadeLines: capHatch(cx, r * 1.4, y - r, top + 1, D.hatch),
			},
			{ solid: [circle(cx, top + 1.4, 0.9)], role: 'roof' },
			{
				solid: [],
				free: [
					{
						pts: [
							[cx, top - 0.5],
							[cx, top + 4.5],
						],
						w: 1,
					},
				],
			},
		],
		tip: [cx, top + 4.5],
	};
}

/**
 * Hemispherical stone dome cap sitting on a flat platform at height y, with
 * its base rim visible in oblique projection (the near half of an ellipse)
 * and the half-sphere arcing up to y + r. The right flank is shaded and
 * hatched horizontally.
 * @param {number} cx
 * @param {number} y base plane of the dome
 * @param {number} r dome base radius (also its height)
 * @param {number} spacing hatch spacing (the culture's D.hatch)
 * @returns {{part: Part, tip: Pt}}
 */
function hemiDome(cx, y, r, spacing) {
	const ry = r * 0.34;
	/** @type {Poly} */
	const outline = [...ell(cx, y, r, ry, 180, 360), ...ell(cx, y, r, r, 0, 180, 28).slice(1, -1)];
	return {
		part: {
			solid: [outline],
			role: 'roof',
			shadeArea: rect(cx + r * 0.3, y - ry - 2, r * 2, r + ry + 4),
			shadeLines: capHatch(cx, r, y - ry - 2, y + r + 2, spacing),
		},
		tip: [cx, y + r],
	};
}

/**
 * Lancet cap: a pointed (ogival) dome — a lancet arch spun about the
 * tower's axis. It sits flush on the tower top; each side is an arc centred
 * on the springing line, so it rises vertically before curving to a point.
 * Height follows the culture's spire knob. The right flank is shaded and
 * hatched horizontally.
 * @param {Design} D
 * @param {number} cx
 * @param {number} y base plane of the cap
 * @param {number} R base radius
 * @returns {{part: Part, tip: Pt}}
 */
function lancetCap(D, cx, y, R) {
	const ry = R * 0.34,
		H = R * (1.4 + 0.4 * D.spire);
	// Right-side arc centre (c, y): equidistant from the springing (R, y)
	// and the apex (0, y + H).
	const c = (R * R - H * H) / (2 * R),
		rr = R - c,
		end = Math.atan2(H, -c),
		N = 14;
	/** @type {Poly} */
	const right = [];
	for (let i = 0; i <= N; i++) {
		const t = (end * i) / N;
		right.push([cx + c + rr * Math.cos(t), y + rr * Math.sin(t)]);
	}
	/** @type {Poly} */
	const outline = [
		...ell(cx, y, R, ry, 180, 360),
		...right.slice(1),
		...right
			.slice(1, -1)
			.reverse()
			.map(([x, yy]) => /** @type {Pt} */ ([2 * cx - x, yy])),
	];
	return {
		part: {
			solid: [outline],
			role: 'roof',
			shadeArea: rect(cx + R * 0.3, y - ry - 2, R * 2, H + ry + 4),
			shadeLines: capHatch(cx, R, y - ry - 2, y + H + 2, D.hatch),
		},
		tip: [cx, y + H],
	};
}

/**
 * A two-faced spire — lit front plus shaded receding side — as ONE part.
 * Drawn as two triangles, softening rounds each tip on its own and the
 * apex comes out as two offset bumps that never close; one solid rounds
 * once. The side is carved out by `shadeArea` (with its hatching on
 * `shadeLines`), and the shared ridge is stroked at outline weight so it
 * still reads as an edge.
 * @param {Poly} front
 * @param {Poly} side
 * @param {Poly} ridge the edge the faces share, eave → apex
 * @param {Part['role']} role
 * @param {number} hatchSpacing
 * @returns {Part}
 */
function pyramid(front, side, ridge, role, hatchSpacing) {
	return {
		solid: [front, side],
		role,
		shadeArea: side,
		shadeLines: hatch(side, -40, hatchSpacing),
		lines: [{ pts: ridge, outline: true }],
	};
}

/**
 * Projection for a box-like piece of depth d. In parallel oblique (k = 0) a
 * front-plane point p at depth fraction t lands at p + depthVec(t·d). With
 * perspective strength k it is also scaled toward the front's ground line
 * by s(t) = 1 / (1 + k·t·d / 20), so receding faces converge: back edges
 * come out shorter and eaves climb less than the ground. Every point of a
 * piece at the same depth must go through the same projector, or faces
 * that share an edge won't meet.
 *
 * Shrinking toward the ground drops a tall piece's back edges, and past a
 * point a flat top tips over and reads as seen from below. So the strength
 * is capped for tall pieces: a top face at height h still climbs at least
 * half as steeply as in parallel (h·(1 − s(1)) ≤ d/4), and a ridge running
 * back at height `ridge` at least a quarter as steeply (≤ 3d/8).
 * @param {number} d depth
 * @param {number} k perspective strength (0 = parallel)
 * @param {number} [h] height of the piece's flat top (0 = none)
 * @param {number} [ridge] height of a ridge that runs back (0 = none)
 */
function boxProjector(d, k, h = 0, ridge = 0) {
	let u = (k * d) / 20;
	/** Largest u that keeps an edge at height y within c of rising like parallel. */
	const cap = (/** @type {number} */ y, /** @type {number} */ c) => {
		if (y > c) u = Math.min(u, c / (y - c));
	};
	cap(h, d / 4);
	cap(ridge, (3 * d) / 8);
	const scale = (/** @type {number} */ t) => 1 / (1 + u * t);
	/** @param {Pt} p @param {number} t @returns {Pt} */
	const at = (p, t) => {
		const s = scale(t),
			v = depthVec(d * t);
		return [p[0] * s + v[0], p[1] * s + v[1]];
	};
	return {
		at,
		scale,
		/** @param {Pt} p @returns {Pt} */
		back: (p) => at(p, 1),
		/**
		 * An upright opening (bottom-centred at 0,0; x runs along the face in
		 * depth units) painted on the receding face at x = fx, its bottom at
		 * height y and depth fraction t. Its bottom and top edges follow the
		 * face's own slope, so it reads as painted on the wall rather than
		 * floating over it. Use it for any fill on a receding face.
		 * @param {Poly} poly @param {number} fx @param {number} y @param {number} t
		 * @returns {Poly}
		 */
		face: (poly, fx, y, t) => poly.map(([px, py]) => at([fx, y + py], t + px / d)),
	};
}

/**
 * House with its gable facing the viewer.
 * @param {Design} D
 * @param {{w?: number, h?: number, seed?: number}} [o]
 * @returns {Part[]}
 */
export function gableHouse(D, o = {}) {
	const r = rng(o.seed ?? 1);
	const two = r() < D.storeys;
	const w = o.w ?? 16,
		h = (o.h ?? 10) * (two ? 1.65 : 1) * D.stature,
		rh = w * D.pitch,
		ov = 1.5;
	const dome = D.towerRoof === 'dome';
	const P = boxProjector(
		w * D.depth,
		D.perspective ?? DEFAULT_DESIGN.perspective,
		h,
		dome ? 0 : h + rh,
	);
	const side = /** @type {Poly} */ ([
		[w / 2, 0],
		P.back([w / 2, 0]),
		P.back([w / 2, h]),
		[w / 2, h],
	]);
	// Dome-culture houses: a stone half-sphere cap sits on the box top in
	// place of a gable. The flat top of the box is drawn first so the
	// dome's near-rim ellipse reads as a seam, not a floating arc.
	if (dome) {
		const facadeFills = facade(D, -w / 2, w / 2, h, two, r);
		// topCap overlaps the front wall rect by a hair at y=h so softening
		// can't pull their shared top corners apart (both are 'wall' role,
		// so the overlap is invisible). The dome stays on its own part and
		// draws on top of topCap, as before.
		const topCap = /** @type {Poly} */ ([
			[-w / 2, h - 0.4],
			[w / 2, h - 0.4],
			P.back([w / 2, h]),
			P.back([-w / 2, h]),
		]);
		const [dcx, dcy] = P.at([0, h], 0.5);
		const { part } = hemiDome(dcx, dcy, w * 0.42 * P.scale(0.5), D.hatch);
		return [
			{ solid: [side], shaded: true, lines: hatch(side, 65, D.hatch) },
			{ solid: [topCap] },
			part,
			{
				solid: [rect(-w / 2, 0, w, h)],
				fills: facadeFills,
				lines: D.masonry ? stoneCourses(-w / 2, w / 2, 0, h) : [],
			},
		];
	}
	/** @type {Pt} */ const L = [-w / 2 - ov, h];
	/** @type {Pt} */ const R = [w / 2 + ov, h];
	/** @type {Pt} */ const A = [0, h + rh];
	const mid = /** @type {Pt} */ ([0, h + rh * 0.35]);
	const la = sag(L, A, mid, D.concave);
	const ar = sag(A, R, mid, D.concave);
	const left = /** @type {Poly} */ ([...la, ...la.map(P.back).reverse()]);
	const right = /** @type {Poly} */ ([...ar, ...ar.map(P.back).reverse()]);
	const fills = facade(D, -w / 2, w / 2, h, two, r);
	fills.push(opening(D, 0, h + rh * 0.22, 2.4));
	// The left slope faces away from the viewer whenever pitch > 1/3, so the
	// shaded right slope must draw over it — on steep roofs it's correctly
	// hidden entirely.
	return [
		{ solid: [side], shaded: true, lines: hatch(side, 65, D.hatch) },
		{ solid: [left], role: 'roof' },
		{ solid: [right], role: 'roof', shaded: true, lines: hatch(right, -28, D.hatch) },
		{
			solid: [rect(-w / 2, 0, w, h), [...la, ...ar.slice(1)]],
			fills,
			lines: D.masonry ? stoneCourses(-w / 2, w / 2, 0, h + rh) : [],
		},
		...(D.flourish > 0.25 ? finial(A) : []),
		...(D.flourish > 0.6
			? [
					{
						solid: [circle(L[0], L[1], 1.1), circle(R[0], R[1], 1.1)],
						role: /** @type {const} */ ('roof'),
					},
				]
			: []),
	];
}

/**
 * House with its ridge parallel to the viewer and the gable end on the
 * shaded right side. `kind` turns it into a trade building:
 *   'warehouse' — long, always two storeys, plank loading doors and a
 *                 hoist beam with a hanging crate off the gable;
 *   'workshop'  — a manufactory with tall smoking chimneys;
 *   'church'    — a tall nave with lancet windows and a rose window;
 *   'longhouse' — Norse hall: long, low walls, a steep boat-backed ridge
 *                 and crossed horns at the gable peaks;
 *   'barn'      — plank walls, big braced doors, a hayloft hatch;
 *   'tavern'    — two storeys, a chimney and a hanging sign;
 *   'barracks'  — long stone hall, a row of slit windows, a banner;
 *   'mill'      — a waterwheel at the front, standing in a mill race.
 * @param {Design} D
 * @param {{w?: number, h?: number, seed?: number, kind?: 'house' | 'warehouse' | 'workshop' | 'church' | 'longhouse' | 'barn' | 'tavern' | 'barracks' | 'mill'}} [o]
 * @returns {Part[]}
 */
export function sideHouse(D, o = {}) {
	const r = rng(o.seed ?? 2);
	const kind = o.kind ?? 'house';
	const two = kind === 'warehouse' || kind === 'tavern' || (kind === 'house' && r() < D.storeys);
	const long = kind === 'longhouse';
	const W0 = { house: 22, longhouse: 34, barn: 26, tavern: 24, barracks: 38, mill: 22 };
	const H0 = { church: 13, longhouse: 6.5, barn: 11, barracks: 8 };
	const w = o.w ?? W0[/** @type {keyof typeof W0} */ (kind)] ?? 30,
		h = (o.h ?? H0[/** @type {keyof typeof H0} */ (kind)] ?? 9) * (two ? 1.65 : 1) * D.stature,
		d = 12 * D.depth * (kind === 'house' ? 1 : kind === 'church' ? 1.35 : long ? 1.15 : 1.2),
		rh = d * D.pitch * (kind === 'warehouse' ? 1.1 : long ? 1.9 : 1.5),
		ov = 1.4;
	const v = depthVec(d);
	const P = boxProjector(d, D.perspective ?? DEFAULT_DESIGN.perspective, h);
	// The ridge runs at mid-depth, so under perspective it comes out
	// narrower than the front eave and the roof plane reads as a trapezoid.
	/** @type {Pt} */ const gTop = P.at([w / 2, h + rh], 0.5);
	const gableEnd = /** @type {Poly} */ ([
		[w / 2, 0],
		P.back([w / 2, 0]),
		P.back([w / 2, h]),
		gTop,
		[w / 2, h],
	]);
	/** @type {Pt} */ const eL = [-w / 2 - ov, h - 0.4];
	/** @type {Pt} */ const eR = [w / 2 + ov, h - 0.4];
	/** @type {Pt} */ const rR = add(gTop, [ov * 0.6, 0]);
	/** @type {Pt} */ const rL = add(P.at([-w / 2, h + rh], 0.5), [-ov * 0.6, 0]);
	const below = /** @type {Pt} */ ([0, h - rh]);
	const slope = /** @type {Poly} */ ([
		eL,
		eR,
		...sag(eR, rR, below, D.concave * 0.5).slice(1),
		// A longhouse ridge dips in the middle like an upturned boat.
		...(long ? sag(rR, rL, [(rR[0] + rL[0]) / 2, h], 0.06).slice(1) : [rL]),
		...sag(rL, eL, below, D.concave * 0.5).slice(1, -1),
	]);
	/** @type {Line[]} */
	const courses = [];
	for (let f = 0.25; f < 1; f += 0.25) {
		const y = h + (gTop[1] - h) * f;
		courses.push({
			pts: [
				[-w, y],
				[w + 10, y + 0.0001],
			],
			w: THIN,
		});
	}
	const fills =
		kind === 'warehouse'
			? loadingBay(D, w, h)
			: kind === 'church'
				? naveWindows(w, h)
				: kind === 'barn'
					? [rect(-4.2, 0, 8.4, h * 0.82)]
					: kind === 'barracks'
						? barracksWindows(w, h)
						: facade(D, -w / 2, w / 2, h, two, r);
	const barn = kind === 'barn';
	const wallRole = barn ? /** @type {const} */ ('wood') : undefined;
	/** Vertical plank seams on a barn. @param {number} x0 @param {number} x1 */
	const planks = (x0, x1, y0 = 0, y1 = h + rh + 10) => {
		/** @type {Line[]} */
		const out = [];
		for (let x = x0 + 2.2; x < x1; x += 2.2)
			out.push({
				pts: [
					[x, y0 - 1],
					[x + v[0], y1 + v[1]],
				],
				w: 0.45,
			});
		return out;
	};
	const rose = P.at([w / 2, h + rh * 0.3], 0.5);
	/** @type {Part[]} */
	const back =
		kind === 'workshop'
			? chimneys(D, w, h, rh, P)
			: kind === 'tavern'
				? chimneys(D, 20, h, rh, P)
				: [];
	/** @type {Part[]} */
	const extras = [];
	if (kind === 'tavern') {
		// Sign on a bracket off the left corner.
		const y = h * 0.74,
			x = -w / 2;
		extras.push({
			solid: [rect(x - 8, y - 8.2, 6.6, 5.6)],
			role: 'flag',
			fills: [circle(x - 4.7, y - 5.4, 1.4)],
			free: [
				{
					pts: [
						[x + 0.5, y],
						[x - 8.6, y],
					],
					w: 1.1,
				},
				{
					pts: [
						[x - 7.4, y],
						[x - 7.4, y - 2.6],
					],
					w: 0.5,
				},
				{
					pts: [
						[x - 2, y],
						[x - 2, y - 2.6],
					],
					w: 0.5,
				},
			],
		});
	}
	// The banner flies from the left gable peak, streaming over the roof, so
	// it doesn't widen the building.
	if (kind === 'barracks')
		extras.push(...flag({ ...D, flagLen: Math.max(D.flagLen, 12) }, rL[0] + ov * 0.6, rL[1] - 1));
	/** @type {Part[]} */
	const race = [];
	if (kind === 'mill') {
		// Waterwheel standing in a mill race along the front, facing the
		// viewer so it reads as a true circle; given depth with a back rim
		// and paddle boards spanning the two rims.
		const R = h * 0.74;
		const C = /** @type {Pt} */ ([-w / 2 - R * 0.15, R - 1.2]);
		// Back rim at depth 3.4, through the house's projector so it shrinks
		// with the rest of the building.
		const Cb = P.at(C, 3.4 / d),
			rs = P.scale(3.4 / d);
		const ringAt = (/** @type {Pt} */ c, /** @type {number} */ r0, /** @type {number} */ r1) => {
			/** @type {Poly} */
			const outer = [];
			/** @type {Poly} */
			const inner = [];
			for (let i = 0; i < 36; i++) {
				const a = (i / 36) * Math.PI * 2;
				outer.push([c[0] + Math.cos(a) * r1, c[1] + Math.sin(a) * r1]);
				inner.unshift([c[0] + Math.cos(a) * r0, c[1] + Math.sin(a) * r0]);
			}
			return [outer, inner];
		};
		const pt = (/** @type {Pt} */ c, /** @type {number} */ a, /** @type {number} */ r) =>
			/** @type {Pt} */ ([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
		/** @type {Poly[]} */
		const paddles = [];
		for (let i = 0; i < 10; i++) {
			const a = (i / 10) * Math.PI * 2 + 0.12;
			paddles.push([
				pt(C, a, R * 0.9),
				pt(C, a, R * 1.1),
				pt(Cb, a, R * 1.1 * rs),
				pt(Cb, a, R * 0.9 * rs),
			]);
		}
		/** @type {Line[]} */
		const spokes = [];
		for (let i = 0; i < 6; i++) {
			const a = (i / 6) * Math.PI * 2 + 0.12;
			spokes.push({ pts: [pt(C, a, -R * 0.82), pt(C, a, R * 0.82)], w: 0.8 });
		}
		const x0 = C[0] - R * 1.5,
			x1 = C[0] + R * 1.5,
			y0 = -2.4,
			raceT = 6 / d;
		race.push({
			solid: [[[x0, y0], [x1, y0], P.at([x1, y0], raceT), P.at([x0, y0], raceT)]],
			role: 'water',
			terrain: true,
			lines: [0.3, 0.6].map((f) => ({
				pts: /** @type {Poly} */ ([P.at([x0, y0], raceT * f), P.at([x1, y0], raceT * f)]),
				w: 0.4,
			})),
		});
		extras.push(
			{ solid: ringAt(Cb, R * 0.82 * rs, R * rs), role: 'wood', shaded: true },
			{ solid: paddles, role: 'wood', shadeArea: rect(C[0], C[1] - R * 2, R * 3, R * 4) },
			{ solid: [], free: [{ pts: [C, P.at(C, 8 / d)], w: 1.2 }] },
			{ solid: ringAt(C, R * 0.82, R), role: 'wood', free: spokes },
			{ solid: [circle(C[0], C[1], 1.3)], role: 'wood' },
		);
	}
	/** @type {Line[]} */
	const hoist = [];
	/** @type {Part[]} */
	const crate = [];
	if (long)
		// Crossed gable horns (barge boards carried past the peak) at both ends.
		for (const p of [rR, add(rL, [ov * 1.2, 0])])
			hoist.push(
				{ pts: [add(p, [-2.6, -2.2]), add(p, [2.2, 3.6])], w: 1.1, round: true },
				{ pts: [add(p, [2.6, -2.2]), add(p, [-2.2, 3.6])], w: 1.1, round: true },
			);
	if (kind === 'warehouse') {
		// Hoist beam out of the gable peak, a rope, and a crate on it.
		const top = P.at([w / 2, h + rh * 0.62], 0.5);
		hoist.push(
			{ pts: [top, add(top, [6, 0])], w: 1.4 },
			{ pts: [add(top, [5.2, 0]), add(top, [5.2, -7])], w: THIN },
		);
		const c = add(top, [5.2, -7]);
		crate.push({ solid: [rect(c[0] - 1.8, c[1] - 3.2, 3.6, 3.2)], role: 'wood' });
	}
	return [
		...race,
		...back,
		{
			solid: [gableEnd],
			role: wallRole,
			shaded: true,
			lines: [
				...hatch(gableEnd, 65, D.hatch),
				...(barn ? planks(w / 2, w / 2 + v[0], 0, h + rh + v[1]) : []),
			],
			fills:
				kind === 'warehouse'
					? []
					: barn
						? [P.face(rect(-1.6, 0, 3.2, 3.2), w / 2, h + 0.8, 0.5)]
						: kind === 'church'
							? [circle(rose[0], rose[1], 2.6)]
							: [P.face(opening(D, 0, 0, 2.2), w / 2, h + 1.5, 0.45)],
			cuts: kind === 'church' ? roseCuts(rose) : [],
		},
		{
			solid: [rect(-w / 2, 0, w, h)],
			role: wallRole,
			fills,
			cuts: kind === 'warehouse' ? doorCuts(w, h) : barn ? barnDoorCuts(h) : [],
			lines:
				D.masonry || kind === 'barracks'
					? stoneCourses(-w / 2, w / 2, 0, h)
					: barn
						? planks(-w / 2, w / 2, 0, h).map((l) => ({
								...l,
								pts: [
									[l.pts[0][0], -1],
									[l.pts[0][0], h + 1],
								],
							}))
						: [],
		},
		{ solid: [slope], role: 'roof', lines: courses, free: hoist },
		...(D.flourish > 0.45 ? cresting(add(rL, [ov * 0.6, 0]), add(rR, [-ov * 0.6, 0])) : []),
		...(D.flourish > 0.25 ? finial(gTop) : []),
		...crate,
		...extras,
	];
}

/** Barracks front: a door in the middle, regular slit windows either side. */
function barracksWindows(/** @type {number} */ w, /** @type {number} */ h) {
	const n = Math.max(3, Math.round(w / 4.4) | 1);
	return Array.from({ length: n }, (_, i) => {
		const x = -w / 2 + (w * (i + 0.5)) / n;
		return i === (n - 1) / 2
			? archOpening(x, 0, 3.6, h * 0.72)
			: rect(x - 0.6, h * 0.38, 1.2, h * 0.4);
	});
}

/**
 * Braced double barn door: centre seam plus an X brace on each leaf.
 * @returns {Line[]}
 */
function barnDoorCuts(/** @type {number} */ h) {
	const t = h * 0.82;
	/** @type {Line[]} */
	return [
		{
			pts: [
				[0, -1],
				[0, t + 1],
			],
			w: 0.7,
		},
		{
			pts: [
				[-4.2, 0.4],
				[0, t - 0.4],
			],
			w: 0.6,
		},
		{
			pts: [
				[-4.2, t - 0.4],
				[0, 0.4],
			],
			w: 0.6,
		},
		{
			pts: [
				[0, 0.4],
				[4.2, t - 0.4],
			],
			w: 0.6,
		},
		{
			pts: [
				[0, t - 0.4],
				[4.2, 0.4],
			],
			w: 0.6,
		},
	];
}

/** Ornamental finial: a ball on a short spike. @param {Pt} p @returns {Part[]} */
function finial(p) {
	return [
		{
			solid: [circle(p[0], p[1] + 2.2, 0.9)],
			role: 'roof',
			free: [{ pts: [p, [p[0], p[1] + 4]], w: 0.8 }],
		},
	];
}

/** A row of little spikes along a roof ridge. @param {Pt} a @param {Pt} b @returns {Part[]} */
function cresting(a, b) {
	const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
	/** @type {Poly[]} */
	const spikes = [];
	for (let i = 0; i <= n; i++) {
		const x = a[0] + ((b[0] - a[0]) * i) / n,
			y = a[1] + ((b[1] - a[1]) * i) / n;
		spikes.push([
			[x - 0.6, y - 0.2],
			[x + 0.6, y - 0.2],
			[x, y + 1.8],
		]);
	}
	return [{ solid: spikes, role: 'roof' }];
}

/** Stone courses with staggered joints, clipped to a wall by the renderer. */
function stoneCourses(
	/** @type {number} */ x0,
	/** @type {number} */ x1,
	/** @type {number} */ y0,
	/** @type {number} */ y1,
) {
	/** @type {Line[]} */
	const out = [];
	let row = 0;
	for (let y = y0 + 2.4; y < y1; y += 2.4, row++) {
		out.push({
			pts: [
				[x0 - 2, y],
				[x1 + 2, y],
			],
			w: 0.45,
		});
		for (let x = x0 + (row % 2 ? 2.2 : 0); x < x1; x += 4.4)
			out.push({
				pts: [
					[x, y - 2.4],
					[x, y],
				],
				w: 0.45,
			});
	}
	return out;
}

/** Tall lancet windows along a church nave. */
function naveWindows(/** @type {number} */ w, /** @type {number} */ h) {
	const n = Math.max(2, Math.round(w / 7));
	return Array.from({ length: n }, (_, i) =>
		lancet(-w / 2 + (w * (i + 0.5)) / n, h * 0.22, 2.8, h * 0.58),
	);
}

/**
 * Tracery knocked out of a rose window. @param {Pt} c
 * @returns {Line[]}
 */
function roseCuts(c) {
	/** @type {Line[]} */
	const out = [];
	for (let a = 0; a < 180; a += 45) {
		const t = (a * Math.PI) / 180;
		out.push({
			pts: [
				[c[0] - Math.cos(t) * 3, c[1] - Math.sin(t) * 3],
				[c[0] + Math.cos(t) * 3, c[1] + Math.sin(t) * 3],
			],
			w: 0.6,
		});
	}
	return out;
}

/** Warehouse ground floor: wide plank doors; small windows above. */
function loadingBay(/** @type {Design} */ D, /** @type {number} */ w, /** @type {number} */ h) {
	const fh = h / 1.65;
	/** @type {Poly[]} */
	const out = [];
	for (const x of bayXs(w)) out.push(rect(x - 3, 0, 6, fh * 0.85));
	for (const x of bayXs(w)) out.push(opening(D, x, fh + (h - fh) * 0.3, 2.6));
	return out;
}
/** @param {number} w */
const bayXs = (w) => (w > 26 ? [-w / 4, w / 4] : [0]);
/**
 * Plank joint + brace knocked out of each loading door.
 * @returns {Line[]}
 */
function doorCuts(/** @type {number} */ w, /** @type {number} */ h) {
	const fh = (h / 1.65) * 0.85;
	return bayXs(w).flatMap(
		(x) =>
			/** @type {Line[]} */ ([
				{
					pts: [
						[x, -1],
						[x, fh + 1],
					],
					w: 0.7,
				},
				{
					pts: [
						[x - 3, 0.5],
						[x + 3, fh - 0.5],
					],
					w: 0.7,
				},
			]),
	);
}

/** Tall brick stacks behind a workshop roof, each with a smoke plume. */
function chimneys(
	/** @type {Design} */ D,
	/** @type {number} */ w,
	/** @type {number} */ h,
	/** @type {number} */ rh,
	/** @type {ReturnType<typeof boxProjector>} */ P,
) {
	/** @type {Part[]} */
	const out = [];
	for (const x of w > 26 ? [-w * 0.22, w * 0.18] : [w * 0.1]) {
		// Stacks stand 30% of the way back; their tops clear the ridge.
		const cx = P.at([x, h], 0.3)[0],
			sw = 3.6,
			top = P.at([0, h + rh], 0.5)[1] + 9;
		const v = depthVec(2.5);
		const side = /** @type {Poly} */ ([
			[cx + sw / 2, h],
			add([cx + sw / 2, h], v),
			add([cx + sw / 2, top], v),
			[cx + sw / 2, top],
		]);
		out.push(
			{ solid: [side], shaded: true, lines: hatch(side, 65, D.hatch) },
			{
				solid: [
					rect(cx - sw / 2, h, sw, top - h),
					rect(cx - sw / 2 - 0.6, top - 1.6, sw + 1.2, 1.6),
				],
			},
			{
				solid: [
					circle(cx + 1.5, top + 3.2, 2.4),
					circle(cx + 4.6, top + 5.6, 3),
					circle(cx + 8.6, top + 7.2, 2.4),
				],
			},
		);
	}
	return out;
}

/** Flag on a pole, folded `D.flagFolds` times. */
function flag(/** @type {Design} */ D, /** @type {number} */ x, /** @type {number} */ y) {
	const L = D.flagLen,
		hgt = 4.2,
		n = D.flagFolds * 4,
		shape = D.flagShape ?? 'banner';
	/** @type {Poly} */
	const top = [];
	/** @type {Poly} */
	const bot = [];
	for (let i = 0; i <= n; i++) {
		const t = i / n;
		const wave = Math.sin(t * Math.PI * D.flagFolds) * 0.9;
		// taper governs the cloth's trailing height:
		//   banner      → slight natural taper (1 - 0.45·t at the tip)
		//   pennant     → full taper to a single point (1 - t)
		//   swallowtail → no taper, full-height trailing edge (= 1) with a
		//                 deep V-notch cut between its two tips.
		const taper = shape === 'pennant' ? 1 - t : shape === 'swallowtail' ? 1 : 1 - t * 0.45;
		top.push([x + 0.4 + L * t, y + 10 + wave - t * 0.8]);
		bot.push([x + 0.4 + L * t, y + 10 - hgt * taper + wave - t * 0.8]);
	}
	/** @type {Poly} */
	let cloth;
	if (shape === 'swallowtail') {
		const topTip = top[top.length - 1],
			botTip = bot[bot.length - 1];
		const notchDepth = L * 0.4;
		const notch = /** @type {Pt} */ ([topTip[0] - notchDepth, (topTip[1] + botTip[1]) / 2]);
		cloth = [...top, notch, ...bot.reverse()];
	} else if (shape === 'pennant') {
		// Both edges meet at the same trailing point; drop the duplicate tip.
		cloth = [...top, ...bot.slice(0, -1).reverse()];
	} else {
		cloth = [...top, ...bot.reverse()];
	}
	/** @type {Part[]} */
	const parts = [
		{ solid: [cloth], role: 'flag' },
		{
			solid: [],
			free: [
				{
					pts: [
						[x, y],
						[x, y + 10.5],
					],
					w: 1.2,
				},
			],
		},
	];
	return parts;
}

/**
 * Round tower: shaded cylinder, optionally crenellated at the top, capped
 * per the culture — cone, onion, dome, lancet or nothing.
 * @param {Design} D
 * @param {{r?: number, h?: number, roof?: Design['towerRoof'], crenel?: boolean, flags?: boolean, corbel?: number, belfry?: boolean, clock?: boolean, finial?: boolean}} [o]
 *   `belfry`: a church bell tower — door, and an arched bell chamber with its
 *   bell in place of the window; `clock`: a clock face up top instead;
 *   `finial`: the culture's holy symbol on the top instead of a flag.
 * @returns {Part[]}
 */
export function roundTower(D, o = {}) {
	const r = o.r ?? 6,
		h = (o.h ?? 30) * D.stature,
		ry = r * 0.34,
		b = bowAmt(D.towerBow),
		// Concave (elven) towers flare at the foot and narrow as they rise.
		top = r * (1 - (b > 0 ? Math.max(D.taper, 0.42 * Math.min(1, D.towerBow)) : D.taper));
	const { roof, crenel } = towerTop(D, o);
	/** @type {Pt} */ const mid = [0, h / 2];
	// Corbelled body: from the belt up to the parapet, the walls widen via
	// a 45° slope and then stay flared. `D.towerCorbel` is the share of the
	// tower's height occupied by the corbel, measured down from the top —
	// 0 means no corbel, 1 means the whole tower is the slope. Orthogonal
	// to roof style: any cap can sit on a corbelled or straight body.
	const corbelAmount = Math.max(0, Math.min(1, o.corbel ?? D.towerCorbel ?? 0));
	const corbelOvMax = Math.max(1.6, r * 0.26);
	const corbelBelt = (1 - corbelAmount) * h;
	// Project outward by the fixed max, clamped to the room available above
	// the belt — can't rise past the parapet.
	const corbelOv = Math.min(corbelOvMax, Math.max(0, h - corbelBelt));
	const corbel = corbelOv > 0.01;
	const topCorbel = top + corbelOv;
	const body = corbel
		? /** @type {Poly} */ ([
				...ell(0, 0, r, ry, 180, 360),
				...sag([r, 0], [top, corbelBelt], [0, corbelBelt / 2], b).slice(1),
				[topCorbel, corbelBelt + corbelOv], // 45° slope out
				[topCorbel, h], // vertical to top
				[-topCorbel, h],
				[-topCorbel, corbelBelt + corbelOv],
				[-top, corbelBelt],
				...sag([-top, corbelBelt], [-r, 0], [0, corbelBelt / 2], b).slice(1, -1),
			])
		: /** @type {Poly} */ ([
				...ell(0, 0, r, ry, 180, 360),
				...sag([r, 0], [top, h], mid, b).slice(1),
				...sag([-top, h], [-r, 0], mid, b).slice(0, -1),
			]);
	/** @type {Poly[]} */
	const bodySolids = [body];
	// A top ellipse closes the corbelled deck so the parapet reads as a disc
	// (otherwise the cone sits on a flat line without the oblique rim).
	if (corbel) {
		bodySolids.push([
			...ell(0, h, topCorbel, ry * 1.1, 180, 360),
			...ell(0, h, topCorbel, ry * 1.1, 0, 180).slice(1),
		]);
	}
	// Shade reaches to the wider radius when corbelled, so the 45° outer
	// slope and the parapet both carry the cylindrical shading.
	const shadeR = corbel ? topCorbel : r;
	// Window follows the culture's style. Height varies — compute conservatively
	// for the straddle check so no shape crosses the corbel bend.
	const winS = D.window === 'arched' || D.window === 'lancet' ? 4.4 : 4;
	const winH =
		D.window === 'arched'
			? winS * 1.5
			: D.window === 'lancet'
				? winS * 1.6
				: D.window === 'slit'
					? winS * 1.4
					: winS;
	const winY = clearCorbel(h * 0.55, winH, corbelBelt, corbelOv);
	// Bell towers and clock towers: a door at the foot, and either a bell
	// chamber or a clock face near the top — each clear of the corbel bend.
	const steeple = o.belfry || o.clock;
	const belfryY = clearCorbel(h - 9.5, 7.5, corbelBelt, corbelOv);
	const dialR = Math.min(r * 0.62, 3.6);
	// The dial sits clear below the cap's front rim (h − ry).
	const dialY = clearCorbel(h - ry - 1.4 - dialR * 2, dialR * 2, corbelBelt, corbelOv) + dialR;
	/** @type {Poly[]} */
	const openings = steeple
		? [
				archOpening(0, -ry * 0.85, 4, 7),
				o.clock
					? opening(D, 0, clearCorbel(h * 0.42, winH, corbelBelt, corbelOv), winS)
					: archOpening(0, belfryY, 4.4, 7.5),
			]
		: [opening(D, -r * 0.35, winY, winS)];
	/** @type {Part[]} */
	const parts = [
		{
			solid: bodySolids,
			shadeArea: rect(shadeR * 0.3, -ry - 2, shadeR * 2, h + ry + 4),
			shadeLines: cylinderHatch(shadeR, -ry - 1, h + 1, D.hatch),
			fills: openings,
			cuts: o.belfry && !o.clock ? bellCuts(0, belfryY + 1.9) : [],
		},
		...(o.clock ? clockFace(0, dialY, dialR) : []),
	];
	// Crenellated top: a short parapet ring corbelled out from the body top
	// on its own 45° slope — the same look as the body corbel — with merlons
	// round its rim. A cap sits on it (its crenels showing as dark slots under
	// the eave); with no cap the merlons stand free and the flag flies from
	// the platform. Caps sit at `capY` on radius `capR` either way.
	let capY = h,
		capR = topCorbel;
	const flies = D.flags && o.flags !== false && !o.finial;
	/** Flag or finial on the uppermost point `tip` of the top. */
	const crown = (/** @type {Pt} */ tip, /** @type {number} */ drop, socket = 0) => {
		if (o.finial) parts.push(...symbolAt(D.symbol, tip, socket));
		else if (flies) parts.unshift(...flag(D, tip[0], tip[1] - drop));
	};
	if (crenel) {
		const ov = Math.max(0.8, r * 0.2),
			band = Math.max(3, r);
		const R = topCorbel + ov,
			y1 = h + ov,
			y2 = y1 + band;
		const capped = roof !== 'none';
		/** @type {Poly} */
		const ring = [
			...ell(0, h, topCorbel, ry, 180, 360),
			...(capped
				? [/** @type {Pt} */ ([R, y1]), /** @type {Pt} */ ([R, y2]), /** @type {Pt} */ ([-R, y2])]
				: crenellated(-R, R, y1, y2, { merlon: 2.4, notch: Math.min(2, band * 0.45) }).slice(1)),
			[-R, y1],
		];
		/** @type {Poly[]} */
		const slots = [];
		if (capped)
			// Crenels between merlons, seen as dark slots under the cap's rim.
			for (let a = 215; a <= 325; a += 22) {
				const t = (a * Math.PI) / 180;
				const x = R * Math.cos(t),
					w = 1.1 * Math.abs(Math.sin(t)),
					rim = y2 + ry * Math.sin(t);
				slots.push(rect(x - w / 2, rim - band * 0.42, w, band * 0.42 + 0.6));
			}
		parts.push({
			solid: [ring],
			fills: slots,
			// The break where the 45° slope meets the upright band.
			lines: [{ pts: ell(0, y1, R, ry, 180, 360), w: THIN }],
			shadeArea: rect(R * 0.3, h - ry - 2, R * 2, y2 - h + ry + 4),
			shadeLines: cylinderHatch(R, h - ry - 1, y2 + 1, D.hatch),
		});
		if (!capped) {
			crown([0, y2], 2);
			return parts;
		}
		capY = y2;
		capR = R;
	}
	if (roof === 'onion') {
		const dome = onionDome(D, 0, capY, capR * 0.95);
		parts.push(...dome.parts);
		crown(dome.tip, 2);
		return parts;
	}
	if (roof === 'dome') {
		const dome = hemiDome(0, capY, capR + 0.4, D.hatch);
		parts.push(dome.part);
		crown(dome.tip, 2);
		return parts;
	}
	if (roof === 'lancet') {
		const cap = lancetCap(D, 0, capY, capR + 0.2);
		parts.push(cap.part);
		crown(cap.tip, 2, 3);
		return parts;
	}
	// Cone base sits on whatever is below — the crenellated top, or the
	// body's own top radius (`topCorbel` absorbs a corbel's 45° slope).
	const R = capR + 1.8;
	const rh = top * 2 * D.spire * 0.75;
	/** @type {Pt} */ const apex = [0, capY + rh];
	const sweep = D.concave * 0.8;
	/** @type {Poly} */
	const outline = [
		...ell(0, capY, R, ry, 180, 360),
		...sag([R, capY], apex, [0, capY], sweep).slice(1),
		...sag(apex, [-R, capY], [0, capY], sweep).slice(1, -1),
	];
	parts.push({
		solid: [outline],
		role: 'roof',
		shadeArea: rect(R * 0.25, capY - ry - 2, R * 2, rh + ry + 4),
		shadeLines: capHatch(0, R, capY - ry - 2, capY + rh + 2, D.hatch),
	});
	crown(apex, 1, 3);
	return parts;
}

/**
 * Square tower (church tower / donjon): optionally crenellated at the top,
 * capped per the culture — a pyramid spire for cone, or onion, dome, lancet,
 * or nothing.
 * @param {Design} D
 * @param {{w?: number, h?: number, finial?: boolean, clock?: boolean, corbel?: number, roof?: Design['towerRoof'], crenel?: boolean}} [o]
 *   `finial`: top it with the culture's symbol; `clock`: a clock face instead
 *   of the belfry; `corbel`: override `D.towerCorbel` (0..1).
 * @returns {Part[]}
 */
export function squareTower(D, o = {}) {
	const w = o.w ?? 10,
		h = (o.h ?? 28) * D.stature;
	const { roof, crenel } = towerTop(D, o);
	// A crenellated top's corbel and band (see below).
	const ctOv = Math.max(0.8, w * 0.12),
		ctBand = Math.max(3, w * 0.5);
	const P = boxProjector(
		w * 0.8,
		D.perspective ?? DEFAULT_DESIGN.perspective,
		crenel ? h + ctOv + ctBand : h,
	);
	// Corbelled body: from the belt up, the walls widen by beltOv on every
	// side via a 45° slope. `D.towerCorbel` is the share of the tower's
	// height occupied by the corbel (measured down from the top) — 0 means
	// no corbel, 1 means the whole tower is the slope. Pyramid / onion /
	// dome above rises from the wider top.
	const corbelAmount = Math.max(0, Math.min(1, o.corbel ?? D.towerCorbel ?? 0));
	const beltOvMax = Math.max(1.4, w * 0.14);
	const beltY = (1 - corbelAmount) * h;
	const beltOv = Math.min(beltOvMax, Math.max(0, h - beltY));
	const corbel = beltOv > 0.01;
	const w2 = w / 2 + beltOv; // effective half-width at the top
	// Front wall: plain rect when straight; T-shape when corbelled.
	const frontSolid = corbel
		? /** @type {Poly} */ ([
				[-w / 2, 0],
				[w / 2, 0],
				[w / 2, beltY],
				[w2, beltY + beltOv],
				[w2, h],
				[-w2, h],
				[-w2, beltY + beltOv],
				[-w / 2, beltY],
			])
		: rect(-w / 2, 0, w, h);
	// Side (right-oblique) face: plain parallelogram when straight; T-shape
	// pushed back along the depth vector when corbelled.
	const side = corbel
		? /** @type {Poly} */ ([
				[w / 2, 0],
				P.back([w / 2, 0]),
				P.back([w / 2, beltY]),
				P.back([w2, beltY + beltOv]),
				P.back([w2, h]),
				[w2, h],
				[w2, beltY + beltOv],
				[w / 2, beltY],
			])
		: /** @type {Poly} */ ([[w / 2, 0], P.back([w / 2, 0]), P.back([w / 2, h]), [w / 2, h]]);
	// Keep every opening wholly below or above the corbel bend; straddling
	// kills the 3D read on the 45° slope.
	const belfryY = clearCorbel(h - 9.5, 7.5, beltY, beltOv);
	const clockWinS = D.window === 'arched' || D.window === 'lancet' ? 4.4 : 4;
	const clockWinH =
		D.window === 'arched'
			? clockWinS * 1.5
			: D.window === 'lancet'
				? clockWinS * 1.6
				: D.window === 'slit'
					? clockWinS * 1.4
					: clockWinS;
	const clockWinY = clearCorbel(h * 0.45, clockWinH, beltY, beltOv);
	/** @type {Part[]} */
	const parts = [
		{ solid: [side], shaded: true, lines: hatch(side, 65, D.hatch) },
		{
			solid: [frontSolid],
			fills: o.clock
				? [archOpening(0, 0, 4, 7), opening(D, 0, clockWinY, clockWinS)]
				: [archOpening(0, 0, 4, 7), archOpening(0, belfryY, 4.4, 7.5)],
			cuts: o.clock ? [] : bellCuts(0, belfryY + 1.9),
			lines: D.masonry ? stoneCourses(-w / 2, w / 2, 0, h) : [],
		},
		...(o.clock ? clockFace(0, h - w * 0.42, w * 0.3) : []),
	];
	// Crenellated top: a parapet band corbelled out on its own 45° slope, as
	// on round towers. A cap then sits on it, its crenels showing as dark
	// slots under the eave; bare, it shows a platform with merlons round the
	// rim and a back parapet. Caps sit at `topY` on half-width `topW`.
	let topY = h,
		topW = w2;
	if (crenel) {
		const band = ctBand;
		const w3 = w2 + ctOv,
			y1 = h + ctOv,
			y2 = y1 + band;
		const capped = roof !== 'none';
		const notch = Math.min(2, band * 0.45);
		/** @type {Poly} */
		const ctFront = [
			[-w2, h],
			[w2, h],
			...(capped
				? /** @type {Pt[]} */ ([
						[w3, y1],
						[w3, y2],
						[-w3, y2],
					])
				: crenellated(-w3, w3, y1, y2, { merlon: 2.2, notch }).slice(1)),
			[-w3, y1],
		];
		/** @type {Poly} */
		const ctSide = [
			[w2, h],
			P.back([w2, h]),
			P.back([w3, y1]),
			P.back([w3, y2]),
			[w3, y2],
			[w3, y1],
		];
		if (!capped) {
			// Back parapet (its inner face, in shadow), then the platform.
			const BL = P.back([-w3, y2]),
				BR = P.back([w3, y2]),
				sb = P.scale(1);
			const back = crenellated(BL[0], BR[0], BL[1], BL[1] + band * 0.6 * sb, {
				merlon: 2.2 * sb,
				notch: notch * sb,
			});
			parts.push(
				{ solid: [back], shaded: true, lines: hatch(back, 65, D.hatch) },
				{ solid: [[[-w3, y2], [w3, y2], BR, BL]] },
			);
		}
		/** @type {Poly[]} */
		const sideMerlons = [];
		if (!capped)
			for (let i = 0; i < 3; i++)
				sideMerlons.push(P.face(rect(-0.9, 0, 1.8, notch), w3, y2 - 0.3, (i + 0.5) / 3));
		/** @type {Poly[]} */
		const slots = [];
		if (capped)
			for (let x = -w3 + 1.5; x < w3 - 0.9; x += 2.4)
				slots.push(rect(x - 0.5, y2 - band * 0.42, 1, band * 0.42 + 0.6));
		parts.push(
			{ solid: [ctSide, ...sideMerlons], shaded: true, lines: hatch(ctSide, 65, D.hatch) },
			{
				solid: [ctFront],
				fills: slots,
				// The break where the 45° slope meets the upright band.
				lines: [
					{
						pts: [
							[-w3, y1],
							[w3, y1],
						],
						w: THIN,
					},
				],
			},
		);
		if (!capped) {
			if (o.finial) parts.push(...symbolAt(D.symbol, P.at([0, y2], 0.5)));
			return parts;
		}
		topY = y2;
		topW = w3;
	}
	// Pyramid corners use `topW` — the tower top, or its crenellated band —
	// so the pyramid base always matches what it sits on.
	const ov = corbel || crenel ? 0 : 1;
	/** @type {Pt} */ const fl = [-topW - ov, topY];
	/** @type {Pt} */ const fr = [topW + ov, topY];
	const br = P.back(fr);
	const bl = P.back(fl);
	const apex = P.at([0, topY + w * D.spire], 0.5);
	// Centre of the top (where the caps sit) and the scale there; the spire
	// faces sag toward a point level with the front eave below it.
	const top = P.at([0, topY], 0.5),
		cs = P.scale(0.5);
	const c = /** @type {Pt} */ ([top[0], topY]);
	/** @type {Poly} */
	const flatTop = [[-topW, topY], [topW, topY], P.back([topW, topY]), P.back([-topW, topY])];
	/** @type {Poly} */
	const sideFace = [
		fr,
		br,
		...sag(br, apex, c, D.concave).slice(1),
		...sag(apex, fr, c, D.concave).slice(1, -1),
	];
	// Deck at the top — fills the oblique top so the softened corners where
	// front, side and roof meet don't leave a sliver of background showing.
	if (corbel && !crenel) parts.push({ solid: [[fl, fr, br, bl]], role: 'roof' });
	const deck = !corbel || crenel;
	if (roof === 'onion') {
		if (deck) parts.push({ solid: [flatTop] });
		const dome = onionDome(D, top[0], top[1] - 0.6, topW * cs);
		parts.push(...dome.parts);
		if (o.finial) parts.push(...symbolAt(D.symbol, dome.tip));
		return parts;
	}
	if (roof === 'dome') {
		if (deck) parts.push({ solid: [flatTop] });
		const dome = hemiDome(top[0], top[1], topW * 1.04 * cs, D.hatch);
		parts.push(dome.part);
		if (o.finial) parts.push(...symbolAt(D.symbol, dome.tip));
		return parts;
	}
	if (roof === 'lancet') {
		if (deck) parts.push({ solid: [flatTop] });
		const cap = lancetCap(D, top[0], top[1], topW * 1.04 * cs);
		parts.push(cap.part);
		if (o.finial) parts.push(...symbolAt(D.symbol, cap.tip, 3));
		return parts;
	}
	// Pyramid (the cone cap on a square tower), one part so the apex closes.
	const ridge = sag(fr, apex, c, D.concave);
	/** @type {Poly} */
	const frontFace = [fl, ...ridge, ...sag(apex, fl, c, D.concave).slice(1, -1)];
	parts.push(pyramid(frontFace, sideFace, ridge, 'roof', D.hatch));
	if (o.finial) parts.push(...symbolAt(D.symbol, apex, 3));
	return parts;
}

/**
 * A landmark tower — church and cathedral towers, the clock tower, a village
 * bell tower — square or round per the culture's `steeple`, with the
 * culture's cap and crenellated top either way.
 * @param {Design} D
 * @param {{w?: number, h?: number, finial?: boolean, clock?: boolean}} [o]
 * @returns {Part[]}
 */
export function belfry(D, o = {}) {
	if (D.steeple !== 'round') return squareTower(D, o);
	return roundTower(D, {
		r: (o.w ?? 10) / 2,
		h: o.h ?? 28,
		belfry: !o.clock,
		clock: o.clock,
		finial: o.finial,
		flags: false,
	});
}

/**
 * Square gate tower: lit front with an arch, shaded right side. Stone
 * towers get merlons; wooden ones (palisades) a row of sharpened planks.
 * @param {Design} D
 * @param {number} y0
 * @param {number} h
 * @param {boolean} wood
 * @returns {Part[]}
 */
function gateTower(D, y0, h, wood) {
	const w = 11;
	const P = boxProjector(5, D.perspective ?? DEFAULT_DESIGN.perspective, y0 + h);
	const side = /** @type {Poly} */ ([
		[w / 2, y0],
		P.back([w / 2, y0]),
		P.back([w / 2, y0 + h]),
		[w / 2, y0 + h],
	]);
	/** @type {Poly} */
	const front = wood
		? [
				[-w / 2, y0],
				[w / 2, y0],
				[w / 2, y0 + h],
				[-w / 2, y0 + h],
			]
		: crenellated(-w / 2, w / 2, y0, y0 + h, { merlon: 2.2, notch: 2 });
	// A wooden gate takes the palisade's plank pattern.
	const role = wood ? /** @type {const} */ ('wall-wood') : undefined;
	// Banner is planted on whatever caps the gate — the dome tip, the pyramid
	// apex, or (stone gate) just the crenellated parapet.
	let flagAt = /** @type {Pt} */ ([0.6, y0 + h - 0.5]);
	/** @type {Part[]} */
	const parts = [
		{ solid: [side], role, shaded: true, lines: hatch(side, 65, D.hatch) },
		{
			solid: [front],
			role,
			fills: [archOpening(0, y0, 5.6, Math.min(8.5, h * 0.7))],
		},
	];
	// Every gate gets a sheltered cap: dome in dome culture, otherwise a
	// modest pyramid roof. Stone gates keep their crenellated parapet below
	// the roof as a decorative band; wooden gates already had their
	// sharpened-palisade crown replaced with a flat top. The roof's own
	// role is the palisade's plank pattern on wooden gates, 'roof' on stone gates (so the stone
	// gatehouse's cap takes the marker colour, matching every other roof).
	const yTop = y0 + h;
	parts.push({
		solid: [[[-w / 2, yTop], [w / 2, yTop], P.back([w / 2, yTop]), P.back([-w / 2, yTop])]],
	});
	if (D.towerRoof === 'dome') {
		const [dx, dy] = P.at([0, yTop], 0.5);
		const dome = hemiDome(dx, dy, w * 0.42 * P.scale(0.5), D.hatch);
		parts.push(dome.part);
		flagAt = [dome.tip[0], dome.tip[1] - 1.5];
	} else {
		const ov = 1.2,
			rh = w * 0.55;
		const roofRole = wood ? /** @type {const} */ ('wall-wood') : /** @type {const} */ ('roof');
		/** @type {Pt} */ const fL = [-w / 2 - ov, yTop];
		/** @type {Pt} */ const fR = [w / 2 + ov, yTop];
		const bR = P.back(fR);
		const apex = P.at([0, yTop + rh], 0.5);
		const frontRoof = /** @type {Poly} */ ([fL, fR, apex]);
		const sideRoof = /** @type {Poly} */ ([fR, bR, apex]);
		parts.push(pyramid(frontRoof, sideRoof, [fR, apex], roofRole, D.hatch));
		flagAt = [apex[0], apex[1] - 1];
	}
	// Banner flies in front of everything so it reads clearly against the cap.
	if (D.flags) parts.push(...flag(D, flagAt[0], flagAt[1]));
	return parts;
}

/**
 * @typedef {{piece: Part[], x?: number, y?: number, s?: number, flip?: boolean, ship?: boolean,
 *   wall?: boolean, wallShare?: number}} Placed  `ship`: the harbour's caravel; `wall`: an
 *   enclosure-wall face (ruins breach it rather than crumble it), `wallShare` its share of the run
 */

/**
 * Ring wall around a settlement, seen from above-front, in the culture's
 * style (or `o.type`). Returns placed pieces in two batches: `back` goes
 * BEHIND the buildings (the wall's far half and the towers on it), `front`
 * goes IN FRONT (near half, gate, near towers) — already depth-sorted.
 * @param {Design} D
 * `shape` (default: the culture's `wallShape`) switches to a square
 * enclosure — see squareWall().
 * @param {Design} D
 * @param {{rx?: number, ry?: number, h?: number, type?: Design['wall'], towers?: number, shape?: 'round' | 'square'}} [o]
 * @returns {{back: Placed[], front: Placed[]}}
 */
export function ringWall(D, o = {}) {
	if ((o.shape ?? D.wallShape) === 'square') return squareWall(D, o);
	const type = o.type ?? D.wall;
	const mat = material(type);
	const wood = mat.soft;
	const rx = o.rx ?? 40,
		ry = o.ry ?? 14,
		h = (o.h ?? 9) * (wood ? mat.h : D.wallH) * D.stature;
	const role = mat.role;
	const flank = rect(rx * 0.4, -ry - 2, rx, h + 2 * ry + 8);
	// Posts the wall top spans between: the gate at the front and each ring
	// tower (see below), in degrees.
	const nTowers = mat.towers ? (o.towers ?? D.wallTowers) : 0;
	const posts = [270];
	for (let i = 0; i < nTowers; i++) posts.push(270 + (360 * (i + 0.5)) / nTowers);
	posts.push(630);
	/** Wall height at angle `deg` — follows the culture's wall bow. */
	const hAt = (/** @type {number} */ deg) => {
		if (!bow(D)) return h;
		const a = ((((deg - 270) % 360) + 360) % 360) + 270;
		let i = 0;
		while (a > posts[i + 1]) i++;
		return spanH(D, h, (a - posts[i]) / (posts[i + 1] - posts[i]));
	};
	/** Top edge from angle a0 to a1 — sharpened stakes for a palisade. */
	const topEdge = (/** @type {number} */ a0, /** @type {number} */ a1) => {
		// One sharpened stake per STAKE units of arc (matching the plank pattern),
		// other crests every 4.5°.
		const n = Math.max(
			1,
			Math.round(
				mat.crest === 'stake'
					? (Math.abs(a1 - a0) * Math.PI * rx) / 180 / STAKE
					: Math.abs(a1 - a0) / 4.5,
			),
		);
		const at = (/** @type {number} */ i) => {
			const deg = a0 + ((a1 - a0) * i) / n;
			const a = (deg * Math.PI) / 180;
			return /** @type {Pt} */ ([rx * Math.cos(a), hAt(deg) + ry * Math.sin(a)]);
		};
		if (!wood) return Array.from({ length: n + 1 }, (_, i) => at(i));
		/** @type {Poly} */
		const pts = [];
		for (let i = 0; i <= n; i++) {
			pts.push(at(i));
			if (i < n) pts.push(...crest(mat, at(i), at(i + 1)));
		}
		return pts;
	};
	/** Vertical seams: stake joints on a palisade, light shading on stone. */
	const seams = (/** @type {number} */ a0, /** @type {number} */ a1) => {
		/** @type {Line[]} */
		const out = [];
		if (!mat.seams && !mat.hachure) return out;
		for (let t = a0; t <= a1; t += mat.hachure ? 3 : 4.5) {
			const a = (t * Math.PI) / 180;
			const x = rx * Math.cos(a),
				y = ry * Math.sin(a);
			// Hachures: short downhill ticks from the bank's crest.
			out.push({
				pts: mat.hachure
					? [
							[x, y + h + 1],
							[x, y + h * 0.35],
						]
					: [
							[x, y - 1],
							[x, y + h + 3],
						],
				w: THIN,
			});
		}
		return out;
	};
	// (Stone brick-courses used to be generated here as Clipper lines; now
	//  the stone body is pattern-filled via the wall-stone role — see
	//  settlement-kit/patterns.js. The pattern-filled role is set by
	//  `material('stone').role`; segments below just carry it on their part.)
	// The ring is cut into segments at its towers so towers and wall can be
	// depth-sorted together: a tower then sits behind the stretch of wall
	// that curves nearer the viewer than it, and in front of the stretch
	// that runs away from it — the wall comes into the tower naturally.
	const gk = gateKind(type, D);
	const twin = gk === 'twin';
	const archGate = gk === 'jawbone' || gk === 'arch' || twin;
	/** Ring towers (degrees), spaced round from the gate at the front. */
	const towerAngles = Array.from(
		{ length: nTowers },
		(_, i) => (270 + (360 * (i + 0.5)) / nTowers) % 360,
	);
	const twinAngles = twin ? [262, 278] : [];
	const rad = (/** @type {number} */ deg) => (deg * Math.PI) / 180;
	/** Outer face between angles a0 < a1, both within one half of the ring. */
	const facePoly = (/** @type {number} */ a0, /** @type {number} */ a1) =>
		/** @type {Poly} */ ([...topEdge(a0, a1), ...ell(0, 0, rx, ry, a1, a0)]);
	// Elven walls flare at the foot: a skirt from part-way up the outer face
	// out to a wider foot ring, its ends curving like a tower's flared base.
	const F = Math.max(0, D.wallBow) * 2.6,
		sh = h * 0.45;
	const flareSeg = (/** @type {number} */ a0, /** @type {number} */ a1) => {
		/** @type {Poly} */
		const poly = [...ell(0, sh, rx, ry, a0, a1)];
		if (a1 === 360) poly.push(...sag([rx, sh], [rx + F, 0], [rx, 0], 0.35).slice(1, -1));
		poly.push(...ell(0, 0, rx + F, ry + F * 0.34, a1, a0));
		if (a0 === 180) poly.push(...sag([-rx - F, 0], [-rx, sh], [-rx, 0], 0.35).slice(1, -1));
		return poly;
	};
	/** @type {Line[]} */
	const shade = [];
	for (let t = 25; t < 90; t += 4) {
		const x = rx * Math.sin(rad(t));
		shade.push({
			pts: [
				[x, -ry - h],
				[x, h + ry],
			],
			w: THIN,
		});
	}
	// One hatch field for the whole back face, so it runs on unbroken
	// across the segments (each clips it to its own face).
	const backHatch = hatch(
		/** @type {Poly} */ ([...topEdge(0, 180), ...ell(0, 0, rx, ry, 180, 0)]),
		70,
		D.hatch * 1.1,
	);
	/** Radius of the tower standing at angle `a`, if any (towers at 0° also
	 *  stand at 360°). */
	const towerR = (/** @type {number} */ a) => {
		const m = ((a % 360) + 360) % 360;
		if (towerAngles.some((t) => Math.abs(t - m) < 0.01)) return 5;
		if (twinAngles.some((t) => Math.abs(t - m) < 0.01)) return 4.2;
		return 0;
	};
	/**
	 * Pull a segment end that meets a tower back to the tower's edge when the
	 * segment draws IN FRONT of that tower (the tower is the further of the
	 * two): the wall then abuts the tower and overlaps it only slightly,
	 * rather than painting across its whole flank.
	 */
	const trim = (/** @type {number} */ end, /** @type {number} */ mid) => {
		const r = towerR(end);
		if (!r || Math.sin(rad(end)) <= Math.sin(rad(mid))) return end;
		const d = ((r * 0.9) / (rx * Math.PI)) * 180;
		return end + Math.sign(mid - end) * d;
	};
	/** Segment edges for one half: its ends plus the posts inside it. */
	const cuts = (
		/** @type {number} */ lo,
		/** @type {number} */ hi,
		/** @type {number[]} */ posts,
	) => [lo, ...posts.filter((a) => a > lo && a < hi).sort((p, q) => p - q), hi];
	/**
	 * Earthworks: a run of rounded dirt mounds between angles a0 and a1,
	 * each overlapping its neighbours so they read as one heaped bank. Each
	 * mound is its own part (outline, right-flank shade and hatching), drawn
	 * far to near so the nearer mound overlaps the one behind.
	 */
	const moundParts = (
		/** @type {number} */ a0,
		/** @type {number} */ a1,
		/** @type {Partial<Part>} */ look,
	) => {
		const step = (7 / (rx * Math.PI)) * 180; // ~7 units of ring per heap
		const n = Math.max(1, Math.round((a1 - a0) / step));
		const st = (a1 - a0) / n;
		const hb = h * 0.5; // the bank's continuous lower course
		/** @type {Poly} */
		const body = [...ell(0, hb, rx, ry, a0, a1), ...ell(0, 0, rx, ry, a1, a0)];
		return bulwark(
			D,
			Array.from({ length: n }, (_, i) => {
				const c = a0 + st * (i + 0.5);
				return /** @type {[number, number, number]} */ ([
					rx * Math.cos(rad(c)),
					ry * Math.sin(rad(c)),
					hAt(c),
				]);
			}),
			body,
			look,
		);
	};
	/** Draw-order key: further back (larger y) draws first. @type {{k: number, item: Placed}[]} */
	const backList = [];
	/** @type {{k: number, item: Placed}[]} */
	const frontList = [];
	const towerPiece = (/** @type {number} */ r, /** @type {number} */ th) =>
		roundTower(D, { r, h: th, flags: D.flourish > 0.7 });

	// Back half: inner faces, in shadow.
	const bc = cuts(0, 180, towerAngles);
	for (let i = 0; i + 1 < bc.length; i++) {
		const mid = (bc[i] + bc[i + 1]) / 2;
		const [a0, a1] = [trim(bc[i], mid), trim(bc[i + 1], mid)];
		backList.push({
			k: ry * Math.sin(rad(mid)),
			item: {
				piece:
					mat.crest === 'mound'
						? moundParts(a0, a1, { role, shaded: true })
						: [
								{
									solid: [facePoly(a0, a1)],
									role,
									shaded: true,
									lines: [...backHatch, ...seams(a0, a1)],
								},
							],
				wall: true,
				wallShare: (a1 - a0) / 180,
			},
		});
	}
	// Front half: outer faces, lit on the left and shaded on the right flank.
	const fc = cuts(180, 360, [...towerAngles, ...twinAngles, ...(archGate ? [] : [270])]);
	for (let i = 0; i + 1 < fc.length; i++) {
		const mid = (fc[i] + fc[i + 1]) / 2;
		const [a0, a1] = [trim(fc[i], mid), trim(fc[i + 1], mid)];
		/** @type {Part[]} */
		const seg =
			mat.crest === 'mound'
				? moundParts(a0, a1, { role, shadeArea: flank })
				: [
						{
							solid: F ? [facePoly(a0, a1), flareSeg(a0, a1)] : [facePoly(a0, a1)],
							role,
							shadeArea: flank,
							lines: [...shade, ...seams(a0, a1)],
						},
					];
		if (archGate && a0 < 270 && a1 > 270)
			seg[0].fills = [archOpening(0, -ry, 6, Math.min(h * 0.85, 8))];
		if (!wood && D.merlons) {
			/** @type {Poly[]} */
			const merlons = [];
			for (let t = 195; t < 345; t += 9)
				if (t >= a0 && t < a1)
					merlons.push(
						rect(rx * Math.cos(rad(t)) - 1.1, hAt(t) + ry * Math.sin(rad(t)) - 0.4, 2.2, 2.6),
					);
			if (merlons.length) seg.push({ solid: merlons, role, shadeArea: flank });
		}
		frontList.push({
			k: ry * Math.sin(rad(mid)),
			item: { piece: seg, wall: true, wallShare: (a1 - a0) / 180 },
		});
	}
	// The gate, nearest of all.
	if (gk === 'jawbone') frontList.push({ k: -ry - 2, item: { piece: jawGate(-ry, h) } });
	else if (!archGate)
		frontList.push({
			k: -ry - 2,
			item: { piece: gateTower(D, -ry - 1, h + (wood ? 6 : 9), wood) },
		});
	for (const a of twinAngles) {
		const y = ry * Math.sin(rad(a)) - 0.5;
		frontList.push({
			k: y,
			item: { piece: towerPiece(4.2, h + 7), x: rx * Math.cos(rad(a)) * 1.02, y },
		});
	}
	for (const a of towerAngles) {
		const y = ry * Math.sin(rad(a));
		(Math.sin(rad(a)) > 0 ? backList : frontList).push({
			k: y,
			item: { piece: towerPiece(5, h + 8), x: rx * Math.cos(rad(a)), y },
		});
	}
	const order = (/** @type {{k: number, item: Placed}[]} */ list) =>
		list.sort((p, q) => q.k - p.k).map((e) => e.item);
	return { back: order(backList), front: order(frontList) };
}

/**
 * The culture's holy symbol standing on a point (a spire apex or dome tip).
 * Deliberately not always a cross — Ironsworn's faiths are the table's own.
 * `socket` carries the post that far down into the point: softening rounds
 * (and so lowers) a sharp spire apex, which would otherwise leave the symbol
 * floating above it. The socket sits inside the tip's outline ink.
 * @param {Design['symbol']} kind
 * @param {Pt} p
 * @param {number} [socket]
 * @returns {Part[]}
 */
function symbolAt(kind, p, socket = 0) {
	const parts = symbolShape(kind, p);
	if (!parts.length || !socket) return parts;
	/** @type {Line} */
	const post = { pts: [[p[0], p[1] - socket], p], w: 1.1 };
	return [{ ...parts[0], free: [...(parts[0].free ?? []), post] }, ...parts.slice(1)];
}

/**
 * @param {Design['symbol']} kind
 * @param {Pt} p
 * @returns {Part[]}
 */
function symbolShape(kind, p) {
	const [x, y] = p;
	/** @param {Poly} pts @param {number} [w] @returns {Line} */
	const ln = (pts, w = 1.2) => ({ pts, w });
	switch (kind) {
		case 'none':
			return [];
		case 'cross':
			return [
				{
					solid: [],
					free: [
						ln([p, [x, y + 6]], 1.3),
						ln(
							[
								[x - 2.2, y + 4],
								[x + 2.2, y + 4],
							],
							1.3,
						),
					],
				},
			];
		case 'horns': {
			/** @type {Poly} */
			const hornL = [
				[x - 0.3, y + 1.4],
				[x - 2, y + 2.6],
				[x - 2.9, y + 4.6],
				[x - 2.4, y + 6.8],
			];
			const hornR = /** @type {Poly} */ (hornL.map(([hx, hy]) => [2 * x - hx, hy]));
			return [
				{
					solid: [],
					free: [
						{ pts: [p, [x, y + 1.6]], w: 1.1 },
						{ pts: hornL, w: 1.1, round: true },
						{ pts: hornR, w: 1.1, round: true },
					],
				},
			];
		}
		case 'wheel': {
			/** @type {Line[]} */
			const spokes = [{ pts: [p, [x, y + 2.4]], w: 1 }];
			const ring = circle(x, y + 5.2, 2.8);
			spokes.push({ pts: [...ring, ring[0]], w: 0.8 });
			for (let a = 0; a < 180; a += 30) {
				const t = (a * Math.PI) / 180;
				spokes.push({
					pts: [
						[x - Math.cos(t) * 2.8, y + 5.2 - Math.sin(t) * 2.8],
						[x + Math.cos(t) * 2.8, y + 5.2 + Math.sin(t) * 2.8],
					],
					w: 0.5,
				});
			}
			return [{ solid: [circle(x, y + 5.2, 0.8)], role: 'roof', free: spokes }];
		}
		case 'claw': {
			// Varou clan mark: three claw slashes on a post.
			/** @type {Line[]} */
			const marks = [{ pts: [p, [x, y + 2]], w: 1 }];
			for (const dx of [-1.6, 0, 1.6])
				marks.push({
					pts: [
						[x + dx - 1.1, y + 2.4],
						[x + dx + 1.1, y + 7.4],
					],
					w: 0.9,
					round: true,
				});
			return [{ solid: [], free: marks }];
		}
		case 'trident':
			return [
				{
					solid: [],
					free: [
						{ pts: [p, [x, y + 8.4]], w: 1 },
						{
							pts: [
								[x - 2.4, y + 7.6],
								[x - 2.4, y + 4.6],
								[x + 2.4, y + 4.6],
								[x + 2.4, y + 7.6],
							],
							w: 0.9,
						},
					],
				},
				{
					solid: [
						[
							[x - 3, y + 7.4],
							[x - 1.8, y + 7.4],
							[x - 2.4, y + 9],
						],
						[
							[x - 0.6, y + 8.2],
							[x + 0.6, y + 8.2],
							[x, y + 10],
						],
						[
							[x + 1.8, y + 7.4],
							[x + 3, y + 7.4],
							[x + 2.4, y + 9],
						],
					],
					role: 'roof',
				},
			];
		case 'spike':
			return [
				{
					solid: [
						[
							[x - 0.9, y],
							[x + 0.9, y],
							[x, y + 8],
						],
					],
					role: 'roof',
				},
			];
		case 'sun': {
			/** @type {Line[]} */
			const rays = [ln([p, [x, y + 2.6]])];
			for (let a = 0; a < 360; a += 45) {
				const t = (a * Math.PI) / 180;
				rays.push(
					ln(
						[
							[x + Math.cos(t) * 2.4, y + 5 + Math.sin(t) * 2.4],
							[x + Math.cos(t) * 3.6, y + 5 + Math.sin(t) * 3.6],
						],
						0.8,
					),
				);
			}
			return [{ solid: [circle(x, y + 5, 1.7)], role: 'roof', free: rays }];
		}
		default: // orb
			return [{ solid: [circle(x, y + 4.4, 1.5)], role: 'roof', free: [ln([p, [x, y + 3]])] }];
	}
}

/**
 * A bell hanging in a belfry, knocked out of the dark opening.
 * @returns {Line[]}
 */
function bellCuts(/** @type {number} */ cx, /** @type {number} */ y) {
	/** @type {Line[]} */
	return [
		{
			pts: [
				[cx - 1.7, y],
				[cx - 1.2, y + 0.5],
				[cx - 1, y + 2.4],
				[cx - 0.5, y + 3.1],
				[cx + 0.5, y + 3.1],
				[cx + 1, y + 2.4],
				[cx + 1.2, y + 0.5],
				[cx + 1.7, y],
				[cx - 1.7, y],
			],
			w: 0.7,
		},
		{
			pts: [
				[cx, y + 3.1],
				[cx, y + 4.6],
			],
			w: 0.6,
		},
	];
}

/**
 * Footprint of a square enclosure matching a round one of radii rx/ry:
 * front width and the depth vector. Shared with the layouts so buildings
 * land inside the walls.
 * @param {number} rx
 * @param {number} ry
 * @returns {{W: number, dv: Pt}}
 */
export function squareFootprint(rx, ry) {
	return { W: rx * 1.75, dv: depthVec(ry * 2.7) };
}

/**
 * Square enclosure in 3/4 view. Seen from the front-right, so the front
 * and right walls show their OUTER faces (in front of the town) and the
 * back and left walls show their INNER faces (behind it). Towers go on
 * the corners first, then mid-wall; the gate is centred on the front.
 * @param {Design} D
 * @param {{rx?: number, ry?: number, h?: number, type?: Design['wall'], towers?: number}} o
 * @returns {{back: Placed[], front: Placed[]}}
 */
function squareWall(D, o) {
	const type = o.type ?? D.wall;
	const mat = material(type);
	const wood = mat.soft;
	const { W, dv } = squareFootprint(o.rx ?? 40, o.ry ?? 14);
	const h = (o.h ?? 9) * (wood ? mat.h : D.wallH) * D.stature;
	const role = mat.role;
	/** @type {Pt} */ const FL = [-W / 2, 0];
	/** @type {Pt} */ const FR = [W / 2, 0];
	const BL = add(FL, dv),
		BR = add(FR, dv);
	const up = (/** @type {Pt} */ p) => /** @type {Pt} */ ([p[0], p[1] + h]);
	/**
	 * Top edge from a to b (both at wall height) — sharpened stakes on a
	 * palisade; bowed between the corner posts by the culture's wall bow.
	 */
	const edge = (/** @type {Pt} */ a, /** @type {Pt} */ b) => {
		const bowed = !!bow(D);
		if (!wood && !bowed) return [a, b];
		const stride = mat.crest === 'stake' ? STAKE : 3.4;
		const n = Math.max(bowed ? 12 : 2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / stride));
		/** @type {Poly} */
		const pts = [];
		const at = (/** @type {number} */ i) =>
			/** @type {Pt} */ ([
				a[0] + ((b[0] - a[0]) * i) / n,
				a[1] + ((b[1] - a[1]) * i) / n + spanH(D, h, i / n) - h,
			]);
		if (!wood) return Array.from({ length: n + 1 }, (_, i) => at(i));
		for (let i = 0; i <= n; i++) {
			pts.push(at(i));
			if (i < n) pts.push(...crest(mat, at(i), at(i + 1)));
		}
		return pts;
	};
	const face = (/** @type {Pt} */ p, /** @type {Pt} */ q) =>
		/** @type {Poly} */ ([p, q, ...edge(up(q), up(p))]);
	/** Stake joints on a palisade. */
	const seams = (/** @type {Pt} */ p, /** @type {Pt} */ q) => {
		/** @type {Line[]} */
		const out = [];
		if (!mat.seams && !mat.hachure) return out;
		const n = Math.max(
			2,
			Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / (mat.hachure ? 2.4 : 3.4)),
		);
		for (let i = 1; i < n; i++) {
			const x = p[0] + ((q[0] - p[0]) * i) / n,
				y = p[1] + ((q[1] - p[1]) * i) / n;
			out.push({
				pts: mat.hachure
					? [
							[x, y + h + 1],
							[x, y + h * 0.35],
						]
					: [
							[x, y - 1],
							[x, y + h + 3],
						],
				w: THIN,
			});
		}
		return out;
	};
	// (Stone brick-courses were generated here as Clipper lines; now the
	//  stone body uses the wall-stone pattern role — see patterns.js.)
	/** Merlons along a stone wall's top edge. */
	const merlons = (/** @type {Pt} */ p, /** @type {Pt} */ q) => {
		/** @type {Poly[]} */
		const out = [];
		if (wood || !D.merlons) return out;
		const n = Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 4.6);
		for (let i = 0; i < n; i++) {
			const t = (i + 0.5) / n;
			const x = p[0] + (q[0] - p[0]) * t,
				y = p[1] + (q[1] - p[1]) * t + spanH(D, h, t);
			out.push(rect(x - 1.1, y - 0.4, 2.2, 2.6));
		}
		return out;
	};
	/** Flare out at the foot of an OUTER face (front, right) of elven walls. */
	const F = Math.max(0, D.wallBow) * 2.6;
	const wallPart = (
		/** @type {Pt} */ p,
		/** @type {Pt} */ q,
		/** @type {boolean} */ shaded,
		/** @type {Pt | null} */ outward = null,
	) => {
		if (mat.crest === 'mound') {
			// Earthworks: a bank along the side crested with heaps.
			const n = Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 7));
			const hb = h * 0.5;
			return bulwark(
				D,
				Array.from({ length: n }, (_, i) => {
					const t = (i + 0.5) / n;
					return /** @type {[number, number, number]} */ ([
						p[0] + (q[0] - p[0]) * t,
						p[1] + (q[1] - p[1]) * t,
						spanH(D, h, t),
					]);
				}),
				[p, q, [q[0], q[1] + hb], [p[0], p[1] + hb]],
				shaded ? { role, shaded: true } : { role },
			);
		}
		const poly = face(p, q);
		const m = merlons(p, q);
		/** @type {Part[]} */
		const parts = [
			{
				solid: F && outward ? [poly, flareSkirt(p, q, outward, h * 0.45)] : [poly],
				role,
				shaded,
				lines: [...(shaded ? hatch(poly, 65, D.hatch) : []), ...seams(p, q)],
			},
		];
		if (m.length) parts.push({ solid: m, role, shaded });
		return parts;
	};
	const gk = gateKind(type, D);
	const twin = gk === 'twin';
	const front = wallPart(FL, FR, false, [0, -F * 0.6]);
	if (gk === 'twin' || gk === 'arch' || gk === 'jawbone')
		front[0].fills = [archOpening(0, 0, 6, Math.min(h * 0.85, 8))];
	if (gk === 'jawbone') front.push(...jawGate(0, h));
	else if (gk === 'tower' || gk === 'woodtower')
		front.push(...gateTower(D, -1, h + (wood ? 6 : 9), wood));

	/** @type {Placed[]} */
	const back = [
		{ piece: wallPart(BL, BR, false), wall: true },
		{ piece: wallPart(FL, BL, true), wall: true },
	];
	/** @type {Placed[]} */
	const frontItems = [
		{ piece: wallPart(FR, BR, true, [F, -F * 0.3]), wall: true },
		{ piece: front, wall: true },
	];
	/** @type {Placed[]} */
	const towers = [];
	const mid = (/** @type {Pt} */ a, /** @type {Pt} */ b) =>
		/** @type {Pt} */ ([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
	// Corners first, then mid-wall; [position, behind the town?]
	/** @type {[Pt, boolean][]} */
	const slots = [
		[FL, false],
		[FR, false],
		[BL, true],
		[BR, true],
		[mid(BL, BR), true],
		[mid(FR, BR), false],
		[mid(FL, BL), true],
	];
	const n = mat.towers ? Math.min(slots.length, o.towers ?? D.wallTowers) : 0;
	for (const [p, behind] of slots.slice(0, n)) {
		const item = {
			piece: roundTower(D, { r: 5, h: h + 8, flags: D.flourish > 0.7 }),
			x: p[0],
			y: p[1] - 0.5,
		};
		(behind ? back : towers).push(item);
	}
	if (twin)
		for (const x of [-7.5, 7.5])
			towers.push({
				piece: roundTower(D, { r: 4.2, h: h + 7, flags: D.flourish > 0.7 }),
				x,
				y: -0.5,
			});
	towers.sort((p, q) => (q.y ?? 0) - (p.y ?? 0));
	return { back, front: [...frontItems, ...towers] };
}

/**
 * Church: nave with lancet and rose windows, bell tower at its west
 * (left) end. The tower is drawn first so the nave's front wall hides the
 * tower's side face where they join; the tower top follows the culture
 * (spire, or an onion dome in onion cultures).
 * @param {Design} D
 * @param {{w?: number, seed?: number}} [o]
 * @returns {Part[]}
 */
export function church(D, o = {}) {
	const w = o.w ?? 28;
	const tw = 10;
	const tower = place(belfry(D, { finial: true, w: tw, h: 34 }), { x: -w / 2 - tw / 2 + 0.5 });
	return [...tower, ...sideHouse(D, { w, seed: o.seed, kind: 'church' })];
}

/**
 * Castle keep: a square donjon in 3/4 view — crenellated platform with a
 * back parapet, shaded right face, arrow slits, a raised door, and four
 * corner turrets topped in the culture's tower style.
 * @param {Design} D
 * @param {{w?: number, h?: number}} [o]
 * @returns {Part[]}
 */
export function keep(D, o = {}) {
	const w = o.w ?? 22,
		h = (o.h ?? 30) * D.stature;
	const P = boxProjector(17, D.perspective ?? DEFAULT_DESIGN.perspective, h);
	const sb = P.scale(1);
	/** @type {Pt} */ const FR = [w / 2, 0];
	const side = /** @type {Poly} */ ([FR, P.back(FR), P.back([w / 2, h]), [w / 2, h]]);
	const BL = P.back([-w / 2, h]),
		BR = P.back([w / 2, h]);
	const platform = /** @type {Poly} */ ([[-w / 2, h], [w / 2, h], BR, BL]);
	const parapet = crenellated(BL[0], BR[0], BL[1], BL[1] + 4.5 * sb, {
		merlon: 2.4 * sb,
		notch: 2 * sb,
	});
	/** Merlons along the slanted top of the right face. */
	/** @type {Poly[]} */
	const sideMerlons = [];
	for (let i = 0; i < 4; i++)
		sideMerlons.push(P.face(rect(-1.1, 0, 2.2, 2.6), w / 2, h - 0.4, (i + 0.5) / 4));
	/** @type {Poly[]} */
	const slits = [];
	for (const x of [-w * 0.3, w * 0.3])
		for (const y of [h * 0.35, h * 0.65]) slits.push(rect(x - 0.7, y, 1.4, 4.5));
	// Turret at a top corner (front or back), sized for its depth.
	const turret = (/** @type {Pt} */ at, /** @type {number} */ s, flags = false) =>
		place(roundTower(D, { r: 3.4, h: 10, flags }), { x: at[0], y: at[1] - 2 * s, s });
	/** @type {Part[]} */
	const parts = [
		// Four corner turrets: the two back ones first, behind the parapet.
		// The banner flies from the back-right turret — tall, in profile,
		// clear of the keep's own silhouette.
		...turret(BL, sb),
		...turret(BR, sb, D.flags),
		{ solid: [parapet], shaded: true, lines: hatch(parapet, 65, D.hatch) },
		{ solid: [platform] },
		{
			solid: [side],
			shaded: true,
			lines: hatch(side, 65, D.hatch),
			fills: [P.face(rect(-0.6, 0, 1.2, 4.5), w / 2, h * 0.5, 0.5)],
		},
		{ solid: sideMerlons, shaded: true },
		{
			solid: [crenellated(-w / 2, w / 2, 0, h + 3, { merlon: 2.4, notch: 2.2 })],
			fills: [...slits, archOpening(0, 4, 4.4, 7.5), opening(D, 0, h * 0.6, 3.4)],
		},
		// Steps up to the raised door.
		{ solid: [rect(-3.6, 0, 7.2, 1.5), rect(-3, 1.5, 6, 1.5), rect(-2.4, 3, 4.8, 1.2)] },
		...turret([-w / 2, h], 1),
		...turret([w / 2, h], 1),
	];
	return parts;
}

/**
 * Market square: a plain open plaza (returned separately as `ground`, to be
 * drawn under everything) with a few open stalls around a covered well.
 * @param {Design} D
 * @param {{rx?: number, ry?: number}} [o]
 * @returns {{ground: Part[], items: Placed[]}}
 */
export function market(D, o = {}) {
	const rx = o.rx ?? 16,
		ry = o.ry ?? 6;
	const plaza = /** @type {Poly} */ (ell(0, 0, rx, ry, 0, 360, 40).slice(0, -1));
	/** @type {Placed[]} */
	const items = [];
	[215, 325, 45, 135].forEach((a, i) => {
		const t = (a * Math.PI) / 180;
		items.push({ piece: stall(D, i), x: rx * 0.8 * Math.cos(t), y: ry * 0.86 * Math.sin(t) });
	});
	items.push({ piece: well(D), x: 0, y: 0 });
	items.sort((p, q) => (q.y ?? 0) - (p.y ?? 0));
	return { ground: [{ solid: [plaza], terrain: true }], items };
}

/**
 * Market stall: an open wooden stall — side walls, an open back on two
 * corner posts, and a counter with real depth across the front between
 * two posts — under either a peaked or a slanted (lean-to) roof, some with
 * striped canvas.
 * @param {Design} D
 * @param {number} i stall index, picks the roof and stripes
 */
function stall(D, i) {
	const w = 5.8,
		ch = 2,
		ph = 4.8;
	const peaked = i % 2 === 0;
	const rise = peaked ? 0 : 1.8; // a lean-to's back is higher than its front
	const P = boxProjector(
		3.2,
		D.perspective ?? DEFAULT_DESIGN.perspective,
		ph + rise,
		peaked ? ph + 2.8 : 0,
	);
	const hl = -w / 2,
		hr = w / 2;
	/** @param {Pt} p @param {number} [dy] @returns {Pt} */
	const back = (p, dy = 0) => P.back([p[0], p[1] + dy]);
	const wood = /** @type {const} */ ('wood');
	// Counter: a box with a front face and a top running halfway back.
	/** @param {Pt} p @returns {Pt} */
	const deep = (p) => P.at(p, 0.5);
	/** @param {number} x @param {number} h @returns {Poly} back corner post, up to the roof */
	const backPost = (x, h) => [
		back([x, 0]),
		back([x + 0.7, 0]),
		back([x + 0.7, h], rise),
		back([x, h], rise),
	];
	/** @type {Poly} */
	const rightSide = [[hr, 0], back([hr, 0]), back([hr, ph], rise), [hr, ph]];
	/** @type {Part[]} */
	const parts = [
		// Open back: just the two back corner posts carrying the roof.
		{ solid: [backPost(hl, ph), backPost(hr - 0.7, ph)], role: wood },
		// The left side's inner face, seen through the open front.
		{ solid: [[[hl, 0], back([hl, 0]), back([hl, ph], rise), [hl, ph]]], role: wood, shaded: true },
		// Counter top, then the right side (which hides the counter's far end).
		{
			solid: [[[hl, ch], [hr, ch], deep([hr, ch]), deep([hl, ch])]],
			role: wood,
			lines: [{ pts: [deep([hl - 1, ch]), deep([hr + 1, ch])], w: 0.4 }],
		},
		{ solid: [rightSide], role: wood, shaded: true, lines: hatch(rightSide, 65, D.hatch) },
		// Counter front, and the two front posts.
		{
			solid: [rect(hl, 0, w, ch)],
			role: wood,
			lines: [
				{
					pts: [
						[hl - 1, ch * 0.5],
						[hr + 1, ch * 0.5],
					],
					w: 0.4,
				},
			],
		},
		{ solid: [rect(hl, ch, 0.7, ph - ch), rect(hr - 0.7, ch, 0.7, ph - ch)], role: wood },
	];
	const ov = 0.7;
	/** @type {Pt} */ const L = [hl - ov, ph];
	/** @type {Pt} */ const R = [hr + ov, ph];
	const striped = i % 3 !== 2;
	if (peaked) {
		/** @type {Pt} */ const A = [0, ph + 2.8];
		const left = /** @type {Poly} */ ([L, A, back(A), back(L)]);
		const right = /** @type {Poly} */ ([A, R, back(R), back(A)]);
		/** @type {Line[]} */
		const stripes = [];
		if (striped)
			for (let f = 0.2; f < 1; f += 0.2) {
				const p0 = /** @type {Pt} */ ([L[0] + (R[0] - L[0]) * f, ph - 1]);
				stripes.push({ pts: [p0, back(p0, 4)], w: 0.9 });
			}
		parts.push(
			{ solid: [left], role: 'roof', lines: stripes },
			{ solid: [right], role: 'roof', shaded: true, lines: stripes },
			{
				solid: [[L, R, A]],
				role: 'roof',
				lines: stripes.map((l) => ({
					...l,
					pts: /** @type {Poly} */ ([
						[l.pts[0][0], ph - 1],
						[l.pts[0][0], ph + 4],
					]),
				})),
			},
		);
	} else {
		const roof = /** @type {Poly} */ ([L, R, back(R, rise), back(L, rise)]);
		/** @type {Line[]} */
		const stripes = [];
		if (striped)
			for (let x = L[0] + 1.4; x < R[0]; x += 1.4)
				stripes.push({ pts: [[x, ph - 1], back([x, ph], rise + 1)], w: 0.9 });
		parts.push({ solid: [roof], role: 'roof', lines: stripes });
	}
	return parts;
}

/**
 * Covered well: low round curb, two posts, little pyramid roof.
 * @returns {Part[]}
 */
export function well(/** @type {Design} */ D) {
	const r = 2.6,
		ch = 2.2,
		ry = r * 0.34;
	const curb = /** @type {Poly} */ ([
		...ell(0, 0, r, ry, 180, 360),
		[r, ch],
		...ell(0, ch, r, ry, 0, 180),
	]);
	return [
		{
			solid: [curb],
			shadeArea: rect(r * 0.3, -2, r * 2, 6),
			shadeLines: cylinderHatch(r, -ry - 1, ch + 1, D.hatch),
		},
		// Stone rim seen from above, with the dark shaft inside it.
		{
			solid: [ell(0, ch, r, ry, 0, 360, 32).slice(0, -1)],
			fills: [ell(0, ch, r * 0.66, ry * 0.66, 0, 360, 28).slice(0, -1)],
		},
		{
			solid: [],
			free: [
				{
					pts: [
						[-r + 0.5, ch],
						[-r + 0.5, ch + 4.5],
					],
					w: 0.9,
				},
				{
					pts: [
						[r - 0.5, ch],
						[r - 0.5, ch + 4.5],
					],
					w: 0.9,
				},
			],
		},
		D.towerRoof === 'dome'
			? hemiDome(0, ch + 4.2, r + 1, D.hatch).part
			: {
					solid: [
						[
							[-r - 1, ch + 4.2],
							[r + 1, ch + 4.2],
							[0, ch + 4.2 + r * D.pitch * 1.6],
						],
					],
					role: /** @type {const} */ ('roof'),
				},
	];
}

/**
 * @typedef {{soft: boolean, role: import('./render.js').Role | undefined, h: number,
 *   seams: boolean, hachure?: boolean, towers: boolean, crest: 'none' | 'stake' | 'scallop' | 'rib' | 'mound' | 'rock'}} Material
 */

/**
 * What a wall type is made of. Only stone carries towers and merlons;
 * the soft walls get a shaped top edge instead.
 * @param {string} type
 * @returns {Material}
 */
function material(type) {
	switch (type) {
		case 'palisade':
			// Plank-striped pattern body (wall-wood): the stakes come from the
			// fill, so no per-stake seam strokes; the top edge carries the tips.
			return {
				soft: true,
				role: 'wall-wood',
				h: 0.85,
				seams: false,
				towers: false,
				crest: 'stake',
			};
		case 'hedge':
			// Foliage pattern body (via wall-hedge role) + scalloped crown.
			return {
				soft: true,
				role: 'wall-hedge',
				h: 0.9,
				seams: false,
				towers: false,
				crest: 'scallop',
			};
		case 'bone':
			return { soft: true, role: 'wall-bone', h: 1, seams: true, towers: false, crest: 'rib' };
		case 'earth':
			return {
				soft: true,
				role: 'wall-earth',
				h: 0.8,
				seams: false,
				towers: false,
				crest: 'mound',
			};
		case 'reef':
			// Coral-stipple pattern body (via wall-reef role) + rocky crown.
			return {
				soft: true,
				role: 'wall-reef',
				h: 0.8,
				seams: false,
				towers: false,
				crest: 'rock',
			};
		default:
			// Stone — brick pattern body via wall-stone role; no in-line
			// `bricks()` lines any more (patterns.js carries the tiling).
			return { soft: false, role: 'wall-stone', h: 1, seams: false, towers: true, crest: 'none' };
	}
}

/**
 * Extra top-edge points between two neighbouring wall-top points p and q:
 * a sharpened stake, a rounded hedge scallop, or a tall leaning whale rib.
 * @param {Material} mat
 * @param {Pt} p
 * @param {Pt} q
 * @returns {Poly}
 */
function crest(mat, p, q) {
	const lerp = (/** @type {number} */ t, /** @type {number} */ dy, dx = 0) =>
		/** @type {Pt} */ ([p[0] + (q[0] - p[0]) * t + dx, p[1] + (q[1] - p[1]) * t + dy]);
	switch (mat.crest) {
		case 'stake':
			return [lerp(0.5, 2.8)];
		case 'scallop':
			return [lerp(0.2, 1), lerp(0.5, 1.7), lerp(0.8, 1)];
		case 'rib':
			return [lerp(0.35, 2.4, -0.2), lerp(0.55, 4.2, 0.5), lerp(0.7, 2.4)];
		case 'mound':
			return [lerp(0.5, 0.5)];
		case 'rock': {
			// Jagged reef rock: irregular but deterministic per position.
			const j = (/** @type {number} */ k) =>
				Math.abs(Math.sin(p[0] * 12.9898 + p[1] * 78.233 + k) * 43758.5453) % 1;
			return [
				lerp(0.25, 0.8 + j(1) * 2.2, -0.3),
				lerp(0.5, 0.2 + j(2)),
				lerp(0.75, 1 + j(3) * 2.4, 0.3),
			];
		}
		default:
			return [];
	}
}

/**
 * Which gate a wall gets: stone follows the culture's choice; a palisade
 * or earth bank gets a timber gate tower (or a jawbone arch if the
 * culture uses those);
 * a hedge just an arched gap; a bone wall a whale-jaw arch.
 * @param {string} type
 * @param {Design} D
 * @returns {'tower' | 'twin' | 'jawbone' | 'woodtower' | 'arch'}
 */
function gateKind(type, D) {
	if (type === 'bone') return 'jawbone';
	if (type === 'hedge' || type === 'reef') return 'arch';
	if (type === 'palisade' || type === 'earth')
		return D.gate === 'jawbone' ? 'jawbone' : 'woodtower';
	return D.gate;
}

/**
 * Whale-jaw gate: two great curved jawbones rising either side of the
 * gateway and meeting in a point above it.
 * @param {number} y0 ground at the gate
 * @param {number} h wall height
 * @returns {Part[]}
 */
function jawGate(y0, h) {
	const top = y0 + h + 11;
	/** @param {number} sx 1 = left jaw, -1 = right jaw (mirrored) */
	const jaw = (sx) => {
		const outer = sag([-6.6 * sx, y0], [-0.4 * sx, top], [-10 * sx, y0 + h * 0.7], 0.32);
		const inner = sag([-0.4 * sx, top - 1.4], [-3.8 * sx, y0], [-6.4 * sx, y0 + h * 0.6], 0.3);
		/** @type {Poly} */
		const poly = [...outer, ...inner];
		return sx > 0 ? poly : poly.reverse();
	};
	/** @type {Line[]} */
	const bands = [];
	for (const f of [0.3, 0.55, 0.78])
		bands.push({
			pts: [
				[-12, y0 + (top - y0) * f],
				[12, y0 + (top - y0) * f],
			],
			w: 0.45,
		});
	return [
		{ solid: [jaw(1)], lines: bands },
		{
			solid: [jaw(-1)],
			shaded: true,
			lines: [...bands, ...hatch(rect(0, y0, 8, top - y0), 65, 1.6)],
		},
	];
}

/**
 * Round hut: low cylindrical wall under a conical thatched roof.
 * @param {Design} D
 * @param {{r?: number}} [o]
 * @returns {Part[]}
 */
export function roundHut(D, o = {}) {
	const r = o.r ?? 7,
		h = 6 * D.stature,
		ry = r * 0.34;
	const body = /** @type {Poly} */ ([...ell(0, 0, r, ry, 180, 360), [r, h], [-r, h]]);
	const bodyPart = {
		solid: [body],
		shadeArea: rect(r * 0.3, -ry - 2, r * 2, h + ry + 4),
		lines: D.masonry ? stoneCourses(-r, r, -ry, h) : [],
		shadeLines: cylinderHatch(r, -ry - 1, h + 1, D.hatch),
		fills: [archOpening(-r * 0.25, -ry * 0.95, 3.4, 5.4)],
	};
	// Dome culture: stone half-sphere on the cylinder's flat top instead
	// of a thatched cone.
	if (D.towerRoof === 'dome') return [bodyPart, hemiDome(0, h, r + 0.4, D.hatch).part];
	const R = r + 1.6,
		rh = R * 2 * D.pitch * 0.9;
	/** @type {Pt} */ const apex = [0, h + rh];
	const sweep = D.concave * 0.8;
	/** @type {Poly} */
	const roof = [
		...ell(0, h, R, ry, 180, 360),
		...sag([R, h], apex, [0, h], sweep).slice(1),
		...sag(apex, [-R, h], [0, h], sweep).slice(1, -1),
	];
	/** @type {Line[]} */
	const thatch = [];
	for (let t = 20; t < 90; t += 6) {
		const a = (t * Math.PI) / 180;
		thatch.push({ pts: [apex, [R * 1.3 * Math.sin(a), h - ry * Math.cos(a)]], w: THIN });
	}
	return [
		bodyPart,
		{
			solid: [roof],
			role: 'roof',
			shadeArea: rect(R * 0.25, h - ry - 2, R * 2, rh + ry + 4),
			lines: thatch,
		},
		...(D.flourish > 0.25 ? finial(apex) : []),
	];
}

/**
 * Turf mound house: an earth-covered dome with a stone-framed doorway.
 * @param {Design} D
 * @param {{r?: number}} [o]
 * @returns {Part[]}
 */
export function moundHut(D, o = {}) {
	const rx = o.r ?? 9,
		ry = rx * 0.34,
		ht = 7 * D.stature;
	/** @type {Poly} */
	const dome = [...ell(0, 0, rx, ry, 180, 360), ...ell(0, 0, rx, ht, 0, 180, 28).slice(1, -1)];
	/** @type {Line[]} */
	const turf = [];
	for (let f = 0.3; f < 1; f += 0.22)
		turf.push({ pts: ell(0, 0, rx * f + 1, ht * f + 0.6, 0, 180, 18), w: THIN });
	return [
		{
			solid: [dome],
			role: 'roof',
			shadeArea: rect(rx * 0.3, -ry - 2, rx * 2, ht + ry + 4),
			lines: turf,
			shadeLines: capHatch(0, rx, -ry - 1, ht + 1, D.hatch),
		},
		{
			solid: [archOpening(-rx * 0.2, -ry * 0.9, 5.4, 6.4)],
			fills: [archOpening(-rx * 0.2, -ry * 0.9, 3.2, 5)],
		},
		{ solid: [circle(rx * 0.55, -ry * 0.6, 1.1), circle(rx * 0.75, -ry * 0.3, 0.8)] },
	];
}

/**
 * Hut on stilts over water: a small round hut lifted onto a timber deck
 * standing on posts.
 * @param {Design} D
 * @param {{r?: number}} [o]
 * @returns {Part[]}
 */
export function stiltHut(D, o = {}) {
	return onStilts(roundHut(D, { r: o.r ?? 6 }), D);
}

/**
 * Lift any piece onto a timber deck on four stilts, sized to the piece's own
 * x extent. Used by stilt-settlement layouts to perch every building (gable
 * house, tower, warehouse) on the same deck recipe stiltHut uses for a round
 * hut — one coherent "built on pilings" settlement whatever its culture.
 * @param {Part[]} parts the piece in its own local frame (ground at y=0)
 * @param {Design} D
 * @returns {Part[]}
 */
export function onStilts(parts, D) {
	let x0 = Infinity,
		x1 = -Infinity;
	for (const p of parts)
		for (const poly of p.solid)
			for (const [x] of poly) {
				if (x < x0) x0 = x;
				if (x > x1) x1 = x;
			}
	if (!Number.isFinite(x0)) return parts;
	const cx = (x0 + x1) / 2;
	const xHalf = (x1 - x0) / 2;
	// Estimate the piece's drawing-depth (y range of its base) from its x
	// extent. In 3/4 oblique a building with 3D depth d contributes 0.75·d
	// to x and 0.5·d to y, so for the usual D.depth range the base's y
	// extent runs ≈ 0.4 × (total x extent). A deep gable house whose back
	// base reaches past the deck's back-rim at the house's x edges reads
	// as lifted off the platform — the deck visibly rises around it.
	const depthDraw = xHalf * 0.4;
	const lift = 4.5 * D.stature;
	// Deck big enough that both the piece's x extent AND its base's full
	// drawing-depth fit inside its top ellipse (ry = 0.32·R, with a bit of
	// margin so the piece's edges don't abut the deck's silhouette).
	const R = Math.max(5, xHalf + 1.6, depthDraw / 0.6 + 1.6);
	const ry = R * 0.32;
	/** @type {Poly} */
	const deck = [...ell(cx, lift - 1.2, R, ry, 180, 360), ...ell(cx, lift, R, ry, 0, 180)];
	/** @type {Line[]} */
	const posts = [];
	for (const a of [200, 250, 290, 340]) {
		const t = (a * Math.PI) / 180;
		const x = cx + R * 0.78 * Math.cos(t),
			y = R * 0.78 * ry * Math.sin(t) * (1 / R);
		posts.push({
			pts: [
				[x, y - 1.6],
				[x, y + lift - 1],
			],
			w: 1.6,
			// Rounded cap so the piling disappears softly into the water; the
			// top is occluded by the deck above so only the bottom cap shows.
			round: true,
		});
	}
	// Centre the piece's base y range on the deck's top-face centre so its
	// front base sits above the deck's front top edge and its back base
	// below the back-top-rim peak — the piece reads as resting on the deck.
	return [
		{ solid: [], free: posts },
		{ solid: [deck], role: 'wood', shadeArea: rect(cx + R * 0.3, lift - R, R * 2, R * 2) },
		...place(parts, { y: lift - depthDraw / 2 }),
	];
}

/**
 * Lagoon the settlement stands in: a water plane with wave ticks, drawn
 * under everything else.
 * @param {number} rx
 * @param {number} ry
 * @returns {Part[]}
 */
export function lagoon(rx, ry) {
	/** @type {Poly} */
	const plane = ell(0, 0, rx, ry, 0, 360, 48).slice(0, -1);
	/** @type {Line[]} */
	const waves = [];
	const r = rng(17);
	for (let i = 0; i < 26; i++) {
		const a = r() * Math.PI * 2,
			d = 0.25 + r() * 0.7;
		const x = Math.cos(a) * rx * d,
			y = Math.sin(a) * ry * d;
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
	return [{ solid: [plane], role: 'water', lines: waves, terrain: true }];
}

/**
 * Tower windmill: tapered round tower, a cap in the culture's roof style,
 * and four lattice sails on a hub at the front.
 * @param {Design} D
 * @returns {Part[]}
 */
export function windmill(D) {
	const h = 22 * D.stature,
		r0 = 5.6,
		r1 = 3.8,
		ry = r0 * 0.34;
	const body = /** @type {Poly} */ ([...ell(0, 0, r0, ry, 180, 360), [r1, h], [-r1, h]]);
	/** @type {Part[]} */
	const parts = [
		{
			solid: [body],
			shadeArea: rect(r0 * 0.3, -ry - 2, r0 * 2, h + ry + 4),
			lines: D.masonry ? stoneCourses(-r0, r0, -ry, h) : [],
			shadeLines: cylinderHatch(r0, -ry - 1, h + 1, D.hatch),
			fills: [archOpening(-1.2, -ry * 0.92, 2.8, 5), rect(-0.6, h * 0.55, 1.2, 3.2)],
		},
	];
	if (D.towerRoof === 'onion') parts.push(...onionDome(D, 0, h - 0.4, r1 * 0.95).parts);
	else if (D.towerRoof === 'dome') parts.push(hemiDome(0, h - 0.4, r1 * 1.1, D.hatch).part);
	else {
		const R = r1 + 1.2,
			rh = R * 1.6 * Math.max(0.6, D.pitch);
		/** @type {Pt} */ const apex = [0, h + rh];
		parts.push({
			solid: [
				[
					...ell(0, h, R, R * 0.34, 180, 360),
					...sag([R, h], apex, [0, h], D.concave * 0.8).slice(1),
					...sag(apex, [-R, h], [0, h], D.concave * 0.8).slice(1, -1),
				],
			],
			role: 'roof',
			shadeArea: rect(R * 0.25, h - R, R * 2, rh + R * 2),
			shadeLines: capHatch(0, R, h - R, h + rh + 1, D.hatch),
		});
	}
	// Sails: a spar plus a lattice panel on its trailing side.
	/** @type {Pt} */ const hub = [0.6, h - 1.2];
	const L = h * 0.66;
	for (const deg of [25, 115, 205, 295]) {
		const a = (deg * Math.PI) / 180;
		const d = /** @type {Pt} */ ([Math.cos(a), Math.sin(a)]);
		const n = /** @type {Pt} */ ([-d[1], d[0]]);
		const P = (/** @type {number} */ along, /** @type {number} */ side) =>
			/** @type {Pt} */ ([
				hub[0] + d[0] * along + n[0] * side,
				hub[1] + d[1] * along + n[1] * side,
			]);
		/** @type {Line[]} */
		const lattice = [{ pts: [P(L * 0.25, 1.75), P(L, 1.75)], w: 0.45 }];
		for (let t = L * 0.25 + 2.4; t < L; t += 2.4)
			lattice.push({ pts: [P(t, 0), P(t, 3.6)], w: 0.45 });
		parts.push({
			solid: [[P(L * 0.25, 0.3), P(L, 0.3), P(L, 3.4), P(L * 0.25, 3.4)]],
			lines: lattice,
			free: [{ pts: [hub, P(L + 0.6, 0)], w: 0.9 }],
		});
	}
	parts.push({ solid: [circle(hub[0], hub[1], 1.1)], role: 'wood' });
	return parts;
}

/**
 * Tall townhouse: storeys jettied out one above the other, timber framing
 * (or masonry), gable to the street.
 * @param {Design} D
 * @param {{floors?: number}} [o]
 * @returns {Part[]}
 */
export function townhouse(D, o = {}) {
	const floors = o.floors ?? 3,
		w = 12,
		fh = 8.5 * D.stature,
		jet = 1.2;
	const Wt = w + 2 * jet * (floors - 1),
		H = fh * floors,
		rh = Wt * D.pitch;
	const P = boxProjector(w * D.depth, D.perspective ?? DEFAULT_DESIGN.perspective, H, H + rh);
	/** @type {Part[]} */
	const sides = [];
	/** @type {Part[]} */
	const fronts = [];
	for (let i = 0; i < floors; i++) {
		const half = w / 2 + jet * i,
			y0 = fh * i;
		const side = /** @type {Poly} */ ([
			[half, y0],
			P.back([half, y0]),
			P.back([half, y0 + fh]),
			[half, y0 + fh],
		]);
		sides.push({ solid: [side], shaded: true, lines: hatch(side, 65, D.hatch) });
		/** @type {Line[]} */
		const frame = [];
		if (i > 0 || !D.masonry)
			frame.push(
				{
					pts: [
						[-half, y0 + 0.4],
						[-half * 0.45, y0 + fh],
					],
					w: 0.8,
				},
				{
					pts: [
						[half, y0 + 0.4],
						[half * 0.45, y0 + fh],
					],
					w: 0.8,
				},
				{
					pts: [
						[-half * 0.45, y0 - 1],
						[-half * 0.45, y0 + fh + 1],
					],
					w: 0.8,
				},
				{
					pts: [
						[half * 0.45, y0 - 1],
						[half * 0.45, y0 + fh + 1],
					],
					w: 0.8,
				},
			);
		else frame.push(...stoneCourses(-half, half, y0, y0 + fh));
		const fills =
			i === 0
				? [archOpening(-half * 0.15, 0, 3.6, fh * 0.75), opening(D, half * 0.62, fh * 0.35, 2.6)]
				: [opening(D, 0, y0 + fh * 0.3, 2.8)];
		fronts.push({ solid: [rect(-half, y0, half * 2, fh)], fills, lines: frame });
	}
	/** @type {Pt} */ const Lp = [-Wt / 2 - 1, H];
	/** @type {Pt} */ const Rp = [Wt / 2 + 1, H];
	/** @type {Pt} */ const A = [0, H + rh];
	const mid = /** @type {Pt} */ ([0, H + rh * 0.35]);
	const la = sag(Lp, A, mid, D.concave),
		ar = sag(A, Rp, mid, D.concave);
	const left = /** @type {Poly} */ ([...la, ...la.map(P.back).reverse()]);
	const right = /** @type {Poly} */ ([...ar, ...ar.map(P.back).reverse()]);
	return [
		...sides,
		{ solid: [left], role: 'roof' },
		{ solid: [right], role: 'roof', shaded: true, lines: hatch(right, -28, D.hatch) },
		...fronts,
		{ solid: [[...la, ...ar.slice(1)]], fills: [opening(D, 0, H + rh * 0.25, 2.2)] },
		...(D.flourish > 0.25 ? finial(A) : []),
	];
}

/**
 * Camp: tents around a campfire. Cultures that build round houses pitch
 * cone tents; everyone else ridge tents.
 * @param {Design} D
 * @returns {{items: Placed[]}}
 */
export function camp(D) {
	const cone = D.houseForm === 'round' || D.houseForm === 'stilt';
	const tent = (/** @type {number} */ w) => (cone ? coneTent(D, w) : ridgeTent(D, w));
	/** @type {Placed[]} */
	const items = [
		{ piece: tent(12), x: -10, y: 7 },
		{ piece: tent(10), x: 10, y: 6 },
		{ piece: tent(9), x: -12, y: -3 },
		{ piece: campfire(), x: 2, y: -2 },
	];
	items.sort((p, q) => (q.y ?? 0) - (p.y ?? 0));
	return { items };
}

/**
 * Ridge tent: canvas over a ridge pole, door flap at the front.
 * @returns {Part[]}
 */
function ridgeTent(/** @type {Design} */ D, /** @type {number} */ w, deep = 1.1) {
	const h = w * 0.62 * D.stature;
	const P = boxProjector(w * deep, D.perspective ?? DEFAULT_DESIGN.perspective, 0, h);
	/** @type {Pt} */ const L = [-w / 2, 0];
	/** @type {Pt} */ const R = [w / 2, 0];
	/** @type {Pt} */ const A = [0, h];
	const bA = P.back(A);
	const right = /** @type {Poly} */ ([A, R, P.back(R), bA]);
	return [
		{ solid: [[L, A, bA, P.back(L)]] },
		{ solid: [right], shaded: true, lines: hatch(right, -30, D.hatch) },
		{
			solid: [[L, R, A]],
			fills: [
				[
					[-1.8, 0],
					[1.8, 0],
					[0, h * 0.7],
				],
			],
		},
		{
			solid: [],
			free: [
				{ pts: [A, [0, h + 1.6]], w: 0.8 },
				{ pts: [bA, add(bA, [0, 1.6 * P.scale(1)])], w: 0.8 },
			],
		},
	];
}

/**
 * Cone tent: hide cone on crossed poles.
 * @returns {Part[]}
 */
function coneTent(/** @type {Design} */ D, /** @type {number} */ w) {
	const R = w / 2,
		ry = R * 0.34,
		h = w * 1.05 * D.stature;
	/** @type {Pt} */ const apex = [0, h];
	return [
		{
			solid: [[...ell(0, 0, R, ry, 180, 360), apex]],
			shadeArea: rect(R * 0.25, -R, R * 2, h + R * 2),
			shadeLines: capHatch(0, R, -ry - 1, h, D.hatch),
			fills: [
				[
					[-2, -ry * 0.95],
					[1.2, -ry * 0.95],
					[-0.4, h * 0.45],
				],
			],
		},
		{
			solid: [],
			free: [
				{
					pts: [
						[-1.8, h + 2.6],
						[0.6, h - 1],
					],
					w: 0.7,
				},
				{
					pts: [
						[1.8, h + 2.6],
						[-0.6, h - 1],
					],
					w: 0.7,
				},
			],
		},
	];
}

/**
 * Campfire: crossed logs under a flame.
 * @returns {Part[]}
 */
function campfire() {
	return [
		{
			solid: [],
			free: [
				{
					pts: [
						[-3, -0.6],
						[3, 1.4],
					],
					w: 1.2,
					round: true,
				},
				{
					pts: [
						[-3, 1.4],
						[3, -0.6],
					],
					w: 1.2,
					round: true,
				},
			],
		},
		{
			solid: [
				[
					[-2, 0.6],
					[2, 0.6],
					[1.4, 3],
					[0.6, 2.4],
					[0.2, 5.4],
					[-0.8, 2.8],
					[-1.4, 3.6],
				],
			],
			role: 'roof',
		},
	];
}

/**
 * Mine: a timber-framed adit driven into the foot of a mountain — a main
 * peak and a lower shoulder, lit on the left and hatched on the right of
 * the ridge — with rails running out of it, a pickaxe beside them, and a
 * spoil heap.
 * @param {Design} D
 * @returns {Part[]}
 */
export function mine(D) {
	const rx = 20,
		ry = rx * 0.34,
		k = D.stature;
	/** @param {number} x @param {number} y @returns {Pt} */
	const P = (x, y) => [x, y * k];
	// Ridge from the main peak down to the front of the base.
	const footA = 290.5;
	const foot = /** @type {Pt} */ ([
		rx * Math.cos((footA * Math.PI) / 180),
		ry * Math.sin((footA * Math.PI) / 180),
	]);
	const ridge = /** @type {Poly} */ ([P(2, 28), P(4.5, 17), P(6, 8), foot]);
	const skyR = /** @type {Poly} */ ([P(16, 7), P(12, 12), P(9, 15), P(6, 22)]);
	const skyL = /** @type {Poly} */ ([
		P(-1, 23),
		P(-4, 19.5),
		P(-8, 22.5),
		P(-11, 16),
		P(-15, 9),
		P(-18, 4),
	]);
	/** @type {Poly} */
	const lit = [...ell(0, 0, rx, ry, 180, footA, 18), ...ridge.slice(0, -1).reverse(), ...skyL];
	/** @type {Poly} */
	const shade = [...ell(0, 0, rx, ry, footA, 360, 10), ...skyR, ...ridge.slice(0, -1)];
	// The shoulder peak's own shadowed facet.
	const facet = /** @type {Poly} */ ([P(-8, 22.5), P(-4, 19.5), P(-4.6, 12), P(-7, 15)]);
	/** @type {Line[]} */
	const crags = [
		{ pts: [P(-8, 22.5), P(-7, 15), P(-8.5, 7)], w: THIN },
		{ pts: [P(-14, 10), P(-12, 4)], w: THIN },
	];
	const y0 = -ry * 0.88,
		ax = -4;
	const heap = /** @type {Poly} */ ([
		...ell(12, -ry - 1, 5, 1.6, 180, 360),
		...ell(12, -ry - 1, 5, 3.4, 0, 180, 14).slice(1, -1),
	]);
	/** @type {Line[]} */
	const track = [
		{
			pts: [
				[ax - 1.5, y0],
				[ax - 3.8, y0 - 7.5],
			],
			w: 1,
		},
		{
			pts: [
				[ax + 1.5, y0],
				[ax + 3.4, y0 - 7.5],
			],
			w: 1,
		},
	];
	for (const f of [0.18, 0.42, 0.66, 0.9]) {
		const y = y0 - 7.5 * f;
		track.push({
			pts: [
				[ax - 1.9 - 2.6 * f, y],
				[ax + 1.9 + 2.2 * f, y],
			],
			w: 1,
		});
	}
	return [
		{ solid: [lit], lines: crags, terrain: true },
		{ solid: [shade], shaded: true, lines: hatch(shade, 70, D.hatch), terrain: true },
		{ solid: [facet], shaded: true, lines: hatch(facet, 70, D.hatch), terrain: true },
		{ solid: [rect(ax - 2.6, y0, 5.2, 6.4)], fills: [rect(ax - 2.6, y0, 5.2, 6.4)] },
		{
			solid: [
				rect(ax - 4, y0, 1.4, 7),
				rect(ax + 2.6, y0, 1.4, 7),
				rect(ax - 4.6, y0 + 6.4, 9.2, 1.6),
			],
			role: 'wood',
		},
		{ solid: [], free: track },
		{ solid: [heap], role: 'earth', shaded: true, lines: hatch(heap, 70, D.hatch), terrain: true },
		// A pickaxe left lying beside the rails.
		...pickaxe(/** @type {Pt} */ ([ax + 5, y0 - 7.6]), /** @type {Pt} */ ([ax + 9, y0 - 3.4])),
	];
}

/**
 * Pickaxe lying on the ground: wooden haft from `a` to `b`, iron head
 * across the `b` end curving back to two points.
 * @param {Pt} a
 * @param {Pt} b
 * @returns {Part[]}
 */
function pickaxe(a, b) {
	const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
	const d = /** @type {Pt} */ ([(b[0] - a[0]) / len, (b[1] - a[1]) / len]);
	const n = /** @type {Pt} */ ([-d[1], d[0]]);
	const at = (/** @type {Pt} */ o, /** @type {number} */ along, /** @type {number} */ side) =>
		/** @type {Pt} */ ([o[0] + d[0] * along + n[0] * side, o[1] + d[1] * along + n[1] * side]);
	/** @type {Poly} */
	const haft = [at(a, 0, -0.5), at(b, 0, -0.5), at(b, 0, 0.5), at(a, 0, 0.5)];
	/** @type {Poly} */
	const head = [
		at(b, -1.1, -3),
		at(b, 0.2, -1.3),
		at(b, 0.6, 0),
		at(b, 0.2, 1.3),
		at(b, -1.1, 3),
		at(b, -0.5, 1.1),
		at(b, -0.6, 0),
		at(b, -0.5, -1.1),
	];
	// A prop, not a building: never ruined, and kept out of a ruin's bounds.
	return [
		{ solid: [haft], role: 'wood', terrain: true },
		{ solid: [head], fills: [head], terrain: true },
	];
}

/**
 * Lighthouse on a rocky foot at the water's edge: tapered tower painted in
 * bands of the marker colour, a railed gallery, a glazed lantern throwing
 * light, and a cap in the culture's roof style.
 * @param {Design} D
 * @returns {Part[]}
 */
export function lighthouse(D) {
	const h = 34 * D.stature,
		r0 = 5.2,
		r1 = 3.4,
		k = 0.34;
	const rAt = (/** @type {number} */ y) => r0 + (r1 - r0) * (y / h);
	/** Front half of the tower between two heights (a band of paint). */
	const band = (/** @type {number} */ y0, /** @type {number} */ y1) =>
		/** @type {Poly} */ ([
			...ell(0, y0, rAt(y0), rAt(y0) * k, 180, 360, 16),
			...ell(0, y1, rAt(y1), rAt(y1) * k, 360, 180, 16),
		]);
	const flank = rect(r0 * 0.3, -r0, r0 * 2, h + r0 * 2);
	/** @type {Poly} */
	const sea = ell(1, -2.4, 17, 5.2, 0, 360, 40).slice(0, -1);
	/** @type {Line[]} */
	const waves = [];
	for (const [x, y] of [
		[-12, -4],
		[-7, -6.4],
		[9, -5.6],
		[13, -3.2],
		[3, -6.8],
	])
		waves.push({
			pts: [
				[x - 2, y],
				[x - 1, y + 0.5],
				[x, y],
				[x + 1, y + 0.5],
				[x + 2, y],
			],
			w: 0.5,
		});
	/** @type {Poly[]} */
	const rocks = [
		[
			[-9, -3],
			[-6, -4.6],
			[-2.6, -4],
			[-1.6, -1.6],
			[-5.6, 0.6],
			[-8.6, -0.8],
		],
		[
			[2, -4.4],
			[6.4, -4.8],
			[9.2, -2.8],
			[7.6, -0.4],
			[3, 0.4],
		],
		[
			[-4.6, -5.6],
			[-1.2, -6.4],
			[1.8, -5.2],
			[0.4, -3.6],
			[-3.4, -3.8],
		],
	];
	/** @type {Poly[]} */
	const slits = [];
	for (const f of [0.38, 0.62]) slits.push(rect(-0.6, h * f, 1.2, 3));
	/** @type {Part[]} */
	const parts = [
		{ solid: [sea], role: 'water', lines: waves, terrain: true },
		// One solid rock mass under the whole foot of the tower, so no sea
		// shows through beneath it; the outlying stones merge into it.
		{
			solid: [foundation(r0 + 3.4, r0 * k + 2.4), ...rocks.slice(0, 2)],
			shadeArea: rect(1, -9, 13, 14),
			lines: hatch(rect(1, -7, 12, 10), 70, D.hatch),
			terrain: true,
		},
		{
			solid: [[...ell(0, 0, r0, r0 * k, 180, 360), [r1, h], [-r1, h]]],
			shadeArea: flank,
			lines: D.masonry ? stoneCourses(-r0, r0, -2, h) : [],
			shadeLines: cylinderHatch(r0, -r0 * k - 1, h + 1, D.hatch),
			fills: [archOpening(-0.6, -r0 * k * 0.92, 2.8, 4.8), ...slits],
		},
	];
	// Bands in the marker colour.
	for (const [a, b] of [
		[h * 0.18, h * 0.32],
		[h * 0.5, h * 0.64],
		[h * 0.82, h * 0.96],
	])
		parts.push({
			solid: [band(a, b)],
			role: 'roof',
			shadeArea: flank,
			shadeLines: cylinderHatch(r0, a - 2, b + 2, D.hatch),
		});
	parts.push({ solid: [rocks[2]], terrain: true });
	// Gallery: a platform ring with a railing.
	const g = r1 + 2;
	/** @type {Line[]} */
	const rail = [{ pts: ell(0, h + 2.4, g, g * k, 180, 360, 20), w: 0.6 }];
	for (let a = 190; a <= 350; a += 20) {
		const t = (a * Math.PI) / 180;
		rail.push({
			pts: [
				[g * Math.cos(t), h + g * k * Math.sin(t)],
				[g * Math.cos(t), h + 2.4 + g * k * Math.sin(t)],
			],
			w: 0.5,
		});
	}
	parts.push({
		solid: [[...ell(0, h - 0.8, g, g * k, 180, 360, 20), ...ell(0, h, g, g * k, 0, 180, 20)]],
		shadeArea: flank,
	});
	// Lantern: dark glazing with mullions, light thrown either side.
	const lr = 2.5,
		lh = 5.2;
	/** @type {Poly} */
	const glass = [...ell(0, h, lr, lr * k, 180, 360, 12), [lr, h + lh], [-lr, h + lh]];
	/** @type {Line[]} */
	const rays = [];
	for (const side of [-1, 1])
		for (const dy of [-1.6, 0, 1.6]) {
			const y = h + lh / 2 + dy;
			rays.push({
				pts: [
					[side * (lr + 1.6), y + dy * 0.4],
					[side * (lr + 7.5), y + dy * 1.6],
				],
				w: 0.6,
				round: true,
			});
		}
	parts.push(
		{
			solid: [glass],
			fills: [glass],
			cuts: [-1.2, 0, 1.2].map((x) => ({
				pts: /** @type {Poly} */ ([
					[x, h - 2],
					[x, h + lh + 1],
				]),
				w: 0.5,
			})),
			free: rays,
		},
		{ solid: [], free: rail },
	);
	// Cap in the culture's roof style.
	if (D.towerRoof === 'onion') parts.push(...onionDome(D, 0, h + lh - 0.3, lr * 1.05).parts);
	else if (D.towerRoof === 'dome') parts.push(hemiDome(0, h + lh - 0.3, lr * 1.15, D.hatch).part);
	else {
		const R = lr + 1,
			rh = R * 1.5 * Math.max(0.6, D.pitch);
		/** @type {Pt} */ const apex = [0, h + lh + rh];
		parts.push(
			{
				solid: [
					[
						...ell(0, h + lh, R, R * k, 180, 360, 14),
						...sag([R, h + lh], apex, [0, h + lh], D.concave * 0.8).slice(1),
						...sag(apex, [-R, h + lh], [0, h + lh], D.concave * 0.8).slice(1, -1),
					],
				],
				role: 'roof',
				shadeArea: rect(R * 0.25, h, R * 2, rh + lh + 4),
				shadeLines: capHatch(0, R, h + lh - R, h + lh + rh + 1, D.hatch),
			},
			...finial(apex),
		);
	}
	return parts;
}

/**
 * Irregular rocky plinth: a jagged ring of points around an ellipse,
 * deterministic so the same rock is drawn every time.
 * @param {number} rx
 * @param {number} ry
 * @returns {Poly}
 */
function foundation(rx, ry) {
	const r = rng(43);
	/** @type {Poly} */
	const pts = [];
	for (let i = 0; i < 14; i++) {
		const a = (i / 14) * Math.PI * 2;
		const j = 0.82 + r() * 0.3;
		// Lift the back half a little so the rock rises around the tower.
		pts.push([Math.cos(a) * rx * j, -1 + Math.sin(a) * ry * j + (Math.sin(a) > 0 ? 1.2 : 0)]);
	}
	return pts;
}

/**
 * Caravel in profile, bow to the right, sitting on the waterline (y = 0):
 * planked hull with a raised sterncastle, square sails on the main and
 * fore masts, a lateen mizzen, bowsprit, rigging and a pennant.
 * @param {Design} D
 * @returns {Part[]}
 */
export function caravel(D) {
	/** @type {Poly} */
	const hull = [
		[-12, 7.5],
		[-12.6, 4],
		[-11, 0],
		[-6, -1.8],
		[6, -1.8],
		[11, 0.4],
		[13.2, 4.6],
		[9, 4.2],
		[-6, 3.6],
		[-7, 6.6],
	];
	/** @type {Line[]} */
	const strakes = [1, 2.4].map((y) => ({
		pts: /** @type {Poly} */ ([
			[-14, y],
			[14, y + 0.6],
		]),
		w: 0.5,
	}));
	/** @type {Line[]} */
	const masts = [
		{
			pts: [
				[1, 3.8],
				[1, 25],
			],
			w: 0.9,
		},
		{
			pts: [
				[8, 4.2],
				[8, 19.5],
			],
			w: 0.8,
		},
		{
			pts: [
				[-8.5, 6.6],
				[-8.5, 18],
			],
			w: 0.7,
		},
		{
			pts: [
				[12.6, 4.6],
				[17, 7],
			],
			w: 0.8,
		},
	];
	/** @type {Line[]} */
	const rigging = [
		{
			pts: [
				[1, 24.5],
				[16.5, 6.8],
			],
			w: 0.35,
		},
		{
			pts: [
				[1, 24.5],
				[-12, 7.4],
			],
			w: 0.35,
		},
		{
			pts: [
				[8, 19],
				[17, 7],
			],
			w: 0.35,
		},
	];
	/** Square sail between two yards, bellying slightly forward. */
	const square = (
		/** @type {number} */ x0,
		/** @type {number} */ x1,
		/** @type {number} */ y0,
		/** @type {number} */ y1,
	) =>
		/** @type {Poly} */ ([
			[x0, y0],
			...sag([x1, y0], [x1 + 0.4, y1], [x1 + 3, (y0 + y1) / 2], 0.18),
			[x0 - 0.3, y1],
		]);
	const main = square(-3.4, 5.4, 9.5, 21);
	const fore = square(5.2, 10.8, 10, 17.6);
	/** @type {Poly} */
	const lateen = [
		[-12.4, 8.2],
		[-4.6, 19.6],
		[-8, 9],
	];
	/** @type {Line[]} */
	const yards = [
		{
			pts: [
				[-4.4, 21],
				[6.4, 21],
			],
			w: 0.7,
		},
		{
			pts: [
				[-4, 9.5],
				[6, 9.5],
			],
			w: 0.6,
		},
		{
			pts: [
				[4.4, 17.6],
				[11.6, 17.6],
			],
			w: 0.6,
		},
		{
			pts: [
				[-13, 7.6],
				[-4, 20.4],
			],
			w: 0.6,
		},
	];
	// The flag flies at the masthead, its lower edge just above the main yard
	// (y = 21; the cloth is drawn 10 above the pole's foot). The pole runs
	// behind the sails like the mast; the cloth goes in front, so the sails'
	// outlines can't swallow it on a small ship.
	const [cloth, pole] = D.flags ? flag({ ...D, flagLen: 8, flagFolds: 2 }, 1, 16.2) : [];
	return [
		{ solid: [], free: [...rigging, ...masts] },
		...(pole ? [pole] : []),
		{ solid: [lateen], shadeArea: rect(-9, 8, 6, 14) },
		{
			solid: [main],
			shadeArea: rect(1, 9, 8, 13),
			lines: hatch(rect(1, 9, 8, 13), 70, D.hatch * 1.4),
		},
		{ solid: [fore], shadeArea: rect(8, 9, 6, 10) },
		{ solid: [], free: yards },
		...(cloth ? [cloth] : []),
		{ solid: [hull], role: 'wood', shadeArea: rect(-14, -3, 28, 3.6), lines: strakes },
	];
}

/**
 * Timber pier running out to the right from (0, 0), `len` long: a plank
 * deck with a front edge and posts standing down into the water.
 * @param {number} len
 * @returns {Part[]}
 */
export function pier(len) {
	const dp = depthVec(4.4);
	/** @type {Poly} */
	const deck = [
		[0, 0],
		[len, 0],
		[len + dp[0], dp[1]],
		[dp[0], dp[1]],
	];
	/** @type {Line[]} */
	const planks = [];
	for (let x = 1.6; x < len; x += 1.6)
		planks.push({
			pts: [
				[x, -0.5],
				[x + dp[0], dp[1] + 0.5],
			],
			w: 0.35,
		});
	/** @type {Line[]} */
	const posts = [];
	for (let x = 1.5; x <= len; x += 5)
		posts.push({
			pts: [
				[x, -1],
				[x, -4.2],
			],
			w: 1,
		});
	return [
		{ solid: [], free: posts },
		{ solid: [deck], role: 'wood', lines: planks },
		{ solid: [rect(0, -1.1, len, 1.1)], role: 'wood', shaded: true },
	];
}

/** Clock face: a ringed dial with hour ticks and two hands. */
function clockFace(/** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ r) {
	/** @type {Line[]} */
	const ticks = [];
	for (let a = 0; a < 360; a += 30) {
		const t = (a * Math.PI) / 180;
		ticks.push({
			pts: [
				[cx + Math.cos(t) * r * 0.72, cy + Math.sin(t) * r * 0.72],
				[cx + Math.cos(t) * r * 0.95, cy + Math.sin(t) * r * 0.95],
			],
			w: 0.4,
		});
	}
	/** @type {Part[]} */
	const parts = [
		{
			solid: [circle(cx, cy, r)],
			lines: [
				...ticks,
				{
					pts: [
						[cx, cy],
						[cx, cy + r * 0.62],
					],
					w: 0.7,
				},
				{
					pts: [
						[cx, cy],
						[cx + r * 0.45, cy - r * 0.2],
					],
					w: 0.7,
				},
			],
		},
	];
	return parts;
}

/**
 * Clock tower: a tall, slender square tower with a clock face under its
 * spire (or dome).
 * @param {Design} D
 * @returns {Part[]}
 */
export function clocktower(D) {
	return belfry(D, { w: 11, h: 40, clock: true, finial: D.flourish > 0.4 });
}

/**
 * Standalone tent — a ridge tent, or a hide cone in round-hut cultures.
 * @param {Design} D
 * @param {{w?: number}} [o]
 * @returns {Part[]}
 */
export function tent(D, o = {}) {
	const w = o.w ?? 16;
	return D.houseForm === 'round' || D.houseForm === 'stilt'
		? coneTent(D, w)
		: ridgeTent(D, w, 0.55);
}

/**
 * Pavilion: a round tournament tent — a canvas drum with an open door
 * flap, a scalloped valance and a tall cone roof striped in the roof
 * colour, a pennant on the king pole.
 * @param {Design} D
 * @param {{r?: number}} [o]
 * @returns {Part[]}
 */
export function pavilion(D, o = {}) {
	const r = o.r ?? 10,
		ry = r * 0.34,
		h = 7 * D.stature;
	const R = r + 1.2,
		rh = r * 1.5 * D.stature;
	/** @type {Pt} */ const apex = [0, h + rh];
	const body = /** @type {Poly} */ ([...ell(0, 0, r, ry, 180, 360), [r, h], [-r, h]]);
	/** @type {Poly} */
	const roof = [
		...ell(0, h, R, ry, 180, 360),
		...sag([R, h], apex, [0, h], 0.12).slice(1),
		...sag(apex, [-R, h], [0, h], 0.12).slice(1, -1),
	];
	// Scalloped valance hanging from the roof's front edge.
	const n = 8;
	/** @type {Poly} */
	const val = [...ell(0, h, R, ry, 180, 360, n * 3)];
	for (let i = n; i > 0; i--) {
		const a1 = ((180 + (180 * i) / n) * Math.PI) / 180,
			am = ((180 + (180 * (i - 0.5)) / n) * Math.PI) / 180;
		val.push([R * Math.cos(a1), h + ry * Math.sin(a1) - 0.6]);
		val.push([R * 0.98 * Math.cos(am), h + ry * Math.sin(am) - 2.4]);
	}
	/** @type {Line[]} */
	const stripes = [];
	for (let t = -75; t < 90; t += 30) {
		const a = (t * Math.PI) / 180;
		stripes.push({ pts: [apex, [R * Math.sin(a), h - ry * Math.cos(a)]], w: 1.1 });
	}
	/** @type {Part[]} */
	const parts = [
		{
			solid: [body],
			shadeArea: rect(r * 0.3, -ry - 2, r * 2, h + ry + 4),
			shadeLines: cylinderHatch(r, -ry - 1, h + 1, D.hatch),
			fills: [
				[
					[-2.6, -ry * 0.98],
					[2.6, -ry * 0.98],
					[0, h - 1],
				],
			],
		},
		{
			solid: [roof],
			role: 'roof',
			shadeArea: rect(R * 0.25, h - ry - 2, R * 2, rh + ry + 4),
			lines: stripes,
		},
		{ solid: [val], role: 'roof', shadeArea: rect(R * 0.25, h - ry - 4, R * 2, ry + 4) },
	];
	if (D.flags) parts.unshift(...flag(D, 0, h + rh - 1));
	else parts.push({ solid: [], free: [{ pts: [apex, [0, h + rh + 2.4]], w: 0.9 }] });
	return parts;
}

/**
 * Cathedral: a long nave seen gable-on behind a twin-towered west front,
 * with a rose window over a great arched door.
 * @param {Design} D
 * @returns {Part[]}
 */
export function cathedral(D) {
	const w = 18,
		h = 20 * D.stature,
		rh = w * 0.55 * Math.max(D.pitch, 0.7),
		ov = 1;
	const P = boxProjector(34, D.perspective ?? DEFAULT_DESIGN.perspective, h, h + rh);
	/** @type {Pt} */ const L = [-w / 2 - ov, h];
	/** @type {Pt} */ const R = [w / 2 + ov, h];
	/** @type {Pt} */ const A = [0, h + rh];
	const mid = /** @type {Pt} */ ([0, h + rh * 0.35]);
	const la = sag(L, A, mid, D.concave);
	const ar = sag(A, R, mid, D.concave);
	const side = /** @type {Poly} */ ([
		[w / 2, 0],
		P.back([w / 2, 0]),
		P.back([w / 2, h]),
		[w / 2, h],
	]);
	const right = /** @type {Poly} */ ([...ar, ...ar.map(P.back).reverse()]);
	/** @type {Pt} */ const rose = [0, h * 0.68];
	/** @type {Poly[]} */
	const sideWindows = [];
	for (let i = 1; i < 5; i++)
		sideWindows.push(P.face(lancet(0, 0, 2.2, h * 0.45), w / 2, h * 0.25, i / 5));
	const tw = 9,
		th = 40 * D.stature;
	const towerAt = (/** @type {number} */ x) =>
		place(belfry(D, { w: tw, h: th / D.stature, finial: true }), { x });
	return [
		...towerAt(-w / 2 - tw / 2 + 1),
		{ solid: [side], shaded: true, lines: hatch(side, 65, D.hatch), fills: sideWindows },
		{ solid: [right], role: 'roof', shaded: true, lines: hatch(right, -28, D.hatch) },
		{
			solid: [rect(-w / 2, 0, w, h), [...la, ...ar.slice(1)]],
			fills: [archOpening(0, 0, 6.4, 10), circle(rose[0], rose[1], 3.4)],
			cuts: roseCuts(rose),
			lines: D.masonry ? stoneCourses(-w / 2, w / 2, 0, h + rh) : [],
		},
		...(D.flourish > 0.25 ? finial(A) : []),
		...towerAt(w / 2 + tw / 2 - 1),
	];
}

/** Sharpened-stake top edge from x1 back to x0 at height y. */
function stakes(/** @type {number} */ x0, /** @type {number} */ x1, /** @type {number} */ y) {
	const n = Math.max(2, Math.round((x1 - x0) / STAKE));
	/** @type {Poly} */
	const out = [];
	for (let i = n; i > 0; i--) {
		const b = x0 + ((x1 - x0) * i) / n,
			a = b - (x1 - x0) / n;
		out.push([b, y - 1.6], [(a + b) / 2, y]);
	}
	out.push([x0, y - 1.6]);
	return out;
}

/**
 * Gatehouse: a fortified gate on a short run of wall. Stone: a crenellated
 * gate block with a great arch between two round towers. Wood: a timber
 * gate tower in a stretch of palisade.
 * @param {Design} D
 * @param {{wood?: boolean}} [o]
 * @returns {Part[]}
 */
export function gatehouse(D, o = {}) {
	const wood = !!o.wood;
	const span = wood ? 15 : 17,
		wh = (wood ? 8 : 9) * D.stature;
	if (wood)
		return [
			...wallRun(D, -span, -4, wh, true),
			...wallRun(D, 4, span, wh, true),
			...gateTower(D, -0.5, wh + 7, true),
		];
	// The banner flies from the right-hand tower's top.
	const tower = (/** @type {number} */ x, /** @type {boolean} */ flags) =>
		place(roundTower(D, { r: 4.6, h: wh + 13, flags }), { x, y: -0.3 });
	const gw = 12,
		gh = wh + 7;
	const P = boxProjector(7, D.perspective ?? DEFAULT_DESIGN.perspective, gh);
	const gside = /** @type {Poly} */ ([
		[gw / 2, 0],
		P.back([gw / 2, 0]),
		P.back([gw / 2, gh]),
		[gw / 2, gh],
	]);
	const roof = /** @type {Poly} */ ([
		[-gw / 2, gh],
		[gw / 2, gh],
		P.back([gw / 2, gh]),
		P.back([-gw / 2, gh]),
	]);
	return [
		...wallRun(D, -span - 4, -7, wh, false),
		...wallRun(D, 7, span + 4, wh, false),
		{ solid: [roof] },
		{ solid: [gside], shaded: true, lines: hatch(gside, 65, D.hatch) },
		{
			solid: [crenellated(-gw / 2, gw / 2, 0, gh + 2.6, { merlon: 2.2, notch: 2 })],
			fills: [archOpening(0, 0, 6.4, 9), rect(-3.2, gh - 4.4, 1.2, 3), rect(2, gh - 4.4, 1.2, 3)],
			cuts: [
				...[-1.6, 0, 1.6].map((x) => ({
					pts: /** @type {Poly} */ ([
						[x, 0],
						[x, 7.6],
					]),
					w: 0.5,
				})),
				{
					pts: /** @type {Poly} */ ([
						[-3.2, 3.6],
						[3.2, 3.6],
					]),
					w: 0.5,
				},
			],
			lines: D.masonry ? stoneCourses(-gw / 2, gw / 2, 0, gh) : [],
		},
		...tower(-gw / 2 - 2, D.flourish > 0.5),
		...tower(gw / 2 + 2, D.flags),
	];
}

/**
 * Witch's hut: a crooked round hut with a steep, shaggy thatch, perched on
 * leaning stilts over the bog, a smoking chimney pot through the roof.
 * @param {Design} D
 * @returns {Part[]}
 */
export function witchHut(D) {
	const d = { ...D, pitch: Math.max(D.pitch, 1.1), concave: Math.max(D.concave, 0.14) };
	const r = 6,
		lift = 6 * D.stature,
		R = r + 1.4;
	const deck = /** @type {Poly} */ ([
		...ell(0, lift - 1.4, R, R * 0.34, 180, 360),
		...ell(0, lift, R, R * 0.34, 0, 180),
	]);
	/** @type {Line[]} */
	const posts = [];
	for (const a of [200, 245, 300, 340]) {
		const t = (a * Math.PI) / 180;
		const x = R * 0.78 * Math.cos(t),
			y = R * 0.78 * 0.34 * Math.sin(t);
		posts.push({
			pts: [
				[x, y - 2],
				[x, y + lift - 1.2],
			],
			w: 1,
		});
	}
	/** @type {Line[]} */
	const ladder = [
		{
			pts: [
				[-R - 2.4, -2.6],
				[-R + 0.2, lift - 1],
			],
			w: 0.6,
		},
		{
			pts: [
				[-R - 0.4, -2.6],
				[-R + 1.8, lift - 1],
			],
			w: 0.6,
		},
	];
	for (let i = 1; i < 4; i++) {
		const t = i / 4;
		ladder.push({
			pts: [
				[-R - 2.4 + 2.6 * t, -2.6 + (lift + 1.6) * t],
				[-R - 0.4 + 2.2 * t, -2.6 + (lift + 1.6) * t],
			],
			w: 0.5,
		});
	}
	const hut = roundHut(d, { r });
	// Dome culture: the hut stands bare on its deck (there is no thatch for
	// a chimney pot to vent through).
	if (D.towerRoof === 'dome') {
		return [
			{ solid: [], free: [...posts, ...ladder] },
			{ solid: [deck], role: 'wood', shadeArea: rect(R * 0.3, lift - R, R * 2, R * 2) },
			...place(hut, { y: lift - 0.4 }),
		];
	}
	const rh = (r + 1.6) * 2 * d.pitch * 0.9,
		hh = 6 * D.stature;
	// A tapered chimney pot poking out of the thatch's lit flank.
	const py = hh + rh * 0.38;
	/** @type {Poly} */
	const pot = [
		[-r * 0.55, py],
		[-r * 0.55 + 2.2, py],
		[-r * 0.55 + 1.9, py + rh * 0.36],
		[-r * 0.55 + 0.3, py + rh * 0.36],
	];
	return [
		{ solid: [], free: [...posts, ...ladder] },
		{ solid: [deck], role: 'wood', shadeArea: rect(R * 0.3, lift - R, R * 2, R * 2) },
		...place([...hut, { solid: [pot] }], { y: lift - 0.4 }),
	];
}

/**
 * A straight run of wall from x0 to x1, `wh` high, seen square-on with a
 * shaded end face: crenellated stone, or sharpened palisade stakes.
 * @param {Design} D
 * @param {number} x0
 * @param {number} x1
 * @param {number} wh
 * @param {boolean} wood
 * @returns {Part[]}
 */
function wallRun(D, x0, x1, wh, wood) {
	const v = depthVec(4);
	const front = /** @type {Poly} */ (
		wood
			? [[x0, 0], [x1, 0], ...stakes(x0, x1, wh)]
			: crenellated(x0, x1, 0, wh, { merlon: 2.2, notch: 2 })
	);
	const role = wood ? /** @type {const} */ ('wall-wood') : /** @type {const} */ ('wall-stone');
	const sideFace = /** @type {Poly} */ ([[x1, 0], add([x1, 0], v), add([x1, wh], v), [x1, wh]]);
	/** @type {Part[]} */
	const parts = [
		{ solid: [sideFace], role, shaded: true, lines: hatch(sideFace, 65, D.hatch) },
		// Both bodies take their texture from the pattern fill: running-bond
		// courses for stone, plank stripes for a palisade.
		{ solid: [front], role },
	];
	return parts;
}

/**
 * Standalone wall segment: a run of stone (optionally with a tower at its
 * middle) or of palisade.
 * @param {Design} D
 * @param {{wood?: boolean, len?: number, tower?: boolean, h?: number}} [o]
 * @returns {Part[]}
 */
export function wallSegment(D, o = {}) {
	const wood = !!o.wood,
		len = o.len ?? 36,
		wh = (o.h ?? (wood ? 8 : 9)) * D.stature;
	if (!o.tower) return wallRun(D, -len / 2, len / 2, wh, wood);
	return [
		...wallRun(D, -len / 2, len / 2, wh, wood),
		...place(roundTower(D, { r: 5, h: wh + 10, flags: D.flags }), { y: -0.4 }),
	];
}
