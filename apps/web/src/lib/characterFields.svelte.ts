// =============================================================================
// Iron Ledger — character fields from extensions
//
// An extension declares fields on the character in its extension.json
// (`characterFields`): a dropdown, a radio or a line of text, shown on the
// sheet and in New Character, rolled from an oracle, and readable by
// preconditions. Values live in `character.fields`, keyed by field id. See
// docs/character-fields.md. The pure helpers are in characterFieldsCore.ts;
// these read the extension registry and the loaded oracles.
// =============================================================================

import type { CharacterFieldDef } from '#lib/types.js';
import { getExtensions, isSourceEnabled, resolveOracleKey } from '#lib/expansionStore.svelte.js';
import { getOracles } from '#lib/oracleStore.svelte.js';
import {
	resolveField,
	rollField,
	type FieldRoll,
	type ResolvedField,
} from '#lib/characterFieldsCore.js';

export * from '#lib/characterFieldsCore.js';

type Values = Record<string, string> | undefined;

/** One extension's fields, under its heading (null: none). */
export interface FieldGroup {
	source: string;
	heading: string | null;
	fields: ResolvedField[];
}

// ---------------------------------------------------------------------------
// Store-backed
// ---------------------------------------------------------------------------

/** Every declared field, enabled or not, in extension order then declaration
 *  order: what preconditions and saved values resolve against. */
export function allCharacterFields(): ResolvedField[] {
	const oracles = getOracles();
	return getExtensions().flatMap((e) =>
		(e.characterFields ?? []).map((f) => resolveField(f, e.id, oracles)),
	);
}

/** A declared field by id, from any extension. */
export function findCharacterField(id: string): ResolvedField | undefined {
	return allCharacterFields().find((f) => f.id === id);
}

/** The enabled extensions' fields, in extension order, each extension's in
 *  declaration order, under its heading. */
export function characterFieldGroups(): FieldGroup[] {
	const oracles = getOracles();
	return getExtensions()
		.filter((e) => isSourceEnabled(e.id) && e.characterFields?.length)
		.map((e) => ({
			source: e.id,
			heading: e.characterFieldsHeading === false ? null : (e.characterFieldsHeading ?? e.name),
			fields: (e.characterFields ?? []).map((f) => resolveField(f, e.id, oracles)),
		}));
}

/** Roll a field against the live catalogue (supersession applied). */
export function rollCharacterField(field: ResolvedField, values: Values): FieldRoll | null {
	return rollField(field, values, getOracles(), findCharacterField, resolveOracleKey);
}

/** The title of the oracle a field's die rolls ("Character: Touched
 *  Aspect"), for its hover hint. */
export function rollOracleTitle(field: CharacterFieldDef): string {
	if (!field.roll) return '';
	const key = resolveOracleKey(field.roll.oracle);
	return getOracles().find((o) => o.key === key)?.title ?? key;
}
