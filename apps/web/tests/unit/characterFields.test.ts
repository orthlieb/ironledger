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
	counterValue,
	fieldHint,
	fieldNumber,
	fieldRequirement,
	fieldShown,
	fieldValue,
	matchOption,
	optionId,
	optionIndex,
	resolveField,
	rollField,
	valueLabel,
	type ResolvedField,
} from '../../src/lib/characterFieldsCore.js';
import { moveLegacyYrtFields } from '../../src/lib/character.js';
import type { OracleFile } from '../../src/lib/oracleStore.svelte.js';
import type { CharacterFieldDef } from '../../src/lib/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');
const read = (rel: string) => JSON.parse(readFileSync(path.join(REPO, rel), 'utf-8'));
const declared = (ext: string) =>
	read(`extensions/${ext}/extension.json`).characterFields as CharacterFieldDef[];

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

	it('the sample extension declares one of each', () => {
		expect(sample.map((f) => f.type)).toEqual([
			'dropdown',
			'radio',
			'counter',
			'switch',
			'string',
			'markdown',
		]);
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
		const gated = { ...sf('sampleNotes'), if: [{ key: 'sampleResolve', min: 3 }] };
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
