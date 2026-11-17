// =============================================================================
// Iron Ledger — character fields: the pure helpers
//
// Option ids, values, visibility, rolls and precondition messages for the
// fields extensions add to a character (docs/character-fields.md). Nothing
// here reads a store; characterFields.svelte.ts wires them to the live
// extension registry and oracles.
// =============================================================================

import type { CharacterFieldDef } from '#lib/types.js';
import type { OracleEntry, OracleFile } from '#lib/oracleStore.svelte.js';
import { stripInline } from '#lib/markdown.js';
import { evaluateCondition, type CompareOp, type Reading } from '@ironledger/shared';
import { parsedCondition } from '#lib/conditionCache.js';

/** One choice of a dropdown or radio field; `row` is its oracle row, for an
 *  `optionsFrom` field. */
export interface FieldOption {
	id: string;
	label: string;
	row?: OracleEntry;
}

/** A declared field with its extension and its options resolved. */
export interface ResolvedField extends CharacterFieldDef {
	source: string;
	options: FieldOption[];
}

type Values = Record<string, string> | undefined;
/** A comparison as bounds on a number, for messages: `touched >= prime` is
 *  `{ min: 1 }`. */
export interface Bound {
	min?: number;
	max?: number;
	eq?: number;
	ne?: number;
}

/** A dropdown or radio: a choice among options, stored as the option id. */
export const isChoice = (f: { type: string }) => f.type === 'dropdown' || f.type === 'radio';
/** A string or markdown field: free text, which preconditions can't read. */
export const isText = (f: { type: string }) => f.type === 'string' || f.type === 'markdown';

/** An option id from its label: lower case, each run of other characters a
 *  `-` ("Oray Hills" → "oray-hills"). Same rule as gen-extensions-manifest. */
export function optionId(label: string): string {
	return label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** A field's options: as declared, or one per row of its `optionsFrom`
 *  oracle (none until the oracles load). The oracle goes through
 *  `resolveKey`, so an extension that supersedes it supplies the options:
 *  YRT's regions replace the core Region of origin list. */
export function fieldOptions(
	def: CharacterFieldDef,
	oracles: OracleFile[],
	resolveKey: (key: string) => string = (k) => k,
): FieldOption[] {
	if (!isChoice(def)) return [];
	if (def.options) return def.options.map((o) => ({ id: o.id, label: o.label }));
	const from = def.optionsFrom;
	if (!from) return [];
	const prop = from.label ?? 'value';
	const oracle = oracles.find((o) => o.key === resolveKey(from.oracle));
	return (oracle?.data ?? [])
		.map((row) => {
			const label = typeof row[prop] === 'string' ? (row[prop] as string) : '';
			return { id: optionId(label), label, row };
		})
		.filter((o) => o.id);
}

/** Resolve a declaration against the loaded oracles. */
export function resolveField(
	def: CharacterFieldDef,
	source: string,
	oracles: OracleFile[],
	resolveKey: (key: string) => string = (k) => k,
): ResolvedField {
	return { ...def, source, options: fieldOptions(def, oracles, resolveKey) };
}

/** The character's value for a field: what's stored, else the default. */
export function fieldValue(field: CharacterFieldDef, values: Values): string {
	return values?.[field.id] ?? field.default;
}

/** A choice field's value as the option's position, from 0; −1 when unset
 *  or no option matches. */
export function optionIndex(field: ResolvedField, value: string): number {
	if (!value) return -1;
	return field.options.findIndex((o) => o.id === value);
}

/** A counter's value as a whole number, 0 to its `maxValue`. */
export function counterValue(field: CharacterFieldDef, value: string): number {
	const n = Math.floor(Number(value));
	const max = field.maxValue ?? Infinity;
	return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
}

/** A field's value as the number a precondition compares: a choice's option
 *  position (−1 unset), a counter's count, a switch's 1 or 0. NaN for text,
 *  which preconditions can't read. */
export function fieldNumber(field: ResolvedField, value: string): number {
	if (isChoice(field)) return optionIndex(field, value);
	if (field.type === 'counter') return counterValue(field, value);
	if (field.type === 'switch') return value === '1' ? 1 : 0;
	return NaN;
}

/** What the sheet and log show for a value: a choice's label (or the stored
 *  id when no option matches, a renamed oracle row), a count, on or off, or
 *  the text itself. */
export function valueLabel(field: ResolvedField, value: string): string {
	if (isChoice(field)) return field.options.find((o) => o.id === value)?.label ?? value;
	if (field.type === 'counter') return String(counterValue(field, value));
	if (field.type === 'switch') return value === '1' ? 'on' : 'off';
	return value;
}

/** Whether a number passes a precondition's operators. */
export function passes(v: number, c: Bound): boolean {
	if (c.min !== undefined && v < c.min) return false;
	if (c.max !== undefined && v > c.max) return false;
	if (c.eq !== undefined && v !== c.eq) return false;
	if (c.ne !== undefined && v === c.ne) return false;
	return true;
}

/** Whether a field shows: its `if` conditions pass against the fields they
 *  name (declared above it, in its extension). */
/**
 * A field as a condition reads it (docs/command-language.md → Conditions): a
 * dropdown or radio as a list (its option's position, −1 unset), a counter
 * as a number, a switch as true/false, text as its length.
 */
export function fieldReading(field: ResolvedField, value: string): Reading {
	if (isChoice(field))
		return {
			kind: 'list',
			// A custom value (a `custom` dropdown's typed text) is chosen but has
			// no place in the options' order: it reads past the last one, which
			// only "is one chosen?" looks at (the content checker allows nothing
			// else on such a field).
			value:
				field.custom && value && optionIndex(field, value) < 0
					? field.options.length
					: optionIndex(field, value),
			option: (word) => {
				const id = matchOption(field, word);
				return id === null ? -1 : optionIndex(field, id);
			},
		};
	if (field.type === 'counter') return { kind: 'number', value: counterValue(field, value) };
	if (field.type === 'switch') return { kind: 'bool', value: value === '1' ? 1 : 0 };
	return { kind: 'text', value: value.length };
}

/** Whether a field shows: its `if` holds, read against the other fields. A
 *  name that isn't a field reads as unset (the content checker allows only
 *  fields declared above it). */
export function fieldShown(
	field: CharacterFieldDef,
	values: Values,
	byId: (id: string) => ResolvedField | undefined,
): boolean {
	if (!field.if) return true;
	const node = parsedCondition(field.if);
	if (!node) return true;
	return evaluateCondition(node, (t) => {
		const other = t.owner ? undefined : byId(t.name);
		return other ? fieldReading(other, fieldValue(other, values)) : { kind: 'exists', value: 0 };
	});
}

/** A comparison as bounds, for fieldRequirement: `>= 1` is `{ min: 1 }`,
 *  `> 1` is `{ min: 2 }`. */
export function boundFor(op: CompareOp, n: number): Bound {
	switch (op) {
		case '>=':
			return { min: n };
		case '>':
			return { min: n + 1 };
		case '<=':
			return { max: n };
		case '<':
			return { max: n - 1 };
		case '==':
			return { eq: n };
		case '!=':
			return { ne: n };
	}
}

/** The comparison that holds exactly when `op` doesn't: for "not (a >= 2)". */
export function negateOp(op: CompareOp): CompareOp {
	const flip: Record<CompareOp, CompareOp> = {
		'>=': '<',
		'<': '>=',
		'<=': '>',
		'>': '<=',
		'==': '!=',
		'!=': '==',
	};
	return flip[op];
}

/** The option a rolled or typed value names, by id or label, ignoring case;
 *  null when none does. */
export function matchOption(field: ResolvedField, raw: string): string | null {
	const want = raw.trim().toLowerCase();
	if (!want) return null;
	const hit =
		field.options.find((o) => o.id === want || o.label.toLowerCase() === want) ??
		field.options.find((o) => o.id === optionId(raw));
	return hit?.id ?? null;
}

/**
 * A character's field values from an import, tidied into what the sheet
 * stores. A dropdown or radio may name its option by label ("Barrier
 * Islands") or by its id in any case; either way the id is kept, and a value
 * that names no option keeps its text, as the sheet does. A counter keeps its
 * count within its maximum; a switch is `"1"` or `"0"` (true, yes and on
 * count as on). Numbers and booleans become text; anything else (an object, a
 * list) is dropped, as is a `fields` that isn't an object. An empty value
 * stays empty. A field id no extension declares keeps its value: the
 * extension may be off or missing on this install.
 */
export function cleanFieldValues(
	raw: unknown,
	byId: (id: string) => ResolvedField | undefined,
): Record<string, string> {
	const out: Record<string, string> = {};
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
	for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
		let text: string;
		if (typeof v === 'string') text = v;
		else if (typeof v === 'number' && Number.isFinite(v)) text = String(v);
		else if (typeof v === 'boolean') text = v ? '1' : '0';
		else continue;
		const f = byId(id);
		if (!f || text === '' || isText(f)) out[id] = text;
		else if (isChoice(f)) out[id] = matchOption(f, text) ?? text;
		else if (f.type === 'counter') out[id] = String(counterValue(f, text));
		else if (f.type === 'switch') out[id] = /^(1|true|yes|on)$/i.test(text.trim()) ? '1' : '0';
		else out[id] = text;
	}
	return out;
}

/**
 * The character's fields as Markdown for the export: a `## Details` section
 * with what the sheet's Details tab shows (the enabled extensions' fields
 * whose `if` passes), each extension's under its heading. A field with no
 * value is left out; a markdown field's notes follow its label, indented
 * under it. No lines when nothing has a value.
 */
export function fieldsMarkdown(
	groups: Array<{ heading: string | null; fields: ResolvedField[] }>,
	values: Values,
	byId: (id: string) => ResolvedField | undefined,
): string[] {
	const lines: string[] = [];
	for (const g of groups) {
		const items: string[] = [];
		for (const f of g.fields) {
			if (!fieldShown(f, values, byId)) continue;
			const v = fieldValue(f, values);
			if (!v.trim()) continue;
			if (f.type === 'markdown') {
				items.push(
					`- **${f.label}:**`,
					...v
						.trim()
						.split('\n')
						.map((l) => (l ? `  ${l}` : '')),
				);
			} else if (f.type === 'counter') {
				items.push(`- **${f.label}:** ${counterValue(f, v)}/${f.maxValue ?? 0}`);
			} else {
				items.push(`- **${f.label}:** ${valueLabel(f, v)}`);
			}
		}
		if (!items.length) continue;
		if (g.heading) lines.push(`### ${g.heading}`);
		lines.push(...items, '');
	}
	return lines.length ? ['## Details', ...lines] : [];
}

/** A field's hover hint: its tooltip, then (for an `optionsFrom` field) the
 *  chosen row's description, or its value when that isn't just the label. */
export function fieldHint(field: ResolvedField, value: string): string {
	const parts: string[] = [];
	if (field.tooltip) parts.push(field.tooltip);
	const row = field.options.find((o) => o.id === value)?.row;
	if (row) {
		const desc = typeof row.description === 'string' ? row.description : '';
		const text = typeof row.value === 'string' ? row.value : '';
		const extra =
			desc || (text && text !== field.options.find((o) => o.id === value)?.label ? text : '');
		if (extra) parts.push(stripInline(extra));
	}
	return parts.join('\n\n');
}

/** The column a field's roll uses, from the field `roll.column` names: the
 *  key of the oracle column whose label equals that option row's property.
 *  '' when the roll has no column; null when it needs one it can't have yet. */
export function rollColumn(
	field: ResolvedField,
	oracle: OracleFile,
	values: Values,
	byId: (id: string) => ResolvedField | undefined,
): string | null {
	const col = field.roll?.column;
	if (!col) return '';
	const other = byId(col.field);
	if (!other) return null;
	const row = other.options.find((o) => o.id === fieldValue(other, values))?.row;
	const label = row?.[col.from];
	if (typeof label !== 'string' || !label) return null;
	return oracle.columns?.find((c) => c.label === label)?.key ?? null;
}

/** A roll's result for a field: the value to store, the d100 and what the
 *  log shows. */
export interface FieldRoll {
	value: string;
	roll: number;
	display: string;
}

/**
 * Roll a field's oracle: on the column `roll.column` names, if any; the row's
 * `from` property (or its value's, for an object value), else its value. A
 * choice field keeps it only if it names an option. Null when there's nothing
 * to roll, the column field is empty, or the result matches no option.
 */
export function rollField(
	field: ResolvedField,
	values: Values,
	oracles: OracleFile[],
	byId: (id: string) => ResolvedField | undefined,
	resolveKey: (key: string) => string = (k) => k,
	rng: () => number = Math.random,
): FieldRoll | null {
	if (!field.roll) return null;
	const oracle = oracles.find((o) => o.key === resolveKey(field.roll!.oracle));
	if (!oracle?.data.length) return null;
	const col = rollColumn(field, oracle, values, byId);
	if (col === null) return null;
	const roll = Math.floor(rng() * 100) + 1;
	const rows = oracle.data;
	const top = (r: OracleEntry) => (col ? (r[col] as number) : r.topRange);
	const row = rows.find((r) => roll <= top(r)) ?? rows[rows.length - 1]!;
	const from = field.roll.from;
	let raw: unknown = row.value;
	if (from) {
		raw =
			row[from] ??
			(row.value && typeof row.value === 'object'
				? (row.value as Record<string, unknown>)[from]
				: undefined);
	}
	const text = typeof raw === 'string' ? raw : raw == null ? '' : String(raw);
	if (!text) return null;
	if (isText(field)) return { value: text, roll, display: text };
	if (field.type === 'counter') {
		const n = text.match(/-?\d+/)?.[0];
		if (n === undefined) return null;
		const v = String(counterValue(field, n));
		return { value: v, roll, display: v };
	}
	if (!isChoice(field)) return null;
	const id = matchOption(field, text);
	if (!id) return null;
	return { value: id, roll, display: valueLabel(field, id) };
}

/** A precondition's failure message: for a choice, in the option labels
 *  ("Requires Touched: Prime or higher"); for a counter, in numbers
 *  ("Requires Resolve 2 or more"); for a switch, on or off ("Requires Sworn",
 *  "Requires no Sworn"). */
export function fieldRequirement(field: ResolvedField, c: Bound): string {
	if (field.type === 'switch') {
		const wantsOn = c.eq === 1 || c.ne === 0 || (c.min !== undefined && c.min >= 1);
		return wantsOn ? `Requires ${field.label}` : `Requires no ${field.label}`;
	}
	if (field.type === 'counter') {
		if (c.min !== undefined && c.max === undefined)
			return `Requires ${field.label} ${c.min} or more`;
		if (c.max !== undefined && c.min === undefined)
			return `Requires ${field.label} ${c.max} or less`;
		if (c.eq !== undefined) return `Requires ${field.label} ${c.eq}`;
		if (c.ne !== undefined) return `Requires ${field.label} other than ${c.ne}`;
		return `${field.label} requirement not met`;
	}
	const at = (i: number) => field.options[i]?.label ?? String(i);
	if (c.min !== undefined && c.max === undefined)
		return c.min <= 0
			? `Requires ${field.label}`
			: `Requires ${field.label}: ${at(c.min)} or higher`;
	if (c.max !== undefined && c.min === undefined)
		return c.max < 0
			? `Requires no ${field.label}`
			: `Requires ${field.label}: ${at(c.max)} or lower`;
	if (c.eq !== undefined) return `Requires ${field.label}: ${c.eq < 0 ? 'none' : at(c.eq)}`;
	if (c.ne !== undefined) return `Requires ${field.label}: not ${c.ne < 0 ? 'none' : at(c.ne)}`;
	return `${field.label} requirement not met`;
}
