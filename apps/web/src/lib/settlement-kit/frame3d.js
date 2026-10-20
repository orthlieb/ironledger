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
 * A solid of revolution — a round tower, a band, a dome — through `at`,
 * which takes a point given from its base's centre (across, up, back) to
 * the screen. Its level section at a share `u` of its rise `H` is an
 * ellipse `a·k(u)` across and `b·k(u)` deep. Seen from above-front its
 * outline is the front of its base section, up the sections' right ends,
 * over the back of its top one (where it has a top, not a point) and down
 * their left ends.
 * @param {(p: [number, number, number]) => Pt} at
 * @param {number} a
 * @param {number} b
 * @param {number} H
 * @param {(u: number) => number} k
 * @param {number} [levels] sections the sides are traced through
 */
export function revolve(at, a, b, H, k, levels = 40) {
	const N = 72;
	/** The section at `u`, round from the right (+x) through the back. */
	const ring = (/** @type {number} */ u) => {
		const s = k(u);
		return Array.from({ length: N }, (_, i) => {
			const f = (2 * Math.PI * i) / N;
			return at([a * s * Math.cos(f), u * H, b * s * Math.sin(f)]);
		});
	};
	/** A section's leftmost and rightmost points' indices. @param {Poly} R */
	const ends = (R) => {
		let l = 0,
			r = 0;
		R.forEach(([x], i) => {
			if (x < R[l][0]) l = i;
			if (x > R[r][0]) r = i;
		});
		return [l, r];
	};
	/** Section R from index i round to j. @param {Poly} R @param {number} i @param {number} j */
	const span = (R, i, j) => {
		/** @type {Poly} */
		const out = [];
		for (let n = i; ; n = (n + 1) % N) {
			out.push(R[n]);
			if (n === j) return out;
		}
	};
	/** The front half of the section at `u`, its left end to its right. */
	const front = (/** @type {number} */ u) => {
		const R = ring(u),
			[l, r] = ends(R);
		return span(R, l, r);
	};
	/** Its back half, from its right end round to its left. */
	const back = (/** @type {number} */ u) => {
		const R = ring(u),
			[l, r] = ends(R);
		return span(R, r, l);
	};
	/** @type {Pt[]} */
	const lefts = [],
		/** @type {Pt[]} */
		rights = [];
	for (let i = 1; i <= levels; i++) {
		const R = ring(i / levels),
			[l, r] = ends(R);
		lefts.push(R[l]);
		rights.push(R[r]);
	}
	const topped = k(1) > 1e-3;
	/** @type {Poly} */
	const outline = [
		...front(0),
		...rights,
		...(topped ? back(1).slice(1, -1) : []),
		...(topped ? lefts : lefts.slice(0, -1)).reverse(),
	];
	return { outline, ring, front, back };
}

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
		 * A solid of revolution (revolve()) standing in the frame, its base's
		 * centre at `base`.
		 * @param {[number, number, number]} base
		 * @param {number} a
		 * @param {number} b
		 * @param {number} H
		 * @param {(u: number) => number} k
		 */
		revolve: (base, a, b, H, k) =>
			revolve(([x, y, z]) => pt([base[0] + x, base[1] + y, base[2] + z]), a, b, H, k),
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
