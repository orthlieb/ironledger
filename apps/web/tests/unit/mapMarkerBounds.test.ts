/**
 * mapMarkerBounds.test.ts — regression guard for the marker walk-back
 * that runs after a background swap widens or narrows the map canvas.
 *
 * `setBackground` in mapStore.svelte.ts calls `clampMarkersToBounds`
 * whenever the new image's aspect changes `gridDimsForAspect(aspect)`.
 * A marker landing outside the new `(cols, rows)` becomes unclickable
 * (the click-capture `<rect>` only spans the current bounds), so we
 * walk it back to the nearest edge. These tests pin that contract
 * against the pure helper without touching the $state store.
 */
import { describe, it, expect } from 'vitest';
import { clampMarkersToBounds } from '../../src/lib/mapGeometry.js';

interface Marker {
	id: string;
	x: number;
	y: number;
	label?: string;
}

function m(id: string, x: number, y: number): Marker {
	return { id, x, y, label: id };
}

describe('clampMarkersToBounds', () => {
	const bounds = { cols: 10, rows: 6 };

	it('passes through markers already inside the bounds unchanged', () => {
		const inside = [m('a', 0, 0), m('b', 5, 3), m('c', 10, 6)];
		expect(clampMarkersToBounds(inside, bounds)).toEqual(inside);
	});

	it('returns the same array reference when nothing moved (skip-persist signal)', () => {
		// The caller in setBackground checks `clamped !== mapState.markers`
		// to decide whether to fire a PUT. A no-op call must return the
		// input array so that identity check reads as "unchanged".
		const inside = [m('a', 2.5, 1.25), m('b', 7, 4)];
		expect(clampMarkersToBounds(inside, bounds)).toBe(inside);
	});

	it('clamps a marker past the right edge back to cols', () => {
		const [result] = clampMarkersToBounds([m('east', 15, 3)], bounds);
		expect(result).toEqual({ id: 'east', x: 10, y: 3, label: 'east' });
	});

	it('clamps a marker past the bottom edge back to rows', () => {
		const [result] = clampMarkersToBounds([m('south', 5, 11.4)], bounds);
		expect(result).toEqual({ id: 'south', x: 5, y: 6, label: 'south' });
	});

	it('clamps a marker past the top-left corner back to (0, 0)', () => {
		const [result] = clampMarkersToBounds([m('nw', -3, -2)], bounds);
		expect(result).toEqual({ id: 'nw', x: 0, y: 0, label: 'nw' });
	});

	it('clamps a bottom-right overflow on both axes to (cols, rows)', () => {
		const [result] = clampMarkersToBounds([m('se', 42, 42)], bounds);
		expect(result).toEqual({ id: 'se', x: 10, y: 6, label: 'se' });
	});

	it('walks back only the out-of-bounds markers, leaving the rest ===', () => {
		const inside = m('inside', 5, 3);
		const outside = m('outside', 12, 8);
		const [a, b] = clampMarkersToBounds([inside, outside], bounds);
		// The one already inside must survive with byte-identical identity —
		// downstream code (persist diff, entity-link cache) uses === to see
		// whether the marker changed.
		expect(a).toBe(inside);
		expect(b).toEqual({ id: 'outside', x: 10, y: 6, label: 'outside' });
	});

	it('preserves all other marker fields verbatim', () => {
		const styled = {
			id: 'styled',
			x: 42,
			y: 42,
			label: 'Bright Hollow',
			icon: 'site/spring',
			color: '#e8a030',
			angle: 90,
			labelStyle: { bold: true, case: 'small-caps' as const },
			labelPosition: 'top-right' as const,
		};
		const [result] = clampMarkersToBounds([styled], bounds);
		expect(result).toEqual({ ...styled, x: 10, y: 6 });
	});

	it('handles the shrinking-canvas case (portrait → landscape swap)', () => {
		// Original bounds: 6 cols × 10 rows (tall portrait). New bounds:
		// 10 cols × 6 rows (wide landscape). Every marker at y > 6
		// walks back to the new bottom edge.
		const tall = [m('a', 3, 2), m('b', 3, 7), m('c', 3, 9.5)];
		const wide = { cols: 10, rows: 6 };
		const walked = clampMarkersToBounds(tall, wide);
		expect(walked.map(({ y }) => y)).toEqual([2, 6, 6]);
	});
});
