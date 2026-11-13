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
type Condition = NonNullable<CharacterFieldDef['if']>[number];

/** An option id from its label: lower case, each run of other characters a
 *  `-` ("Oray Hills" → "oray-hills"). Same rule as gen-extensions-manifest. */
export function optionId(label: string): string {
	return label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** A field's options: as declared, or one per row of its `optionsFrom`
 *  oracle (none until the oracles load). */
export function fieldOptions(def: CharacterFieldDef, oracles: OracleFile[]): FieldOption[] {
	if (def.type === 'text') return [];
	if (def.options) return def.options.map((o) => ({ id: o.id, label: o.label }));
	const from = def.optionsFrom;
	if (!from) return [];
	const prop = from.label ?? 'value';
	const oracle = oracles.find((o) => o.key === from.oracle);
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
): ResolvedField {
	return { ...def, source, options: fieldOptions(def, oracles) };
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

/** What the sheet shows for a value: the option's label, the stored id when
 *  no option matches (a renamed oracle row), or the text itself. */
export function valueLabel(field: ResolvedField, value: string): string {
	if (field.type === 'text') return value;
	return field.options.find((o) => o.id === value)?.label ?? value;
}

/** Whether a number passes a precondition's operators. */
export function passes(v: number, c: Omit<Condition, 'key'>): boolean {
	if (c.min !== undefined && v < c.min) return false;
	if (c.max !== undefined && v > c.max) return false;
	if (c.eq !== undefined && v !== c.eq) return false;
	if (c.ne !== undefined && v === c.ne) return false;
	return true;
}

/** Whether a field shows: its `if` conditions pass against the fields they
 *  name (declared above it, in its extension). */
export function fieldShown(
	field: CharacterFieldDef,
	values: Values,
	byId: (id: string) => ResolvedField | undefined,
): boolean {
	for (const c of field.if ?? []) {
		const other = byId(c.key);
		if (!other) continue;
		if (!passes(optionIndex(other, fieldValue(other, values)), c)) return false;
	}
	return true;
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
	if (field.type === 'text') return { value: text, roll, display: text };
	const id = matchOption(field, text);
	if (!id) return null;
	return { value: id, roll, display: valueLabel(field, id) };
}

/** A precondition's failure message for a choice field, in the option
 *  labels: "Requires Touched: Prime or higher". */
export function fieldRequirement(field: ResolvedField, c: Omit<Condition, 'key'>): string {
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
