// =============================================================================
// Settlement kit — renderer
//
// Turns a back-to-front list of placed parts into fill-only SVG paths, one
// per colour role (renderLayered):
//
//   part = {
//     solid: Poly[]   silhouette; drawn as an outline ring and filled in
//                     its role colour, and it hides every part behind it
//     lines?: Line[]  detail strokes (timbers, thatch, stone courses) —
//                     clipped to the inside of the part's own silhouette
//     shadeLines?: Line[]  as `lines`, but clipped to the shaded portion
//                     only (hatching on one flank of a merged face)
//     fills?: Poly[]  solid ink (doors, windows, arrow slits)
//     cuts?:  Line[]  strokes knocked OUT of the fills (window mullions,
//                     portcullis grid)
//     free?:  Line[]  strokes drawn as-is, unclipped (crosses, flag poles)
//     mask?:  Poly    keep-region; everything outside is removed (ruins)
//     role?:  Role    colour role of the face for renderLayered()
//                     ('wall' default, 'roof', 'wood', 'earth', 'water', 'flag')
//     shaded?: boolean   whole face is in shadow (darker role colour)
//     shadeArea?: Poly   only this region of the face is in shadow
//                        (the right flank of a cylinder or cone)
//     terrain?: boolean  ground, sea, rock or mountain — never ruined
//   }
//   Line = { pts: Poly, w?: number, round?: boolean, outline?: boolean }
//     `outline` strokes at the render's outline weight instead of `w` — for
//     an internal edge that should read like a silhouette edge (a ridge)
//
// Line widths are in world units and do NOT scale with a placed piece, so
// every icon shares one stroke weight no matter how big its pieces are.
// =============================================================================

import ClipperLib from 'clipper-lib';

/** @typedef {import('./geom.js').Pt} Pt */
/** @typedef {import('./geom.js').Poly} Poly */
/** @typedef {{pts: Poly, w?: number, round?: boolean, outline?: boolean}} Line */
/** @typedef {'wall' | 'wall-stone' | 'wall-hedge' | 'wall-reef' | 'wall-wood' | 'wall-earth' | 'wall-bone' | 'roof' | 'wood' | 'earth' | 'water' | 'flag'} Role */
/** @typedef {{solid: Poly[], lines?: Line[], shadeLines?: Line[], fills?: Poly[], cuts?: Line[], free?: Line[], mask?: Poly, role?: Role, shaded?: boolean, shadeArea?: Poly, terrain?: boolean}} Part */
/** @typedef {{X: number, Y: number}[][]} CPaths */

/** Default outline stroke weight (world units). */
export const OUTLINE = 3;
/** Default detail stroke weight. */
export const DETAIL = 1.7;

const S = 1000; // Clipper works in integers

/** @param {Poly} p @returns {{X: number, Y: number}[]} */
const toC = (p) => p.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));

/**
 * Boolean op on ring sets that are themselves Clipper outputs. Even-odd
 * fill, because Clipper occasionally emits an outer ring with reversed
 * orientation after rounding (near-collinear vertices); under non-zero the
 * next op then sees that outer and its holes winding the same way and
 * fills the holes in — the whole face goes ink-black. Even-odd only counts
 * nesting, so a mis-oriented ring can't swallow its holes.
 * @param {number} ct ClipType
 * @param {CPaths} a
 * @param {CPaths} b
 * @returns {CPaths}
 */
function bool(ct, a, b) {
	const c = new ClipperLib.Clipper();
	c.AddPaths(a, ClipperLib.PolyType.ptSubject, true);
	c.AddPaths(b, ClipperLib.PolyType.ptClip, true);
	/** @type {CPaths} */
	const out = [];
	c.Execute(ct, out, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
	return out;
}
/** @param {CPaths} a @param {CPaths} b */
const union = (a, b) => bool(ClipperLib.ClipType.ctUnion, a, b);
/**
 * Union a list of clean ring sets pairwise in a balanced tree: the same
 * result as folding union() left to right, but each ring is re-processed
 * O(log n) times instead of once per later operand.
 * @param {CPaths[]} sets
 * @returns {CPaths}
 */
function unionAll(sets) {
	let level = sets.filter((s) => s.length);
	while (level.length > 1) {
		/** @type {CPaths[]} */
		const next = [];
		for (let i = 0; i < level.length; i += 2)
			next.push(i + 1 < level.length ? union(level[i], level[i + 1]) : level[i]);
		level = next;
	}
	return level[0] ?? [];
}
/** @param {CPaths} a @param {CPaths} b */
const minus = (a, b) => bool(ClipperLib.ClipType.ctDifference, a, b);
/** @param {CPaths} a @param {CPaths} b */
const intersect = (a, b) => bool(ClipperLib.ClipType.ctIntersection, a, b);

/**
 * Merge raw piece polygons (which may overlap and may be wound either way)
 * into one clean ring set: orient every input counter-clockwise, then
 * union under non-zero so overlaps add rather than cancel.
 * @param {Poly[]} polys
 * @returns {CPaths}
 */
function rawUnion(polys) {
	const paths = polys.map((p) => {
		const c = toC(p);
		return ClipperLib.Clipper.Orientation(c) ? c : c.reverse();
	});
	const c = new ClipperLib.Clipper();
	c.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
	/** @type {CPaths} */
	const out = [];
	c.Execute(
		ClipperLib.ClipType.ctUnion,
		out,
		ClipperLib.PolyFillType.pftNonZero,
		ClipperLib.PolyFillType.pftNonZero,
	);
	return out;
}

/**
 * Grow (d > 0) or shrink (d < 0) closed shapes. Mitred by default so
 * roofs, merlons and spires keep crisp corners; `round` softens them.
 * @param {CPaths} paths
 * @param {number} d world units
 * @param {boolean} [round]
 * @returns {CPaths}
 */
function offset(paths, d, round = false) {
	const co = new ClipperLib.ClipperOffset(1.6, 0.05 * S);
	co.AddPaths(
		paths,
		round ? ClipperLib.JoinType.jtRound : ClipperLib.JoinType.jtMiter,
		ClipperLib.EndType.etClosedPolygon,
	);
	/** @type {CPaths} */
	const out = [];
	co.Execute(out, d * S);
	return out;
}

/**
 * Stroke open polylines into closed ink.
 * @param {Line[]} lines
 * @param {boolean} [round] round joins and caps for every line
 * @param {number} [outlineW] weight for lines flagged `outline`
 * @returns {CPaths}
 */
function stroke(lines, round = false, outlineW = OUTLINE) {
	/** @type {CPaths[]} */
	const out = [];
	for (const l of lines) {
		const co = new ClipperLib.ClipperOffset(2, 0.05 * S);
		co.AddPath(
			toC(l.pts),
			l.round || round ? ClipperLib.JoinType.jtRound : ClipperLib.JoinType.jtMiter,
			l.round || round ? ClipperLib.EndType.etOpenRound : ClipperLib.EndType.etOpenButt,
		);
		/** @type {CPaths} */
		const sol = [];
		co.Execute(sol, ((l.outline ? outlineW : (l.w ?? DETAIL)) / 2) * S);
		out.push(sol);
	}
	return unionAll(out);
}

/** @param {CPaths} paths */
function toPathData(paths) {
	const f = (/** @type {number} */ n) => Number((n / S).toFixed(2)).toString();
	return paths
		.filter((p) => p.length > 2)
		.map((p) => 'M' + p.map((q) => `${f(q.X)} ${f(-q.Y)}`).join('L') + 'Z')
		.join('');
}

/** @param {CPaths} paths */
function boundsOf(paths) {
	let x0 = Infinity,
		y0 = Infinity,
		x1 = -Infinity,
		y1 = -Infinity;
	for (const p of paths)
		for (const q of p) {
			x0 = Math.min(x0, q.X);
			x1 = Math.max(x1, q.X);
			y0 = Math.min(y0, -q.Y);
			y1 = Math.max(y1, -q.Y);
		}
	return { x: x0 / S, y: y0 / S, w: (x1 - x0) / S, h: (y1 - y0) / S };
}

/**
 * Place a piece's parts in world space: translate to (x, y) where y is the
 * ground line (up is +y here; flipped to SVG's y-down at output), scale by
 * s, optionally mirror. Line widths are left alone on purpose.
 * @param {Part[]} parts
 * @param {{x?: number, y?: number, s?: number, flip?: boolean}} at
 * @returns {Part[]}
 */
export function place(parts, at) {
	const { x = 0, y = 0, s = 1, flip = false } = at;
	const fx = flip ? -s : s;
	/** @param {Poly} poly @returns {Poly} */
	const tp = (poly) => {
		const out = poly.map(([px, py]) => /** @type {Pt} */ ([x + px * fx, y + py * s]));
		return flip ? out.reverse() : out;
	};
	/** @param {Line} l @returns {Line} */
	const tl = (l) => ({ ...l, pts: tp(l.pts) });
	return parts.map((p) => ({
		solid: p.solid.map(tp),
		lines: p.lines?.map(tl),
		shadeLines: p.shadeLines?.map(tl),
		fills: p.fills?.map(tp),
		cuts: p.cuts?.map(tl),
		free: p.free?.map(tl),
		// Masks follow the piece (ruins are cut in piece-local coordinates).
		mask: p.mask && tp(p.mask),
		role: p.role,
		terrain: p.terrain,
		shaded: p.shaded,
		shadeArea: p.shadeArea && tp(p.shadeArea),
	}));
}

/** Colour layers emitted by renderLayered(), in paint order. The
 *  `wall-*` material roles (stone / hedge / reef / wood / earth / bone) take
 *  an SVG `<pattern>` fill in place of a flat colour — see
 *  settlement-kit/patterns.js — each with its own -shade tile. */
export const LAYERS = /** @type {const} */ ([
	'water',
	'water-shade',
	'wall',
	'wall-shade',
	'wall-stone',
	'wall-stone-shade',
	'wall-hedge',
	'wall-hedge-shade',
	'wall-reef',
	'wall-reef-shade',
	'wall-wood',
	'wall-wood-shade',
	'wall-earth',
	'wall-earth-shade',
	'wall-bone',
	'wall-bone-shade',
	'wood',
	'wood-shade',
	'earth',
	'earth-shade',
	'roof',
	'roof-shade',
	'flag',
	'ink',
]);

/**
 * Render parts to one path per colour role, so the consumer can colour
 * roofs, walls, flags and ink independently (roofs follow the marker
 * colour). Faces are
 * clipped to what's visible, so the layers never overlap and paint order
 * only matters for ink-on-top. `silhouette` is the union of everything,
 * for drawing a halo behind the icon.
 * `join` softens the drawing: 'round' rounds every line join and end;
 * 'soft' also rounds the shapes' own convex corners (roof peaks, eaves,
 * merlons) by `softRadius`.
 * @param {Part[]} parts back → front
 * @param {{outline?: number, join?: 'sharp' | 'round' | 'soft', softRadius?: number}} [opts]
 * @returns {{layers: Record<string, string>, silhouette: string, bounds: {x: number, y: number, w: number, h: number}}}
 */
export function renderLayered(parts, opts = {}) {
	const half = (opts.outline ?? OUTLINE) / 2;
	const round = opts.join === 'round' || opts.join === 'soft';
	const soft = opts.join === 'soft' ? (opts.softRadius ?? 0.9) : 0;
	/** Visible pieces per layer, unioned once at the end. @type {Record<string, CPaths[]>} */
	const acc = Object.fromEntries(LAYERS.map((l) => [l, []]));
	/** @type {CPaths} */
	let occ = [];
	for (let i = parts.length - 1; i >= 0; i--) {
		const p = parts[i];
		let solid = rawUnion(p.solid);
		const mask = p.mask ? [toC(p.mask)] : null;
		if (mask) solid = intersect(solid, mask);
		// Morphological opening: shrink then regrow with round joins,
		// which rounds every convex corner by `soft`.
		if (soft) solid = offset(offset(solid, -soft, true), soft, true);
		const outer = offset(solid, half, round);
		const inner = offset(solid, -half, round);
		let ink = minus(outer, inner);
		const fillInk = p.fills?.length ? intersect(rawUnion(p.fills), outer) : [];
		if (p.lines?.length)
			ink = union(
				ink,
				minus(intersect(stroke(p.lines, false, half * 2), inner), offset(fillInk, 0.6)),
			);
		const shadeClip = p.shaded ? inner : p.shadeArea ? intersect(inner, [toC(p.shadeArea)]) : [];
		if (p.shadeLines?.length && shadeClip.length)
			ink = union(
				ink,
				minus(intersect(stroke(p.shadeLines, false, half * 2), shadeClip), offset(fillInk, 0.6)),
			);
		if (fillInk.length) ink = union(ink, p.cuts?.length ? minus(fillInk, stroke(p.cuts)) : fillInk);
		let free = p.free?.length ? stroke(p.free) : [];
		if (mask) free = intersect(free, mask);
		ink = union(ink, free);
		acc.ink.push(minus(ink, occ));

		const face = minus(solid, occ);
		const role = p.role ?? 'wall';
		if (role === 'flag') acc.flag.push(face);
		else {
			const shade = p.shaded ? face : p.shadeArea ? intersect(face, [toC(p.shadeArea)]) : [];
			acc[role].push(minus(face, shade));
			acc[`${role}-shade`].push(shade);
		}
		occ = union(occ, union(outer, free));
	}
	const clean = (/** @type {CPaths} */ c) => ClipperLib.Clipper.CleanPolygons(c, 0.02 * S);
	return {
		layers: Object.fromEntries(LAYERS.map((l) => [l, toPathData(clean(unionAll(acc[l])))])),
		silhouette: toPathData(clean(occ)),
		bounds: boundsOf(occ),
	};
}
