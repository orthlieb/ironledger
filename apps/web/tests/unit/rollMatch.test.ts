import { describe, it, expect } from 'vitest';
import { matchNoteHtml } from '../../src/lib/rollMatch.js';

describe('matchNoteHtml', () => {
	it('adds a positive-twist note on a strong hit + match', () => {
		const html = matchNoteHtml(true, true, true);
		expect(html).toContain('roll-match-note');
		expect(html).toContain('positive twist');
	});

	it('adds a dangerous-turn note on a miss + match', () => {
		const html = matchNoteHtml(false, false, true);
		expect(html).toContain('roll-match-note');
		expect(html).toContain('dangerous turn');
	});

	it('adds NO note on a weak hit + match (no special rule in Ironsworn)', () => {
		expect(matchNoteHtml(true, false, true)).toBe('');
		expect(matchNoteHtml(false, true, true)).toBe('');
	});

	it('adds no note when the dice are not a match, whatever the outcome', () => {
		expect(matchNoteHtml(true, true, false)).toBe(''); // strong, no match
		expect(matchNoteHtml(true, false, false)).toBe(''); // weak, no match
		expect(matchNoteHtml(false, false, false)).toBe(''); // miss, no match
	});
});
