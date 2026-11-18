import { describe, it, expect } from 'vitest';
import { parseCommand, parseAmount } from '../../src/lib/commands/parse.js';
import { plan, ownerRef, type World } from '../../src/lib/commands/resolve.js';
import type { Catalogue, CharacterOwner } from '../../src/lib/commands/values.js';
import type {
	AssetDefinition,
	CharacterData,
	Expedition,
	FoeEncounter,
} from '../../src/lib/types.js';
import type { ResolvedField } from '../../src/lib/characterFieldsCore.js';

// ---------------------------------------------------------------------------
// A world, by hand
// ---------------------------------------------------------------------------

const RANKS: Record<number, { label: string; tpm: number; harm: number }> = {
	1: { label: 'Troublesome', tpm: 12, harm: 1 },
	2: { label: 'Dangerous', tpm: 8, harm: 2 },
	3: { label: 'Formidable', tpm: 4, harm: 3 },
};

const hawk: AssetDefinition = {
	id: 'companion/hawk',
	name: 'Hawk',
	category: 'Companion',
	abilities: [],
	customFields: [
		{ id: 'companion-name', type: 'string', label: 'Companion Name' },
		{ id: 'health', type: 'counter', label: 'Health', maxValue: 3, default: 3 },
	],
} as unknown as AssetDefinition;
const raven = { ...hawk, id: 'companion/raven', name: 'Raven' } as AssetDefinition;
const ritual = {
	id: 'ritual/scry',
	name: 'Scry',
	category: 'Ritual',
	abilities: [],
	customFields: [{ id: 'mana', type: 'counter', label: 'Mana', maxValue: 10, global: true }],
} as unknown as AssetDefinition;
const ASSETS = [hawk, raven, ritual];

const field = (f: Partial<ResolvedField> & { id: string; type: ResolvedField['type'] }) =>
	({
		label: f.id.charAt(0).toUpperCase() + f.id.slice(1),
		default: '',
		source: 'x',
		options: [],
		...f,
	}) as ResolvedField;
const opts = (...labels: string[]) => labels.map((l) => ({ id: l.toLowerCase(), label: l }));

const cat: Catalogue = {
	fields: [
		field({
			id: 'touched',
			type: 'dropdown',
			options: opts('Pure', 'Prime', 'Second'),
			default: 'pure',
			writable: false,
		}),
		field({ id: 'oath', type: 'dropdown', options: opts('Iron', 'Silver') }),
		field({ id: 'home', type: 'dropdown', options: opts('Hearth', 'Road'), custom: true }),
		field({ id: 'banner', type: 'string', scope: 'party' }),
		field({ id: 'renown', type: 'counter', maxValue: 5, default: '0' }),
		field({ id: 'blessed', type: 'switch', default: '0' }),
	],
	globals: [
		{ id: 'mana', label: 'Mana', type: 'counter', maxValue: 10, default: '0', scope: 'global' },
	],
	findAsset: (id) => ASSETS.find((a) => a.id === id),
	assets: ASSETS,
	foe: (enc) => {
		const r = RANKS[enc.effectiveRank]!;
		return { name: enc.customName, rank: r.label, ticksPerMark: r.tpm, harm: r.harm };
	},
};

function character(id: string, name: string, over: Partial<CharacterData> = {}): CharacterOwner {
	const data = {
		name,
		momentum: 2,
		health: 4,
		spirit: 3,
		supply: 3,
		xp: 10,
		edge: 1,
		heart: 2,
		iron: 3,
		shadow: 1,
		wits: 2,
		bonds: 5,
		failures: 0,
		wounded: false,
		shaken: false,
		unprepared: false,
		encumbered: false,
		maimed: false,
		corrupted: false,
		cursed: false,
		tormented: false,
		initiative: 0,
		fields: { touched: 'prime' },
		globalValues: { mana: '3' },
		vows: [],
		assets: [],
		...over,
	} as unknown as CharacterData;
	return { kind: 'character', id, name, data };
}

const foe = (id: string, name: string, rank: 1 | 2 | 3, ticks = 0): World['foes'][number] => ({
	kind: 'foe',
	id,
	name,
	enc: {
		id,
		foeId: 'x',
		quantity: 'solo',
		effectiveRank: rank,
		ticks,
		notes: '',
		customName: name,
		vanquished: false,
	} as FoeEncounter,
});

const exp = (id: string, type: 'journey' | 'site' | 'scene', name: string, extra = {}) => {
	const e = {
		id,
		type,
		name,
		difficulty: 'formidable',
		ticks: 0,
		complete: false,
		notes: '',
		countdownFilled: 0,
		theme: '',
		domain: '',
		...extra,
	} as unknown as Expedition;
	return { kind: type, id, name, exp: e } as World['expeditions'][number];
};

function world(over: Partial<World> = {}): World {
	const bjorn = character('c1', 'Bjorn', {
		vows: [
			{
				id: 'v1',
				name: 'Avenge Bjorn',
				difficulty: 'dangerous',
				ticks: 8,
				threat: '',
				menace: 2,
				status: 'active',
			},
		],
		assets: [
			{
				assetId: 'companion/hawk',
				abilities: [true, false, false],
				customValues: { 'companion-name': 'Ash', health: '2' },
			},
		],
	});
	return {
		characters: [bjorn, character('c2', 'Edda'), character('c3', 'Wolf')],
		foes: [
			foe('f1', 'Wolf', 2, 10),
			foe('f2', 'Raider', 1),
			foe('f3', 'Raider', 1),
			foe('f4', 'Barrow', 3),
		],
		expeditions: [
			exp('e1', 'journey', 'The Long Road'),
			exp('e2', 'site', 'Barrow'),
			exp('e3', 'scene', 'Duel at Dawn'),
		],
		activeCharacterId: 'c1',
		activeFoeId: 'f1',
		activeExpeditionId: 'e3',
		cat,
		moves: [
			{ id: 'move/face-danger', name: 'Face Danger', category: 'Adventure', blocked: null },
			{ id: 'move/endure-harm', name: 'Endure Harm', category: 'Suffer', blocked: null },
			{
				id: 'move/strike',
				name: 'Strike',
				category: 'Combat',
				blocked: 'Requires character initiative',
			},
		],
		oracles: [{ key: 'region', title: 'Region' }],
		...over,
	};
}

/** The plan's summary, message or text, whichever it has. */
function says(input: string, w = world()): string {
	const p = plan(input, w);
	if ('summary' in p) return p.summary;
	if ('message' in p) return p.message;
	if ('text' in p) return p.text;
	return p.kind;
}

// ---------------------------------------------------------------------------

describe('parseCommand', () => {
	it('takes spaces anywhere but inside names', () => {
		for (const s of ['/momentum+=2', '/momentum += 2', '/ momentum += 2']) {
			const p = parseCommand(s);
			expect(p).toMatchObject({
				kind: 'value',
				value: { text: 'momentum' },
				op: '+=',
				operand: '2',
			});
		}
	});

	it('finds where names end from the dot and the operator', () => {
		expect(parseCommand('/Avenge Bjorn.progress++')).toMatchObject({
			owner: { text: 'Avenge Bjorn' },
			value: { text: 'progress' },
			op: '++',
		});
		expect(parseCommand('/companion/hawk.health--')).toMatchObject({
			owner: { text: 'companion/hawk' },
			value: { text: 'health' },
			op: '--',
		});
		expect(parseCommand('/"Wolf.Bane".progress++')).toMatchObject({
			owner: { text: 'Wolf.Bane', quoted: true },
		});
		expect(parseCommand('/foe:Raider#2.progress++')).toMatchObject({
			owner: { text: 'Raider', qualifier: 'foe', index: 2 },
		});
	});

	it('takes the rest of the line after =, quotes optional', () => {
		expect(parseCommand('/hawk.companion-name="Ash"')).toMatchObject({ op: '=', operand: 'Ash' });
		expect(parseCommand('/journey=The Long Road')).toMatchObject({ operand: 'The Long Road' });
		expect(parseCommand('/xp=-2')).toMatchObject({ op: '=', operand: '-2' });
	});

	it('reads ! after a value as flip, and a lone + as an operator half typed', () => {
		expect(parseCommand('/wounded!')).toMatchObject({ op: '!' });
		expect(parseCommand('/health+')).toMatchObject({ partialOp: '+', op: undefined });
	});

	it('reads verbs, notes, and refuses what can’t be a command', () => {
		expect(parseCommand('/move endure harm 2')).toMatchObject({
			kind: 'verb',
			verb: 'move',
			arg: 'endure harm 2',
		});
		expect(parseCommand('Bjorn reaches the hall')).toEqual({
			kind: 'note',
			text: 'Bjorn reaches the hall',
		});
		expect(parseCommand('/a.b.c').kind).toBe('error');
		expect(parseCommand('/health++ 2')).toMatchObject({
			kind: 'error',
			message: '++ takes nothing after it.',
		});
	});

	it('reads amounts with units and harm', () => {
		expect(parseAmount('2')).toEqual({ kind: 'number', n: 2, unit: undefined });
		expect(parseAmount('4b')).toEqual({ kind: 'number', n: 4, unit: 'b' });
		expect(parseAmount('3t')).toEqual({ kind: 'number', n: 3, unit: 't' });
		expect(parseAmount('harm')).toEqual({ kind: 'harm' });
		expect(parseAmount('-2').kind).toBe('bad');
		expect(parseAmount('-2', true)).toEqual({ kind: 'number', n: -2, unit: undefined });
	});
});

describe('numbers', () => {
	it('adds and takes away, held to the range, with the sheet’s log line', () => {
		const p = plan('/momentum+=2', world());
		expect(p).toMatchObject({ kind: 'change', from: 2, to: 4, summary: 'Momentum 2 → 4' });
		expect(p.kind === 'change' && p.line).toBe('<div>Momentum: 2 → <strong>4</strong> (+2)</div>');
		const h = plan('/health+=2', world());
		expect(h).toMatchObject({ to: 5, summary: 'Health 4 → 5 (max 5)', title: 'Bjorn — Health' });
		expect(h.kind === 'change' && h.line).toContain('(+2, max 5)');
	});

	it('sets with =, saying where the range cut it', () => {
		const p = plan('/momentum=-20', world());
		expect(p).toMatchObject({ to: -6, summary: 'Momentum 2 → −6 (min −6)' });
		expect(p.kind === 'change' && p.line).toContain('(= −20, min −6)');
		expect(says('/xp=12')).toBe('Experience 10 → 12');
		expect(plan('/health=4', world())).toMatchObject({
			nothing: true,
			summary: 'Health: already 4',
		});
	});

	it('takes the active foe’s harm', () => {
		expect(says('/health-=harm')).toBe('Health 4 → 2 (Wolf’s harm)');
		expect(says('/health-=harm', world({ activeFoeId: null }))).toBe('No foe to take harm from.');
	});

	it('refuses a unit, a flip, and a read-only value', () => {
		expect(says('/health-=2b')).toBe('Health takes no unit.');
		expect(says('/mana!')).toBe("Mana isn't true/false.");
		expect(says('/vowCount=3')).toBe('Vows is read-only.');
	});

	it('shows a value named alone', () => {
		expect(says('/mana')).toBe('Mana 3/10');
		expect(says('/health')).toBe('Health 4/5');
		expect(plan('/health', world()).kind).toBe('show');
	});

	it('holds a content pack counter to its declared max', () => {
		expect(says('/renown+=9')).toBe('Renown 0 → 5 (max 5)');
		expect(says('/mana+=9')).toBe('Mana 3 → 10 (max 10)');
	});
});

describe('true/false, lists and text', () => {
	it('sets with ++ and --, flips with !, and says when it’s already so', () => {
		const w = world();
		expect(says('/wounded++', w)).toBe('Wounded: Cleared → Marked');
		expect(says('/wounded--', w)).toBe('Wounded: already Cleared');
		expect(says('/wounded!', w)).toBe('Wounded: Cleared → Marked');
		expect(says('/wounded=3', w)).toBe('Wounded: Cleared → Marked');
		expect(says('/blessed++', w)).toBe('Blessed: Off → On');
		expect(says('/wounded+=1', w)).toBe('Wounded is true/false: use ++, -- or !.');
	});

	it('sets a list by an option’s id or label, refusing one that isn’t there', () => {
		expect(says('/initiative=foe')).toBe('Initiative: None → Foe');
		expect(says('/initiative=FOE')).toBe('Initiative: None → Foe');
		expect(says('/initiative++')).toBe(
			'Initiative is a list: set it with =, e.g. /initiative=none.',
		);
		expect(says('/oath=Gold')).toBe('Oath has no option "Gold": Iron, Silver');
		expect(says('/touched=third')).toBe('Touched is read-only.');
		expect(says('/touched')).toBe('Touched: Prime');
	});

	it('keeps typed text in a list that allows its own values', () => {
		const p = plan('/home=Mountain hut', world());
		expect(p).toMatchObject({
			kind: 'change',
			to: 'Mountain hut',
			summary: 'Home: — → Mountain hut',
		});
	});

	it('sets text, and a party value takes no owner', () => {
		expect(says('/banner="Red Stag"')).toBe('Banner: — → Red Stag');
		expect(says('/Bjorn.supply++')).toBe("Supply is the party's: /supply++");
		expect(plan('/supply--', world())).toMatchObject({ kind: 'change', to: 2 });
	});
});

describe('tracks', () => {
	it('counts a plain number as marks by rank, b as boxes, t as ticks', () => {
		// Wolf is Dangerous: 8 ticks a mark. It has 10 ticks.
		expect(says('/foe.progress+=2')).toBe('Wolf: Progress 2 boxes, 2 ticks → 6 boxes, 2 ticks');
		expect(says('/foe.progress=4b')).toBe('Wolf: Progress 2 boxes, 2 ticks → 4 boxes');
		expect(says('/foe.progress+=3t')).toBe('Wolf: Progress 2 boxes, 2 ticks → 3 boxes, 1 tick');
		expect(says('/foe.progress++')).toBe('Wolf: Progress 2 boxes, 2 ticks → 4 boxes, 2 ticks');
		const p = plan('/foe.progress+=2', world());
		expect(p.kind === 'change' && p.line).toContain('(+2 marks)');
	});

	it('counts ticks on a track with no rank (bonds)', () => {
		expect(says('/bonds++')).toBe('Bonds 1 box, 1 tick → 1 box, 2 ticks');
		expect(says('/bonds+=2b')).toBe('Bonds 1 box, 1 tick → 3 boxes, 1 tick');
	});

	it('stops at a full track', () => {
		expect(says('/foe.progress+=9')).toBe(
			'Wolf: Progress 2 boxes, 2 ticks → 10 boxes (max 10 boxes)',
		);
	});
});

describe('owners and names', () => {
	it('reaches the active foe, expedition or character through a keyword', () => {
		expect(says('/scene.countdown++')).toBe('Duel at Dawn: Countdown 0 → 1');
		expect(says('/journey.progress++')).toBe(
			'No active journey: the active expedition is the scene Duel at Dawn.',
		);
		expect(says('/character.health--')).toBe('Health 4 → 3');
		expect(says('/foe.vanquished++')).toBe('Wolf: Vanquished: No → Yes');
	});

	it('counts only things that have the value when names collide', () => {
		// A character and a foe are both called Wolf.
		expect(says('/Wolf.health--')).toBe('Wolf: Health 4 → 3');
		expect(says('/Wolf.progress++')).toBe('Wolf: Progress 2 boxes, 2 ticks → 4 boxes, 2 ticks');
		// Only the site called Barrow has a theme.
		expect(says('/Barrow.theme=haunted')).toBe('Barrow: Theme: — → Haunted');
	});

	it('refuses what’s still ambiguous, saying how to name each', () => {
		expect(says('/Barrow.progress++')).toBe(
			'Barrow is a foe and a site: /foe:Barrow.progress, /site:Barrow.progress',
		);
		expect(says('/Raider.progress++')).toBe(
			'There are 2 foes called Raider: /foe:Raider#1.progress, /foe:Raider#2.progress',
		);
		expect(says('/foe:Barrow.progress++')).toBe('Barrow: Progress 0 boxes → 1 box');
		const second = plan('/foe:Raider#2.progress++', world());
		expect(second.kind === 'change' && second.owner.id).toBe('f3');
	});

	it('writes the shortest reference that names exactly one thing', () => {
		const w = world();
		expect(ownerRef(w.foes[0]!, w, 'progress')).toBe('Wolf');
		expect(ownerRef(w.foes[3]!, w, 'progress')).toBe('foe:Barrow');
		expect(ownerRef(w.foes[2]!, w, 'progress')).toBe('foe:Raider#2');
	});

	it('reaches assets by name, id or the name given them, and vows by name', () => {
		for (const s of ['/hawk.health--', '/Ash.health--', '/companion/hawk.health--'])
			expect(says(s)).toBe('Ash: Health 2 → 1');
		expect(says('/Ash.companion-name="Ash Wing"')).toBe('Ash: Companion Name: Ash → Ash Wing');
		expect(says('/Avenge Bjorn.menace++')).toBe('Avenge Bjorn: Menace 2 → 3');
		expect(says('/Avenge Bjorn.status=fulfilled')).toBe('Avenge Bjorn: Status: Active → Fulfilled');
		expect(says('/raven.health--')).toBe('Bjorn has no Raven.');
	});

	it('suggests a name for a slip, and asks which vow', () => {
		expect(says('/Wlof.progress++')).toBe('Unknown name "Wlof". Did you mean Wolf?');
		expect(says('/vow.menace++')).toBe('Which vow? Name it: /Avenge Bjorn.menace++');
		const bound = world({ bound: { vowId: 'v1' } });
		expect(says('/vow.menace++', bound)).toBe('Avenge Bjorn: Menace 2 → 3');
	});

	it('shows what a name names, and says how to change it', () => {
		expect(says('/Edda')).toBe('Edda: Health 4/5 · Spirit 3/5 · Momentum 2 · Supply 3/5');
		expect(says('/foe')).toBe('Wolf (Dangerous foe): 2 boxes, 2 ticks');
		expect(says('/Edda++')).toBe(
			'Edda is a character: change one of its values, e.g. /Edda.momentum++, or make it active: /character=Edda.',
		);
	});
});

describe('making something active', () => {
	it('chooses by name within the kind', () => {
		expect(plan('/foe=raider#2', world())).toMatchObject({ kind: 'select', owner: { id: 'f3' } });
		expect(says('/foe=Raider')).toBe(
			'There are 2 foes called Raider: /foe=Raider#1, /foe=Raider#2',
		);
		expect(says('/character=Edda')).toBe('Edda becomes the active character');
		expect(says('/journey=Barrow')).toBe('Barrow is a site: /site=Barrow');
		expect(says('/site=Barrow')).toBe('Barrow becomes the active site');
		expect(says('/foe=Wolf')).toBe('Wolf is already the active foe.');
	});
});

describe('verbs', () => {
	it('opens a move by name or a start of one, with an amount', () => {
		expect(plan('/move endure harm 2', world())).toMatchObject({
			kind: 'move',
			move: { id: 'move/endure-harm' },
			amount: 2,
		});
		expect(says('/move face')).toBe('Opens Face Danger');
		expect(says('/move strike')).toBe('Strike: Requires character initiative');
	});

	it('opens an oracle, rolls dice, and marks story sections', () => {
		expect(says('/oracle region')).toBe('Opens Region');
		expect(plan('/roll 2d10 1d6+2', world())).toMatchObject({
			kind: 'roll',
			groups: [{ n: 2 }, { modifier: 2 }],
		});
		expect(plan('/story start', world())).toMatchObject({ kind: 'story', action: 'start' });
		expect(says('/story later')).toBe('/story takes start, end or write, not "later".');
	});

	it('says what’s missing from a command still being typed', () => {
		expect(plan('/health+', world()).kind).toBe('incomplete');
		expect(plan('/hawk.', world()).kind).toBe('incomplete');
		expect(plan('/move', world()).kind).toBe('incomplete');
		expect(plan('/health+=', world()).kind).toBe('incomplete');
	});
});

// ---------------------------------------------------------------------------
// Typeahead
// ---------------------------------------------------------------------------

import { suggest, ghostText } from '../../src/lib/commands/suggest.js';

const rowsOf = (input: string, w = world()) => suggest(input, w).rows;
const labels = (input: string, w = world()) => rowsOf(input, w).map((r) => r.label);

describe('typeahead', () => {
	it('starts with everything that can start a command, narrowed as it’s typed', () => {
		const all = labels('/');
		for (const l of ['foe', 'health', 'move', 'Wolf', 'Avenge Bjorn', 'Ash'])
			expect(all).toContain(l);
		const he = rowsOf('/he');
		expect(he.slice(0, 3).map((r) => r.label)).toEqual(['health', 'heart', 'help']);
		expect(he[0]).toMatchObject({ detail: 'Health — 4/5', apply: '/health' });
		expect(ghostText('/he', he[0])).toBe('alth');
	});

	it('offers the active foe’s and expedition’s values through their keyword', () => {
		const pro = rowsOf('/pro');
		expect(pro.map((r) => r.apply)).toEqual(['/foe.progress', '/scene.progress']);
		expect(pro[0]!.detail).toBe('Wolf — Progress 2 boxes, 2 ticks');
		expect(labels('/foe.progress')[0]).toBe('++');
		expect(rowsOf('/foe.progress')[0]!.detail).toBe('Progress 2 boxes, 2 ticks → 4 boxes, 2 ticks');
	});

	it('offers an owner with its dot, written so it names one thing', () => {
		expect(rowsOf('/As').find((r) => r.label === 'Ash')).toMatchObject({
			detail: 'Hawk (companion)',
			apply: '/Ash.',
		});
		expect(rowsOf('/Raid').map((r) => r.apply)).toEqual(['/foe:Raider#1.', '/foe:Raider#2.']);
		expect(labels('/hawk.')).toEqual(['companion-name', 'health']);
	});

	it('offers the operators that fit, each with its result', () => {
		// With a foe active, health's first operator takes its harm.
		const ops = rowsOf('/health');
		expect(ops.map((r) => r.label)).toEqual(['-=harm', '++', '--', '+=', '-=', '=']);
		expect(ops[0]).toMatchObject({
			detail: 'Health 4 → 2 (Wolf’s harm)',
			apply: '/health-=harm',
		});
		expect(ops[1]).toMatchObject({ detail: 'Health 4 → 5', apply: '/health++' });
		expect(labels('/health', world({ activeFoeId: null }))[0]).toBe('++');
		expect(labels('/momentum')).toEqual(['++', '--', '+=', '-=', '=']);
		expect(labels('/health+')).toEqual(['++', '+=']);
		expect(labels('/wounded')).toEqual(['++', '--', '!']);
		expect(rowsOf('/vowCount')).toMatchObject([{ label: '(show)', icon: 'lock' }]);
	});

	it('lists a list’s options, ticking the current one, and takes typed text where allowed', () => {
		const opts = rowsOf('/initiative=');
		expect(opts.map((r) => [r.label, !!r.current])).toEqual([
			['None', true],
			['Character', false],
			['Foe', false],
		]);
		expect(rowsOf('/home=Mou').at(-1)).toMatchObject({ label: 'Use “Mou”', apply: '/home=Mou' });
	});

	it('gives a track’s units with what each comes to', () => {
		const units = rowsOf('/foe.progress+=2');
		expect(units.map((r) => r.apply)).toEqual([
			'/foe.progress+=2',
			'/foe.progress+=2b',
			'/foe.progress+=2t',
		]);
		expect(units[1]!.detail).toBe('boxes: 2 boxes, 2 ticks → 4 boxes, 2 ticks');
	});

	it('lists the foes after /foe=, the active one ticked, twins numbered', () => {
		expect(rowsOf('/foe=').map((r) => [r.apply, !!r.current])).toEqual([
			['/foe=Wolf', true],
			['/foe=Raider#1', false],
			['/foe=Raider#2', false],
			['/foe=Barrow', false],
		]);
	});

	it('greys a move that can’t be made, saying why', () => {
		const strike = rowsOf('/move st').find((r) => r.label === 'Strike');
		expect(strike?.disabled).toBe('Requires character initiative');
	});

	it('says in its top row what Enter does', () => {
		expect(suggest('/health-=2', world()).top).toEqual({ text: 'Enter: Health 4 → 2', tone: 'ok' });
		expect(suggest('/mana!', world()).top.tone).toBe('error');
		expect(suggest('/health+', world()).top).toEqual({
			text: 'Needs an operator: ++ -- += -= = !',
			tone: 'incomplete',
		});
		expect(suggest('/foe=Raider#2', world()).top.text).toBe('Enter: Raider becomes the active foe');
	});
});

// ---------------------------------------------------------------------------
// The linter's table of built-in values
// ---------------------------------------------------------------------------

import { BUILTIN_VALUES } from '@ironledger/shared';
import { valuesOf } from '../../src/lib/commands/values.js';
import { vowOwners } from '../../src/lib/commands/resolve.js';

describe('BUILTIN_VALUES, which the content linter checks links against', () => {
	it('holds the keys the value registry builds, owner by owner', () => {
		const bare: Catalogue = { ...cat, fields: [], globals: [] };
		const w = world({ cat: bare });
		const keys = (o: Parameters<typeof valuesOf>[0]) =>
			valuesOf(o, bare)
				.map((v) => v.key)
				.sort();
		const table = (k: keyof typeof BUILTIN_VALUES) => Object.keys(BUILTIN_VALUES[k]).sort();
		expect(keys(w.characters[0]!)).toEqual(table('character'));
		expect(keys(w.foes[0]!)).toEqual(table('foe'));
		expect(keys(w.expeditions[0]!)).toEqual(table('journey'));
		expect(keys(w.expeditions[1]!)).toEqual(table('site'));
		expect(keys(w.expeditions[2]!)).toEqual(table('scene'));
		expect(keys(vowOwners(w.characters[0]!)[0]!)).toEqual(table('vow'));
	});
});
