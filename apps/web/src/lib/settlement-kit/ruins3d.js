// =============================================================================
// Settlement kit — ruins
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
// A building on its own (the Buildings tab, `single`) comes down by degrees
// instead — see crumble().
// =============================================================================

import { rect, rng } from './geom.js';

/** @typedef {import('./render.js').Part} Part */
/** @typedef {import('./render.js').Line} Line */
/** @typedef {import('./geom.js').Poly} Poly */
/** @typedef {import('./pieces3d.js').Placed} Placed */
/** `single`: one building on its own (the Buildings tab), not one of many —
 *  ruined by crumble(), a step at a time as `decay` rises, rather than
 *  rolling building by building whether the roof survives.
 *  @typedef {{decay: number, overgrowth: number, burned: boolean, seed?: number, single?: boolean}} RuinOptions */
/** @typedef {Placed} RuinPlaced */

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
				? breach(it.piece, o, (o.seed ?? 1) * 101 + i, it.wallShare ?? 1)
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
	if (o.single) return crumble(parts, o, seed);
	const r = rng(seed);
	const terrain = parts.filter((p) => p.terrain);
	const built = parts.filter((p) => !p.terrain && p.solid.length);
	const all = bounds(built);
	if (!all.ok) return terrain;
	// Only what stands on the ground survives; roofs and spires fall in.
	// (Anything starting in the bottom 30% of the building counts as standing,
	// so a low pickaxe or mill race doesn't make the walls look elevated.)
	const ground = all.y0 + Math.max(0.6, (all.y1 - all.y0) * 0.3);
	// Signs, flags and banners (role 'flag') never survive, however low they
	// hang; nor do a mill's sails (aloft), though a blade reaches the ground.
	const standing = built.filter(
		(p) => bounds([p]).y0 <= ground && p.role !== 'roof' && p.role !== 'flag' && !p.aloft,
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
 * Ruin one building on its own a step at a time as `decay` rises — the
 * Buildings tab's Decay slider. Where ruinPiece() rolls building by building
 * (roof kept or fallen in, walls cut to a height) and so jumps, this one
 * comes down by degrees and stays recognisable a long way down:
 *   * at once: flags, banners, smoke, a lamp's rays and the high line-work
 *     (rails, poles); a mill's sails come off one by one by 0.3;
 *   * the roofs (role 'roof': roofs, cones, spires, domes) open from a gap
 *     at 0.1 to a ragged hole, each roof on its own — the parts that overlap
 *     across, as its lit and shaded sides do — and are gone by 0.4 (sooner,
 *     burned);
 *   * the walls stand roofless at full height there, then break off along
 *     a stepped line down to the foundations at 1 — at each point a share
 *     of the height that stands there, so a tower and the nave beside it
 *     come down together, and nothing is left hanging;
 *   * rubble, ivy and bushes grow with it; burned, the walls are sooted and
 *     charred beams fall once the roof is in.
 * @param {Part[]} parts
 * @param {RuinOptions} o
 * @param {number} seed
 * @returns {Part[]}
 */
function crumble(parts, o, seed) {
	const r = rng(seed);
	const d = o.decay;
	const built = parts.filter((p) => !p.terrain && p.solid.length);
	const all = bounds(built);
	if (!all.ok) return parts.filter((p) => p.terrain);
	// How far the roofs are gone (0–1), and how much of the walls stands.
	const gone = ((d - 0.04) / 0.32) * (o.burned ? 1.4 : 1);
	const keep = d <= 0.4 ? 1 : 1 - ((d - 0.4) / 0.6) * 0.9;
	/** @type {Set<Part>} */
	const drop = new Set();
	for (const p of parts) {
		if (p.terrain) continue;
		if (p.role === 'flag' || p.smoke) drop.add(p);
		// Sails: each holds on to a decay of its own, 0.1–0.3.
		else if (p.aloft && d >= 0.1 + r() * 0.2) drop.add(p);
	}
	const boxes = new Map(parts.map((p) => [p, bounds([p])]));
	const box = (/** @type {Part} */ p) => /** @type {ReturnType<typeof bounds>} */ (boxes.get(p));
	const walled = built.filter((p) => p.role !== 'roof');
	// Roof-coloured paint on a wall (a lighthouse's bands) is the wall's.
	const paint = (/** @type {Part} */ p) =>
		walled.some((w) => {
			const a = box(p),
				b = box(w);
			return a.x0 >= b.x0 && a.x1 <= b.x1 && a.y0 >= b.y0 && a.y1 <= b.y1;
		});
	const roofParts = built.filter((p) => p.role === 'roof' && !drop.has(p) && !paint(p));
	/** @type {Map<Part, Poly>} the ragged hole each surviving roof has */
	const holes = new Map();
	for (const roof of roofGroups(roofParts)) {
		const rb = bounds(roof);
		// What rides on this roof — a chimney through it, a cross or poles on
		// it — comes down with it.
		const riders = parts.filter((p) => {
			if (p.terrain || p.role === 'roof' || drop.has(p)) return false;
			const b = box(p),
				lo = p.solid.length
					? b.y0
					: Math.min(...(p.free ?? []).flatMap((l) => l.pts.map(([, y]) => y)));
			const x0 = p.solid.length
					? b.x0
					: Math.min(...(p.free ?? []).flatMap((l) => l.pts.map(([x]) => x))),
				x1 = p.solid.length
					? b.x1
					: Math.max(...(p.free ?? []).flatMap((l) => l.pts.map(([x]) => x)));
			return lo > rb.y0 + 0.5 && lo < rb.y1 && x1 > rb.x0 && x0 < rb.x1;
		});
		const g = gone * (0.85 + r() * 0.3);
		if (keep < 1 || g >= 1) for (const p of [...roof, ...riders]) drop.add(p);
		else {
			const hole = roofHole(rb, g, r);
			for (const p of [...roof, ...riders]) holes.set(p, hole);
		}
	}
	const walls = built.filter((p) => !drop.has(p) && !holes.has(p));
	const b = bounds(walls);
	if (!b.ok) return [...parts.filter((p) => p.terrain), rubble(all, r, 6)];
	const mask = keep < 1 ? fallingTop(walls, b, keep, r) : undefined;
	const top = (/** @type {number} */ x) => (mask ? maskTop(mask, x, b.y1) : b.y1);
	/** @type {Part[]} */
	const out = [];
	for (const p of parts) {
		if (drop.has(p)) continue;
		if (p.terrain) out.push(p);
		else if (holes.has(p)) out.push({ ...p, mask: holes.get(p) });
		else {
			// Line-work on the walls (rays, ropes, spars) goes with the rest.
			const q = { ...p, ...(mask ? { mask } : {}), ...(p.solid.length ? { free: [] } : {}) };
			out.push(o.burned && p.solid.length ? scorch(q, top) : q);
		}
	}
	// Rubble and bushes sized to the building, so a well isn't buried.
	const size = Math.max(0.45, Math.min(1, (b.x1 - b.x0) / 14));
	if (o.burned && gone >= 0.6) out.push(beams(b, top, r));
	out.push(rubble(b, r, Math.round(1 + d * 7), size));
	if (o.overgrowth > 0)
		out.push(
			...ivy(walls, top, o.overgrowth * (0.4 + d * 0.6), r),
			...bushes(b, o.overgrowth * (0.5 + d * 0.5), r, size),
		);
	return out;
}

/**
 * Roof parts grouped into roofs: those overlapping well across (a roof's
 * lit and shaded sides, a spire and its finial) are one.
 * @param {Part[]} roofs
 * @returns {Part[][]}
 */
function roofGroups(roofs) {
	/** @type {{parts: Part[], b: ReturnType<typeof bounds>}[]} */
	const groups = [];
	for (const p of roofs) {
		const pb = bounds([p]);
		const g = groups.find(
			({ b }) =>
				Math.min(b.x1, pb.x1) - Math.max(b.x0, pb.x0) > 0.3 * Math.min(b.x1 - b.x0, pb.x1 - pb.x0),
		);
		if (g) {
			g.parts.push(p);
			g.b = bounds(g.parts);
		} else groups.push({ parts: [p], b: pb });
	}
	return groups.map((g) => g.parts);
}

/**
 * Keep-region with a ragged hole bitten into a roof from above, `g` (0–1)
 * of the way to gone: wider and deeper as it goes.
 * @param {{x0: number, x1: number, y0: number, y1: number}} b the roof's bounds
 * @param {number} g
 * @param {() => number} r
 * @returns {Poly}
 */
function roofHole(b, g, r) {
	const w = (b.x1 - b.x0) * (0.1 + g * 0.95),
		cx = b.x0 + (b.x1 - b.x0) * (0.3 + r() * 0.4),
		deep = b.y1 - (b.y1 - b.y0) * (0.15 + g * 0.85),
		hi = b.y1 + 20;
	return [
		[b.x0 - 20, b.y0 - 20],
		[b.x1 + 20, b.y0 - 20],
		[b.x1 + 20, hi],
		[cx + w / 2, hi],
		[cx + w * 0.42, deep + 1.4],
		[cx + w * 0.15, deep + 0.4],
		[cx - w * 0.05, deep + 1.6],
		[cx - w * 0.3, deep],
		[cx - w / 2, hi],
		[b.x0 - 20, hi],
	];
}

/**
 * Keep-region under the stepped broken top of a building coming down: at
 * each run across, `keep` of the height standing there (what's tallest
 * over that run), give or take — rougher the further it's fallen.
 * @param {Part[]} walls
 * @param {{x0: number, x1: number, y0: number, y1: number}} b their bounds
 * @param {number} keep
 * @param {() => number} r
 * @returns {Poly}
 */
function fallingTop(walls, b, keep, r) {
	const boxes = walls.map((p) => bounds([p]));
	const slope = (r() < 0.5 ? -1 : 1) * 0.24 * (1 - keep);
	/** @type {Poly} */
	const mask = [
		[b.x1 + 6, b.y0 - 8],
		[b.x0 - 6, b.y0 - 8],
	];
	let x = b.x0 - 6;
	while (x < b.x1 + 6) {
		const x1 = Math.min(x + 2.5 + r() * 4, b.x1 + 6);
		let t = -Infinity;
		for (const q of boxes) if (q.x1 > x && q.x0 < x1) t = Math.max(t, q.y1);
		if (!Number.isFinite(t)) t = b.y1;
		const across = (x - b.x0) / Math.max(1, b.x1 - b.x0) - 0.5;
		const share = keep + slope * across + (r() - 0.5) * (0.08 + 0.3 * (1 - keep));
		const y = Math.max(b.y0 + 1.2, Math.min(t, b.y0 + (t - b.y0) * share));
		mask.push([x, y], [x1, y]);
		x = x1;
	}
	return mask;
}

/**
 * Enclosure wall: stays standing but gets 1–3 breaches down to the ground
 * (scaled by `share` when the wall is cut into segments, so the whole run
 * still gets about that many).
 * @param {Part[]} parts
 * @param {RuinOptions} o
 * @param {number} seed
 * @param {number} share
 * @returns {Part[]}
 */
function breach(parts, o, seed, share) {
	const r = rng(seed);
	const b = bounds(parts.filter((p) => !p.terrain));
	if (!b.ok) return parts;
	const n = Math.round((1 + Math.floor(r() * (1 + o.decay * 2.2))) * share);
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

/** Rubble strewn along the foot, its stones `size` times the usual. @returns {Part} */
function rubble(
	/** @type {{x0: number, x1: number, y0: number}} */ b,
	/** @type {() => number} */ r,
	/** @type {number} */ n,
	size = 1,
) {
	/** @type {Poly[]} */
	const stones = [];
	for (let i = 0; i < n; i++)
		stones.push(
			stone(
				b.x0 + 1 + r() * (b.x1 - b.x0 - 2),
				b.y0 - (0.6 + r() * 1.8) * size,
				(1.1 + r() * 1.3) * size,
				r,
			),
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
 * A ruined building whose roof survived: everything stands except flags,
 * banners and smoke, the roof may have a jagged hole bitten out of it, and
 * it still gets rubble, overgrowth and (if burned) scorched walls.
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
		.filter((p) => !p.terrain && p.role !== 'flag' && !p.smoke)
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
	// Only on what's left of a wall — not one broken off below its foot (an
	// upper storey), which would leave the ivy hanging in the air.
	const big = faces.filter(
		({ b }) => b.x1 - b.x0 > 4 && b.y1 - b.y0 > 3 && top((b.x0 + b.x1) / 2) - b.y0 > 2,
	);
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

/** Low, ragged bushes on the ground at the foot (marker colour), `size`
 *  times the usual. @returns {Part[]} */
function bushes(
	/** @type {{x0: number, x1: number, y0: number}} */ b,
	/** @type {number} */ amount,
	/** @type {() => number} */ r,
	size = 1,
) {
	const n = Math.round(amount * 3);
	/** @type {Part[]} */
	const out = [];
	for (let i = 0; i < n; i++) {
		const w = (3.5 + r() * 3) * size,
			x0 = b.x0 + r() * Math.max(1, b.x1 - b.x0 - w),
			y = b.y0 - (0.6 + r() * 1.4) * size,
			h = (1.4 + r() * 1.3) * size;
		// (Clamped: at the far edge the sine can round a hair below zero,
		// and a fractional power of that is NaN.)
		const height = (/** @type {number} */ x) =>
			y + h * Math.max(0, Math.sin(((x - x0) / w) * Math.PI)) ** 0.6;
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
