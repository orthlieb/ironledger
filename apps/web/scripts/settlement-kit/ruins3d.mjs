// =============================================================================
// Settlement kit — ruins (PROTOTYPE)
//
// Ruins any list of placed pieces (a settlement, or a standalone):
//   * roofs, spires, domes, parapets, sails and flags fall in — every part
//     that doesn't stand on the ground is dropped;
//   * what's left breaks off along a seeded, stepped line (courses of
//     masonry fallen away), lower or higher per building by `decay`;
//   * enclosure walls (`wall: true` pieces) keep their height but get one
//     to three breaches down to the ground;
//   * rubble at every foot; when burned, charred beams, darker walls and
//     soot scorch marks above every opening and below the broken top;
//   * overgrowth — ivy,
//     bushes and a tree in the bigger shells — in the MARKER colour (role
//     'roof'), so ruins stay colour-coded on the map once the roofs are gone.
// Terrain parts (`terrain: true`: sea, rock, mountains, plazas) are never cut.
// =============================================================================

import { rect, rng } from './geom.mjs';

/** @typedef {import('./render.mjs').Part} Part */
/** @typedef {import('./render.mjs').Line} Line */
/** @typedef {import('./geom.mjs').Poly} Poly */
/** @typedef {import('./pieces3d.mjs').Placed} Placed */
/** @typedef {{decay: number, overgrowth: number, burned: boolean, seed?: number}} RuinOptions */
/** @typedef {Placed & {wall?: boolean, ship?: boolean}} RuinPlaced */

/** Bounds of the given parts' silhouettes. @param {Part[]} parts */
function bounds(parts) {
	let x0 = Infinity,
		x1 = -Infinity,
		y0 = Infinity,
		y1 = -Infinity;
	for (const p of parts)
		for (const poly of p.solid)
			for (const [x, y] of poly) {
				x0 = Math.min(x0, x);
				x1 = Math.max(x1, x);
				y0 = Math.min(y0, y);
				y1 = Math.max(y1, y);
			}
	return { x0, x1, y0, y1, ok: Number.isFinite(x0) };
}

/**
 * Ruin a whole placed list. Ships sail away; everything else is broken.
 * @param {RuinPlaced[]} items
 * @param {RuinOptions} o
 * @returns {Placed[]}
 */
export function ruinPlaced(items, o) {
	return items
		.filter((it) => !it.ship)
		.map((it, i) => ({
			...it,
			piece: it.wall
				? breach(it.piece, o, (o.seed ?? 1) * 101 + i)
				: ruinPiece(it.piece, o, (o.seed ?? 1) * 101 + i),
		}));
}

/**
 * Ruin one building.
 * @param {Part[]} parts
 * @param {RuinOptions} o
 * @param {number} seed
 * @returns {Part[]}
 */
export function ruinPiece(parts, o, seed) {
	const r = rng(seed);
	const terrain = parts.filter((p) => p.terrain);
	const built = parts.filter((p) => !p.terrain && p.solid.length);
	const all = bounds(built);
	if (!all.ok) return terrain;
	// Only what stands on the ground survives; roofs and spires fall in.
	// (Anything starting in the bottom 30% of the building counts as standing,
	// so a low pickaxe or mill race doesn't make the walls look elevated.)
	const ground = all.y0 + Math.max(0.6, (all.y1 - all.y0) * 0.3);
	// Signs, flags and banners (role 'flag') never survive, however low they hang.
	const standing = built.filter(
		(p) => bounds([p]).y0 <= ground && p.role !== 'roof' && p.role !== 'flag',
	);
	// Line-only parts low down (rails, posts) stay; high ones (flags, crosses) fall.
	const lowLines = parts.filter(
		(p) =>
			!p.terrain &&
			!p.solid.length &&
			(p.free ?? []).every((l) => l.pts.every(([, y]) => y <= ground)),
	);
	const b = bounds(standing);
	if (!b.ok) return [...terrain, rubble(all, r, 6)];
	// Some buildings keep their roof — more often the less decayed the ruin,
	// less often if it burned — about half of those with a hole in it.
	if (r() < (1 - o.decay) * 0.35 * (o.burned ? 0.5 : 1)) return roofed(parts, terrain, all, o, r);
	const hgt = b.y1 - b.y0;
	// How much is left: decay 0 keeps most of the walls, 1 leaves foundations.
	const keep = Math.max(0.08, 0.88 - o.decay * 0.75 + (r() - 0.5) * 0.22);
	const base = b.y0 + hgt * keep;
	const mask = brokenTop(b, base, hgt, r);
	/** @type {Part[]} */
	const out = [...terrain];
	const top = (/** @type {number} */ x) => maskTop(mask, x, base);
	const tree = o.overgrowth > 0.6 && b.x1 - b.x0 > 12 ? growTree(b, top, r) : [];
	const shell = standing.map((p) =>
		o.burned ? scorch({ ...p, mask, free: [] }, top) : { ...p, mask, free: [] },
	);
	out.push(...tree, ...lowLines, ...shell);
	if (o.burned) out.push(beams(b, top, r));
	out.push(rubble(b, r, keep < 0.2 ? 7 : 4));
	if (o.overgrowth > 0)
		out.push(...ivy(standing, top, o.overgrowth, r), ...bushes(b, o.overgrowth, r));
	return out;
}

/**
 * Enclosure wall: stays standing but gets 1–3 breaches down to the ground.
 * @param {Part[]} parts
 * @param {RuinOptions} o
 * @param {number} seed
 * @returns {Part[]}
 */
function breach(parts, o, seed) {
	const r = rng(seed);
	const b = bounds(parts.filter((p) => !p.terrain));
	if (!b.ok) return parts;
	const n = 1 + Math.floor(r() * (1 + o.decay * 2.2));
	const top = b.y1 + 30;
	/** @type {Poly} */
	const mask = [
		[b.x1 + 4, b.y0 - 8],
		[b.x0 - 4, b.y0 - 8],
		[b.x0 - 4, top],
	];
	const span = b.x1 - b.x0;
	const centres = Array.from(
		{ length: n },
		(_, i) => b.x0 + span * ((i + 0.5 + (r() - 0.5) * 0.6) / n),
	).sort((p, q) => p - q);
	/** @type {Poly[]} */
	const stones = [];
	for (const cx of centres) {
		// Keep the gateway itself (front-centre) standing.
		if (Math.abs(cx) < 9) continue;
		const w = 5 + r() * 6 + o.decay * 4;
		mask.push(
			[cx - w, top],
			[cx - w * 0.6, b.y0 + 5 + r() * 3],
			[cx - w * 0.2, b.y0 + 1.5],
			[cx + w * 0.3, b.y0 + 2.5],
			[cx + w * 0.7, b.y0 + 6 + r() * 3],
			[cx + w, top],
		);
		for (let k = 0; k < 4; k++)
			stones.push(stone(cx + (r() - 0.5) * w * 1.6, b.y0 - 1 - r() * 2, 1.6 + r() * 1.4, r));
	}
	mask.push([b.x1 + 4, top]);
	/** @type {Part[]} */
	// Flags and banners come down with the rest; the wall itself just breaches.
	const out = parts
		.filter((p) => p.role !== 'flag')
		.map((p) => (p.terrain ? p : { ...p, mask, free: [] }));
	if (stones.length) out.push({ solid: stones, shadeArea: rect(b.x0, b.y0 - 8, span * 2, 12) });
	if (o.overgrowth > 0) out.push(...bushes(b, o.overgrowth * 0.6, r));
	return out;
}

/**
 * Keep-region under a stepped broken top: level runs joined by vertical
 * drops, sloping down toward one (seeded) end.
 * @param {{x0: number, x1: number, y0: number, y1: number}} b
 * @param {number} base
 * @param {number} hgt
 * @param {() => number} r
 * @returns {Poly}
 */
function brokenTop(b, base, hgt, r) {
	const slope = (r() < 0.5 ? -1 : 1) * hgt * 0.3;
	/** @type {Poly} */
	const mask = [
		[b.x1 + 6, b.y0 - 8],
		[b.x0 - 6, b.y0 - 8],
	];
	let x = b.x0 - 6;
	while (x < b.x1 + 6) {
		const t = (x - b.x0) / Math.max(1, b.x1 - b.x0) - 0.5;
		const y = Math.max(b.y0 + 1.2, Math.min(b.y1, base + slope * t + (r() - 0.5) * hgt * 0.25));
		const run = 2.5 + r() * 4;
		mask.push([x, y], [Math.min(x + run, b.x1 + 6), y]);
		x += run;
	}
	return mask;
}

/** An irregular stone. */
function stone(
	/** @type {number} */ cx,
	/** @type {number} */ cy,
	/** @type {number} */ s,
	/** @type {() => number} */ r,
) {
	/** @type {Poly} */
	const pts = [];
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * Math.PI * 2;
		const k = 0.7 + r() * 0.4;
		pts.push([cx + Math.cos(a) * s * k, cy + Math.sin(a) * s * 0.6 * k]);
	}
	return pts;
}

/** Rubble strewn along the foot. @returns {Part} */
function rubble(
	/** @type {{x0: number, x1: number, y0: number}} */ b,
	/** @type {() => number} */ r,
	/** @type {number} */ n,
) {
	/** @type {Poly[]} */
	const stones = [];
	for (let i = 0; i < n; i++)
		stones.push(
			stone(b.x0 + 1 + r() * (b.x1 - b.x0 - 2), b.y0 - 0.6 - r() * 1.8, 1.1 + r() * 1.3, r),
		);
	return { solid: stones, shadeArea: rect((b.x0 + b.x1) / 2, b.y0 - 8, (b.x1 - b.x0) * 2, 12) };
}

/**
 * Height of a broken top at x: the stepped mask's level run over x
 * (capped at `base` where the walls are lower than the mask).
 * @param {Poly} mask
 * @param {number} x
 * @param {number} base
 */
function maskTop(mask, x, base) {
	for (let i = 2; i < mask.length - 1; i++) {
		const [ax, ay] = mask[i],
			[bx] = mask[i + 1];
		if (x >= Math.min(ax, bx) && x <= Math.max(ax, bx)) return ay;
	}
	return base;
}

/**
 * A ruined building whose roof survived: everything stands except flags
 * and banners, the roof may have a jagged hole bitten out of it, and it
 * still gets rubble, overgrowth and (if burned) scorched walls.
 * @param {Part[]} parts
 * @param {Part[]} terrain
 * @param {{x0: number, x1: number, y0: number, y1: number}} all
 * @param {RuinOptions} o
 * @param {() => number} r
 * @returns {Part[]}
 */
function roofed(parts, terrain, all, o, r) {
	/** @type {Poly | undefined} */
	let hole;
	if (r() < 0.5) {
		// Keep-region with a ragged bite out of the roof, from above.
		const w = (all.x1 - all.x0) * (0.18 + r() * 0.16),
			cx = all.x0 + (all.x1 - all.x0) * (0.3 + r() * 0.4),
			deep = all.y1 - (all.y1 - all.y0) * (0.2 + r() * 0.15),
			hi = all.y1 + 20;
		hole = [
			[all.x0 - 20, all.y0 - 20],
			[all.x1 + 20, all.y0 - 20],
			[all.x1 + 20, hi],
			[cx + w / 2, hi],
			[cx + w * 0.42, deep + 1.4],
			[cx + w * 0.15, deep + 0.4],
			[cx - w * 0.05, deep + 1.6],
			[cx - w * 0.3, deep],
			[cx - w / 2, hi],
			[all.x0 - 20, hi],
		];
	}
	const top = () => all.y1;
	/** @type {Part[]} */
	const kept = parts
		.filter((p) => !p.terrain && p.role !== 'flag')
		.map((p) => {
			const q = p.role === 'roof' && hole ? { ...p, mask: hole } : p;
			return o.burned && p.role !== 'roof' ? scorch(q, top) : q;
		});
	/** @type {Part[]} */
	const out = [...terrain, ...kept, rubble(all, r, 3)];
	if (o.overgrowth > 0) {
		const walls = kept.filter((p) => p.role !== 'roof' && bounds([p]).y0 <= all.y0 + 1);
		out.push(
			...ivy(walls, () => all.y0 + (all.y1 - all.y0) * 0.45, o.overgrowth * 0.7, r),
			...bushes(all, o.overgrowth, r),
		);
	}
	return out;
}

/**
 * Burn a surviving wall: drawn in its shaded (darker) tone, with soot
 * plumes rising from the top of every door and window and a sooty band
 * under the broken top. Soot is dense hatching — a mid-dark tone, not
 * solid ink — which the renderer keeps just clear of the openings.
 * @param {Part} p
 * @param {(x: number) => number} top
 * @returns {Part}
 */
function scorch(p, top) {
	if (p.role === 'water' || p.role === 'earth') return p;
	const b = bounds([p]);
	/** @type {Line[]} */
	const soot = [];
	for (const f of p.fills ?? []) {
		const ob = bounds([{ solid: [f] }]);
		const w = (ob.x1 - ob.x0) * 1.25,
			h = Math.min(w * 1.7 + 1, top((ob.x0 + ob.x1) / 2) - ob.y1),
			cx = (ob.x0 + ob.x1) / 2,
			y0 = ob.y1 - 0.2;
		if (h < 0.8) continue;
		/** @type {Poly} */
		const plume = [
			[cx - w / 2, y0],
			[cx + w / 2, y0],
			[cx + w * 0.34, y0 + h * 0.45],
			[cx + w * 0.12, y0 + h * 0.8],
			[cx, y0 + h],
			[cx - w * 0.18, y0 + h * 0.7],
			[cx - w * 0.38, y0 + h * 0.4],
		];
		soot.push(...scanlines(plume, 0.8));
	}
	// Smoke-blackened band just under the broken top.
	for (let x = b.x0 + 0.4; x < b.x1; x += 0.8) {
		const t = Math.min(top(x), b.y1);
		soot.push({
			pts: [
				[x, t - 1.6 - ((x * 7.3) % 1) * 0.8],
				[x, t + 0.5],
			],
			w: 0.55,
		});
	}
	return { ...p, shaded: true, lines: [...(p.lines ?? []), ...soot] };
}

/**
 * Horizontal strokes filling a convex polygon (a tone made of hatching).
 * @param {Poly} poly
 * @param {number} step
 * @returns {Line[]}
 */
function scanlines(poly, step) {
	const ys = poly.map((q) => q[1]);
	/** @type {Line[]} */
	const out = [];
	for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
		/** @type {number[]} */
		const xs = [];
		for (let i = 0; i < poly.length; i++) {
			const [ax, ay] = poly[i],
				[bx, by] = poly[(i + 1) % poly.length];
			if ((ay <= y && by > y) || (by <= y && ay > y))
				xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
		}
		if (xs.length >= 2)
			out.push({
				pts: [
					[Math.min(...xs), y],
					[Math.max(...xs), y],
				],
				w: 0.55,
			});
	}
	return out;
}

/**
 * Charred timbers that rest on something, each building rolling its own
 * mix: one or two leaning (from either side, at varied slopes) against
 * the broken wall top, and one to three fallen at random angles and
 * lengths on the ground — some running back along the ground plane, the
 * odd pair crossing — so no two ruins repeat the same pattern.
 * @returns {Part}
 */
function beams(
	/** @type {{x0: number, x1: number, y0: number}} */ b,
	/** @type {(x: number) => number} */ top,
	/** @type {() => number} */ r,
) {
	const span = b.x1 - b.x0;
	/** @type {Line[]} */
	const free = [];
	const leaning = 1 + (r() < 0.35 ? 1 : 0);
	for (let i = 0; i < leaning; i++) {
		const x = b.x0 + span * (0.2 + r() * 0.6);
		const side = r() < 0.5 ? -1 : 1;
		const foot = 2.5 + r() * 5.5; // closer foot = steeper lean
		free.push({
			pts: [
				[x + side * foot, b.y0 - 0.4 - r() * 1.2],
				[x, top(x) - 0.4 - r() * 0.8],
			],
			w: 0.9 + r() * 0.5,
			round: true,
		});
	}
	const fallen = 1 + Math.floor(r() * 3);
	for (let i = 0; i < fallen; i++) {
		const len = 3.5 + r() * 7;
		// Mostly across the ground, sometimes back along its depth (~34°).
		const a =
			r() < 0.3
				? (r() < 0.5 ? 34 : -146) + (r() - 0.5) * 16
				: (r() - 0.5) * 50 + (r() < 0.5 ? 0 : 180);
		const t = (a * Math.PI) / 180;
		const cx = b.x0 + span * (0.1 + r() * 0.8),
			cy = b.y0 - 0.6 - r() * 1.8;
		const dx = (Math.cos(t) * len) / 2,
			dy = ((Math.sin(t) * len) / 2) * 0.6;
		free.push({
			pts: [
				[cx - dx, cy - dy],
				[cx + dx, cy + dy],
			],
			w: 0.9 + r() * 0.5,
			round: true,
		});
		// The odd timber lands across another.
		if (r() < 0.2)
			free.push({
				pts: [
					[cx - dy * 2, cy - dx * 0.25],
					[cx + dy * 2, cy + dx * 0.25],
				],
				w: 0.9,
				round: true,
			});
	}
	return { solid: [], free };
}

/**
 * Ragged top edge from (x0, y) to (x1, y) for vegetation: little uneven
 * leaf bumps rather than round puffs.
 * @param {number} x0
 * @param {number} x1
 * @param {(x: number) => number} height
 * @param {() => number} r
 * @returns {Poly} points from x1 back to x0
 */
function leafyEdge(x0, x1, height, r) {
	/** @type {Poly} */
	const pts = [];
	const n = Math.max(3, Math.round((x1 - x0) / 0.8));
	for (let i = n; i >= 0; i--) {
		const x = x0 + ((x1 - x0) * i) / n;
		pts.push([x, height(x) + (i % 2 ? 0.45 : -0.15) * (0.6 + r())]);
	}
	return pts;
}

/**
 * Ivy creeping up from the ground against wall faces (marker colour),
 * always staying below that wall's broken top.
 * @param {Part[]} walls
 * @param {(x: number) => number} top
 * @param {number} amount
 * @param {() => number} r
 * @returns {Part[]}
 */
function ivy(walls, top, amount, r) {
	const faces = walls
		.filter((p) => !p.shaded && p.role !== 'water')
		.map((p) => ({ p, b: bounds([p]) }));
	const big = faces.filter(({ b }) => b.x1 - b.x0 > 4 && b.y1 - b.y0 > 3);
	if (!big.length) return [];
	/** @type {Poly[]} */
	const patches = [];
	const n = Math.max(1, Math.round(amount * 3));
	for (let i = 0; i < n; i++) {
		const { b } = big[Math.floor(r() * big.length)];
		const w = Math.min(b.x1 - b.x0 - 1, 3 + r() * 4);
		const xa = b.x0 + 0.5 + r() * (b.x1 - b.x0 - 1 - w);
		const reach = (0.35 + amount * 0.45) * (0.6 + r() * 0.4);
		const height = (/** @type {number} */ x) => {
			const room = Math.min(top(x), b.y1) - b.y0 - 0.8;
			const t = (x - xa) / w;
			return b.y0 + Math.max(0.8, room * reach * (0.55 + 0.45 * Math.sin(t * Math.PI)));
		};
		patches.push([[xa, b.y0 - 0.2], [xa + w, b.y0 - 0.2], ...leafyEdge(xa, xa + w, height, r)]);
	}
	return [{ solid: patches, role: 'roof' }];
}

/** Low, ragged bushes on the ground at the foot (marker colour). @returns {Part[]} */
function bushes(
	/** @type {{x0: number, x1: number, y0: number}} */ b,
	/** @type {number} */ amount,
	/** @type {() => number} */ r,
) {
	const n = Math.round(amount * 3);
	/** @type {Part[]} */
	const out = [];
	for (let i = 0; i < n; i++) {
		const w = 3.5 + r() * 3,
			x0 = b.x0 + r() * Math.max(1, b.x1 - b.x0 - w),
			y = b.y0 - 0.6 - r() * 1.4,
			h = 1.4 + r() * 1.3;
		const height = (/** @type {number} */ x) => y + h * Math.sin(((x - x0) / w) * Math.PI) ** 0.6;
		out.push({
			solid: [[[x0, y], [x0 + w, y], ...leafyEdge(x0, x0 + w, height, r)]],
			role: 'roof',
			shadeArea: rect(x0 + w * 0.55, y - 2, w, h + 4),
		});
	}
	return out;
}

/**
 * A tree growing up inside the shell, drawn behind its walls: a trunk and
 * one irregular, lobed canopy.
 * @returns {Part[]}
 */
function growTree(
	/** @type {{x0: number, x1: number, y0: number}} */ b,
	/** @type {(x: number) => number} */ top,
	/** @type {() => number} */ r,
) {
	const x = b.x0 + (b.x1 - b.x0) * (0.35 + r() * 0.3);
	const R = 3.4 + r() * 1.2;
	const cy = top(x) + R * 0.9 + 1;
	/** @type {Poly} */
	const canopy = [];
	const lobes = 7 + Math.floor(r() * 3);
	for (let i = 0; i < 28; i++) {
		const a = (i / 28) * Math.PI * 2;
		const k = 0.82 + 0.18 * Math.abs(Math.sin(a * lobes * 0.5)) + (r() - 0.5) * 0.08;
		canopy.push([x + Math.cos(a) * R * k * 1.15, cy + Math.sin(a) * R * k]);
	}
	return [
		{
			solid: [],
			free: [
				{
					pts: [
						[x, b.y0 + 1],
						[x + 0.3, cy - R * 0.6],
					],
					w: 1.1,
				},
			],
		},
		{ solid: [canopy], role: 'roof', shadeArea: rect(x + R * 0.2, cy - R * 2, R * 3, R * 4) },
	];
}
