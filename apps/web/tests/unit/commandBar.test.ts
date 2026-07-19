/**
 * commandBar.test.ts — parser + fuzzy-match unit tests for the /home input strip.
 */

import { describe, it, expect } from 'vitest';
import {
	parseCommand,
	parseVitalOp,
	parseDeltaOp,
	parseRollGroup,
	initiativeToNumber,
	fuzzyScore,
	fuzzyPick,
	prefixPick,
	ROLL_DIE_SIDES,
	ROLL_MAX_N,
	ROLL_MAX_MODIFIER,
	ROLL_MAX_GROUPS,
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

	it('parses /char with no args as help focused on char', () => {
		expect(parseCommand('/char')).toEqual({ kind: 'help', focus: 'char' });
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

describe('parseCommand /foe overloads', () => {
	it('/foe <name> still sets the active foe (existing behavior)', () => {
		expect(parseCommand('/foe Blood Thorn')).toEqual({ kind: 'foe', name: 'Blood Thorn' });
	});
	it('/foe with no args opens help focused on foe', () => {
		expect(parseCommand('/foe')).toEqual({ kind: 'help', focus: 'foe' });
	});
	it('/foe vanquish parses as the subcommand', () => {
		expect(parseCommand('/foe vanquish')).toEqual({ kind: 'foe-vanquish' });
	});
	it('/foe vanquish is case-insensitive', () => {
		expect(parseCommand('/foe VANQUISH')).toEqual({ kind: 'foe-vanquish' });
		expect(parseCommand('/foe Vanquish')).toEqual({ kind: 'foe-vanquish' });
	});
	it('/foe +2 parses as progress delta (boxes)', () => {
		expect(parseCommand('/foe +2')).toEqual({ kind: 'foe-progress', op: '+', value: 2 });
	});
	it('/foe - defaults to -1 box', () => {
		expect(parseCommand('/foe -')).toEqual({ kind: 'foe-progress', op: '-', value: 1 });
	});
	it('/foe = N rejects — no absolute set on progress', () => {
		const c = parseCommand('/foe = 4');
		expect(c?.kind).toBe('error');
		if (c?.kind === 'error') expect(c.message).toMatch(/= is not supported/);
	});
	it('/foe = with no value also rejects', () => {
		const c = parseCommand('/foe =');
		expect(c?.kind).toBe('error');
	});
	it('/foe vanquished (past tense) is NOT the subcommand — falls through to name', () => {
		expect(parseCommand('/foe vanquished')).toEqual({ kind: 'foe', name: 'vanquished' });
	});
});

describe('parseCommand /exp overloads', () => {
	it('/exp <name> sets active expedition', () => {
		expect(parseCommand('/exp Night Watch')).toEqual({ kind: 'exp', name: 'Night Watch' });
	});
	it('/exp with no args opens help focused on exp', () => {
		expect(parseCommand('/exp')).toEqual({ kind: 'help', focus: 'exp' });
	});
	it('/exp +3 parses as progress delta (marks)', () => {
		expect(parseCommand('/exp +3')).toEqual({ kind: 'exp-progress', op: '+', value: 3 });
	});
	it('/exp = N rejects — no absolute set on progress', () => {
		const c = parseCommand('/exp = 5');
		expect(c?.kind).toBe('error');
		if (c?.kind === 'error') expect(c.message).toMatch(/= is not supported/);
	});
	it('/exp - defaults to -1 mark', () => {
		expect(parseCommand('/exp -')).toEqual({ kind: 'exp-progress', op: '-', value: 1 });
	});
	it('/exp has no vanquish subcommand — falls through to name', () => {
		expect(parseCommand('/exp vanquish')).toEqual({ kind: 'exp', name: 'vanquish' });
	});
	it('/exp jammed op parses (+2 no space)', () => {
		expect(parseCommand('/exp +2')).toEqual({ kind: 'exp-progress', op: '+', value: 2 });
	});
});

describe('parseCommand /char overloads', () => {
	it('/char <name> still sets the active character', () => {
		expect(parseCommand('/char Beepalache')).toEqual({ kind: 'char', name: 'Beepalache' });
	});
	it('/char -2 parses as harm (delta down on health, explicit value)', () => {
		expect(parseCommand('/char -2')).toEqual({
			kind: 'char-harm',
			op: '-',
			value: 2,
			defaulted: false,
		});
	});
	it('/char + defaults to +1 with defaulted=true', () => {
		expect(parseCommand('/char +')).toEqual({
			kind: 'char-harm',
			op: '+',
			value: 1,
			defaulted: true,
		});
	});
	it('/char - defaults to -1 with defaulted=true (dispatch may swap in foe rank)', () => {
		expect(parseCommand('/char -')).toEqual({
			kind: 'char-harm',
			op: '-',
			value: 1,
			defaulted: true,
		});
	});
	it('explicit /char -1 is NOT flagged as defaulted', () => {
		expect(parseCommand('/char -1')).toEqual({
			kind: 'char-harm',
			op: '-',
			value: 1,
			defaulted: false,
		});
	});
	it('/char = N is rejected — use /vital health = N for absolute set', () => {
		const c = parseCommand('/char = 3');
		expect(c?.kind).toBe('error');
		if (c?.kind === 'error') expect(c.message).toMatch(/= is not supported/);
	});
	it('/char with a numeric-like name still parses as name (no ambiguity)', () => {
		// Not really practical — but the parser only routes to op if the first
		// char is +/-/=. Anything else is a name.
		expect(parseCommand('/char Vault2')).toEqual({ kind: 'char', name: 'Vault2' });
	});
});

describe('parseDeltaOp', () => {
	it('accepts + and - with defaults', () => {
		expect(parseDeltaOp('+')).toEqual({ op: '+', value: 1 });
		expect(parseDeltaOp('-')).toEqual({ op: '-', value: 1 });
	});
	it('accepts +N and -N', () => {
		expect(parseDeltaOp('+3')).toEqual({ op: '+', value: 3 });
		expect(parseDeltaOp('- 5')).toEqual({ op: '-', value: 5 });
	});
	it('rejects = with an explicit "use + or -" pointer', () => {
		const r = parseDeltaOp('= 4');
		expect('kind' in r).toBe(true);
		if ('kind' in r) expect(r.message).toMatch(/use \+ or -/);
	});
	it('rejects explicit negative deltas on + / -', () => {
		const r = parseDeltaOp('+ -2');
		expect('kind' in r).toBe(true);
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

describe('parseCommand /initiative', () => {
	it('parses none / character / foe', () => {
		expect(parseCommand('/initiative none')).toEqual({ kind: 'initiative', who: 'none' });
		expect(parseCommand('/initiative character')).toEqual({
			kind: 'initiative',
			who: 'character',
		});
		expect(parseCommand('/initiative foe')).toEqual({ kind: 'initiative', who: 'foe' });
	});
	it('is case-insensitive', () => {
		expect(parseCommand('/initiative FOE')).toEqual({ kind: 'initiative', who: 'foe' });
		expect(parseCommand('/INITIATIVE Character')).toEqual({
			kind: 'initiative',
			who: 'character',
		});
	});
	it('errors on missing value', () => {
		const c = parseCommand('/initiative');
		expect(c?.kind).toBe('error');
	});
	it('errors on unknown value — no numeric aliases', () => {
		const c = parseCommand('/initiative 1');
		expect(c?.kind).toBe('error');
		if (c?.kind === 'error') expect(c.message).toMatch(/none \/ character \/ foe/);
	});
	it('errors on aliases we do not accept', () => {
		expect(parseCommand('/initiative char')?.kind).toBe('error');
		expect(parseCommand('/initiative me')?.kind).toBe('error');
		expect(parseCommand('/initiative you')?.kind).toBe('error');
	});
	it('errors on extra tokens', () => {
		const c = parseCommand('/initiative foe now');
		expect(c?.kind).toBe('error');
	});
});

describe('initiativeToNumber', () => {
	it('maps to the on-disk enum', () => {
		expect(initiativeToNumber('none')).toBe(0);
		expect(initiativeToNumber('character')).toBe(1);
		expect(initiativeToNumber('foe')).toBe(2);
	});
});

describe('parseCommand /roll', () => {
	it('parses a single group', () => {
		expect(parseCommand('/roll 2d10')).toEqual({
			kind: 'roll',
			groups: [{ n: 2, sides: 10, modifier: 0, raw: '2d10' }],
		});
	});
	it('implicit n=1 (d100 = 1d100)', () => {
		expect(parseCommand('/roll d100')).toEqual({
			kind: 'roll',
			groups: [{ n: 1, sides: 100, modifier: 0, raw: 'd100' }],
		});
	});
	it('positive modifier', () => {
		expect(parseCommand('/roll 1d6+2')).toEqual({
			kind: 'roll',
			groups: [{ n: 1, sides: 6, modifier: 2, raw: '1d6+2' }],
		});
	});
	it('negative modifier', () => {
		expect(parseCommand('/roll 2d10-1')).toEqual({
			kind: 'roll',
			groups: [{ n: 2, sides: 10, modifier: -1, raw: '2d10-1' }],
		});
	});
	it('multiple groups — full action roll', () => {
		expect(parseCommand('/roll 2d10 1d6+2')).toEqual({
			kind: 'roll',
			groups: [
				{ n: 2, sides: 10, modifier: 0, raw: '2d10' },
				{ n: 1, sides: 6, modifier: 2, raw: '1d6+2' },
			],
		});
	});
	it('is case-insensitive on the D separator', () => {
		expect(parseCommand('/roll 2D10')).toEqual({
			kind: 'roll',
			groups: [{ n: 2, sides: 10, modifier: 0, raw: '2D10' }],
		});
	});
	it('errors on empty args', () => {
		const c = parseCommand('/roll');
		expect(c?.kind).toBe('error');
	});
	it('errors on unsupported sides (d7 not in dice library)', () => {
		const c = parseCommand('/roll 1d7');
		expect(c?.kind).toBe('error');
		if (c?.kind === 'error') expect(c.message).toMatch(/1d7/);
	});
	it('errors when n exceeds ROLL_MAX_N', () => {
		const c = parseCommand(`/roll ${ROLL_MAX_N + 1}d6`);
		expect(c?.kind).toBe('error');
	});
	it('errors when modifier exceeds ROLL_MAX_MODIFIER', () => {
		const c = parseCommand(`/roll 1d6+${ROLL_MAX_MODIFIER + 1}`);
		expect(c?.kind).toBe('error');
	});
	it('errors when more than ROLL_MAX_GROUPS groups are given', () => {
		const many = Array(ROLL_MAX_GROUPS + 1)
			.fill('1d6')
			.join(' ');
		const c = parseCommand(`/roll ${many}`);
		expect(c?.kind).toBe('error');
		if (c?.kind === 'error') expect(c.message).toMatch(/at most/);
	});
	it('errors on garbage in a group ("2xd10")', () => {
		const c = parseCommand('/roll 2xd10');
		expect(c?.kind).toBe('error');
	});
	it('rejects double-signed modifiers (1d6++2)', () => {
		const c = parseCommand('/roll 1d6++2');
		expect(c?.kind).toBe('error');
	});
	it('rejects a stray unit (1d)', () => {
		const c = parseCommand('/roll 1d');
		expect(c?.kind).toBe('error');
	});
});

describe('parseRollGroup helper', () => {
	it('produces the same shape as the parser', () => {
		expect(parseRollGroup('3d20')).toEqual({ n: 3, sides: 20, modifier: 0, raw: '3d20' });
	});
	it('returns null on malformed input', () => {
		expect(parseRollGroup('abc')).toBeNull();
		expect(parseRollGroup('1d6-')).toBeNull();
		expect(parseRollGroup('')).toBeNull();
	});
	it('rejects side counts outside the supported set', () => {
		expect(parseRollGroup('1d13')).toBeNull();
		expect(parseRollGroup('1d1')).toBeNull();
		for (const s of ROLL_DIE_SIDES) {
			expect(parseRollGroup(`1d${s}`)).not.toBeNull();
		}
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
