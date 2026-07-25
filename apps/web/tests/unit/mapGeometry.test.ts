/**
 * mapGeometry.test.ts — square-grid geometry helpers.
 *
 * The geometry lives in a pure module (no Svelte, no DOM). These tests
 * lock in the snap-to-grid + sub-grid-per-zoom helpers the MapDialog
 * uses to place markers precisely at whatever zoom the user is at.
 */

import { describe, it, expect } from 'vitest';
import {
	snapToStep,
	subGridStep,
	snapCoord,
	gridLineOffsets,
	isMajorLine,
} from '../../src/lib/mapGeometry.js';

describe('snapToStep', () => {
	it('rounds to the nearest multiple of the step', () => {
		expect(snapToStep(0.4, 1)).toBe(0);
		expect(snapToStep(0.6, 1)).toBe(1);
		expect(snapToStep(0.6, 0.5)).toBe(0.5);
		expect(snapToStep(0.76, 0.25)).toBe(0.75);
	});
	it('returns the value unchanged for step <= 0', () => {
		expect(snapToStep(3.14, 0)).toBe(3.14);
		expect(snapToStep(3.14, -1)).toBe(3.14);
	});
});

describe('subGridStep', () => {
	it('is 1 at zoom 1 (base grid)', () => {
		expect(subGridStep(1)).toBe(1);
	});
	it('halves at each octave', () => {
		expect(subGridStep(2)).toBeCloseTo(0.5, 6);
		expect(subGridStep(4)).toBeCloseTo(0.25, 6);
		expect(subGridStep(8)).toBeCloseTo(0.125, 6);
	});
	it('holds the previous octave between doublings', () => {
		expect(subGridStep(1.5)).toBe(1);
		expect(subGridStep(3.9)).toBeCloseTo(0.5, 6);
	});
	it('clamps to base at zoom <= 1', () => {
		expect(subGridStep(0.5)).toBe(1);
		expect(subGridStep(0)).toBe(1);
	});
});

describe('snapCoord', () => {
	// Cell-centre snap: marker for a click at (3.7, 2.2) lands in the
	// cell whose corners are (3, 2)-(4, 3), so the snapped position is
	// its centre (3.5, 2.5) — one half-cell in from each corner.
	it('snaps to cell centres at zoom 1', () => {
		expect(snapCoord({ x: 3.7, y: 2.2 }, 1)).toEqual({ x: 3.5, y: 2.5 });
	});
	it('snaps to half-cell centres at zoom 2', () => {
		expect(snapCoord({ x: 3.7, y: 2.2 }, 2)).toEqual({ x: 3.75, y: 2.25 });
	});
	it('snaps to quarter-cell centres at zoom 4', () => {
		expect(snapCoord({ x: 3.7, y: 2.2 }, 4)).toEqual({ x: 3.625, y: 2.125 });
	});
});

describe('gridLineOffsets', () => {
	it('emits integer lines at octave 0 (inclusive of both ends)', () => {
		expect([...gridLineOffsets(5, 0)]).toEqual([0, 1, 2, 3, 4, 5]);
	});
	it('emits half-cell lines at octave 1', () => {
		expect([...gridLineOffsets(3, 1)]).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3]);
	});
	it('emits quarter-cell lines at octave 2', () => {
		const out = [...gridLineOffsets(1, 2)];
		expect(out).toEqual([0, 0.25, 0.5, 0.75, 1]);
	});
});

describe('isMajorLine', () => {
	it('true for integers, false for fractional offsets', () => {
		expect(isMajorLine(0)).toBe(true);
		expect(isMajorLine(3)).toBe(true);
		expect(isMajorLine(3.5)).toBe(false);
		expect(isMajorLine(3.25)).toBe(false);
	});
});
