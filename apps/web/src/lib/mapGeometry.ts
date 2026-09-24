// =============================================================================
// Iron Ledger — Square-grid geometry helpers
//
// Pure functions — no Svelte, no DOM, no store access. Everything the map
// renderer needs to size the grid, walk its lines, and snap marker
// coordinates lives here. Kept separate from mapStore.svelte.ts so the
// geometry can be unit-tested without a browser and reused by any future
// non-Svelte consumer.
//
// Coord system: fractional (x, y) in world units where each cell is 1 × 1.
// Base grid at 100% zoom has `cols × rows` cells; zoom introduces
// power-of-two sub-grid octaves (see `subGridStep`).
// =============================================================================

import { subGridOctaveForZoom } from './mapConstants.js';

export interface GridCoord {
	x: number;
	y: number;
}

/** Walk out-of-bounds markers back into `[0, cols] × [0, rows]`. When
 *  a new background image has a different aspect than the old one the
 *  grid's `(cols, rows)` shrinks or grows, and markers that were legal
 *  against the old bounds can land outside the canvas — the click-
 *  capture `<rect>` in MapDialog only spans the current bounds, so a
 *  click there just misses the icon and those markers become
 *  unselectable and undeletable. Clamp them back to the nearest edge.
 *
 *  Pure and typed only against a `{x, y}`-plus-anything shape so the
 *  helper is easy to unit-test without pulling the $state-carrying
 *  mapStore module through vitest's node import path. Preserves the
 *  input array's identity when no marker needed to move (===) so
 *  callers can skip a persist. */
export function clampMarkersToBounds<T extends GridCoord>(
	markers: T[],
	bounds: { cols: number; rows: number },
): T[] {
	const { cols, rows } = bounds;
	let changed = false;
	const out = markers.map((m) => {
		const x = Math.max(0, Math.min(cols, m.x));
		const y = Math.max(0, Math.min(rows, m.y));
		if (x === m.x && y === m.y) return m;
		changed = true;
		return { ...m, x, y };
	});
	return changed ? out : markers;
}

/** Snap a world coordinate to the nearest sub-grid intersection at the
 *  given step (world units between adjacent snap lines). Used for
 *  rendering grid lines; markers themselves snap to cell CENTERS via
 *  `snapToCellCenter`. */
export function snapToStep(v: number, step: number): number {
	if (step <= 0) return v;
	return Math.round(v / step) * step;
}

/** Snap a world coordinate to the CENTER of the cell containing it
 *  at the given cell size. Cell centers sit at `s/2, 3s/2, 5s/2, …`
 *  — one half-step in from each corner intersection — so a marker
 *  placed via `snapCoord` visually lands INSIDE a cell rather than on
 *  the grid crossing where four cells meet. */
export function snapToCellCenter(v: number, cellSize: number): number {
	if (cellSize <= 0) return v;
	return Math.floor(v / cellSize) * cellSize + cellSize / 2;
}

/** World-unit distance between adjacent sub-grid lines at a given zoom.
 *  Zoom 1 → 1 (base cells); zoom 2 → 0.5; zoom 4 → 0.25; etc. */
export function subGridStep(zoom: number): number {
	return 1 / Math.pow(2, subGridOctaveForZoom(zoom));
}

/** Snap a marker's `(x, y)` to the CENTER of the sub-cell containing
 *  it at the current zoom. Cell-centered so the visible marker icon
 *  sits inside the cell (and the selection outline wraps that cell)
 *  instead of straddling the intersection where four cells meet. */
export function snapCoord(coord: GridCoord, zoom: number): GridCoord {
	const step = subGridStep(zoom);
	return { x: snapToCellCenter(coord.x, step), y: snapToCellCenter(coord.y, step) };
}

/** Yield every world-unit x-coordinate that a vertical grid line falls
 *  on at the given octave. Octave 0 → integers only (major lines);
 *  octave 1 adds .5s; octave 2 adds .25s and .75s; and so on. Yields
 *  from 0 through `cols` inclusive so both edges land on a line. */
export function* gridLineOffsets(extent: number, octave: number): Generator<number> {
	const step = 1 / Math.pow(2, Math.max(0, Math.floor(octave)));
	// Multiply to build integer index and divide to place, so floating-point
	// error doesn't accumulate across the sweep.
	const total = Math.round(extent / step);
	for (let i = 0; i <= total; i++) yield (i * step * 1000) / 1000;
}

/** True when `x` is an integer (base grid), false for sub-grid
 *  intersections. Used to draw major lines slightly darker than minor. */
export function isMajorLine(x: number): boolean {
	return Math.abs(x - Math.round(x)) < 1e-9;
}
