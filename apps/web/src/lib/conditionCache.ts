// =============================================================================
// Iron Ledger — condition expressions, parsed once
//
// Moves, assets and fields carry their conditions as expression strings
// (docs/command-language.md → Conditions). They're read many times a render
// (the asset picker, the Moves list), so each string is parsed once.
// =============================================================================

import { parseCondition, type CondNode } from '@ironledger/shared';

const cache = new Map<string, CondNode | null>();

/**
 * A condition, parsed; null if it doesn't parse. The content checker
 * (scripts/gen-extensions-manifest.mjs) rejects a condition that doesn't
 * parse, so null is a backstop: it's logged once and treated as no
 * condition.
 */
export function parsedCondition(src: string): CondNode | null {
	let node = cache.get(src);
	if (node !== undefined) return node;
	const r = parseCondition(src);
	node = r.ok ? r.node : null;
	if (!r.ok) console.error(`[conditions] "${src}": ${r.error} at ${r.at}`);
	cache.set(src, node);
	return node;
}
