// =============================================================================
// Settlement kit — geometry helpers
//
// Pieces are authored as plain polygons / polylines in a piece-local frame:
// x to the right from the piece's centre, y UP from the ground line. The
// renderer (render.mjs) turns them into fill-only outline art with Clipper,
// so the checked-in SVGs need no strokes and tint via `fill: currentColor`.
// =============================================================================

/** @typedef {[number, number]} Pt */
/** @typedef {Pt[]} Poly */

/**
 * @param {number} x left
 * @param {number} y bottom
 * @param {number} w
 * @param {number} h
 * @returns {Poly}
 */
export function rect(x, y, w, h) {
	return [
		[x, y],
		[x + w, y],
		[x + w, y + h],
		[x, y + h],
	];
}

/**
 * Points along a circular arc (degrees, counter-clockwise, 0 = +x).
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} a0
 * @param {number} a1
 * @param {number} [n]
 * @returns {Poly}
 */
export function arc(cx, cy, r, a0, a1, n = 12) {
	/** @type {Poly} */
	const out = [];
	for (let i = 0; i <= n; i++) {
		const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
		out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
	}
	return out;
}

/** @param {number} cx @param {number} cy @param {number} r @returns {Poly} */
export function circle(cx, cy, r) {
	return arc(cx, cy, r, 0, 360, 24).slice(0, -1);
}

/**
 * Round-headed (Romanesque) opening — doors, windows, gate arches.
 * @param {number} cx centre x
 * @param {number} y bottom
 * @param {number} w
 * @param {number} h total height including the arch
 * @returns {Poly}
 */
export function archOpening(cx, y, w, h) {
	const r = w / 2;
	return [[cx - r, y], [cx + r, y], ...arc(cx, y + h - r, r, 0, 180, 10), [cx - r, y]].slice(0, -1);
}

/**
 * Pointed (Gothic lancet) opening — church windows.
 * @param {number} cx
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @returns {Poly}
 */
export function lancet(cx, y, w, h) {
	const r = w; // equilateral arch: each side is an arc of radius = width
	const springY = y + h - r * Math.sin(Math.PI / 3);
	return [
		[cx - w / 2, y],
		[cx + w / 2, y],
		...arc(cx - w / 2, springY, r, 0, 60, 6),
		...arc(cx + w / 2, springY, r, 120, 180, 6).slice(1),
	];
}

/**
 * Crenellated block: a rectangle whose top edge carries merlons. The
 * merlon count is chosen so the block always starts and ends on a merlon.
 * @param {number} x0
 * @param {number} x1
 * @param {number} yBase
 * @param {number} yTop top of the merlons
 * @param {{merlon?: number, notch?: number}} [o] target merlon width, notch depth
 * @returns {Poly}
 */
export function crenellated(x0, x1, yBase, yTop, o = {}) {
	const target = o.merlon ?? 3.2;
	const depth = o.notch ?? 2.6;
	const w = x1 - x0;
	// n merlons + (n-1) gaps, gap ≈ merlon width.
	const n = Math.max(2, Math.round((w / target + 1) / 2));
	const unit = w / (2 * n - 1);
	/** @type {Poly} */
	const pts = [
		[x0, yBase],
		[x1, yBase],
	];
	for (let i = 2 * n - 1; i > 0; i--) {
		const right = x0 + unit * i;
		const left = right - unit;
		const merlon = (i - 1) % 2 === 0;
		const top = merlon ? yTop : yTop - depth;
		pts.push([right, top], [left, top]);
	}
	return pts;
}

/**
 * Deterministic PRNG (mulberry32) so ruins come out identical every build.
 * @param {number} seed
 */
export function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
