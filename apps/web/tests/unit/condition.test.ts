import { describe, it, expect } from 'vitest';
import {
	parseCondition,
	conditionTests,
	evaluateCondition,
	levelValue,
	type CondNode,
	type Reading,
	type TestNode,
} from '@ironledger/shared';

/** Parse, or fail the test with the parser's message. */
function parse(src: string): CondNode {
	const r = parseCondition(src);
	if (!r.ok) throw new Error(`${r.error} at ${r.at}`);
	return r.node;
}

/** Render a parse tree back as fully bracketed text, to check grouping. */
function show(n: CondNode): string {
	switch (n.type) {
		case 'or':
			return `(${n.items.map(show).join(' | ')})`;
		case 'and':
			return `(${n.items.map(show).join(' & ')})`;
		case 'not':
			return `!${show(n.item)}`;
		case 'test': {
			const name = n.owner ? `${n.owner}.${n.name}` : n.name;
			if (!n.op || !n.level) return name;
			const lv = n.level.kind === 'word' ? n.level.word : `${n.level.n}${n.level.unit}`;
			return `[${name} ${n.op} ${lv}]`;
		}
	}
}

describe('parseCondition', () => {
	it('reads the conditions content uses', () => {
		expect(show(parse('character'))).toBe('character');
		expect(show(parse('!foe'))).toBe('!foe');
		expect(show(parse('initiative == me'))).toBe('[initiative == me]');
		expect(show(parse('touched >= prime'))).toBe('[touched >= prime]');
		expect(show(parse('bonds >= 2b'))).toBe('[bonds >= 2b]');
		expect(show(parse('companion/hawk | companion/raven'))).toBe(
			'(companion/hawk | companion/raven)',
		);
		expect(show(parse('self.health >= 1'))).toBe('[self.health >= 1]');
		expect(show(parse('companion/hawk.companion-name'))).toBe('companion/hawk.companion-name');
	});

	it('binds comparisons, then !, then &, then |', () => {
		expect(show(parse('!wounded & mana >= 2 | self.health >= 1'))).toBe(
			'((!wounded & [mana >= 2]) | [self.health >= 1])',
		);
		expect(show(parse('!touched >= prime'))).toBe('![touched >= prime]');
		expect(show(parse('a & (b | c)'))).toBe('(a & (b | c))');
		expect(show(parse('!!foe'))).toBe('!!foe');
	});

	it('takes spaces anywhere outside names, and negative numbers and units', () => {
		expect(show(parse('character&foe&initiative==me'))).toBe(
			'(character & foe & [initiative == me])',
		);
		expect(show(parse('momentum>=-2'))).toBe('[momentum >= -2]');
		expect(show(parse('foe.progress < 3t'))).toBe('[foe.progress < 3t]');
	});

	it('says what is wrong and where', () => {
		expect(parseCondition('')).toMatchObject({ ok: false, error: 'Empty condition' });
		expect(parseCondition('character &')).toMatchObject({
			ok: false,
			error: 'Expected a name',
			at: 11,
		});
		expect(parseCondition('(foe | site')).toMatchObject({
			ok: false,
			error: 'Expected ")"',
			at: 11,
		});
		expect(parseCondition('bonds >= 2boxes')).toMatchObject({
			ok: false,
			error: 'Unexpected "boxes"',
			at: 10,
		});
		expect(parseCondition('health >= ')).toMatchObject({ ok: false, at: 10 });
		expect(parseCondition('health # 2')).toMatchObject({
			ok: false,
			error: 'Unexpected "#"',
			at: 7,
		});
		expect(parseCondition('foe.')).toMatchObject({
			ok: false,
			error: 'Expected a value after "."',
		});
	});

	it('lists every test, for the content checker', () => {
		const tests = conditionTests(parse('character & !(foe | site) & touched >= prime'));
		expect(tests.map((t) => t.name)).toEqual(['character', 'foe', 'site', 'touched']);
		expect(tests.map((t) => t.at)).toEqual([0, 14, 20, 28]);
	});
});

describe('levelValue', () => {
	const track = (ticksPerMark?: number): Reading => ({ kind: 'track', value: 0, ticksPerMark });
	const list: Reading = {
		kind: 'list',
		value: 1,
		option: (w) => ['pure', 'prime', 'second'].indexOf(w),
	};

	it('counts a plain number on a track in marks by rank, ticks with none', () => {
		expect(levelValue({ kind: 'number', n: 2, unit: '' }, track(8))).toBe(16);
		expect(levelValue({ kind: 'number', n: 2, unit: '' }, track())).toBe(2);
		expect(levelValue({ kind: 'number', n: 2, unit: 'b' }, track(8))).toBe(8);
		expect(levelValue({ kind: 'number', n: 3, unit: 't' }, track(8))).toBe(3);
	});

	it('refuses a unit off a track, a number on a list, and an unknown option', () => {
		expect(
			levelValue({ kind: 'number', n: 2, unit: 'b' }, { kind: 'number', value: 0 }),
		).toBeNull();
		expect(levelValue({ kind: 'number', n: 1, unit: '' }, list)).toBeNull();
		expect(levelValue({ kind: 'word', word: 'feral' }, list)).toBeNull();
		expect(levelValue({ kind: 'word', word: 'second' }, list)).toBe(2);
		expect(levelValue({ kind: 'word', word: 'prime' }, { kind: 'number', value: 0 })).toBeNull();
	});
});

describe('evaluateCondition', () => {
	const state: Record<string, Reading> = {
		character: { kind: 'exists', value: 1 },
		foe: { kind: 'exists', value: 0 },
		wounded: { kind: 'bool', value: 1 },
		mana: { kind: 'number', value: 3 },
		touched: { kind: 'list', value: 1, option: (w) => ['pure', 'prime', 'second'].indexOf(w) },
		origin: { kind: 'list', value: -1, option: () => -1 },
		bonds: { kind: 'track', value: 9, ticksPerMark: 1 },
	};
	const read = (t: TestNode) => state[t.name] ?? { kind: 'exists', value: 0 };
	const holds = (src: string) => evaluateCondition(parse(src), read);

	it('reads names on their own as above 0, chosen, or existing', () => {
		expect(holds('character')).toBe(true);
		expect(holds('foe')).toBe(false);
		expect(holds('!foe')).toBe(true);
		expect(holds('wounded')).toBe(true);
		expect(holds('touched')).toBe(true);
		expect(holds('origin')).toBe(false);
	});

	it('compares numbers, options and tracks', () => {
		expect(holds('mana >= 2')).toBe(true);
		expect(holds('mana > 3')).toBe(false);
		expect(holds('mana != 3')).toBe(false);
		expect(holds('touched >= prime')).toBe(true);
		expect(holds('touched == second')).toBe(false);
		expect(holds('bonds >= 2b')).toBe(true);
		expect(holds('bonds >= 3b')).toBe(false);
	});

	it('combines with & | ! and groups', () => {
		expect(holds('character & !foe & mana >= 2')).toBe(true);
		expect(holds('foe | mana >= 3')).toBe(true);
		expect(holds('!(foe | wounded)')).toBe(false);
		expect(holds('!wounded & mana >= 2 | touched >= prime')).toBe(true);
	});

	it('fails a comparison whose level does not fit', () => {
		expect(holds('touched >= feral')).toBe(false);
		expect(holds('mana >= 2b')).toBe(false);
	});
});
