// =============================================================================
// Iron Ledger — Pointy-top hex geometry helpers
//
// Pure functions — no Svelte, no DOM, no store access. Everything the map
// renderer needs to lay out cells, generate SVG polygon points, walk
// neighbours, and compute the enclosing viewBox lives here. Kept separate
// from mapStore.svelte.ts so the geometry can be unit-tested without a
// browser and reused by any future non-Svelte consumer.
//
// Coordinate system: axial (q, r). Pointy-top hexes; conversion to pixel
// space follows the Red Blob Games reference formulae. The bounded
// rectangle uses offset-row shifting so its left and right edges stay
// vertically aligned instead of zig-zagging.
// =============================================================================

import { HEX_SIZE, MAP_COLS, MAP_ROWS } from './mapConstants.js';

export interface AxialCoord {
	q: number;
	r: number;
}

/**
 * Pointy-top axial → pixel. Returns the pixel centre of hex (q, r) in SVG
 * user units. Constants come from mapConstants.HEX_SIZE unless overridden.
 */
export function axialToPx(q: number, r: number, size = HEX_SIZE): { x: number; y: number } {
	const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
	const y = size * ((3 / 2) * r);
	return { x, y };
}

/**
 * The six axial neighbours of (q, r) — pointy-top order, starting east and
 * going counter-clockwise: E, NE, NW, W, SW, SE. Order matters for future
 * path-drawing and flood-fill; keep it stable.
 */
export function neighbors(q: number, r: number): AxialCoord[] {
	return [
		{ q: q + 1, r },
		{ q: q + 1, r: r - 1 },
		{ q, r: r - 1 },
		{ q: q - 1, r },
		{ q: q - 1, r: r + 1 },
		{ q, r: r + 1 },
	];
}

/**
 * SVG polygon `points` attribute for a pointy-top hex centred at (cx, cy).
 * Corners start at the top vertex and wrap clockwise. Values are rounded
 * to two decimal places to keep the emitted SVG compact.
 */
export function hexPolygonPoints(cx: number, cy: number, size = HEX_SIZE): string {
	const parts: string[] = [];
	for (let i = 0; i < 6; i++) {
		// -90° puts the first vertex at the top; six 60° steps around.
		const angle = (Math.PI / 3) * i - Math.PI / 2;
		const x = cx + size * Math.cos(angle);
		const y = cy + size * Math.sin(angle);
		parts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
	}
	return parts.join(' ');
}

/**
 * Yield every cell inside the bounded rectangle. Uses per-row `q` offset
 * so the rectangle has straight vertical sides — otherwise a naive
 * `for q in 0..COLS` produces a parallelogram.
 */
export function* allCells(cols = MAP_COLS, rows = MAP_ROWS): Generator<AxialCoord> {
	for (let r = 0; r < rows; r++) {
		const offset = Math.floor(r / 2);
		for (let q = -offset; q < cols - offset; q++) {
			// `q + 0` normalises -0 → +0 when offset === 0 (row 0). Signed
			// zero would leak into localStorage keys and test comparisons and
			// wreck lookups otherwise.
			yield { q: q + 0, r };
		}
	}
}

/**
 * SVG `viewBox` bounds that fit every cell produced by allCells() with a
 * one-hex margin on every side, so hexes at the edge aren't clipped by
 * the dialog's rounded corners.
 */
export function mapViewBox(
	cols = MAP_COLS,
	rows = MAP_ROWS,
	size = HEX_SIZE,
): { x: number; y: number; w: number; h: number } {
	const hexW = Math.sqrt(3) * size;
	const hexH = 2 * size;
	const padX = hexW;
	const padY = hexH;
	return {
		x: -padX,
		y: -padY,
		w: cols * hexW + padX * 2,
		h: rows * size * 1.5 + padY * 2,
	};
}
