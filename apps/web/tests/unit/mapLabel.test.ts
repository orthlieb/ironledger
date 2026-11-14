/**
 * mapLabel.test.ts — a map marker's label: its SVG placement at each of the
 * eight positions around the icon, and its emphasis style.
 */
import { describe, it, expect } from 'vitest';
import {
	LABEL_CAP_HEIGHT,
	LABEL_SIZE_MULT,
	labelPlacement,
	labelStyleCss,
} from '../../src/lib/mapLabel.js';

describe('labelPlacement', () => {
	// An icon half-size of 0.5, a gap of 0.1, a font size of 0.2.
	const at = (pos: Parameters<typeof labelPlacement>[0]) => labelPlacement(pos, 0.5, 0.1, 0.2);
	const cap = 0.2 * LABEL_CAP_HEIGHT;

	it('puts top and bottom labels centred, clear of the icon by the gap', () => {
		expect(at('top')).toEqual({ x: 0, y: -0.6, anchor: 'middle', baseline: 'alphabetic' });
		const bottom = at('bottom');
		expect(bottom.anchor).toBe('middle');
		expect(bottom.y).toBeCloseTo(0.6 + cap);
	});

	it('puts side labels on the cap-height centre, anchored away from the icon', () => {
		const left = at('left');
		expect(left.anchor).toBe('end');
		expect(left.x).toBeCloseTo(-0.63);
		expect(left.y).toBeCloseTo(cap / 2);
		expect(at('right').anchor).toBe('start');
	});

	it('puts diagonal labels outside the corner', () => {
		expect(at('top-left')).toEqual({ x: -0.6, y: -0.6, anchor: 'end', baseline: 'alphabetic' });
		const br = at('bottom-right');
		expect(br.x).toBeCloseTo(0.6);
		expect(br.anchor).toBe('start');
	});
});

describe('labelStyleCss', () => {
	it('is empty for an unstyled label', () => {
		expect(labelStyleCss(undefined)).toBe('');
		expect(labelStyleCss({})).toBe('');
	});

	it('writes each emphasis, and a size only when it isn’t the default', () => {
		expect(labelStyleCss({ bold: true, italic: true, case: 'small-caps', size: 'lg' })).toBe(
			`font-weight:800;font-style:italic;font-variant:small-caps;--label-size-mult:${LABEL_SIZE_MULT.lg}`,
		);
		expect(labelStyleCss({ underline: true, case: 'uppercase', size: 'md' })).toBe(
			'text-decoration:underline;text-transform:uppercase',
		);
	});
});
