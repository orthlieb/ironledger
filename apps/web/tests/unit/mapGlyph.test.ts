/**
 * mapGlyph.test.ts
 *
 * Covers the icon-colouring helpers in mapConstants: `safeMarkerColor`
 * (guards against markup injection through marker colours) and
 * `mapGlyphInner` (emits `<g fill>` for vector icons, a tint `<filter>`
 * for raster PNG icons). These strings flow through `{@html}` at four
 * render sites, so their shape is worth locking down.
 */
import { describe, it, expect } from 'vitest';
import { safeMarkerColor, mapGlyphInner, haloColor } from '../../src/lib/mapConstants.js';
import type { MapIcon } from '../../src/lib/generated/mapIconManifest.js';

const vector: MapIcon = {
	slug: 'castle',
	label: 'Castle',
	category: 'settlement',
	categoryLabel: 'Settlement',
	viewBox: '0 0 24 24',
	inner: '<path d="M0 0h24v24H0z" />',
};

const raster: MapIcon = {
	slug: 'town',
	label: 'Town',
	category: 'settlement',
	categoryLabel: 'Settlement',
	viewBox: '0 0 221 235',
	inner:
		'<image href="/map/settlement/town.png" x="0" y="0" width="221" height="235" preserveAspectRatio="xMidYMid meet" />',
	raster: true,
};

describe('safeMarkerColor', () => {
	it('passes through valid hex + rgb() colours', () => {
		expect(safeMarkerColor('#000000')).toBe('#000000');
		expect(safeMarkerColor('#Ef4444')).toBe('#Ef4444');
		expect(safeMarkerColor('#abc')).toBe('#abc');
		expect(safeMarkerColor('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
		expect(safeMarkerColor('rgba(1,2,3,0.5)')).toBe('rgba(1,2,3,0.5)');
	});

	it('rejects anything that could inject markup, falling back to default', () => {
		for (const bad of [
			'red',
			'"/><script>alert(1)</script>',
			'#000" onload="x',
			'url(#x)',
			'',
			null,
			undefined,
		]) {
			expect(safeMarkerColor(bad)).toBe('#000000');
		}
	});
});

describe('haloColor — contrast halo/backing colour', () => {
	it('returns white behind dark colours, black behind light ones', () => {
		expect(haloColor('#000000')).toBe('#ffffff');
		expect(haloColor('#1e3a8a')).toBe('#ffffff'); // dark navy
		expect(haloColor('#ffffff')).toBe('#000000');
		expect(haloColor('#ffe680')).toBe('#000000'); // pale yellow
	});

	it('handles shorthand hex and rgb()/rgba()', () => {
		expect(haloColor('#000')).toBe('#ffffff');
		expect(haloColor('#fff')).toBe('#000000');
		expect(haloColor('rgb(0,0,0)')).toBe('#ffffff');
		expect(haloColor('rgb(255, 255, 255)')).toBe('#000000');
	});

	it('falls back to a white halo for unparseable / injected colours', () => {
		// Routed through safeMarkerColor first → default #000000 → white halo,
		// preserving the legacy hardcoded-white behaviour.
		expect(haloColor('red')).toBe('#ffffff');
		expect(haloColor(null)).toBe('#ffffff');
	});
});

describe('mapGlyphInner — vector icons', () => {
	it('wraps inner in <g fill> and adds no filter', () => {
		const out = mapGlyphInner(vector, '#3b82f6', 'x1');
		expect(out).toBe('<g fill="#3b82f6">' + vector.inner + '</g>');
		expect(out).not.toContain('<filter');
	});

	it('adds a contrast stroke halo only when requested (white behind dark, black behind light)', () => {
		expect(mapGlyphInner(vector, '#000000', 'x2', false)).not.toContain('stroke');
		const darkHaloed = mapGlyphInner(vector, '#000000', 'x2', true);
		expect(darkHaloed).toContain('stroke="#ffffff"');
		expect(darkHaloed).toContain('paint-order="stroke"');
		const lightHaloed = mapGlyphInner(vector, '#ffffff', 'x2b', true);
		expect(lightHaloed).toContain('stroke="#000000"');
	});

	it('true halo is a fixed 2px non-scaling stroke; proportional scales with the viewBox', () => {
		const fixed = mapGlyphInner(vector, '#000000', 'xf', true);
		expect(fixed).toContain('stroke-width="2"');
		expect(fixed).toContain('vector-effect="non-scaling-stroke"');

		// vector viewBox is 0 0 24 24 → maxDim 24; proportional stroke = 24 * 0.16
		// = 3.84 (a device-scaled stroke, so NO non-scaling-stroke).
		const prop = mapGlyphInner(vector, '#000000', 'xp', 'proportional');
		const sw = Number(prop.match(/stroke-width="([\d.]+)"/)?.[1]);
		expect(sw).toBeCloseTo(24 * 0.16, 5);
		expect(prop).not.toContain('non-scaling-stroke');
		expect(prop).toContain('stroke="#ffffff"'); // same haloColor contrast rule
		// Bigger icon → proportionally bigger stroke (the whole point).
		const big = mapGlyphInner(
			{ ...vector, viewBox: '0 0 480 480' },
			'#000000',
			'xb',
			'proportional',
		);
		const swBig = Number(big.match(/stroke-width="([\d.]+)"/)?.[1]);
		expect(swBig).toBeGreaterThan(sw);
	});

	it('sanitises the colour before inlining it', () => {
		const out = mapGlyphInner(vector, '"/><script>', 'x3');
		expect(out).toContain('fill="#000000"');
		expect(out).not.toContain('<script>');
	});
});

describe('mapGlyphInner — raster icons', () => {
	it('emits a tint filter keyed on SourceAlpha, referenced by a unique id', () => {
		const out = mapGlyphInner(raster, '#ef4444', 'mk-42');
		expect(out).toContain('<filter id="mtint-mk-42"');
		expect(out).toContain('flood-color="#ef4444"');
		// Tint = flood colour composited "in" the source alpha.
		expect(out).toContain('in2="SourceAlpha" operator="in"');
		expect(out).toContain('filter="url(#mtint-mk-42)"');
		// The raster image markup is preserved inside the filtered group.
		expect(out).toContain(raster.inner);
	});

	it('omits the contrast backing unless requested (white behind dark, black behind light)', () => {
		expect(mapGlyphInner(raster, '#000000', 'a')).not.toContain('feMorphology');
		const backed = mapGlyphInner(raster, '#000000', 'b', true);
		// Silhouette backing = morphological close (dilate→erode) flooded with
		// the contrast colour — white behind the dark line-art here.
		expect(backed).toContain('operator="dilate"');
		expect(backed).toContain('operator="erode"');
		expect(backed).toContain('flood-color="#ffffff"');
		// A pale tint flips the backing to black so it reads on a light map.
		const lightBacked = mapGlyphInner(raster, '#ffe680', 'c', true);
		expect(lightBacked).toContain('flood-color="#000000"');
	});

	it('grows the close slightly (dilate radius > erode radius) for a thin separating edge', () => {
		const out = mapGlyphInner(raster, '#000', 'edge', true);
		const rDilate = Number(out.match(/operator="dilate" radius="([\d.]+)"/)?.[1]);
		const rErode = Number(out.match(/operator="erode" radius="([\d.]+)"/)?.[1]);
		expect(rDilate).toBeGreaterThan(rErode);
	});

	it('scales the backing radius with the icon pixel box (uniform on-screen weight)', () => {
		const big = mapGlyphInner(raster, '#000', 'big', true); // 221x235
		const small = mapGlyphInner({ ...raster, viewBox: '0 0 50 50' }, '#000', 'small', true);
		const rBig = Number(big.match(/operator="dilate" radius="([\d.]+)"/)?.[1]);
		const rSmall = Number(small.match(/operator="dilate" radius="([\d.]+)"/)?.[1]);
		expect(rBig).toBeGreaterThan(rSmall);
		expect(rSmall).toBeGreaterThanOrEqual(0.5);
	});
});
