// =============================================================================
// Iron Ledger — Foe extras-bag reader.
//
// FoeDef.extras is a per-extension namespace bag: each extension owns a
// key under its manifest id (`extras.yrt.*`, `extras.delve.*`, …) and
// stores whatever custom flags/data it needs on the catalogue record.
// This keeps core types extension-agnostic — no more `escalates?: boolean`
// with a "YRT extension" JSDoc on the shared type.
//
// Consumers read through `foeExtra(def, 'yrt', 'escalates')` etc. so the
// per-extension shape stays isolated at the call site (and any future
// per-extension typing can be layered on later without touching every
// reader).
// =============================================================================

import type { FoeDef } from '$lib/types.js';

/** Read one extras-bag value: `def.extras?.<ext>?.<key>`. Returns undefined
 *  when the def, the extension's bag, or the key is missing. */
export function foeExtra<T = unknown>(
	def: FoeDef | undefined | null,
	ext: string,
	key: string,
): T | undefined {
	const bag = def?.extras?.[ext] as Record<string, unknown> | undefined;
	return bag?.[key] as T | undefined;
}

/** Convenience — coerces to boolean for flag-shaped extras. `false` when
 *  the def is missing or the flag is absent/falsy. */
export function foeExtraFlag(def: FoeDef | undefined | null, ext: string, key: string): boolean {
	return !!foeExtra(def, ext, key);
}
