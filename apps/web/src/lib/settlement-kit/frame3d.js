// =============================================================================
// Iron Ledger — settlement kit: a piece's 3D frame.
//
// A piece built in a frame is laid out in 3D — x across (right +), y up, z
// back, away from the viewer — and every point of it goes through the
// frame's one camera: the kit's oblique view (depthVec()) with the
// culture's perspective, each point shrunk toward the frame's front ground
// line by how far back it stands. So all of a piece's parts — a church's
// tower and nave, a cap on its tower — share one camera: they line up and
// converge together wherever they stand, rather than each drawing through
// a projector of its own and being shifted into place in 2D.
//
// Faces are still drawn as 2D polygons (the renderer is unchanged): build
// one on its own plane — front(), side(), level() — or point by point with
// pt(). box() hands helpers written against boxProjector() a projector for
// a box standing in the frame.
// =============================================================================

/** @typedef {import('./geom.js').Pt} Pt */
/** @typedef {import('./geom.js').Poly} Poly */

/** Depth axis in screen space — tightened cab-oblique (~34° above
 *  horizontal, length ≈ 0.90). Previously `[0.62, 0.42]` (length ≈ 0.75)
 *  which read flat at marker scale; the 20 % deeper vector exposes more of
 *  each shaded right-flank so the oblique projection actually reads 3D.
 *  A short-lived `view: 'iso'` toggle lived here (coefficients 1.4 / 0.95)
 *  but was reverted — the extra depth didn't read as a meaningfully different
 *  rendering at marker scale; the per-marker `scale` slider does the heavy
 *  lifting for "I want this icon bigger / more legible".
 *  @param {number} d @returns {Pt} */
export const depthVec = (d) => [d * 0.75, d * 0.5];

/**
 * A 3D frame and its camera. `k` is the perspective strength (the
 * culture's `perspective`; 0 = parallel). It's capped, as boxProjector()
 * caps it, for each of the piece's flat `tops` and back-running `ridges`
 * (each [height, depth]) — a tall top still climbs at least half as
 * steeply as in parallel, a ridge a quarter — but once for the whole
 * frame, so its parts keep one camera.
 * @param {number} k
 * @param {{tops?: [number, number][], ridges?: [number, number][]}} [o]
 */
export function frame(k, o = {}) {
	/** How much a point shrinks per unit of depth. */
	let c = k / 20;
	for (const [h, d] of o.tops ?? []) if (h > d / 4) c = Math.min(c, 1 / (4 * h - d));
	for (const [r, d] of o.ridges ?? []) if (r > (3 * d) / 8) c = Math.min(c, 3 / (8 * r - 3 * d));
	/** The shrink at depth z. @param {number} z */
	const scale = (z) => 1 / (1 + c * z);
	/** A point of the frame on screen. @param {[number, number, number]} p @returns {Pt} */
	const pt = ([x, y, z]) => {
		const s = scale(z),
			[vx, vy] = depthVec(z);
		return [x * s + vx, y * s + vy];
	};
	return {
		pt,
		scale,
		/** A face on the upright plane at depth `z`, its points (x, y). @param {Poly} poly */
		front: (poly, z = 0) => poly.map(([x, y]) => pt([x, y, z])),
		/** A face on the upright plane at `x`, its points (z, y). @param {Poly} poly @param {number} x */
		side: (poly, x) => poly.map(([z, y]) => pt([x, y, z])),
		/** A face on the level plane at height `y`, its points (x, z). @param {Poly} poly @param {number} y */
		level: (poly, y) => poly.map(([x, z]) => pt([x, y, z])),
		/**
		 * A projector shaped as boxProjector()'s, for a box standing in the
		 * frame: centred across on `x`, from depth `z0` back `d`. Its points
		 * come out in the frame's coordinates.
		 * @param {number} x
		 * @param {number} z0
		 * @param {number} d
		 */
		box: (x, z0, d) => {
			/** @param {Pt} p @param {number} t @returns {Pt} */
			const at = ([px, py], t) => pt([x + px, py, z0 + t * d]);
			return {
				d,
				at,
				/** @param {number} t */
				scale: (t) => scale(z0 + t * d),
				/** @param {Pt} p */
				back: (p) => at(p, 1),
				/** @param {Poly} poly @param {number} fx @param {number} y @param {number} t */
				face: (poly, fx, y, t) => poly.map(([px, py]) => at([fx, y + py], t + px / d)),
			};
		},
	};
}
