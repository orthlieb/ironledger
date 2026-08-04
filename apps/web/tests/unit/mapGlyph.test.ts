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
import { safeMarkerColor, mapGlyphInner } from '../../src/lib/mapConstants.js';
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

describe('mapGlyphInner — vector icons', () => {
	it('wraps inner in <g fill> and adds no filter', () => {
		const out = mapGlyphInner(vector, '#3b82f6', 'x1');
		expect(out).toBe('<g fill="#3b82f6">' + vector.inner + '</g>');
		expect(out).not.toContain('<filter');
	});

	it('adds the stroke halo only when requested', () => {
		expect(mapGlyphInner(vector, '#000000', 'x2', false)).not.toContain('stroke');
		const haloed = mapGlyphInner(vector, '#000000', 'x2', true);
		expect(haloed).toContain('stroke="#fff"');
		expect(haloed).toContain('paint-order="stroke"');
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

	it('omits the white backing unless requested', () => {
		expect(mapGlyphInner(raster, '#000000', 'a')).not.toContain('feMorphology');
		const backed = mapGlyphInner(raster, '#000000', 'b', true);
		// Silhouette backing = morphological close (dilate→erode) flooded white.
		expect(backed).toContain('operator="dilate"');
		expect(backed).toContain('operator="erode"');
		expect(backed).toContain('flood-color="#ffffff"');
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
