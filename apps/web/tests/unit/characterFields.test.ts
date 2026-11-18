/**
 * Character fields from extensions (docs/character-fields.md): YRT's region
 * of origin, religion, touched level and animal, resolved against YRT's real
 * oracle files, and the load-time move of older characters' values into
 * `character.fields`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
	cleanFieldValues,
	counterValue,
	fieldHint,
	fieldNumber,
	fieldRequirement,
	fieldReading,
	fieldShown,
	fieldsMarkdown,
	fieldValue,
	matchOption,
	optionId,
	optionIndex,
	resolveField,
	rollField,
	valueLabel,
	type ResolvedField,
} from '../../src/lib/characterFieldsCore.js';
import { moveLegacyYrtFields, reconcileImportedCharacter } from '../../src/lib/character.js';
import type { OracleFile } from '../../src/lib/oracleStore.svelte.js';
import type { CharacterFieldDef } from '../../src/lib/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
const read = (rel: string) => JSON.parse(readFileSync(path.join(REPO, rel), 'utf-8'));
/** An extension's sheet fields: its party and character ones (its global
 *  fields, like YRT's mana, are its assets'). */
const declared = (ext: string) =>
	(read(`extensions/${ext}/extension.json`).fields as CharacterFieldDef[]).filter(
		(f) => f.scope !== 'global',
	);

// The core Region of origin, then YRT's three, against both region oracles.
const oracles: OracleFile[] = [
	read('apps/api/data/oracles/region.json'),
	...['region', 'religion', 'touched', 'animal'].map((n) =>
		read(`extensions/yrt/oracles/${n}.json`),
	),
];
/** YRT on: its supersession of the core Region oracle. */
const yrtOn = (k: string) => (k === 'region' ? 'yrtRegion' : k);
const fields = [
	...declared('base').map((d) => resolveField(d, 'base', oracles, yrtOn)),
	...declared('yrt').map((d) => resolveField(d, 'yrt', oracles, yrtOn)),
];
const byId = (id: string) => fields.find((f) => f.id === id);
const field = (id: string) => byId(id) as ResolvedField;
/** An rng that lands the d100 on `n`. */
const d100 = (n: number) => () => (n - 0.5) / 100;

describe('field declarations', () => {
	it('declares origin in the core rules, then religion, touched and animal in YRT', () => {
		expect(fields.map((f) => [f.source, f.id])).toEqual([
			['base', 'origin'],
			['yrt', 'religion'],
			['yrt', 'touched'],
			['yrt', 'touchedAnimal'],
		]);
	});

	it('lists the Ironlands for Region of origin without YRT', () => {
		const core = resolveField(declared('base')[0]!, 'base', oracles);
		expect(core.options.map((o) => o.label)).toContain('Barrier Islands');
		expect(core.options).toHaveLength(10);
		expect(
			rollField(
				core,
				{},
				oracles,
				() => undefined,
				undefined,
				() => 0,
			)?.value,
		).toBe('barrier-islands');
	});

	it("builds origin (YRT's regions, through the supersession) and religion options", () => {
		expect(field('origin').options).toHaveLength(25);
		expect(field('origin').options[0]).toMatchObject({ id: 'piscis', label: 'Piscis' });
		expect(field('origin').options.map((o) => o.id)).toContain('oray-hills');
		expect(field('religion').options.map((o) => o.id)).toEqual([
			'puritan',
			'optime',
			'wildens',
			'none-or-their-own',
		]);
	});

	it('reads the touched level as a position, Pure 0 to Feral 4, unset −1', () => {
		const t = field('touched');
		expect(optionIndex(t, 'pure')).toBe(0);
		expect(optionIndex(t, 'feral')).toBe(4);
		expect(optionIndex(field('origin'), '')).toBe(-1);
		expect(fieldValue(t, {})).toBe('pure');
		expect(fieldValue(t, { touched: 'second' })).toBe('second');
	});
});

describe('optionId', () => {
	it('lower-cases and dashes runs of other characters', () => {
		expect(optionId('Oray Hills')).toBe('oray-hills');
		expect(optionId('None, or their own')).toBe('none-or-their-own');
		expect(optionId('Mountain Lion / Puma')).toBe('mountain-lion-puma');
	});
});

describe('fieldShown', () => {
	it('hides Animal while Touched is Pure, and shows it from Prime', () => {
		const animal = field('touchedAnimal');
		expect(fieldShown(animal, {}, byId)).toBe(false);
		expect(fieldShown(animal, { touched: 'pure' }, byId)).toBe(false);
		expect(fieldShown(animal, { touched: 'prime' }, byId)).toBe(true);
		expect(fieldShown(field('religion'), {}, byId)).toBe(true);
	});
});

describe('matchOption and labels', () => {
	it('matches by id or label, ignoring case', () => {
		expect(matchOption(field('touched'), 'Second')).toBe('second');
		expect(matchOption(field('origin'), 'oray hills')).toBe('oray-hills');
		expect(matchOption(field('touched'), 'Mythic')).toBeNull();
		expect(valueLabel(field('religion'), 'none-or-their-own')).toBe('None, or their own');
		expect(valueLabel(field('origin'), 'atlantis')).toBe('atlantis');
	});

	it("shows the chosen religion's text as its hint, and nothing extra for a region", () => {
		expect(fieldHint(field('religion'), 'puritan')).toMatch(/^Puritan: Holds that humanity/);
		expect(fieldHint(field('origin'), 'piscis')).toBe(field('origin').tooltip);
	});
});

describe('rollField', () => {
	it('rolls the touched class from the row value', () => {
		expect(rollField(field('touched'), {}, oracles, byId, undefined, d100(3))).toMatchObject({
			value: 'pure',
			roll: 3,
		});
		expect(rollField(field('touched'), {}, oracles, byId, undefined, d100(70))?.value).toBe(
			'second',
		);
	});

	it('rolls a region, and an animal as text', () => {
		expect(rollField(field('origin'), {}, oracles, byId, yrtOn, d100(1))?.value).toBe('piscis');
		const animal = rollField(field('touchedAnimal'), {}, oracles, byId, undefined, d100(1));
		expect(animal?.value).toBeTruthy();
		expect(typeof animal?.value).toBe('string');
	});

	it("rolls religion on the origin country's column, and not without an origin", () => {
		expect(rollField(field('religion'), {}, oracles, byId)).toBeNull();
		// Buralia: Puritan 1, Optime 2, Wildens 3–95. Mons is in Buralia.
		expect(
			rollField(field('religion'), { origin: 'mons' }, oracles, byId, undefined, d100(50))?.value,
		).toBe('wildens');
		// Nysis: Puritan 1–86. Piscis is in Nysis.
		expect(
			rollField(field('religion'), { origin: 'piscis' }, oracles, byId, undefined, d100(50))?.value,
		).toBe('puritan');
	});

	it('follows a supersession through resolveKey', () => {
		const swapped = rollField(
			field('touchedAnimal'),
			{},
			oracles,
			byId,
			(k) => (k === 'yrtAnimal' ? 'yrtRegion' : k),
			d100(1),
		);
		expect(swapped?.value).toBe('Piscis');
	});
});

describe('fieldRequirement', () => {
	it('names the options a precondition needs', () => {
		const t = field('touched');
		expect(fieldRequirement(t, { min: 1 })).toBe('Requires Touched: Prime or higher');
		expect(fieldRequirement(t, { max: 3 })).toBe('Requires Touched: Third or lower');
		expect(fieldRequirement(t, { eq: 0 })).toBe('Requires Touched: Pure');
		expect(fieldRequirement(field('origin'), { min: 0 })).toBe('Requires Region of origin');
	});
});

describe('moveLegacyYrtFields', () => {
	it("takes the level and animal from the Touched asset, and drops the asset's copies", () => {
		const d: Record<string, unknown> = {
			background: '',
			assets: [
				{
					assetId: 'path/yrt-touched-lupine',
					customValues: { touchedLevel: 'third', animalName: 'Wolf' },
				},
			],
		};
		moveLegacyYrtFields(d);
		expect(d.fields).toEqual({ touched: 'third', touchedAnimal: 'Wolf' });
		expect((d.assets as Array<{ customValues: object }>)[0]!.customValues).toEqual({});
	});

	it('falls back to the old fields, then to what New Character wrote in the background', () => {
		const old: Record<string, unknown> = { touched: 'prime', touchedAnimal: 'Fox', assets: [] };
		moveLegacyYrtFields(old);
		expect(old.fields).toEqual({ touched: 'prime', touchedAnimal: 'Fox' });
		expect('touched' in old).toBe(false);

		const prose: Record<string, unknown> = {
			assets: [],
			background:
				'**Region of origin:** Oray Hills\n\n**Religion:** **None, or their own**: No faith at all…\n\n' +
				'Fanir is a **Second with 2** features of a Mountain Lion / Puma.\n- Claws\n- Eyes',
		};
		moveLegacyYrtFields(prose);
		expect(prose.fields).toEqual({
			origin: 'oray-hills',
			religion: 'none-or-their-own',
			touched: 'second',
			touchedAnimal: 'Mountain Lion / Puma',
		});
		// The region line goes (the field holds it); the rest stays.
		expect(prose.background).toMatch(/^\*\*Religion:\*\* \*\*None, or their own\*\*/);
		expect(prose.background).not.toContain('Region of origin');

		const pure: Record<string, unknown> = {
			assets: [],
			background: 'Ada is **Pure with no touched features**.',
		};
		moveLegacyYrtFields(pure);
		expect(pure.fields).toEqual({ touched: 'pure' });
	});

	it('drops a region line at the end of a background, with the gap before it', () => {
		const d: Record<string, unknown> = {
			fields: { origin: 'piscis' },
			assets: [],
			background: 'Grew up by the sea.\n\n**Region of origin:** Piscis',
		};
		moveLegacyYrtFields(d);
		expect(d.background).toBe('Grew up by the sea.');
		expect(d.fields).toEqual({ origin: 'piscis' });
	});

	it("keeps a field that's already set, and leaves a rewritten background alone", () => {
		const d: Record<string, unknown> = {
			fields: { touched: 'feral' },
			assets: [],
			background: 'Grew up by the sea. Is a **Second with 2** features of a cat.',
		};
		moveLegacyYrtFields(d);
		expect(d.fields).toEqual({ touched: 'feral', touchedAnimal: 'cat' });
		const blank: Record<string, unknown> = { assets: [], background: 'Grew up by the sea.' };
		moveLegacyYrtFields(blank);
		expect(blank.fields).toEqual({});
	});
});

describe('the asset field types', () => {
	const sampleOracles: OracleFile[] = [
		...oracles,
		read('extensions/sample/oracles/gizmo.json'),
		read('extensions/sample/oracles/prefix-suffix.json'),
	];
	const sample = declared('sample').map((d) => resolveField(d, 'sample', sampleOracles));
	const sf = (id: string) => sample.find((f) => f.id === id) as ResolvedField;
	const sampleById = (id: string) => sample.find((f) => f.id === id);

	it('the sample extension declares one of each, and a custom dropdown and a party field', () => {
		expect(sample.map((f) => f.type)).toEqual([
			'dropdown',
			'radio',
			'counter',
			'switch',
			'string',
			'dropdown',
			'string',
			'markdown',
		]);
		expect(sf('sampleHome').custom).toBe(true);
		expect(sf('sampleBanner').scope).toBe('party');
	});

	it('reads a custom dropdown’s typed value as chosen, with no place in the order', () => {
		const home = sf('sampleHome');
		expect(fieldReading(home, 'road')).toMatchObject({ kind: 'list', value: 1 });
		expect(fieldReading(home, 'Timbuktu')).toMatchObject({ kind: 'list', value: 3 });
		expect(fieldReading(home, '')).toMatchObject({ kind: 'list', value: -1 });
		const gated = { ...sf('sampleNotes'), if: 'sampleHome' };
		expect(fieldShown(gated, { sampleHome: 'Timbuktu' }, sampleById)).toBe(true);
		expect(fieldShown(gated, {}, sampleById)).toBe(false);
		// Shown as typed.
		expect(valueLabel(home, 'Timbuktu')).toBe('Timbuktu');
	});

	it("takes a dropdown's options from an oracle, and rolls on it", () => {
		const trinket = sf('sampleTrinket');
		expect(trinket.options.map((o) => o.label)).toEqual([
			'A humming widget',
			'A glowing sprocket',
			'A suspicious cog',
		]);
		expect(rollField(trinket, {}, sampleOracles, sampleById, undefined, d100(50))).toMatchObject({
			value: 'a-glowing-sprocket',
			display: 'A glowing sprocket',
		});
	});

	it("rolls a line of text from a part of the row's value", () => {
		const epithet = sf('sampleEpithet');
		expect(rollField(epithet, {}, sampleOracles, sampleById, undefined, d100(40))?.value).toBe(
			'Iron',
		);
	});

	it('hides Notes until Sworn is on', () => {
		const notes = sf('sampleNotes');
		expect(fieldShown(notes, {}, sampleById)).toBe(false);
		expect(fieldShown(notes, { sampleSworn: '1' }, sampleById)).toBe(true);
	});

	it('reads a counter as its count, held to 0..maxValue', () => {
		const resolve = sf('sampleResolve');
		expect(fieldNumber(resolve, fieldValue(resolve, {}))).toBe(2);
		expect(counterValue(resolve, '9')).toBe(5);
		expect(counterValue(resolve, '-1')).toBe(0);
		expect(counterValue(resolve, 'x')).toBe(0);
		expect(valueLabel(resolve, '4')).toBe('4');
		expect(fieldRequirement(resolve, { min: 3 })).toBe('Requires Resolve 3 or more');
	});

	it('reads a switch as 1 or 0', () => {
		const sworn = sf('sampleSworn');
		expect(fieldNumber(sworn, '1')).toBe(1);
		expect(fieldNumber(sworn, '0')).toBe(0);
		expect(valueLabel(sworn, '1')).toBe('on');
		expect(fieldRequirement(sworn, { eq: 1 })).toBe('Requires Sworn');
		expect(fieldRequirement(sworn, { eq: 0 })).toBe('Requires no Sworn');
	});

	it("keeps text out of preconditions, and a radio's options in order", () => {
		expect(Number.isNaN(fieldNumber(sf('sampleNotes'), 'anything'))).toBe(true);
		expect(Number.isNaN(fieldNumber(field('touchedAnimal'), 'Wolf'))).toBe(true);
		expect(fieldNumber(sf('sampleRank'), 'master')).toBe(2);
	});

	it('shows a field whose if names a counter only while it passes', () => {
		const gated = { ...sf('sampleNotes'), if: 'sampleResolve >= 3' };
		const by = (id: string) => sample.find((f) => f.id === id);
		expect(fieldShown(gated, {}, by)).toBe(false);
		expect(fieldShown(gated, { sampleResolve: '3' }, by)).toBe(true);
	});

	it('rolls a counter as the number in the result', () => {
		const counted = { ...sf('sampleResolve'), roll: { oracle: 'yrtTouched', from: 'socialRank' } };
		// Pure's social rank is 1, Feral's 5 (held to maxValue 5).
		expect(rollField(counted, {}, oracles, byId, undefined, d100(1))?.value).toBe('1');
		expect(rollField(counted, {}, oracles, byId, undefined, d100(100))?.value).toBe('5');
	});
});

describe('import and export', () => {
	const sampleOracles: OracleFile[] = [
		read('extensions/sample/oracles/gizmo.json'),
		read('extensions/sample/oracles/prefix-suffix.json'),
	];
	const sample = declared('sample').map((d) => resolveField(d, 'sample', sampleOracles));
	const all = [...fields, ...sample];
	const allById = (id: string) => all.find((f) => f.id === id);

	it('stores an imported dropdown or radio by option id, from its label or any case of its id', () => {
		expect(
			cleanFieldValues(
				{ origin: 'Oray Hills', religion: 'None, or their own', touched: 'SECOND' },
				allById,
			),
		).toEqual({ origin: 'oray-hills', religion: 'none-or-their-own', touched: 'second' });
		expect(cleanFieldValues({ sampleRank: 'Master' }, allById)).toEqual({ sampleRank: 'master' });
	});

	it('keeps a choice that names no option, as the sheet does', () => {
		expect(cleanFieldValues({ origin: 'Atlantis' }, allById)).toEqual({ origin: 'Atlantis' });
	});

	it('holds a counter to its maximum and reads a switch as 1 or 0', () => {
		expect(
			cleanFieldValues({ sampleResolve: 9, sampleSworn: true, sampleTrinket: '' }, allById),
		).toEqual({ sampleResolve: '5', sampleSworn: '1', sampleTrinket: '' });
		expect(cleanFieldValues({ sampleSworn: 'yes' }, allById)).toEqual({ sampleSworn: '1' });
		expect(cleanFieldValues({ sampleSworn: 'no' }, allById)).toEqual({ sampleSworn: '0' });
		expect(cleanFieldValues({ sampleResolve: '3' }, allById)).toEqual({ sampleResolve: '3' });
	});

	it('keeps text as written, and an unknown field id for an extension not here', () => {
		expect(
			cleanFieldValues(
				{ touchedAnimal: 'Heron', sampleNotes: '**Oath** kept', starforgedCallsign: 'Vesper' },
				allById,
			),
		).toEqual({
			touchedAnimal: 'Heron',
			sampleNotes: '**Oath** kept',
			starforgedCallsign: 'Vesper',
		});
	});

	it('drops values that are not text, a number or a yes/no, and fields that are not a map', () => {
		expect(
			cleanFieldValues({ origin: { id: 'piscis' }, religion: ['puritan'], touched: null }, allById),
		).toEqual({});
		expect(cleanFieldValues('piscis', allById)).toEqual({});
		expect(cleanFieldValues(['piscis'], allById)).toEqual({});
		expect(cleanFieldValues(undefined, allById)).toEqual({});
	});

	it('writes the Details tab as Markdown: labels, each extension under its heading', () => {
		const groups = [
			{ heading: null, fields: fields.filter((f) => f.source === 'base') },
			{ heading: 'YRT', fields: fields.filter((f) => f.source === 'yrt') },
			{ heading: 'Sample', fields: sample },
		];
		const values = {
			origin: 'oray-hills',
			religion: 'puritan',
			touched: 'second',
			touchedAnimal: 'Heron',
			sampleSworn: '1',
			sampleNotes: 'Line one\n\nLine two',
		};
		expect(fieldsMarkdown(groups, values, allById)).toEqual([
			'## Details',
			'- **Region of origin:** Oray Hills',
			'',
			'### YRT',
			'- **Religion:** Puritan',
			'- **Touched:** Second',
			'- **Animal:** Heron',
			'',
			'### Sample',
			'- **Rank:** Novice',
			'- **Resolve:** 2/5',
			'- **Sworn:** on',
			'- **Notes:**',
			'  Line one',
			'',
			'  Line two',
			'',
		]);
	});

	it('leaves out fields with no value or a failing if, and the section when nothing is left', () => {
		const groups = [{ heading: 'YRT', fields: fields.filter((f) => f.source === 'yrt') }];
		// Touched reads its default, Pure; Animal is hidden while Pure.
		expect(fieldsMarkdown(groups, { touchedAnimal: 'Heron' }, allById)).toEqual([
			'## Details',
			'### YRT',
			'- **Touched:** Pure',
			'',
		]);
		const base = [{ heading: null, fields: fields.filter((f) => f.source === 'base') }];
		expect(fieldsMarkdown(base, {}, allById)).toEqual([]);
	});
});

describe('reconcileImportedCharacter', () => {
	const counters = new Map([['mana', { maxValue: 5 }]]);

	it("tidies the fields, moves an older export's values in, and keeps the outer name", () => {
		const entry: { name?: unknown; data?: Record<string, unknown> } = {
			name: '  Ivy ',
			data: {
				fields: { origin: 'Oray Hills', futureField: 'kept' },
				touched: 'Second',
				touchedAnimal: 'Heron',
				background: '**Religion:** **Puritan**, by upbringing.',
				globalValues: { mana: '9', orphan: '2' },
			},
		};
		const data = reconcileImportedCharacter(entry, counters, byId);
		expect(entry.data).toBe(data);
		expect(data.fields).toEqual({
			origin: 'oray-hills',
			futureField: 'kept',
			religion: 'puritan',
			touched: 'second',
			touchedAnimal: 'Heron',
		});
		expect(data).not.toHaveProperty('touched');
		expect(data).not.toHaveProperty('touchedAnimal');
		expect(data.globalValues).toEqual({ mana: '5' });
		expect(data.name).toBe('Ivy');
	});

	it('leaves a data name alone, and gives an entry without data a fields map', () => {
		const named = { name: 'Outer', data: { name: 'Inner' } };
		expect(reconcileImportedCharacter(named, counters, byId).name).toBe('Inner');
		const bare: { name?: unknown; data?: Record<string, unknown> } = { name: 'Bare' };
		expect(reconcileImportedCharacter(bare, counters, byId)).toEqual({ fields: {}, name: 'Bare' });
		const odd = { name: 42, data: {} };
		expect(reconcileImportedCharacter(odd, counters, byId)).not.toHaveProperty('name');
	});

	it("gives a shared backup's numbers and true/false values their types", () => {
		const xss = '<img src=x onerror=alert(1)>';
		const entry: { name?: unknown; data?: Record<string, unknown> } = {
			name: 'Brennan',
			data: {
				edge: xss,
				heart: '3',
				health: 4,
				momentum: '-2',
				xp: null,
				wounded: 'yes',
				shaken: true,
				vows: [{ name: 'Avenge', ticks: xss, menace: '2' }, null],
			},
		};
		const data = reconcileImportedCharacter(entry, counters, byId);
		expect(data).toMatchObject({
			edge: 0,
			heart: 3,
			health: 4,
			momentum: -2,
			xp: 0,
			wounded: false,
			shaken: true,
		});
		expect((data.vows as Array<Record<string, unknown>>)[0]).toMatchObject({
			name: 'Avenge',
			ticks: 0,
			menace: 2,
		});
		// Keys the backup didn't have stay absent: loading fills its defaults.
		expect(data).not.toHaveProperty('iron');
	});
});
