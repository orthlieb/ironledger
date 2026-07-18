/**
 * commandBar.test.ts — parser + fuzzy-match unit tests for the /home input strip.
 */

import { describe, it, expect } from 'vitest';
import {
	parseCommand,
	parseVitalOp,
	fuzzyScore,
	fuzzyPick,
	prefixPick,
} from '../../src/lib/commandBar.js';

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

	it('parses /start, /end, /story with no args', () => {
		expect(parseCommand('/start')).toEqual({ kind: 'start' });
		expect(parseCommand('/end')).toEqual({ kind: 'end' });
		expect(parseCommand('/story')).toEqual({ kind: 'story' });
	});

	it('ignores any trailing args on /start, /end, /story', () => {
		expect(parseCommand('/start now')).toEqual({ kind: 'start' });
		expect(parseCommand('/end please')).toEqual({ kind: 'end' });
		expect(parseCommand('/story me a tale')).toEqual({ kind: 'story' });
	});

	it('no longer parses /record, /stop, /continue — they became unknown verbs', () => {
		expect(parseCommand('/record')?.kind).toBe('error');
		expect(parseCommand('/stop')?.kind).toBe('error');
		expect(parseCommand('/continue')?.kind).toBe('error');
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

describe('parseCommand /vital', () => {
	it('parses spaced delta form', () => {
		expect(parseCommand('/vital momentum + 2')).toEqual({
			kind: 'vital',
			resource: 'momentum',
			op: '+',
			value: 2,
		});
		expect(parseCommand('/vital health - 3')).toEqual({
			kind: 'vital',
			resource: 'health',
			op: '-',
			value: 3,
		});
	});

	it('parses jammed forms — sign attached to number and/or resource', () => {
		expect(parseCommand('/vital momentum +2')).toEqual({
			kind: 'vital',
			resource: 'momentum',
			op: '+',
			value: 2,
		});
		expect(parseCommand('/vital health-3')).toEqual({
			kind: 'vital',
			resource: 'health',
			op: '-',
			value: 3,
		});
		expect(parseCommand('/vital xp=12')).toEqual({
			kind: 'vital',
			resource: 'xp',
			op: '=',
			value: 12,
		});
	});

	it('bare + / - defaults value to 1', () => {
		expect(parseCommand('/vital momentum +')).toEqual({
			kind: 'vital',
			resource: 'momentum',
			op: '+',
			value: 1,
		});
		expect(parseCommand('/vital spirit -')).toEqual({
			kind: 'vital',
			resource: 'spirit',
			op: '-',
			value: 1,
		});
	});

	it('experience is an alias for xp — both normalize to key "xp"', () => {
		expect(parseCommand('/vital experience +5')).toEqual({
			kind: 'vital',
			resource: 'xp',
			op: '+',
			value: 5,
		});
		expect(parseCommand('/vital xp +5')).toEqual({
			kind: 'vital',
			resource: 'xp',
			op: '+',
			value: 5,
		});
	});

	it('= accepts negative values (for momentum)', () => {
		expect(parseCommand('/vital momentum = -3')).toEqual({
			kind: 'vital',
			resource: 'momentum',
			op: '=',
			value: -3,
		});
		expect(parseCommand('/vital momentum =-3')).toEqual({
			kind: 'vital',
			resource: 'momentum',
			op: '=',
			value: -3,
		});
	});

	it('= without a value is an error', () => {
		const c = parseCommand('/vital health =');
		expect(c?.kind).toBe('error');
		if (c?.kind === 'error') expect(c.message).toMatch(/= needs a value/);
	});

	it('+ / - reject explicit negative values (would flip the sign)', () => {
		const c = parseCommand('/vital momentum + -2');
		expect(c?.kind).toBe('error');
		if (c?.kind === 'error') expect(c.message).toMatch(/negative deltas/);
	});

	it('errors on missing resource', () => {
		const c = parseCommand('/vital');
		expect(c?.kind).toBe('error');
	});

	it('errors on unknown resource — mana is not a vital', () => {
		const c = parseCommand('/vital mana +2');
		expect(c?.kind).toBe('error');
		if (c?.kind === 'error') expect(c.message).toMatch(/mana/i);
	});

	it('errors on missing operator', () => {
		const c = parseCommand('/vital momentum');
		expect(c?.kind).toBe('error');
	});

	it('errors on garbage operator', () => {
		const c = parseCommand('/vital momentum ??');
		expect(c?.kind).toBe('error');
	});

	it('is case-insensitive on resource name', () => {
		expect(parseCommand('/vital MOMENTUM +2')).toEqual({
			kind: 'vital',
			resource: 'momentum',
			op: '+',
			value: 2,
		});
	});
});

describe('parseCommand /bonds and /failures', () => {
	it('parses /bonds +2', () => {
		expect(parseCommand('/bonds +2')).toEqual({
			kind: 'track',
			name: 'bonds',
			op: '+',
			value: 2,
		});
	});
	it('parses /failures -1', () => {
		expect(parseCommand('/failures -1')).toEqual({
			kind: 'track',
			name: 'failures',
			op: '-',
			value: 1,
		});
	});
	it('parses /bonds = 12', () => {
		expect(parseCommand('/bonds = 12')).toEqual({
			kind: 'track',
			name: 'bonds',
			op: '=',
			value: 12,
		});
	});
	it('/bonds = 0 is valid (explicit clear)', () => {
		expect(parseCommand('/bonds = 0')).toEqual({
			kind: 'track',
			name: 'bonds',
			op: '=',
			value: 0,
		});
	});
	it('/bonds + defaults to +1', () => {
		expect(parseCommand('/bonds +')).toEqual({
			kind: 'track',
			name: 'bonds',
			op: '+',
			value: 1,
		});
	});
	it('/bonds = with no value is an error', () => {
		const c = parseCommand('/bonds =');
		expect(c?.kind).toBe('error');
		if (c?.kind === 'error') expect(c.message).toMatch(/needs a value/);
	});
	it('/bonds with no operator is an error', () => {
		const c = parseCommand('/bonds');
		expect(c?.kind).toBe('error');
	});
	it('/failures rejects a negative delta on +/-', () => {
		const c = parseCommand('/failures + -2');
		expect(c?.kind).toBe('error');
	});
	it('/failures = -3 parses (applier clamps to 0)', () => {
		expect(parseCommand('/failures = -3')).toEqual({
			kind: 'track',
			name: 'failures',
			op: '=',
			value: -3,
		});
	});
});

describe('parseCommand /debility', () => {
	it('parses <name> on', () => {
		expect(parseCommand('/debility wounded on')).toEqual({
			kind: 'debility',
			name: 'wounded',
			state: 'on',
		});
	});
	it('parses <name> off', () => {
		expect(parseCommand('/debility shaken off')).toEqual({
			kind: 'debility',
			name: 'shaken',
			state: 'off',
		});
	});
	it('parses <name> toggle', () => {
		expect(parseCommand('/debility encumbered toggle')).toEqual({
			kind: 'debility',
			name: 'encumbered',
			state: 'toggle',
		});
	});

	it('is case-insensitive on both name and state', () => {
		expect(parseCommand('/debility WOUNDED ON')).toEqual({
			kind: 'debility',
			name: 'wounded',
			state: 'on',
		});
		expect(parseCommand('/DEBILITY tormented Toggle')).toEqual({
			kind: 'debility',
			name: 'tormented',
			state: 'toggle',
		});
	});

	it('accepts all eight canonical debilities', () => {
		const names = [
			'wounded',
			'shaken',
			'unprepared',
			'encumbered',
			'maimed',
			'corrupted',
			'cursed',
			'tormented',
		];
		for (const n of names) {
			expect(parseCommand(`/debility ${n} on`)).toEqual({
				kind: 'debility',
				name: n,
				state: 'on',
			});
		}
	});

	it('rejects prefix matches — parser is strict, autocomplete assists', () => {
		const c = parseCommand('/debility wo on');
		expect(c?.kind).toBe('error');
		if (c?.kind === 'error') expect(c.message).toMatch(/doesn't recognise "wo"/);
	});

	it('errors on missing state — no default', () => {
		const c = parseCommand('/debility wounded');
		expect(c?.kind).toBe('error');
	});

	it('errors on missing args entirely', () => {
		const c = parseCommand('/debility');
		expect(c?.kind).toBe('error');
	});

	it('errors on unknown debility name', () => {
		const c = parseCommand('/debility hangnail on');
		expect(c?.kind).toBe('error');
		if (c?.kind === 'error') expect(c.message).toMatch(/hangnail/);
	});

	it('errors on unknown state token', () => {
		const c = parseCommand('/debility wounded maybe');
		expect(c?.kind).toBe('error');
		if (c?.kind === 'error') expect(c.message).toMatch(/on, off, toggle/);
	});

	it('errors on numeric state (1/0 not accepted)', () => {
		const c = parseCommand('/debility wounded 1');
		expect(c?.kind).toBe('error');
	});

	it('errors when extra tokens are present', () => {
		const c = parseCommand('/debility wounded on now');
		expect(c?.kind).toBe('error');
	});
});

describe('parseVitalOp', () => {
	it('spaced form', () => {
		expect(parseVitalOp('+ 2')).toEqual({ op: '+', value: 2 });
	});
	it('attached form', () => {
		expect(parseVitalOp('+2')).toEqual({ op: '+', value: 2 });
	});
	it('bare op defaults to 1', () => {
		expect(parseVitalOp('+')).toEqual({ op: '+', value: 1 });
		expect(parseVitalOp('-')).toEqual({ op: '-', value: 1 });
	});
	it('= requires a value', () => {
		const r = parseVitalOp('=');
		expect('kind' in r).toBe(true);
	});
	it('= permits negative values', () => {
		expect(parseVitalOp('= -3')).toEqual({ op: '=', value: -3 });
	});
	it('+ / - reject negative values', () => {
		const r = parseVitalOp('+ -2');
		expect('kind' in r).toBe(true);
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
