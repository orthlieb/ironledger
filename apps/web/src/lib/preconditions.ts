/**
 * Conditions — when a move can be made, an asset taken (and its abilities
 * used), a field shown. Each is an expression string
 * (docs/command-language.md → Conditions), parsed by @ironledger/shared;
 * this module says what each name reads on a character and in the current
 * context, and why a condition fails, for the UI.
 *
 *   character & foe & initiative == character
 *   touched >= prime
 *   companion/hawk | companion/raven
 *   bonds >= 2b
 *
 * scripts/gen-extensions-manifest.mjs checks every condition in content at
 * build time against the same names; keep CONDITION_NAMES there in step with
 * the names answered here.
 */
import { testHolds, type CondNode, type Reading, type TestNode } from '@ironledger/shared';
import type { CharacterData, CustomFieldDef } from './types.js';
import { findAsset, getGlobalCounterDef } from './assetStore.svelte.js';
import {
	boundFor,
	fieldReading,
	fieldRequirement,
	fieldValue,
	findCharacterField,
	negateOp,
	type Bound,
	type ResolvedField,
} from './characterFields.svelte.js';
import { parsedCondition } from './conditionCache.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single difficulty factor level within an inspection ritual. */
export interface InspectionFactor {
	key: string;
	name: string;
	levels: string[];
}

/** A ritual asset's identity + its difficulty factors, passed via pctx. */
export interface RitualInfo {
	id: string;
	name: string;
	inspectionFactors: InspectionFactor[];
}

/**
 * Optional runtime context for move preconditions.
 * Defaults to all-false / 0 for asset checks (safe — asset picker has no
 * site/journey/foe selection).
 */
export interface PreconditionContext {
	hasCharacter?: boolean;
	hasSite?: boolean;
	hasJourney?: boolean;
	hasScene?: boolean;
	hasFoe?: boolean;
	/** 0 = none, 1 = character has initiative, 2 = foe has initiative */
	initiative?: number;
	/** Harm dealt by the active foe per hit (from FOE_RANKS). Used to resolve harm-links at roll time. */
	foeHarm?: number;
	/** Ritual assets owned by the active character that have difficulty factors. */
	ritualAssets?: RitualInfo[];
	/** Name of the active expedition/site — used for log entry titles on Delve moves. */
	expeditionName?: string;
	/** Name of the active foe — used for log entry titles on Combat moves. */
	foeName?: string;
	/** The asset a condition belongs to, for `self.<field>`: the one being
	 *  checked in the picker or on the sheet. */
	self?: { assetId: string; customValues?: Record<string, string> };
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

const CONTEXT: Record<string, { flag: keyof PreconditionContext; noun: string }> = {
	character: { flag: 'hasCharacter', noun: 'character' },
	foe: { flag: 'hasFoe', noun: 'foe' },
	journey: { flag: 'hasJourney', noun: 'journey' },
	site: { flag: 'hasSite', noun: 'site' },
	scene: { flag: 'hasScene', noun: 'scene' },
};

const STATS: Record<string, string> = {
	momentum: 'Momentum',
	health: 'Health',
	spirit: 'Spirit',
	supply: 'Supply',
	xp: 'XP',
	edge: 'Edge',
	heart: 'Heart',
	iron: 'Iron',
	shadow: 'Shadow',
	wits: 'Wits',
};

const TRACKS: Record<string, string> = { bonds: 'Bonds', failures: 'Failures' };

const DEBILITIES = [
	'wounded',
	'shaken',
	'unprepared',
	'encumbered',
	'maimed',
	'corrupted',
	'cursed',
	'tormented',
];

const COUNTS: Record<string, string> = {
	vowCount: 'Vows',
	assetCount: 'Assets',
	companionCount: 'Companions',
	rarityCount: 'Rarity items',
};

const INITIATIVE = ['none', 'character', 'foe'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What a test names, read on a character in a context: the reading the
 *  parser compares, and what the failure message needs. */
type Subject =
	| { kind: 'context'; reading: Reading; noun: string }
	| { kind: 'initiative'; reading: Reading }
	| { kind: 'number'; reading: Reading; label: string }
	| { kind: 'track'; reading: Reading; label: string }
	| { kind: 'debility'; reading: Reading; label: string }
	| { kind: 'field'; reading: Reading; field: ResolvedField }
	| { kind: 'asset'; reading: Reading; name: string }
	| { kind: 'unknown'; reading: Reading; label: string };

const none: Reading = { kind: 'exists', value: 0 };

/** An asset field (`companion/hawk.health`, `self.health`) as a reading. A
 *  global field reads the character's shared value. */
function assetFieldReading(
	cf: CustomFieldDef,
	stored: string | undefined,
	data: CharacterData,
): Reading {
	const raw = cf.global ? data.globalValues?.[cf.id] : stored;
	const value = raw ?? (cf.default !== undefined ? String(cf.default) : '');
	if (cf.type === 'counter') return { kind: 'number', value: Number.parseInt(value, 10) || 0 };
	if (cf.type === 'switch') return { kind: 'bool', value: value === '1' ? 1 : 0 };
	if (cf.type === 'radio' || cf.type === 'dropdown') {
		const ids = (cf.options ?? []).map((o) => o.id);
		const labels = (cf.options ?? []).map((o) => o.label.toLowerCase());
		return {
			kind: 'list',
			value: value ? ids.indexOf(value) : -1,
			option: (w) => {
				const i = ids.indexOf(w);
				return i >= 0 ? i : labels.indexOf(w.toLowerCase());
			},
		};
	}
	return { kind: 'text', value: value.length };
}

function subject(t: TestNode, data: CharacterData, ctx: PreconditionContext): Subject {
	const { owner, name } = t;

	// An asset's own field: `self.health` or `companion/hawk.health`.
	if (owner) {
		const inst = owner === 'self' ? ctx.self : data.assets.find((a) => a.assetId === owner);
		const def = inst ? findAsset(inst.assetId) : findAsset(owner);
		const cf = def?.customFields?.find((f) => f.id === name);
		const label = `${def?.name ?? owner} ${cf?.label ?? name}`;
		if (!inst || !cf) return { kind: 'unknown', reading: none, label };
		const reading = assetFieldReading(cf, inst.customValues?.[name], data);
		return { kind: 'number', reading, label };
	}

	const context = CONTEXT[name];
	if (context)
		return {
			kind: 'context',
			reading: { kind: 'exists', value: ctx[context.flag] ? 1 : 0 },
			noun: context.noun,
		};

	if (name === 'initiative')
		return {
			kind: 'initiative',
			reading: { kind: 'list', value: ctx.initiative ?? 0, option: (w) => INITIATIVE.indexOf(w) },
		};

	if (name in STATS) {
		const rec = data as unknown as Record<string, unknown>;
		return {
			kind: 'number',
			reading: { kind: 'number', value: Number(rec[name]) || 0 },
			label: STATS[name]!,
		};
	}

	if (name in TRACKS) {
		const ticks = Number((data as unknown as Record<string, unknown>)[name]) || 0;
		return {
			kind: 'track',
			reading: { kind: 'track', value: ticks, ticksPerMark: 1 },
			label: TRACKS[name]!,
		};
	}

	if (DEBILITIES.includes(name)) {
		const on = (data as unknown as Record<string, unknown>)[name] ? 1 : 0;
		return { kind: 'debility', reading: { kind: 'bool', value: on }, label: cap(name) };
	}

	if (name in COUNTS) {
		const count =
			name === 'vowCount'
				? data.vows.length
				: name === 'assetCount'
					? data.assets.length
					: name === 'companionCount'
						? data.assets.filter((a) => findAsset(a.assetId)?.category === 'Companion').length
						: data.assets.filter((a) => !!a.rarityId).length;
		return { kind: 'number', reading: { kind: 'number', value: count }, label: COUNTS[name]! };
	}

	// A field a content pack declares on the character (YRT's touched, …).
	const field = findCharacterField(name);
	if (field)
		return { kind: 'field', reading: fieldReading(field, fieldValue(field, data.fields)), field };

	// A counter shared by the assets that declare it (YRT's mana).
	const counter = getGlobalCounterDef(name);
	if (counter) {
		const reading = assetFieldReading(counter, undefined, data);
		return { kind: 'number', reading, label: counter.label };
	}

	// An asset, by its id ("companion/hawk"): owned or not. Its id, never its
	// name: a name can read differently from one language or content pack to
	// another. The message names it as it reads here.
	if (name.includes('/')) {
		const owned = data.assets.some((a) => a.assetId === name) ? 1 : 0;
		return {
			kind: 'asset',
			reading: { kind: 'exists', value: owned },
			name: findAsset(name)?.name ?? name,
		};
	}

	return { kind: 'unknown', reading: none, label: name };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

const SYMBOL: Record<string, string> = {
	'>=': '≥',
	'<=': '≤',
	'==': '=',
	'!=': '≠',
	'>': '>',
	'<': '<',
};

/** A level as the author wrote it, for a message: `2b` is "2 boxes". */
function levelText(t: TestNode): string {
	const lv = t.level;
	if (!lv) return '';
	if (lv.kind === 'word') return cap(lv.word);
	if (lv.unit === 'b') return `${lv.n} box${lv.n === 1 ? '' : 'es'}`;
	if (lv.unit === 't') return `${lv.n} tick${lv.n === 1 ? '' : 's'}`;
	return String(lv.n);
}

/** Why a test that should hold (or, `negated`, shouldn't) doesn't. */
function testMessage(t: TestNode, s: Subject, negated: boolean): string {
	const op = t.op && (negated ? negateOp(t.op) : t.op);
	switch (s.kind) {
		case 'context':
			if (op) return `${cap(s.noun)} requirement not met`;
			return negated ? `Requires no active ${s.noun}` : `No ${s.noun} selected`;
		case 'initiative': {
			const want = t.level?.kind === 'word' ? t.level.word : '';
			if (op === '==' && want === 'none') return 'Combat already in progress';
			if (op === '==' && want === 'character') return 'Requires character initiative';
			if (op === '==' && want === 'foe') return 'Requires foe initiative';
			return 'Initiative requirement not met';
		}
		case 'debility':
			if (op) return `${s.label} requirement not met`;
			return negated ? `Must not be ${s.label}` : `Must be ${s.label}`;
		case 'asset':
			return negated ? `Must not have the "${s.name}" asset` : `Requires the "${s.name}" asset`;
		case 'field': {
			const { field } = s;
			if (op && t.level) {
				const lv = t.level.kind === 'word' ? (s.reading.option?.(t.level.word) ?? -1) : t.level.n;
				return fieldRequirement(field, boundFor(op, lv));
			}
			const bound: Bound =
				s.reading.kind === 'list'
					? negated
						? { max: -1 }
						: { min: 0 }
					: s.reading.kind === 'bool'
						? { eq: negated ? 0 : 1 }
						: negated
							? { max: 0 }
							: { min: 1 };
			if (s.reading.kind === 'text')
				return negated ? `Requires no ${field.label}` : `Requires ${field.label}`;
			return fieldRequirement(field, bound);
		}
		case 'number':
		case 'track': {
			const current =
				s.kind === 'track' && t.level?.kind === 'number' && t.level.unit === 'b'
					? `${Math.floor(s.reading.value / 4)} boxes`
					: String(s.reading.value);
			if (op) return `Requires ${s.label} ${SYMBOL[op]} ${levelText(t)} (current: ${current})`;
			return negated ? `Requires no ${s.label}` : `Requires ${s.label}`;
		}
		case 'unknown':
			return `${s.label} requirement not met`;
	}
}

/** Join "or" messages: `Requires Archer or Hawk` when each part names an
 *  asset, otherwise each part's message, joined by "or". */
function orMessage(parts: Array<{ msg: string; asset?: string }>): string {
	if (parts.every((p) => p.asset)) return `Requires ${parts.map((p) => p.asset).join(' or ')}`;
	return parts.map((p) => p.msg).join(' or ');
}

type Read = (t: TestNode) => Subject;

/** Why `node` fails (or, `negated`, why it holds when it mustn't); null if
 *  it's met. De Morgan carries `negated` down through & and |. */
function failure(node: CondNode, negated: boolean, read: Read): string | null {
	switch (node.type) {
		case 'not':
			return failure(node.item, !negated, read);
		case 'test': {
			const s = read(node);
			const holds = testHolds(node, s.reading);
			if (holds !== negated) return null;
			return testMessage(node, s, negated);
		}
		case 'and':
		case 'or': {
			// Every part must hold: `and`, or `or` negated (none may hold).
			if ((node.type === 'and') !== negated) {
				for (const item of node.items) {
					const why = failure(item, negated, read);
					if (why) return why;
				}
				return null;
			}
			// One part is enough: `or`, or `and` negated.
			const parts: Array<{ msg: string; asset?: string }> = [];
			for (const item of node.items) {
				const why = failure(item, negated, read);
				if (!why) return null;
				const s = item.type === 'test' && !item.op ? read(item) : null;
				parts.push({ msg: why, asset: s?.kind === 'asset' && !negated ? s.name : undefined });
			}
			return orMessage(parts);
		}
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Why a condition fails on this character in this context, or null if it's
 * met (or there's none). Asset checks pass `ctx.self` so `self.<field>`
 * reads the asset being checked.
 */
export function firstPreconditionFailure(
	preconditions: string | undefined,
	charData: CharacterData,
	ctx: PreconditionContext = {},
): string | null {
	if (!preconditions) return null;
	const node = parsedCondition(preconditions);
	if (!node) return null;
	return failure(node, false, (t) => subject(t, charData, ctx));
}

/**
 * Why a move can't be made now, or null. With no character, a move that has
 * any condition can't be. MovesDialog greys such moves out; the command bar
 * leaves them out of its suggestions.
 */
export function movePreconditionFailure(
	preconditions: string | undefined,
	charData: CharacterData | null | undefined,
	ctx: PreconditionContext = {},
): string | null {
	if (!charData) return preconditions ? 'No character selected' : null;
	return firstPreconditionFailure(preconditions, charData, ctx);
}
