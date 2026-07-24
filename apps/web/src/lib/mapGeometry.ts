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

/** Snap a world coordinate to the nearest sub-grid intersection at the
 *  given step (world units between adjacent snap lines). */
export function snapToStep(v: number, step: number): number {
	if (step <= 0) return v;
	return Math.round(v / step) * step;
}

/** World-unit distance between adjacent sub-grid lines at a given zoom.
 *  Zoom 1 → 1 (base cells); zoom 2 → 0.5; zoom 4 → 0.25; etc. */
export function subGridStep(zoom: number): number {
	return 1 / Math.pow(2, subGridOctaveForZoom(zoom));
}

/** Snap a marker's `(x, y)` to the current zoom's sub-grid — call after
 *  every placement so markers land on a clean intersection users can
 *  eyeball. */
export function snapCoord(coord: GridCoord, zoom: number): GridCoord {
	const step = subGridStep(zoom);
	return { x: snapToStep(coord.x, step), y: snapToStep(coord.y, step) };
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
