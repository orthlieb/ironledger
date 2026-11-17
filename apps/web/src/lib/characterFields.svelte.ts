// =============================================================================
// Iron Ledger — character fields from extensions
//
// An extension declares fields in its extension.json (`fields`). Party and
// character fields (a dropdown, a radio, a counter, a line of text, …) are
// shown on the sheet and in New Character, rolled from an oracle, and read by
// conditions; their values live in `character.fields`, keyed by field id.
// Global fields (mana) are shown on the assets that refer to them, and live
// in `character.globalValues`; they aren't listed here. See
// docs/character-fields.md and docs/command-language.md → Declaring fields. The pure helpers are in characterFieldsCore.ts;
// these read the extension registry and the loaded oracles.
// =============================================================================

import type { CharacterFieldDef, ExtensionInfo } from '#lib/types.js';
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

/** An extension's party and character fields: the ones on the sheet, kept in
 *  `character.fields`. Its global fields are its assets'. */
function sheetFields(e: ExtensionInfo): CharacterFieldDef[] {
	return (e.fields ?? []).filter((f) => f.scope !== 'global');
}

/** Every declared field, enabled or not, in extension order then declaration
 *  order: what preconditions and saved values resolve against. */
export function allCharacterFields(): ResolvedField[] {
	const oracles = getOracles();
	return getExtensions().flatMap((e) =>
		sheetFields(e).map((f) => resolveField(f, e.id, oracles, resolveOracleKey)),
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
		.filter((e) => isSourceEnabled(e.id) && sheetFields(e).length)
		.map((e) => ({
			source: e.id,
			heading: e.fieldsHeading === false ? null : (e.fieldsHeading ?? e.name),
			fields: sheetFields(e).map((f) => resolveField(f, e.id, oracles, resolveOracleKey)),
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
