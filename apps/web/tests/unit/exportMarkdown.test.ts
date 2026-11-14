/**
 * The Markdown export's pure pieces (lib/exportMarkdown.ts): a character's
 * page, and a map as an SVG with numbered pins.
 */
import { describe, it, expect } from 'vitest';
import { characterMarkdown, mapSvg, pinInk } from '../../src/lib/exportMarkdown.js';

const assets = [{ id: 'path/wayfinder', name: 'Wayfinder', category: 'Path' }];

describe('characterMarkdown', () => {
	const page = characterMarkdown(
		'Ivy',
		{
			background: 'Raised on the shore.',
			initiative: 1,
			edge: 3,
			heart: 2,
			iron: 1,
			shadow: 1,
			wits: 2,
			health: 4,
			spirit: 5,
			supply: 3,
			momentum: 6,
			globalValues: { mana: '2' },
			xp: 4,
			bonds: 6,
			bondsFormed: 'Bellmark',
			failures: 0,
			wounded: true,
			vows: [{ name: 'Find the bell', difficulty: 'dangerous', ticks: 8, menace: 3 }],
			assets: [{ assetId: 'path/wayfinder', abilities: [true, false, false] }],
		},
		{
			portrait: '../images/char-ivy.jpg',
			fields: ['## Details', '- **Region of origin:** Oray Hills', ''],
			assets,
		},
	);

	it('opens with the name, portrait, background and initiative', () => {
		expect(page.startsWith('# Ivy\n\n![Portrait](../images/char-ivy.jpg)\n\n')).toBe(true);
		expect(page).toContain('**Background:** Raised on the shore.');
		expect(page).toContain('**Initiative:** You have initiative');
	});

	it('puts the Details section before the stats', () => {
		expect(page.indexOf('## Details')).toBeLessThan(page.indexOf('## Stats'));
		expect(page).toContain('- **Region of origin:** Oray Hills');
		expect(page).toContain('| 3 | 2 | 1 | 1 | 2 |');
	});

	it('lists vitals, counters, progress with notes, debilities, vows and assets', () => {
		expect(page).toContain('- **Health:** 4/5');
		expect(page).toContain('- **Mana:** 2');
		expect(page).toContain('  - Bonds Formed: Bellmark');
		expect(page).toContain('## Debilities\n- Wounded');
		expect(page).toContain('- **Find the bell** (dangerous)');
		expect(page).toContain('  - Menace: 3/10');
		expect(page).toContain('- **Wayfinder** (Path) — 1/3 abilities');
		expect(page.endsWith('\n')).toBe(true);
	});

	it('leaves out what a bare character lacks', () => {
		const bare = characterMarkdown('', {}, { fields: [], assets });
		expect(bare.startsWith('# Unnamed Character\n')).toBe(true);
		expect(bare).not.toContain('Portrait');
		expect(bare).not.toContain('## Details');
		expect(bare).not.toContain('## Debilities');
		expect(bare).not.toContain('## Vows');
	});
});

describe('pinInk', () => {
	it('is dark on a light pin and white on a dark one', () => {
		expect(pinInk('#ffffff')).toBe('#1a1a1a');
		expect(pinInk('#fe0')).toBe('#1a1a1a');
		expect(pinInk('#e63946')).toBe('#fff');
		expect(pinInk('#123')).toBe('#fff');
	});

	it('is white for a colour it can read no luminance from', () => {
		expect(pinInk('tomato')).toBe('#fff');
		expect(pinInk('')).toBe('#fff');
	});
});

describe('mapSvg', () => {
	const svg = mapSvg('data:image/jpeg;base64,AAAA', 40, 30, [
		{ x: 4, y: 5, color: '#ffffff' },
		{ x: 10, y: 12 },
	]);

	it('sizes the view box to the grid and lays the background under the pins', () => {
		expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 30">')).toBe(
			true,
		);
		expect(svg).toContain('<image href="data:image/jpeg;base64,AAAA" x="0" y="0" width="40"');
	});

	it('numbers the pins in order, the default red when a marker has no colour', () => {
		expect(svg).toContain('cx="4" cy="5"');
		expect(svg).toContain('>1</text>');
		expect(svg).toContain('fill="#e63946"');
		expect(svg).toContain('>2</text>');
	});

	it('escapes a colour before it goes in an attribute', () => {
		expect(mapSvg('', 10, 10, [{ x: 1, y: 1, color: '"><script>' }])).toContain(
			'fill="&quot;&gt;&lt;script&gt;"',
		);
	});
});
