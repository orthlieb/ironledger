// =============================================================================
// Iron Ledger — the value registry (docs/command-language.md → Values)
//
// Every value a command can show or change, by owner: a character's momentum,
// debilities and content-pack fields, the party's supply, a foe's progress, a
// journey's, site's or scene's, a vow's menace, an asset's health. Each comes
// bound to its owner's live object, with its kind, its range or options, and
// a get and a set. Nothing here logs or saves: the command runner does
// (commands/run.svelte.ts), and the plan it runs is worked out in plan.ts.
//
// Pure: no store is read. The caller hands in the owners and a Catalogue (the
// content packs' fields, the asset definitions, foe ranks).
// =============================================================================

import type {
	AssetDefinition,
	CharacterAsset,
	CharacterData,
	CharacterFieldDef,
	CustomFieldDef,
	Expedition,
	FoeEncounter,
	Vow,
	VowStatus,
} from '#lib/types.js';
import { DELVE_DOMAINS, DELVE_THEMES, EXPEDITION_MARK_TICKS, VOW_MARK_TICKS } from '#lib/types.js';
import { maxMomentum } from '#lib/character.js';
import { STATS, STAT_MAX, STAT_MIN } from '#lib/rules/statArrays.js';
import { counterValue, type ResolvedField } from '#lib/characterFieldsCore.js';

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

export type OwnerKind = 'character' | 'foe' | 'journey' | 'site' | 'scene' | 'vow' | 'asset';

export interface CharacterOwner {
	kind: 'character';
	id: string;
	name: string;
	data: CharacterData;
}
export interface FoeOwner {
	kind: 'foe';
	id: string;
	name: string;
	enc: FoeEncounter;
}
export interface ExpeditionOwner {
	kind: 'journey' | 'site' | 'scene';
	id: string;
	name: string;
	exp: Expedition;
}
export interface VowOwner {
	kind: 'vow';
	id: string;
	name: string;
	vow: Vow;
	character: CharacterOwner;
}
export interface AssetOwner {
	kind: 'asset';
	/** The asset's id, `companion/hawk`. */
	id: string;
	/** Its name, "Hawk". */
	name: string;
	/** The name the player gave it (a companion's), or "". */
	given: string;
	asset: CharacterAsset;
	def: AssetDefinition | undefined;
	character: CharacterOwner;
}
export type Owner = CharacterOwner | FoeOwner | ExpeditionOwner | VowOwner | AssetOwner;

/** What the registry needs from the catalogue. */
export interface Catalogue {
	/** The enabled content packs' party and character fields. */
	fields: ResolvedField[];
	/** The enabled content packs' global fields (mana). */
	globals: CharacterFieldDef[];
	findAsset(id: string): AssetDefinition | undefined;
	/** Every asset definition, to say "Edda has no Hawk" of one she lacks. */
	assets?: AssetDefinition[];
	/** A foe's name, its rank's label, ticks per mark (its rank, less a YRT
	 *  foe's escalating defense) and harm. */
	foe(enc: FoeEncounter): { name: string; rank: string; ticksPerMark: number; harm: number };
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export type ValueKind = 'number' | 'bool' | 'list' | 'text' | 'track' | 'notes';

export interface ValueOption {
	id: string;
	label: string;
}

/** One value of one owner, bound to it. */
export interface ValueSpec {
	/** The name commands use: `health`, `mana`, `progress`, `companion-name`. */
	key: string;
	label: string;
	kind: ValueKind;
	/** False: commands and links can show it but not change it. */
	writable: boolean;
	/** One value the whole party shares (supply, a party field): it takes no
	 *  owner, and a change reaches every character. */
	party?: boolean;
	/** A number's range (a track's is 0–40 ticks). */
	min?: number;
	max?: number;
	/** A list's options; `get` returns an option's id (or custom text). */
	options?: ValueOption[];
	/** A list that also keeps a value that isn't an option, as typed. */
	custom?: boolean;
	/** A track: ticks per mark, by its rank; absent, a plain number is ticks. */
	ticksPerMark?: number;
	/** A track's rank, for messages ("Dangerous"). */
	rank?: string;
	/** A true/false value's words in the log: [false, true]. */
	words?: [string, string];
	/** A number, 0 or 1 for true/false, ticks for a track; a list's option id
	 *  or text. */
	get(): number | string;
	set(v: number | string): void;
}

export const TRACK_MAX = 40;
export const DEBILITIES = [
	'wounded',
	'shaken',
	'unprepared',
	'encumbered',
	'maimed',
	'corrupted',
	'cursed',
	'tormented',
] as const;
const INITIATIVE: ValueOption[] = [
	{ id: 'none', label: 'None' },
	{ id: 'me', label: 'Me' },
	{ id: 'foe', label: 'Foe' },
];
const VOW_STATUS: ValueOption[] = [
	{ id: 'active', label: 'Active' },
	{ id: 'fulfilled', label: 'Fulfilled' },
	{ id: 'forsaken', label: 'Forsaken' },
];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const asOptions = (labels: readonly string[]): ValueOption[] =>
	labels.map((l) => ({ id: l, label: l }));

/** A number value read and written as a property of `obj`. */
function numberProp(
	obj: object,
	prop: string,
	key: string,
	label: string,
	min: number,
	max: number,
	extra: Partial<ValueSpec> = {},
): ValueSpec {
	const rec = obj as Record<string, unknown>;
	return {
		key,
		label,
		kind: 'number',
		writable: true,
		min,
		max,
		get: () => Number(rec[prop]) || 0,
		set: (v) => {
			rec[prop] = Number(v);
		},
		...extra,
	};
}

/** A progress track kept as ticks in `obj.ticks` (or another property). */
function trackProp(
	obj: object,
	prop: string,
	key: string,
	label: string,
	ticksPerMark?: number,
	rank?: string,
): ValueSpec {
	return {
		...numberProp(obj, prop, key, label, 0, TRACK_MAX),
		kind: 'track',
		ticksPerMark,
		rank,
	};
}

/** A true/false value kept as a boolean property. */
function boolProp(
	obj: object,
	prop: string,
	key: string,
	label: string,
	words: [string, string] = ['No', 'Yes'],
): ValueSpec {
	const rec = obj as Record<string, unknown>;
	return {
		key,
		label,
		kind: 'bool',
		writable: true,
		words,
		get: () => (rec[prop] ? 1 : 0),
		set: (v) => {
			rec[prop] = Number(v) > 0;
		},
	};
}

/** A field kept as a string in a record on `obj` (`fields`, `globalValues`,
 *  `customValues`): its kind follows its type. */
function stringField(
	obj: object,
	recProp: string,
	def: {
		id: string;
		label: string;
		type: string;
		default?: string | number;
		maxValue?: number;
		writable?: boolean;
		custom?: boolean;
	},
	options: ValueOption[],
	extra: Partial<ValueSpec> = {},
): ValueSpec {
	const holder = obj as Record<string, unknown>;
	const read = (): string => {
		const rec = holder[recProp] as Record<string, string> | undefined;
		const v = rec?.[def.id];
		return v ?? (def.default !== undefined ? String(def.default) : '');
	};
	const write = (v: string) => {
		const rec = (holder[recProp] as Record<string, string> | undefined) ?? {};
		holder[recProp] = { ...rec, [def.id]: v };
	};
	const base = {
		key: def.id,
		label: def.label,
		writable: def.writable !== false,
		...extra,
	};
	switch (def.type) {
		case 'counter':
			return {
				...base,
				kind: 'number',
				min: 0,
				max: def.maxValue ?? Infinity,
				get: () => counterValue(def as CharacterFieldDef, read()),
				set: (v) => write(String(v)),
			};
		case 'switch':
			return {
				...base,
				kind: 'bool',
				words: ['Off', 'On'],
				get: () => (read() === '1' ? 1 : 0),
				set: (v) => write(Number(v) > 0 ? '1' : '0'),
			};
		case 'dropdown':
		case 'radio':
			return {
				...base,
				kind: 'list',
				options,
				custom: !!def.custom,
				get: read,
				set: (v) => write(String(v)),
			};
		case 'markdown':
			return { ...base, kind: 'notes', writable: false, get: read, set: () => {} };
		default:
			return { ...base, kind: 'text', get: read, set: (v) => write(String(v)) };
	}
}

/** A character's values, built in and from the content packs: the party's
 *  among them (supply, party fields), marked `party`. */
export function characterValues(owner: CharacterOwner, cat: Catalogue): ValueSpec[] {
	const d = owner.data;
	const out: ValueSpec[] = [
		numberProp(d, 'momentum', 'momentum', 'Momentum', -6, maxMomentum(d)),
		numberProp(d, 'health', 'health', 'Health', 0, 5),
		numberProp(d, 'spirit', 'spirit', 'Spirit', 0, 5),
		numberProp(d, 'supply', 'supply', 'Supply', 0, 5, { party: true }),
		numberProp(d, 'xp', 'xp', 'Experience', 0, 30),
		...STATS.map((s) => numberProp(d, s, s, cap(s), STAT_MIN, STAT_MAX)),
		trackProp(d, 'bonds', 'bonds', 'Bonds'),
		trackProp(d, 'failures', 'failures', 'Failures'),
		...DEBILITIES.map((k) => boolProp(d, k, k, cap(k), ['Cleared', 'Marked'])),
		{
			key: 'initiative',
			label: 'Initiative',
			kind: 'list',
			writable: true,
			options: INITIATIVE,
			get: () => INITIATIVE[d.initiative ?? 0]?.id ?? 'none',
			set: (v) => {
				d.initiative = Math.max(
					0,
					INITIATIVE.findIndex((o) => o.id === v),
				);
			},
		},
		...counts(owner, cat),
	];
	for (const f of cat.fields)
		out.push(stringField(d, 'fields', f, f.options, f.scope === 'party' ? { party: true } : {}));
	for (const g of cat.globals) out.push(stringField(d, 'globalValues', g, []));
	return out;
}

/** The counts a condition reads; commands show them. */
function counts(owner: CharacterOwner, cat: Catalogue): ValueSpec[] {
	const d = owner.data;
	const count = (key: string, label: string, n: () => number): ValueSpec => ({
		key,
		label,
		kind: 'number',
		writable: false,
		min: 0,
		max: Infinity,
		get: n,
		set: () => {},
	});
	return [
		count('vowCount', 'Vows', () => d.vows?.length ?? 0),
		count('assetCount', 'Assets', () => d.assets?.length ?? 0),
		count(
			'companionCount',
			'Companions',
			() =>
				(d.assets ?? []).filter((a) => cat.findAsset(a.assetId)?.category === 'Companion').length,
		),
		count('rarityCount', 'Rarity items', () => (d.assets ?? []).filter((a) => !!a.rarityId).length),
	];
}

/** A vow's status, reading the old `fulfilled` flag of a save that has no
 *  status. */
export function vowStatus(v: Vow): VowStatus {
	return v.status ?? (v.fulfilled ? 'fulfilled' : 'active');
}

/** A counter's top on an asset: a number, or one per ability level (the
 *  highest marked ability's). */
function assetCounterMax(cf: CustomFieldDef, asset: CharacterAsset): number {
	const mv = cf.maxValue;
	if (mv === undefined) return Infinity;
	if (typeof mv === 'number') return mv;
	let last = 0;
	asset.abilities.forEach((on, i) => {
		if (on) last = i;
	});
	return mv[Math.min(last, mv.length - 1)] ?? Infinity;
}

/** An owner's values. */
export function valuesOf(owner: Owner, cat: Catalogue): ValueSpec[] {
	switch (owner.kind) {
		case 'character':
			return characterValues(owner, cat);
		case 'foe': {
			const f = cat.foe(owner.enc);
			return [
				trackProp(owner.enc, 'ticks', 'progress', 'Progress', f.ticksPerMark, f.rank),
				boolProp(owner.enc, 'vanquished', 'vanquished', 'Vanquished'),
			];
		}
		case 'journey':
		case 'site':
		case 'scene': {
			const e = owner.exp;
			const out = [
				trackProp(
					e,
					'ticks',
					'progress',
					'Progress',
					EXPEDITION_MARK_TICKS[e.difficulty],
					cap(e.difficulty),
				),
				boolProp(e, 'complete', 'complete', 'Complete'),
			];
			if (e.type === 'scene')
				out.push(numberProp(e, 'countdownFilled', 'countdown', 'Countdown', 0, 4));
			if (e.type === 'site') {
				const site = e as unknown as Record<string, unknown>;
				const list = (key: string, label: string, labels: readonly string[]): ValueSpec => ({
					key,
					label,
					kind: 'list',
					writable: true,
					options: asOptions(labels),
					get: () => String(site[key] ?? ''),
					set: (v) => {
						site[key] = String(v);
					},
				});
				out.push(list('theme', 'Theme', DELVE_THEMES), list('domain', 'Domain', DELVE_DOMAINS));
			}
			return out;
		}
		case 'vow': {
			const v = owner.vow;
			return [
				trackProp(
					v,
					'ticks',
					'progress',
					'Progress',
					VOW_MARK_TICKS[v.difficulty],
					cap(v.difficulty),
				),
				numberProp(v, 'menace', 'menace', 'Menace', 0, 10),
				{
					key: 'status',
					label: 'Status',
					kind: 'list',
					writable: true,
					options: VOW_STATUS,
					get: () => vowStatus(v),
					set: (s) => {
						v.status = s as VowStatus;
						delete v.fulfilled;
					},
				},
			];
		}
		case 'asset': {
			const { asset, def, character } = owner;
			return (def?.customFields ?? []).map((cf) => {
				if (cf.global) {
					// One value per character: the global field's, declared once.
					const g = cat.globals.find((x) => x.id === cf.id) ?? {
						...cf,
						default: String(cf.default ?? ''),
						maxValue: typeof cf.maxValue === 'number' ? cf.maxValue : undefined,
					};
					return stringField(
						character.data,
						'globalValues',
						{ ...g, label: cf.label || g.label },
						[],
					);
				}
				const spec = stringField(asset, 'customValues', cf as never, cf.options ?? []);
				if (cf.type === 'counter') {
					const max = assetCounterMax(cf, asset);
					const raw = () => asset.customValues?.[cf.id] ?? String(cf.default ?? '0');
					return {
						...spec,
						max,
						get: () => Math.max(0, Math.min(max, Math.floor(Number(raw())) || 0)),
					};
				}
				return spec;
			});
		}
	}
}

/** A value of an owner by its key, ignoring case. */
export function findValue(owner: Owner, key: string, cat: Catalogue): ValueSpec | undefined {
	const k = key.toLowerCase();
	return valuesOf(owner, cat).find((v) => v.key.toLowerCase() === k);
}

// ---------------------------------------------------------------------------
// Showing values
// ---------------------------------------------------------------------------

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A track as boxes and ticks: "3 boxes, 2 ticks", "1 box", "0 boxes". */
export function trackText(ticks: number): string {
	const boxes = Math.floor(ticks / 4);
	const rest = ticks % 4;
	if (!rest) return plural(boxes, 'box', 'boxes');
	if (!boxes) return plural(rest, 'tick');
	return `${plural(boxes, 'box', 'boxes')}, ${plural(rest, 'tick')}`;
}

/** A list value as its option's label, the text as typed (a custom value),
 *  or "—" unset. */
export function listLabel(spec: ValueSpec, v: string): string {
	if (!v) return '—';
	return spec.options?.find((o) => o.id === v)?.label ?? v;
}

/** A value as it reads in a message: "4/5", "3 boxes, 2 ticks", "Prime",
 *  "Marked". */
export function valueText(spec: ValueSpec, v: number | string = spec.get()): string {
	switch (spec.kind) {
		case 'number': {
			const n = Number(v);
			const num = n < 0 ? `−${-n}` : String(n);
			return spec.max !== undefined && Number.isFinite(spec.max) && spec.min === 0
				? `${num}/${spec.max}`
				: num;
		}
		case 'bool':
			return (spec.words ?? ['No', 'Yes'])[Number(v) > 0 ? 1 : 0];
		case 'track':
			return trackText(Number(v));
		case 'list':
			return listLabel(spec, String(v));
		case 'text':
			return String(v) || '—';
		case 'notes':
			return String(v) ? 'notes (edited on the sheet)' : '—';
	}
}

/** "Mana 3/10", "Wounded: Marked", "Progress: 3 boxes, 2 ticks". */
export function showValue(spec: ValueSpec): string {
	const v = valueText(spec);
	return spec.kind === 'number' ? `${spec.label} ${v}` : `${spec.label}: ${v}`;
}

/** A value as one row of a log entry: "Progress" and "3 boxes, 2 ticks". */
export interface ValueRow {
	label: string;
	value: string;
}

export function valueRow(spec: ValueSpec): ValueRow {
	return { label: spec.label, value: valueText(spec) };
}

/** What reading an owner on its own logs, a row each: a character's health,
 *  spirit, momentum and supply; a foe's rank and progress; an expedition's
 *  rank, progress (and a scene's countdown); a vow's rank, progress and
 *  menace; an asset's values. */
export function ownerRows(owner: Owner, cat: Catalogue): ValueRow[] {
	const status = (done: boolean, word: string): ValueRow[] =>
		done ? [{ label: 'Status', value: word }] : [];
	switch (owner.kind) {
		case 'character': {
			const vals = characterValues(owner, cat);
			return ['health', 'spirit', 'momentum', 'supply']
				.map((k) => vals.find((v) => v.key === k))
				.filter((v): v is ValueSpec => !!v)
				.map(valueRow);
		}
		case 'foe':
			return [
				{ label: 'Rank', value: cat.foe(owner.enc).rank },
				{ label: 'Progress', value: trackText(owner.enc.ticks) },
				...status(!!owner.enc.vanquished, 'Vanquished'),
			];
		case 'journey':
		case 'site':
		case 'scene': {
			const e = owner.exp;
			return [
				{ label: 'Rank', value: cap(e.difficulty) },
				{ label: 'Progress', value: trackText(e.ticks) },
				...(e.type === 'scene' ? [{ label: 'Countdown', value: `${e.countdownFilled}/4` }] : []),
				...status(!!e.complete, 'Complete'),
			];
		}
		case 'vow': {
			const v = owner.vow;
			const st = vowStatus(v);
			return [
				{ label: 'Rank', value: cap(v.difficulty) },
				{ label: 'Progress', value: trackText(v.ticks) },
				{ label: 'Menace', value: `${v.menace ?? 0}/10` },
				...status(st !== 'active', cap(st)),
			];
		}
		case 'asset':
			return valuesOf(owner, cat)
				.filter((v) => v.kind !== 'notes')
				.map(valueRow);
	}
}

/** An owner's kind as a noun. */
export const KIND_NOUN: Record<OwnerKind, string> = {
	character: 'character',
	foe: 'foe',
	journey: 'journey',
	site: 'site',
	scene: 'scene',
	vow: 'vow',
	asset: 'asset',
};

/** What naming an owner shows: "Wolf (Dangerous foe): 3 boxes, 2 ticks". */
export function showOwner(owner: Owner, cat: Catalogue): string {
	switch (owner.kind) {
		case 'character': {
			const vals = characterValues(owner, cat);
			const pick = (k: string) => vals.find((v) => v.key === k)!;
			return `${owner.name}: ${['health', 'spirit', 'momentum', 'supply'].map((k) => showValue(pick(k))).join(' · ')}`;
		}
		case 'foe': {
			const f = cat.foe(owner.enc);
			const done = owner.enc.vanquished ? ', vanquished' : '';
			return `${owner.name} (${f.rank} foe): ${trackText(owner.enc.ticks)}${done}`;
		}
		case 'journey':
		case 'site':
		case 'scene': {
			const e = owner.exp;
			const done = e.complete ? ', complete' : '';
			const count = e.type === 'scene' ? `; countdown ${e.countdownFilled}/4` : '';
			return `${owner.name} (${cap(e.difficulty)} ${e.type}): ${trackText(e.ticks)}${count}${done}`;
		}
		case 'vow': {
			const v = owner.vow;
			const st = vowStatus(v);
			return `${owner.name} (${cap(v.difficulty)} vow): ${trackText(v.ticks)}; menace ${v.menace ?? 0}/10${st === 'active' ? '' : `, ${st}`}`;
		}
		case 'asset': {
			const vals = valuesOf(owner, cat).filter((v) => v.kind !== 'notes');
			const given = owner.given ? ` (${owner.given})` : '';
			return `${owner.name}${given}${vals.length ? `: ${vals.map(showValue).join(' · ')}` : ''}`;
		}
	}
}
