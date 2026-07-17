/**
 * commandBar.test.ts — parser + fuzzy-match unit tests for the /home input strip.
 */

import { describe, it, expect } from 'vitest';
import { parseCommand, fuzzyScore, fuzzyPick, prefixPick } from '../../src/lib/commandBar.js';

describe('parseCommand', () => {
	it('returns null on empty / whitespace-only input', () => {
		expect(parseCommand('')).toBeNull();
		expect(parseCommand('   ')).toBeNull();
		expect(parseCommand('\n\t')).toBeNull();
	});

	it('treats plain prose as a Note', () => {
		expect(parseCommand('The wind was cold on the ridge.')).toEqual({
			kind: 'note',
			text: 'The wind was cold on the ridge.',
		});
	});

	it('trims edge whitespace on a note', () => {
		expect(parseCommand('  hello  ')).toEqual({ kind: 'note', text: 'hello' });
	});

	it('parses /help with no args', () => {
		expect(parseCommand('/help')).toEqual({ kind: 'help' });
	});

	it('parses /note <text> equivalently to bare prose', () => {
		expect(parseCommand('/note Vale drew steel.')).toEqual({
			kind: 'note',
			text: 'Vale drew steel.',
		});
	});

	it('errors on /note with no text', () => {
		const c = parseCommand('/note');
		expect(c?.kind).toBe('error');
	});

	it('parses /oracle <key>', () => {
		expect(parseCommand('/oracle place')).toEqual({ kind: 'oracle', key: 'place' });
	});

	it('parses /move <name>', () => {
		expect(parseCommand('/move face danger')).toEqual({
			kind: 'move',
			name: 'face danger',
		});
	});

	it('/move does not special-case a trailing +stat (treated as part of the name)', () => {
		// v1 dropped stat parsing — MovesDialog handles stat picking after open.
		expect(parseCommand('/move face danger +heart')).toEqual({
			kind: 'move',
			name: 'face danger +heart',
		});
	});

	it('parses /char <name>', () => {
		expect(parseCommand('/char Porcius')).toEqual({ kind: 'char', name: 'Porcius' });
	});

	it('parses /foe <name>', () => {
		expect(parseCommand('/foe Blood Thorn')).toEqual({ kind: 'foe', name: 'Blood Thorn' });
	});

	it('parses /record and /stop with no args', () => {
		expect(parseCommand('/record')).toEqual({ kind: 'record' });
		expect(parseCommand('/stop')).toEqual({ kind: 'stop' });
	});

	it('ignores any trailing args on /record and /stop', () => {
		expect(parseCommand('/record now')).toEqual({ kind: 'record' });
		expect(parseCommand('/stop please')).toEqual({ kind: 'stop' });
	});

	it('rejects an unknown verb', () => {
		const c = parseCommand('/pillage');
		expect(c?.kind).toBe('error');
		if (c?.kind === 'error') expect(c.message).toMatch(/unknown/i);
	});

	it('lowercases the verb but not the args', () => {
		expect(parseCommand('/CHAR Porcius')).toEqual({ kind: 'char', name: 'Porcius' });
	});
});

describe('fuzzyScore', () => {
	it('gives a perfect score for an exact match', () => {
		expect(fuzzyScore('face-danger', 'face-danger')).toBe(1000);
	});
	it('is case-insensitive', () => {
		expect(fuzzyScore('Face-Danger', 'FACE-DANGER')).toBe(1000);
	});
	it('scores prefix matches above substring matches', () => {
		expect(fuzzyScore('face-danger', 'face')).toBeGreaterThan(fuzzyScore('secure-face', 'face'));
	});
	it('scores substring matches above sub-sequence matches', () => {
		expect(fuzzyScore('face-danger', 'dan')).toBeGreaterThan(fuzzyScore('face-danger', 'fdg'));
	});
	it('returns 0 when a query char is missing', () => {
		expect(fuzzyScore('face-danger', 'xyz')).toBe(0);
	});
	it('returns 1 for an empty query (all items match)', () => {
		expect(fuzzyScore('anything', '')).toBe(1);
	});
});

describe('fuzzyPick', () => {
	const moves = ['face-danger', 'secure-an-advantage', 'compel', 'endure-harm', 'endure-stress'];

	it('returns all items (capped) when the query is empty', () => {
		expect(fuzzyPick(moves, (m) => m, '', 3)).toEqual(moves.slice(0, 3));
	});

	it('sorts prefix matches ahead of substring matches', () => {
		const out = fuzzyPick(moves, (m) => m, 'end');
		expect(out[0]).toBe('endure-harm');
		expect(out[1]).toBe('endure-stress');
	});

	it('drops items that have no character overlap', () => {
		const out = fuzzyPick(moves, (m) => m, 'zzz');
		expect(out).toEqual([]);
	});

	it('respects the limit', () => {
		const out = fuzzyPick(moves, (m) => m, 'e', 2);
		expect(out).toHaveLength(2);
	});
});

describe('prefixPick', () => {
	const moves = [
		'Face Danger',
		'Secure an Advantage',
		'Compel',
		'Endure Harm',
		'Endure Stress',
		'Enter the Fray',
	];

	it('returns only items whose label starts with the query', () => {
		const out = prefixPick(moves, (m) => m, 'e');
		expect(out).toEqual(['Endure Harm', 'Endure Stress', 'Enter the Fray']);
	});

	it('is case-insensitive', () => {
		expect(prefixPick(moves, (m) => m, 'END')).toEqual(['Endure Harm', 'Endure Stress']);
	});

	it('excludes items that only contain the query mid-word (substring)', () => {
		// "Face Danger" contains 'e' but does not START with it — must not appear.
		const out = prefixPick(moves, (m) => m, 'e');
		expect(out).not.toContain('Face Danger');
		expect(out).not.toContain('Secure an Advantage');
	});

	it('returns all items (capped) on an empty query', () => {
		expect(prefixPick(moves, (m) => m, '', 3)).toEqual(moves.slice(0, 3));
	});

	it('sorts matches alphabetically', () => {
		expect(prefixPick(moves, (m) => m, 'en')).toEqual([
			'Endure Harm',
			'Endure Stress',
			'Enter the Fray',
		]);
	});

	it('respects the limit', () => {
		expect(prefixPick(moves, (m) => m, 'e', 2)).toHaveLength(2);
	});
});
