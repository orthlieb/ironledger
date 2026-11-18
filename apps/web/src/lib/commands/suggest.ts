// =============================================================================
// Iron Ledger — command typeahead (docs/command-language.md → Typeahead)
//
// suggest(input, world) follows a command slot by slot and offers what fits
// the slot being typed, each row with what accepting it would give: a value
// with its current value, an owner with its kind, an operator with its
// result ("++  Health 4 → 5"), a list's options with the current one ticked,
// a track's units. The top row says what Enter does with the input as it
// stands. Pure: the command bar builds the World and renders the rows.
// =============================================================================

import {
	normName,
	parseCommand,
	quoteName,
	VERBS,
	type NamePart,
	type Op,
	type Parsed,
	type Verb,
} from './parse.js';
import {
	plan,
	activeCharacter,
	activeExpedition,
	activeFoe,
	groupKeyword,
	groupOwners,
	GROUP_KEYWORDS,
	namedOwners,
	ownerLabel,
	ownerRef,
	resolveOwner,
	isReserved,
	characterValueKeys,
	SELECT_KINDS,
	STORY_ACTIONS,
	type Plan,
	type SelectKind,
	type World,
} from './resolve.js';
import { planChange } from './change.js';
import { findValue, valueText, valuesOf, type Owner, type ValueSpec } from './values.js';

/** One row of the suggestion strip. */
export interface Suggestion {
	/** What the row shows first: "health", "Wolf", "++". */
	label: string;
	/** Beside it: a value, a kind, a result. */
	detail: string;
	/** Which kind of thing it is, for its icon. */
	icon: SuggestionIcon;
	/** The whole input once it's accepted. */
	apply: string;
	/** Why it can't be used now (a move that can't be made). */
	disabled?: string;
	/** It's the one chosen now (the active foe, a list's current option). */
	current?: boolean;
}

export type SuggestionIcon =
	| 'value'
	| 'lock'
	| 'op'
	| 'option'
	| 'unit'
	| 'verb'
	| 'move'
	| 'oracle'
	| 'dice'
	| 'help'
	| 'character'
	| 'foe'
	| 'journey'
	| 'site'
	| 'scene'
	| 'vow'
	| 'asset';

export interface TopRow {
	text: string;
	/** ok: Enter runs it; error: it would fail; incomplete: something's
	 *  missing; none: nothing typed. */
	tone: 'ok' | 'error' | 'incomplete' | 'none';
}

export interface Suggestions {
	top: TopRow;
	rows: Suggestion[];
	/** What Enter would do (the plan behind the top row). */
	plan: Plan;
}

const VERB_HINTS: Record<Verb, string> = {
	move: 'open a move…',
	oracle: 'roll on an oracle…',
	roll: 'roll dice…',
	note: 'add a note…',
	burn: 'burn momentum on the newest roll',
	story: 'mark a story section…',
	help: 'the command help',
};

/** Help topics `/help` takes (CommandHelpDialog's sections). */
export const HELP_TOPICS: { id: string; label: string }[] = [
	{ id: 'values', label: 'Values and operators' },
	{ id: 'tracks', label: 'Progress tracks and units' },
	{ id: 'owners', label: 'Owners and names' },
	{ id: 'active', label: 'Making something active' },
	{ id: 'verbs', label: 'Moves, oracles, dice, notes' },
	{ id: 'keys', label: 'Keys and typeahead' },
];

/** What each group keyword's row says it is. */
const GROUP_HINT: Record<(typeof GROUP_KEYWORDS)[number], string> = {
	companions: 'every companion',
	allies: 'every other character',
	everyone: 'you and every other character',
};

const ROLL_PRESETS: { label: string; detail: string }[] = [
	{ label: '2d10 1d6', detail: 'action roll: challenge dice and action die' },
	{ label: '2d10', detail: 'challenge dice' },
	{ label: '1d6', detail: 'action die' },
	{ label: 'd100', detail: 'oracle' },
];

const MAX_ROWS = 100;

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** How well `label` matches `typed`: at the start (best), at a word's start,
 *  anywhere; 0 for no match. */
export function matchScore(label: string, typed: string): number {
	const t = normName(typed);
	if (!t) return 1;
	const l = normName(label);
	if (l === t) return 4;
	if (l.startsWith(t)) return 3;
	if (l.split(/[\s/:-]+/).some((w) => w.startsWith(t))) return 2;
	return l.includes(t) ? 1 : 0;
}

/** Rows whose label (or one of `also`) matches, best first, keeping the
 *  given order among equals. */
function ranked<T>(items: T[], typed: string, labels: (t: T) => string[]): T[] {
	return items
		.map((it, i) => ({ it, i, s: Math.max(0, ...labels(it).map((l) => matchScore(l, typed))) }))
		.filter((r) => r.s > 0)
		.sort((a, b) => b.s - a.s || a.i - b.i)
		.map((r) => r.it);
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

/** The active one of a kind, for a keyword's row: "foe — Wolf". */
function activeName(kind: SelectKind, w: World): string {
	if (kind === 'character') return activeCharacter(w)?.name ?? 'none active';
	if (kind === 'foe') return activeFoe(w)?.name ?? 'none active';
	const e = activeExpedition(w);
	return e && e.kind === kind ? e.name : 'none active';
}

/** A value's row: its key, its current value; locked when read-only. */
function valueRow(spec: ValueSpec, apply: string): Suggestion {
	const locked = !spec.writable || spec.kind === 'notes';
	return {
		label: spec.key,
		detail: `${spec.label}${spec.party ? ' (party)' : ''} — ${valueText(spec)}`,
		icon: locked ? 'lock' : 'value',
		apply,
	};
}

/** What an owner's row says beside its name. */
function ownerDetail(o: Owner, w: World): string {
	switch (o.kind) {
		case 'character':
			return o.id === w.activeCharacterId ? 'character (active)' : 'character';
		case 'foe':
			return `foe${o.id === w.activeFoeId ? ' (active)' : ''}${o.enc.vanquished ? ', vanquished' : ''}`;
		case 'journey':
		case 'site':
		case 'scene':
			return `${o.kind}${o.id === w.activeExpeditionId ? ' (active)' : ''}`;
		case 'vow':
			return 'vow';
		case 'asset':
			return o.given ? `${o.name} (companion)` : 'asset';
	}
}

/** The first slot: everything that can start a command. */
function firstSlot(typed: string, w: World): Suggestion[] {
	const rows: { row: Suggestion; names: string[] }[] = [];
	for (const k of SELECT_KINDS)
		rows.push({
			row: { label: k, detail: `${k} — ${activeName(k, w)}`, icon: k, apply: `/${k}` },
			names: [k],
		});
	const ch = activeCharacter(w);
	// companions, allies, everyone: when they stand for someone.
	for (const kw of GROUP_KEYWORDS) {
		const list = groupOwners(kw, w);
		if ('error' in list || (kw === 'everyone' && list.length < 2)) continue;
		rows.push({
			row: {
				label: kw,
				detail: `${GROUP_HINT[kw]} — ${list.map(ownerLabel).join(', ')}`,
				icon: kw === 'companions' ? 'asset' : 'character',
				apply: `/${kw}.`,
			},
			names: [kw],
		});
	}
	if (ch)
		for (const spec of valuesOf(ch, w.cat))
			rows.push({ row: valueRow(spec, `/${spec.key}`), names: [spec.key, spec.label] });
	// The active foe's and expedition's values, through their keyword, so
	// `/pro` offers `foe.progress`: the same few keys as the character's.
	const foe = activeFoe(w);
	const exp = activeExpedition(w);
	const actives: [string, Owner][] = [];
	if (foe) actives.push(['foe', foe]);
	if (exp) actives.push([exp.kind, exp]);
	for (const [kw, o] of actives)
		for (const spec of valuesOf(o, w.cat)) {
			const key = `${kw}.${spec.key}`;
			rows.push({
				row: {
					...valueRow(spec, `/${key}`),
					label: key,
					detail: `${o.name} — ${spec.label} ${valueText(spec)}`,
				},
				names: [key, spec.key, spec.label],
			});
		}
	for (const v of VERBS)
		rows.push({
			row: {
				label: v,
				detail: VERB_HINTS[v],
				icon: 'verb',
				apply: v === 'burn' ? '/burn' : `/${v} `,
			},
			names: [v],
		});
	for (const o of namedOwners(w)) {
		const ref = ownerRef(o, w);
		rows.push({
			row: { label: ownerLabel(o), detail: ownerDetail(o, w), icon: o.kind, apply: `/${ref}.` },
			names: o.kind === 'asset' ? [o.name, o.id, o.given].filter(Boolean) : [o.name],
		});
	}
	return ranked(rows, typed, (r) => r.names).map((r) => r.row);
}

/** After `owner.`: that owner's values. */
function valueSlot(ownerText: string, typed: string, owner: Owner, w: World): Suggestion[] {
	const specs = valuesOf(owner, w.cat).filter((s) => !s.party);
	return ranked(specs, typed, (s) => [s.key, s.label]).map((s) =>
		valueRow(s, `/${ownerText}.${s.key}`),
	);
}

/** The operators that fit a value, each with its result where it has one. */
function operatorSlot(target: string, spec: ValueSpec, partial: string, w: World): Suggestion[] {
	const locked = !spec.writable || spec.kind === 'notes';
	if (locked)
		return [
			{
				label: '(show)',
				detail: `${spec.label} is read-only — ${valueText(spec)}`,
				icon: 'lock',
				apply: target,
			},
		];
	const result = (op: Op, operand = ''): string => {
		const harmFoe = activeFoe(w);
		const harm =
			harmFoe && !harmFoe.enc.vanquished
				? { n: w.cat.foe(harmFoe.enc).harm, from: harmFoe.name }
				: undefined;
		const r = planChange(spec, op, operand, harm);
		return r.ok ? r.summary : r.message;
	};
	const rows: Suggestion[] = [];
	const add = (label: string, detail: string, apply = `${target}${label}`) =>
		rows.push({ label, detail, icon: 'op', apply });
	switch (spec.kind) {
		case 'number':
		case 'track': {
			// In a fight, health most often takes the foe's harm: that comes
			// first, so `/he`, Tab, Tab, Enter takes it.
			const foe = activeFoe(w);
			if (spec.key === 'health' && foe && !foe.enc.vanquished) add('-=harm', result('-=', 'harm'));
			add('++', result('++'));
			add('--', result('--'));
			add('+=', spec.kind === 'track' ? 'add marks (b boxes, t ticks)' : 'add an amount');
			add('-=', spec.kind === 'track' ? 'take away marks' : 'take away an amount');
			add('=', 'set it');
			break;
		}
		case 'bool':
			add('++', result('++'));
			add('--', result('--'));
			add('!', result('!'));
			break;
		case 'list':
			add('=', spec.custom ? 'choose an option, or type your own' : 'choose an option');
			break;
		case 'text':
			add('=', 'set the text');
			break;
	}
	return partial ? rows.filter((r) => r.label.startsWith(partial)) : rows;
}

/** After `=` on a list: its options, the current one ticked. */
function optionSlot(target: string, spec: ValueSpec, typed: string): Suggestion[] {
	const now = String(spec.get());
	const rows = ranked(spec.options ?? [], typed, (o) => [o.label, o.id]).map((o) => ({
		label: o.label,
		detail: o.id === now ? 'current' : '',
		icon: 'option' as const,
		apply: `${target}=${o.label}`,
		current: o.id === now,
	}));
	const t = typed.trim();
	if (spec.custom && t && !rows.some((r) => normName(r.label) === normName(t)))
		rows.push({
			label: `Use “${t}”`,
			detail: 'your own value',
			icon: 'option',
			apply: `${target}=${t}`,
			current: false,
		});
	return rows;
}

/** After `+=`, `-=` or `=` with a number on a track: the units, with what
 *  each comes to. */
function unitSlot(target: string, op: Op, n: string, spec: ValueSpec, w: World): Suggestion[] {
	void w;
	const units: [string, string][] = [
		['', spec.ticksPerMark ? `marks (${spec.rank})` : 'ticks'],
		['b', 'boxes'],
		['t', 'ticks'],
	];
	return units
		.filter(([u]) => u !== 't' || spec.ticksPerMark)
		.map(([u, what]) => {
			const r = planChange(spec, op, `${n}${u}`);
			return {
				label: `${n}${u}`,
				detail: `${what}: ${r.ok ? r.summary.replace(/^[^ ]+ /, '') : r.message}`,
				icon: 'unit' as const,
				apply: `${target}${op}${n}${u}`,
			};
		});
}

/** After `/foe=`: the foes, the active one ticked. */
function selectSlot(kind: SelectKind, typed: string, w: World): Suggestion[] {
	const list = (
		kind === 'character' ? w.characters : kind === 'foe' ? w.foes : w.expeditions
	).filter((o) => o.kind === kind) as Owner[];
	const activeId =
		kind === 'character'
			? w.activeCharacterId
			: kind === 'foe'
				? w.activeFoeId
				: w.activeExpeditionId;
	return ranked(list, typed, (o) => [o.name]).map((o) => {
		const same = list.filter((x) => normName(x.name) === normName(o.name));
		const name = same.length > 1 ? `${o.name}#${same.indexOf(o) + 1}` : o.name;
		return {
			label: name,
			detail: o.id === activeId ? 'active' : ownerDetail(o, w),
			icon: kind,
			apply: `/${kind}=${name}`,
			current: o.id === activeId,
		};
	});
}

function verbSlot(verb: Verb, arg: string, w: World): Suggestion[] {
	switch (verb) {
		case 'move': {
			const typed = arg.replace(/\s+\d+$/, '');
			// A name two moves share is written as the move's id instead.
			const shared = (name: string) =>
				w.moves.filter((x) => normName(x.name) === normName(name)).length > 1;
			return ranked(w.moves, typed, (m) => [m.name]).map((m) => ({
				label: m.name,
				detail: [m.category, m.blocked].filter(Boolean).join(' — '),
				icon: 'move',
				apply: `/move ${shared(m.name) ? m.id.replace(/^move\//, '').replace(/-/g, ' ') : m.name}`,
				disabled: m.blocked ?? undefined,
			}));
		}
		case 'oracle':
			return ranked(w.oracles, arg, (o) => [o.title, o.key]).map((o) => ({
				label: o.title,
				detail: o.source ?? '',
				icon: 'oracle',
				apply: `/oracle ${o.title}`,
			}));
		case 'roll':
			return ROLL_PRESETS.filter((p) => !arg || p.label.startsWith(arg.toLowerCase())).map((p) => ({
				label: p.label,
				detail: p.detail,
				icon: 'dice',
				apply: `/roll ${p.label}`,
			}));
		case 'story':
			return STORY_ACTIONS.filter((a) => a.startsWith(arg.toLowerCase())).map((a) => ({
				label: a,
				detail:
					a === 'start'
						? 'mark the newest entry as the start'
						: a === 'end'
							? 'mark the newest entry as the end'
							: 'open Generate on the section',
				icon: 'verb',
				apply: `/story ${a}`,
			}));
		case 'help':
			return ranked(HELP_TOPICS, arg, (t) => [t.id, t.label]).map((t) => ({
				label: t.id,
				detail: t.label,
				icon: 'help',
				apply: `/help ${t.id}`,
			}));
		default:
			return [];
	}
}

/** The text before the operator, as typed (for building `apply`). */
function targetText(input: string, p: Extract<Parsed, { kind: 'value' }>): string {
	const end = p.opStart ?? (p.partialOp ? input.lastIndexOf(p.partialOp) : input.length);
	return input.slice(0, end).trimEnd();
}

/** The rows for what's typed so far. */
function rowsFor(input: string, w: World): Suggestion[] {
	const p = parseCommand(input);
	if (p.kind === 'verb') {
		// `/move` with no space after it yet is still the first slot.
		if (!p.arg && !/\s$/.test(input)) return firstSlot(p.verb, w);
		return verbSlot(p.verb, p.arg, w);
	}
	if (p.kind !== 'value') return [];
	const target = targetText(input, p);
	const valueTyped = p.value.text;

	// After an operator.
	if (p.op) {
		const operand = p.operand ?? '';
		// /foe=…, /character=…
		const t = normName(valueTyped);
		if (
			!p.owner &&
			!p.value.quoted &&
			(SELECT_KINDS as readonly string[]).includes(t) &&
			p.op === '='
		)
			return selectSlot(t as SelectKind, operand, w);
		const spec = specFor(p, w);
		if (!spec) return [];
		if (p.op === '=' && spec.kind === 'list') return optionSlot(target, spec, operand);
		if (spec.kind === 'track' && p.op !== '++' && p.op !== '--' && p.op !== '!') {
			const n = operand.match(/^(\d+)$/);
			if (n) return unitSlot(target, p.op, n[1]!, spec, w);
		}
		if (
			spec.kind === 'number' &&
			(p.op === '-=' || p.op === '+=') &&
			'harm'.startsWith(operand.toLowerCase()) &&
			operand
		) {
			const f = activeFoe(w);
			if (f && !f.enc.vanquished) {
				const r = planChange(spec, p.op, 'harm', { n: w.cat.foe(f.enc).harm, from: f.name });
				return [
					{
						label: 'harm',
						detail: r.ok ? r.summary : r.message,
						icon: 'unit',
						apply: `${target}${p.op}harm`,
					},
				];
			}
		}
		return [];
	}

	// Typing a value after `owner.`.
	if (p.dot && p.owner) {
		const stand = groupStandIn(p.owner, w);
		const owner = stand ?? resolveOwner(p.owner, w, undefined);
		if ('error' in owner) return [];
		const spec = findValue(owner, valueTyped, w.cat);
		const ownerText = input.slice(input.indexOf('/') + 1, input.lastIndexOf('.')).trim();
		// For every companion, each operator says what it does to them all.
		const ops = (partial: string) => {
			const rows = operatorSlot(target, spec!, partial, w);
			if (!stand) return rows;
			return rows.map((r) => {
				const pl = plan(r.apply, w);
				return pl.kind === 'changes' ? { ...r, detail: pl.summary } : r;
			});
		};
		if (spec && normName(spec.key) === normName(valueTyped) && !p.partialOp && /\S$/.test(input))
			return ops('');
		if (spec && p.partialOp) return ops(p.partialOp);
		return valueSlot(ownerText, valueTyped, owner, w);
	}

	// One name, no dot: a value of the active character, a keyword, or a name.
	const t = normName(valueTyped);
	if (!p.value.quoted && (SELECT_KINDS as readonly string[]).includes(t) && !p.partialOp) {
		// `/foe`: its values, or choose one.
		const o = resolveOwner({ ...p.value, text: t, quoted: false }, w);
		const rows: Suggestion[] = [
			{ label: '=', detail: `choose the active ${t}`, icon: 'op', apply: `/${t}=` },
		];
		if (!('error' in o))
			rows.unshift(
				...valuesOf(o, w.cat)
					.filter((s) => !s.party)
					.map((s) => valueRow(s, `/${t}.${s.key}`)),
			);
		return rows;
	}
	if (!p.value.quoted && characterValueKeys(w.cat).some((k) => k.toLowerCase() === t)) {
		const ch = activeCharacter(w);
		const spec = ch && findValue(ch, t, w.cat);
		if (spec) return operatorSlot(target, spec, p.partialOp ?? '', w);
	}
	return firstSlot(valueTyped, w);
}

/** A group keyword as an owner: its first member stands in for the rest
 *  (they share their values), so the value and operator rows can be built. */
function groupStandIn(n: NamePart, w: World): Owner | undefined {
	const kw = groupKeyword(n);
	if (!kw) return undefined;
	const list = groupOwners(kw, w);
	return 'error' in list ? undefined : list[0];
}

/** The value a parsed command names, if it names one. */
function specFor(p: Extract<Parsed, { kind: 'value' }>, w: World): ValueSpec | undefined {
	if (p.owner) {
		const stand = groupStandIn(p.owner, w);
		if (stand) return findValue(stand, p.value.text, w.cat);
		const o = resolveOwner(p.owner, w, p.value.text);
		return 'error' in o ? undefined : findValue(o, p.value.text, w.cat);
	}
	const ch = activeCharacter(w);
	return ch ? findValue(ch, p.value.text, w.cat) : undefined;
}

/** What the top row says Enter does. */
export function topRow(pl: Plan): TopRow {
	switch (pl.kind) {
		case 'empty':
			return { text: '', tone: 'none' };
		case 'error':
			return { text: pl.message, tone: 'error' };
		case 'incomplete':
			return { text: pl.message, tone: 'incomplete' };
		case 'show':
			return { text: `Enter: ${pl.text}`, tone: 'ok' };
		case 'change':
		case 'changes':
			return { text: `Enter: ${pl.summary}`, tone: pl.nothing ? 'none' : 'ok' };
		default:
			return { text: `Enter: ${pl.summary}`, tone: 'ok' };
	}
}

/** The suggestions and top row for what's in the command bar. */
export function suggest(input: string, w: World): Suggestions {
	const pl = plan(input, w);
	const rows = input.trimStart().startsWith('/')
		? rowsFor(input.trimStart(), w).slice(0, MAX_ROWS)
		: [];
	return { top: topRow(pl), rows, plan: pl };
}

/** The ghost text: the rest of a suggestion after what's typed, when the
 *  suggestion carries on from it. */
export function ghostText(input: string, s: Suggestion | undefined): string {
	if (!s || !input) return '';
	return s.apply.toLowerCase().startsWith(input.toLowerCase()) ? s.apply.slice(input.length) : '';
}

export { quoteName, isReserved };
