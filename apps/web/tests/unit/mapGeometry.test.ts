/**
 * mapGeometry.test.ts — pointy-top hex geometry helpers.
 *
 * The geometry lives in a pure module (no Svelte, no DOM). These tests lock
 * in the axial↔pixel conversion, the neighbour walk, the polygon-point
 * generator, and the bounded-rectangle iteration — the same helpers the
 * MapDialog canvas depends on and that Tier 2's fill/path tools will
 * inherit.
 */

import { describe, it, expect } from 'vitest';
import {
	axialToPx,
	neighbors,
	hexPolygonPoints,
	allCells,
	mapViewBox,
} from '../../src/lib/mapGeometry.js';

describe('axialToPx (pointy-top)', () => {
	it('places (0, 0) at the origin', () => {
		const p = axialToPx(0, 0, 22);
		expect(p.x).toBeCloseTo(0, 6);
		expect(p.y).toBeCloseTo(0, 6);
	});
	it('moves right by √3·size on q+1', () => {
		const p = axialToPx(1, 0, 22);
		expect(p.x).toBeCloseTo(Math.sqrt(3) * 22, 6);
		expect(p.y).toBeCloseTo(0, 6);
	});
	it('moves down-right by (√3/2·size, 1.5·size) on r+1', () => {
		const p = axialToPx(0, 1, 22);
		expect(p.x).toBeCloseTo((Math.sqrt(3) / 2) * 22, 6);
		expect(p.y).toBeCloseTo(1.5 * 22, 6);
	});
	it('scales with size argument', () => {
		expect(axialToPx(1, 0, 10).x).toBeCloseTo(Math.sqrt(3) * 10, 6);
		expect(axialToPx(1, 0, 30).x).toBeCloseTo(Math.sqrt(3) * 30, 6);
	});
});

describe('neighbors', () => {
	it('returns exactly six axial coords', () => {
		expect(neighbors(0, 0)).toHaveLength(6);
	});
	it('returns the six pointy-top axial neighbours of (0, 0)', () => {
		// E, NE, NW, W, SW, SE — canonical pointy-top axial deltas.
		expect(neighbors(0, 0)).toEqual([
			{ q: 1, r: 0 },
			{ q: 1, r: -1 },
			{ q: 0, r: -1 },
			{ q: -1, r: 0 },
			{ q: -1, r: 1 },
			{ q: 0, r: 1 },
		]);
	});
	it('translates correctly for a non-origin cell', () => {
		const ns = neighbors(3, 2);
		expect(ns).toContainEqual({ q: 4, r: 2 });
		expect(ns).toContainEqual({ q: 3, r: 3 });
		expect(ns).toContainEqual({ q: 2, r: 3 });
	});
	it('is symmetric — every neighbour lists the source as one of its own neighbours', () => {
		for (const n of neighbors(5, 4)) {
			expect(neighbors(n.q, n.r)).toContainEqual({ q: 5, r: 4 });
		}
	});
});

describe('hexPolygonPoints', () => {
	it('returns six space-separated x,y pairs', () => {
		const s = hexPolygonPoints(0, 0, 22);
		const pairs = s.split(' ');
		expect(pairs).toHaveLength(6);
		for (const p of pairs) {
			expect(p).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
		}
	});
	it('starts at the top vertex (angle = -90°)', () => {
		const s = hexPolygonPoints(0, 0, 22);
		const [firstX, firstY] = s.split(' ')[0].split(',').map(Number);
		expect(firstX).toBeCloseTo(0, 5);
		expect(firstY).toBeCloseTo(-22, 5);
	});
	it('places all six vertices on a circle of radius `size` around (cx, cy)', () => {
		// hexPolygonPoints rounds to 2 decimal places for compact SVG — the
		// rounding introduces up to ~0.01 error per axis, so we test to 1dp.
		const s = hexPolygonPoints(100, 50, 15);
		for (const pair of s.split(' ')) {
			const [x, y] = pair.split(',').map(Number);
			const d = Math.hypot(x - 100, y - 50);
			expect(d).toBeCloseTo(15, 1);
		}
	});
});

describe('allCells', () => {
	it('yields cols × rows cells with default dimensions', () => {
		const cells = [...allCells()];
		// MAP_COLS × MAP_ROWS = 20 × 13 = 260 (grid sized for a 16:9
		// background image, e.g. 4K = 3840×2160)
		expect(cells).toHaveLength(260);
	});
	it('honors custom dimensions', () => {
		expect([...allCells(4, 3)]).toHaveLength(12);
	});
	it('rectangle is straight-sided — every row spans exactly `cols` cells', () => {
		const rowCounts = new Map<number, number>();
		for (const { r } of allCells(6, 5)) {
			rowCounts.set(r, (rowCounts.get(r) ?? 0) + 1);
		}
		for (const n of rowCounts.values()) expect(n).toBe(6);
	});
	it('applies per-row q offset so successive rows shift left by ⌊r/2⌋', () => {
		// Row 0 starts at q=0; row 2 starts at q=-1; row 4 at q=-2.
		const firstQ = new Map<number, number>();
		for (const { q, r } of allCells(4, 6)) {
			if (!firstQ.has(r)) firstQ.set(r, q);
		}
		expect(firstQ.get(0)).toBe(0);
		expect(firstQ.get(1)).toBe(0);
		expect(firstQ.get(2)).toBe(-1);
		expect(firstQ.get(3)).toBe(-1);
		expect(firstQ.get(4)).toBe(-2);
		expect(firstQ.get(5)).toBe(-2);
	});
});

describe('mapViewBox', () => {
	it('has positive dimensions', () => {
		const vb = mapViewBox(20, 15, 22);
		expect(vb.w).toBeGreaterThan(0);
		expect(vb.h).toBeGreaterThan(0);
	});
	it('scales linearly with grid size', () => {
		const a = mapViewBox(10, 10, 20);
		const b = mapViewBox(20, 20, 20);
		expect(b.w).toBeGreaterThan(a.w);
		expect(b.h).toBeGreaterThan(a.h);
	});
	it('includes padding on every side (origin sits comfortably inside)', () => {
		const vb = mapViewBox(20, 15, 22);
		// Origin should be inside the viewBox with room.
		expect(vb.x).toBeLessThan(0);
		expect(vb.y).toBeLessThan(0);
		expect(vb.x + vb.w).toBeGreaterThan(20 * Math.sqrt(3) * 22);
	});
});
