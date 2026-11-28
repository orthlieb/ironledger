/**
 * The line forsaking a vow writes (#lib/vows.ts), whichever way it's done:
 * the card's Forsake, a command or link, or the Forsake Your Vow move.
 */
import { describe, it, expect } from 'vitest';
import { forsakeVowHtml } from '../../src/lib/vows.js';

describe('forsakeVowHtml', () => {
	it('names the vow and its rank, with Endure Stress at that rank', () => {
		const html = forsakeVowHtml({ name: 'Avenge Bjorn', difficulty: 'formidable' });
		expect(html).toContain('Forsook the iron vow <strong>Avenge Bjorn</strong> (Formidable)');
		expect(html).toContain('data-cmd="/move endure-stress 3"');
		expect(html).toContain('(−3) for its rank.');
	});

	it('runs Troublesome 1 to Epic 5', () => {
		expect(forsakeVowHtml({ name: 'A', difficulty: 'troublesome' })).toContain('endure-stress 1"');
		expect(forsakeVowHtml({ name: 'A', difficulty: 'epic' })).toContain('endure-stress 5"');
	});

	it('keeps a vow’s name as text, never markup or a link', () => {
		const html = forsakeVowHtml({ name: '[heal](/health=5) <b>x</b>', difficulty: 'dangerous' });
		expect(html).not.toContain('data-cmd="/health');
		expect(html).not.toContain('<b>');
		expect(html).toContain('&lt;b&gt;');
	});

	it('names an unnamed vow so', () => {
		expect(forsakeVowHtml({ name: '  ', difficulty: 'dangerous' })).toContain(
			'<strong>Unnamed Vow</strong>',
		);
	});
});
