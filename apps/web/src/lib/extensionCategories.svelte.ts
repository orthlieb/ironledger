// =============================================================================
// Iron Ledger — Move / Oracle category resolver (from the extension manifest).
//
// Each extension's `extension.json` declares the move + oracle categories it
// introduces, with per-category icon, tint colour, and sort slot (see
// CategoryDef in @ironledger/shared). This module merges those records
// across every enabled extension into a single source of truth for:
//
//   • picker order for moves (moveStore's CATEGORY_ORDER was the old
//     hardcoded fallback)
//   • per-category icon lookup (replaces iconRegistry's MOVE_CAT_ICON /
//     ORACLE_CAT_ICON)
//   • per-category tint colour (replaces the CATEGORY_COLORS maps that
//     lived inside MovesDialog and OraclesDialog)
//
// First-declared wins on duplicate `key` (legitimate: an extension that
// only adds moves to an existing category doesn't redeclare it; the base
// definition still governs).
//
// Missing `order` → sorts last (Infinity). Oracle pickers keep their
// alphabetical sort and only read the icon+colour off these records.
//
// The lookup functions read the reactive `_registry` + `_enabled` maps
// from expansionStore, so consumers re-render the moment the user toggles
// an expansion in Settings.
// =============================================================================

import type { CategoryDef, ExtensionInfo } from '$lib/types.js';
import { getExtensions, isSourceEnabled } from './expansionStore.svelte.js';

/** Merge all `moveCategories` (or `oracleCategories`) across enabled extensions.
 *  Reactive on the enabled-map because getExtensions reads it via isSourceEnabled. */
function mergeCategories(
	pick: (e: ExtensionInfo) => CategoryDef[] | undefined,
): Map<string, CategoryDef> {
	const out = new Map<string, CategoryDef>();
	for (const e of getExtensions()) {
		if (!isSourceEnabled(e.id)) continue;
		for (const c of pick(e) ?? []) {
			if (!out.has(c.key)) out.set(c.key, c);
		}
	}
	return out;
}

function orderKey(c: CategoryDef | undefined): number {
	return c?.order ?? Number.POSITIVE_INFINITY;
}

// ---------------------------------------------------------------------------
// Move categories
// ---------------------------------------------------------------------------

/** All move-category records from every enabled extension, deduped. */
export function moveCategories(): CategoryDef[] {
	return [...mergeCategories((e) => e.moveCategories).values()];
}

/** Categories in picker-sort order — the array `moveStore` consults instead
 *  of its old hardcoded CATEGORY_ORDER. Missing `order` sorts last. */
export function moveCategoryOrder(): string[] {
	return moveCategories()
		.slice()
		.sort((a, b) => orderKey(a) - orderKey(b) || a.key.localeCompare(b.key))
		.map((c) => c.key);
}

/** One record for a specific move category (icon + tint + order). */
export function moveCategoryMeta(key: string | undefined | null): CategoryDef | undefined {
	if (!key) return undefined;
	return mergeCategories((e) => e.moveCategories).get(key);
}

// ---------------------------------------------------------------------------
// Oracle categories
// ---------------------------------------------------------------------------

/** All oracle-category records from every enabled extension, deduped. */
export function oracleCategories(): CategoryDef[] {
	return [...mergeCategories((e) => e.oracleCategories).values()];
}

export function oracleCategoryMeta(key: string | undefined | null): CategoryDef | undefined {
	if (!key) return undefined;
	return mergeCategories((e) => e.oracleCategories).get(key);
}
