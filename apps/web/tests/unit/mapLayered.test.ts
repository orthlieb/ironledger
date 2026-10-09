/**
 * mapLayered.test.ts
 *
 * Layered (multi-colour) settlement-kit map icons: palette parsing, role
 * colouring (roofs follow the marker colour, everything else keeps the
 * icon's palette), path parsing with its injection guard, and the
 * `mapGlyphInner` branch that draws them once the lazy cache has the file.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	DEFAULT_LAYERED_PALETTE,
	layeredMarkup,
	mixHex,
	parseLayeredSvg,
	parsePalette,
	roleColours,
} from '../../src/lib/mapLayered.js';
import { primeLayered } from '../../src/lib/mapIconCache.js';
import { FLAT_WALLS, MATERIALS, flatWall } from '../../src/lib/settlement-kit/patterns.js';
import { mapGlyphInner } from '../../src/lib/mapConstants.js';
import type { MapIcon } from '../../src/lib/generated/mapIconManifest.js';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" data-palette="wall:#eeeeee;roof:#aa0000">
  <path data-role="sil" fill="#fff" stroke="#fff" d="M0 0L10 0L10 10Z"/>
  <path data-role="wall" fill="#eee" d="M1 1L9 1L9 9Z"/>
  <path data-role="roof" fill="#a00" d="M2 2L8 2L5 5Z"/>
  <path data-role="ink" fill="#000" d="M3 3L4 3L4 4Z"/>
</svg>`;

describe('parsePalette', () => {
	it('reads known keys and keeps defaults for the rest', () => {
		const p = parsePalette('wall:#111111;roof:#222222');
		expect(p.wall).toBe('#111111');
		expect(p.roof).toBe('#222222');
		expect(p.ink).toBe(DEFAULT_LAYERED_PALETTE.ink);
	});
	it('ignores malformed colours and unknown keys (no markup injection)', () => {
		const p = parsePalette('wall:red;roof:#22"/><script>;bogus:#123456');
		expect(p.wall).toBe(DEFAULT_LAYERED_PALETTE.wall);
		expect(p.roof).toBe(DEFAULT_LAYERED_PALETTE.roof);
		expect(p).not.toHaveProperty('bogus');
	});
});

describe('roleColours', () => {
	it('puts the marker colour on the roofs, shading roof-shade toward ink', () => {
		const c = roleColours(DEFAULT_LAYERED_PALETTE, '#3b82f6');
		expect(c.roof).toBe('#3b82f6');
		expect(c['roof-shade']).toBe(mixHex('#3b82f6', DEFAULT_LAYERED_PALETTE.ink, 0.7));
		expect(c.wall).toBe(DEFAULT_LAYERED_PALETTE.wall);
		expect(c.sil).toBe(DEFAULT_LAYERED_PALETTE.halo);
	});
	it('keeps the palette roof without a marker colour, and expands #rgb', () => {
		expect(roleColours(DEFAULT_LAYERED_PALETTE).roof).toBe(DEFAULT_LAYERED_PALETTE.roof);
		expect(roleColours(DEFAULT_LAYERED_PALETTE, '#f00').roof).toBe('#ff0000');
	});
});

describe('parseLayeredSvg / layeredMarkup', () => {
	it('extracts role paths in paint order', () => {
		expect(parseLayeredSvg(SVG).map((p) => p.role)).toEqual(['sil', 'wall', 'roof', 'ink']);
	});
	it('drops paths whose data is not plain path syntax', () => {
		const bad = '<path data-role="wall" d="M0 0&quot;/><script>alert(1)</script>"/>';
		expect(parseLayeredSvg(bad)).toEqual([]);
	});
	it('draws the silhouette only with a halo, and recolours every layer', () => {
		const paths = parseLayeredSvg(SVG);
		const colours = roleColours(parsePalette('wall:#eeeeee'), '#00ff00');
		const plain = layeredMarkup(paths, colours, null);
		expect(plain).not.toContain(colours.sil + '"');
		expect(plain).toContain('fill="#00ff00"');
		const haloed = layeredMarkup(paths, colours, ' stroke="#fff"');
		expect(haloed.startsWith(`<path fill="${colours.sil}" stroke="#fff"`)).toBe(true);
	});
});

describe('layeredMarkup — patterned walls', () => {
	const paths = [
		{ role: 'wall-stone', d: 'M0 0L4 0L4 4Z' },
		{ role: 'wall-hedge-shade', d: 'M5 0L9 0L9 4Z' },
	];
	it("draws material walls through the kit's <pattern> defs", () => {
		const out = layeredMarkup(paths, roleColours(DEFAULT_LAYERED_PALETTE), null);
		expect(out).toMatch(/<pattern id="pat-wall-stone-\w+"/);
		expect(out).toMatch(/fill="url\(#pat-wall-hedge-shade-\w+\)"/);
		expect(out).toContain('patternTransform="scale(2)"'); // the bramble tile
	});
	it('keeps every material its own colours whatever the wall colour — stone is grey', () => {
		const a = layeredMarkup(paths, roleColours(parsePalette('wall:#112233')), null);
		const b = layeredMarkup(paths, roleColours(parsePalette('wall:#445566')), null);
		expect(a).toBe(b);
		expect(a).not.toContain('#112233');
		expect(a).toContain(MATERIALS.stone.body);
	});
});

describe('layeredMarkup — small icons', () => {
	const paths = [
		{ role: 'wall-stone', d: 'M0 0L4 0L4 4Z' },
		{ role: 'wall-hedge-shade', d: 'M5 0L9 0L9 4Z' },
	];
	it('draws walls in flat material colours, with no pattern defs, without detail', () => {
		const colours = roleColours(DEFAULT_LAYERED_PALETTE);
		const out = layeredMarkup(paths, colours, null, 's', false);
		expect(out).not.toContain('<pattern');
		expect(out).toContain(`fill="${FLAT_WALLS['wall-stone']}"`);
		expect(out).toContain(`fill="${flatWall('wall-hedge-shade', colours.ink, mixHex)}"`);
	});
	it('scopes pattern ids per instance when given a scope', () => {
		const out = layeredMarkup(paths, roleColours(DEFAULT_LAYERED_PALETTE), null, 'mk-7');
		expect(out).toContain('id="pat-wall-stone-mk-7"');
	});
});

describe('mapGlyphInner — layered icons', () => {
	const icon: MapIcon = {
		slug: 'village',
		label: 'Village',
		category: 'settlement',
		categoryLabel: 'Settlement',
		viewBox: '0 0 10 10',
		inner: '',
		layered: true,
		src: '/map/settlement/test-village.svg',
		palette: 'wall:#eeeeee;roof:#aa0000',
	};
	afterEach(() => vi.unstubAllGlobals());
	it('renders nothing until the file is loaded, then the coloured layers', () => {
		// The cache fetches unknown files; answer with a 404 so nothing loads.
		const fetchStub = vi.fn(() => Promise.resolve({ ok: false, text: () => Promise.resolve('') }));
		vi.stubGlobal('fetch', fetchStub);
		const unloaded = { ...icon, src: '/map/settlement/not-loaded.svg' };
		expect(mapGlyphInner(unloaded, '#ff0000', 'u1')).toBe('');
		expect(fetchStub).toHaveBeenCalledWith('/map/settlement/not-loaded.svg');
		primeLayered(icon.src!, SVG);
		const out = mapGlyphInner(icon, '#ff0000', 'u2', true);
		expect(out).toContain('fill="#ff0000"'); // roofs follow the marker
		expect(out).toContain('fill="#eeeeee"'); // walls keep the palette
		expect(out).toContain('vector-effect="non-scaling-stroke"'); // halo on the silhouette
	});
	it('drops wall patterns when the icon draws too small for them', () => {
		const walled = { ...icon, src: '/map/settlement/test-walled.svg', viewBox: '0 0 100 100' };
		primeLayered(
			walled.src,
			SVG.replace('data-role="wall"', 'data-role="wall-stone"').replace(
				'viewBox="0 0 10 10"',
				'viewBox="0 0 100 100"',
			),
		);
		expect(mapGlyphInner(walled, '#ff0000', 'w1', true, 20)).not.toContain('<pattern');
		expect(mapGlyphInner(walled, '#ff0000', 'w2', true, 100)).toContain(
			'<pattern id="pat-wall-stone-w2"',
		);
		expect(mapGlyphInner(walled, '#ff0000', 'w3', true)).toContain('<pattern'); // size unknown
	});
	it('keeps the icon roof colour for the default (black) marker', () => {
		primeLayered(icon.src!, SVG);
		expect(mapGlyphInner(icon, '#000000', 'u3')).toContain('fill="#aa0000"');
	});
});
