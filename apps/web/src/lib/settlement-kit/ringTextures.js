// =============================================================================
// Settlement kit — ring-wall textures
//
// A ring wall curves away from the viewer, so a flat <pattern> tile can't
// follow it. Hedge and coral rings take a plain body tile (patterns.js) and
// lay their line-work round the ring instead (ringWall() in pieces3d.js):
// the hedge's arching bramble canes, the brain coral's double-walled grooves.
// This module turns each tile's art into polylines in world units, once at
// load. It needs Clipper, so it lives apart from patterns.js, which the
// app's main bundle loads.
// =============================================================================

import ClipperLib from 'clipper-lib';
import { TILE_ART } from './patterns.js';

/** @typedef {[number, number]} P2 */

/** SVG units per world unit in the kit's icons (generate.js renders at K = 2). */
const SVG_PER_WORLD = 2;
/** Clipper works in integers. */
const S = 1000;

/**
 * Sample absolute M / L / C / Q / Z path data (as the tiles write it) into
 * polylines, `n` points per curve.
 * @param {string} d
 * @param {number} n
 * @returns {P2[][]}
 */
function polylines(d, n) {
	const tokens = d.match(/[MLCQZ]|-?\d+(?:\.\d+)?/g) ?? [];
	/** @type {P2[][]} */
	const out = [];
	/** @type {P2[]} */
	let cur = [];
	let cmd = '',
		i = 0;
	const pt = () => /** @type {P2} */ ([Number(tokens[i++]), Number(tokens[i++])]);
	/** @param {(t: number) => P2} f */
	const sample = (f) => {
		for (let k = 1; k <= n; k++) cur.push(f(k / n));
	};
	while (i < tokens.length) {
		if (/[MLCQZ]/.test(tokens[i])) cmd = tokens[i++];
		if (cmd === 'M') {
			if (cur.length > 1) out.push(cur);
			cur = [pt()];
			cmd = 'L';
		} else if (cmd === 'L') cur.push(pt());
		else if (cmd === 'C') {
			const p0 = cur[cur.length - 1],
				p1 = pt(),
				p2 = pt(),
				p3 = pt();
			sample((t) => {
				const u = 1 - t;
				const b = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
				return [
					b[0] * p0[0] + b[1] * p1[0] + b[2] * p2[0] + b[3] * p3[0],
					b[0] * p0[1] + b[1] * p1[1] + b[2] * p2[1] + b[3] * p3[1],
				];
			});
		} else if (cmd === 'Q') {
			const p0 = cur[cur.length - 1],
				p1 = pt(),
				p2 = pt();
			sample((t) => {
				const u = 1 - t;
				return [
					u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
					u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
				];
			});
		} else if (cmd === 'Z') {
			if (cur.length) cur.push(cur[0]);
			cmd = '';
		} else i++;
	}
	if (cur.length > 1) out.push(cur);
	return out;
}

/**
 * The pieces of a polyline inside the box [0, size)², as polylines.
 * @param {P2[]} pl
 * @param {number} size
 * @returns {P2[][]}
 */
function clipToTile(pl, size) {
	/** @type {P2[][]} */
	const out = [];
	/** @type {P2[]} */
	let run = [];
	for (let k = 0; k + 1 < pl.length; k++) {
		const [a, b] = [pl[k], pl[k + 1]];
		const dx = b[0] - a[0],
			dy = b[1] - a[1];
		let t0 = 0,
			t1 = 1,
			inside = true;
		for (const [p, q] of [
			[-dx, a[0]],
			[dx, size - a[0]],
			[-dy, a[1]],
			[dy, size - a[1]],
		]) {
			if (p === 0) {
				if (q < 0) inside = false;
				continue;
			}
			const r = q / p;
			if (p < 0) t0 = Math.max(t0, r);
			else t1 = Math.min(t1, r);
		}
		if (!inside || t0 > t1) {
			if (run.length > 1) out.push(run);
			run = [];
			continue;
		}
		/** @type {P2} */ const s0 = [a[0] + t0 * dx, a[1] + t0 * dy];
		/** @type {P2} */ const s1 = [a[0] + t1 * dx, a[1] + t1 * dy];
		if (!run.length || t0 > 0) {
			if (run.length > 1) out.push(run);
			run = [s0];
		}
		run.push(s1);
		if (t1 < 1) {
			out.push(run);
			run = [];
		}
	}
	if (run.length > 1) out.push(run);
	return out;
}

/**
 * The walls of a maze's grooves: its centrelines thickened to `band` and
 * unioned (over the tile and its neighbours, so grooves run on across the
 * edges), then the union's outline cut back to the tile.
 * @param {P2[][]} centres
 * @param {number} tile
 * @param {number} band
 * @returns {P2[][]}
 */
function grooveWalls(centres, tile, band) {
	const co = new ClipperLib.ClipperOffset(2, 0.015 * S);
	for (const dx of [-tile, 0, tile])
		for (const dy of [-tile, 0, tile])
			for (const pl of centres)
				co.AddPath(
					pl.map(([x, y]) => ({ X: Math.round((x + dx) * S), Y: Math.round((y + dy) * S) })),
					ClipperLib.JoinType.jtRound,
					ClipperLib.EndType.etOpenRound,
				);
	/** @type {{X: number, Y: number}[][]} */
	const rings = [];
	co.Execute(rings, (band / 2) * S);
	/** @type {P2[][]} */
	const out = [];
	for (const ring of ClipperLib.Clipper.CleanPolygons(rings, 0.01 * S)) {
		/** @type {P2[]} */
		const pl = ring.map((/** @type {{X: number, Y: number}} */ p) => [p.X / S, p.Y / S]);
		pl.push(pl[0]);
		out.push(...clipToTile(pl, tile));
	}
	return out;
}

/**
 * Polylines in tile units → line-work in world units (y up from the tile's
 * foot), each with its stroke weight and extent. Elements drawn whole are
 * kept once: the tiles repeat an element that crosses an edge a tile over,
 * so only the copy that starts inside the tile is kept.
 * @param {number} tile
 * @param {number} scale the tile's patternTransform scale
 * @param {P2[][]} pls
 * @param {number} w stroke weight (world units)
 * @param {boolean} whole keep only polylines that start inside the tile
 * @param {string} role the colour role the lines paint in
 */
function worldLines(tile, scale, pls, w, whole, role) {
	const f = scale / SVG_PER_WORLD;
	return pls
		.filter(([[sx, sy]]) => !whole || (sx >= 0 && sx < tile && sy >= 0 && sy < tile))
		.map((pl) => {
			/** @type {P2[]} */
			const pts = pl.map(([x, y]) => [x * f, (tile - y) * f]);
			const xs = pts.map((p) => p[0]),
				ys = pts.map((p) => p[1]);
			return { pts, w, role, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys) };
		});
}

const { hedge, coral } = TILE_ART;

/** Line-work laid round ring walls, by role: `size` is the tile's width and
 *  height in world units, `lines` its polylines within it. */
export const RING_TEXTURES = {
	'wall-hedge-ring': {
		size: (hedge.tile * hedge.scale) / SVG_PER_WORLD,
		// The canes in their bramble brown, at the tile's own weight.
		lines: worldLines(
			hedge.tile,
			hedge.scale,
			polylines(hedge.cane, 12),
			(0.26 * hedge.scale) / SVG_PER_WORLD,
			true,
			'wall-hedge-cane',
		),
	},
	'wall-reef-ring': {
		size: (coral.tile * coral.scale) / SVG_PER_WORLD,
		lines: [
			// The grooves' walls in the coral's grey — a touch heavier than the
			// tile's, whose rims read bolder with the white gap between them —
			// and the paler vein down the middle of each.
			...worldLines(
				coral.tile,
				coral.scale,
				grooveWalls(polylines(coral.maze, 8), coral.tile, coral.band),
				(0.2 * coral.scale) / SVG_PER_WORLD,
				false,
				'wall-reef-groove',
			),
			...worldLines(
				coral.tile,
				coral.scale,
				polylines(coral.maze, 8),
				(0.14 * coral.scale) / SVG_PER_WORLD,
				true,
				'wall-reef-vein',
			),
		],
	},
};
