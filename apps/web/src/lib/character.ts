// =============================================================================
// Iron Ledger — Pure character game-logic functions
// Ported from YRT oracles-pure.js + 08-characters.js
// =============================================================================

import type { CharacterData } from './types.js';
import { DEFAULT_CHARACTER } from './types.js';

/** Count all active debilities (conditions + banes + burdens). */
export function countDebilities(d: CharacterData): number {
	return (
		(d.wounded ? 1 : 0) +
		(d.unprepared ? 1 : 0) +
		(d.shaken ? 1 : 0) +
		(d.encumbered ? 1 : 0) +
		(d.maimed ? 1 : 0) +
		(d.corrupted ? 1 : 0) +
		(d.cursed ? 1 : 0) +
		(d.tormented ? 1 : 0)
	);
}

/**
 * Maximum momentum a character can hold.
 * Each debility reduces the cap by 1 (min 0).
 */
export function maxMomentum(d: CharacterData): number {
	return Math.max(0, 10 - countDebilities(d));
}

/**
 * Momentum reset value after burning momentum.
 *   0 debilities → 2
 *   1 debility   → 1
 *   2+            → 0
 */
export function momentumReset(d: CharacterData): number {
	const n = countDebilities(d);
	if (n === 0) return 2;
	if (n === 1) return 1;
	return 0;
}

/**
 * Compute how many ticks are in a specific progress box (0-based index).
 * Progress is stored linearly (0–40) across 10 boxes of 4 ticks each.
 */
export function boxTicks(totalTicks: number, boxIndex: number): number {
	return Math.min(4, Math.max(0, totalTicks - boxIndex * 4));
}

/**
 * New total-ticks value after clicking progress box i.
 * Cycles that box: 0→1→2→3→4→0. Boxes beyond i are implicitly cleared.
 */
export function cycleBox(totalTicks: number, boxIndex: number): number {
	const current = boxTicks(totalTicks, boxIndex);
	const next = (current + 1) % 5;
	return boxIndex * 4 + next;
}

/**
 * Human-readable progress summary.
 * e.g. "3/10 boxes, 2/4 ticks"
 */
export function progressText(totalTicks: number, boxes = 10): string {
	const fullBoxes = Math.floor(totalTicks / 4);
	const remaining = totalTicks % 4;
	const parts: string[] = [];
	if (fullBoxes > 0) parts.push(`${fullBoxes}/${boxes} boxes`);
	if (remaining > 0) parts.push(`${remaining}/4 ticks`);
	return parts.join(', ');
}

/**
 * Patch missing keys onto an existing data object IN PLACE. Use when the
 * object is a Svelte 5 $state proxy and you must preserve its identity so
 * downstream bindings keep working. Replacing the object with a fresh spread
 * (as hydrateCharacter does) loses the proxy and breaks `bind:value`.
 */
export function hydrateCharacterInPlace(d: Record<string, unknown>): void {
	for (const [k, v] of Object.entries(DEFAULT_CHARACTER as unknown as Record<string, unknown>)) {
		if (d[k] === undefined) d[k] = v;
	}
}

/**
 * Resolve the display name for an asset chit. When the asset definition has
 * a `type: 'string'` custom field (e.g. companion name, ritual specialty)
 * and the user has filled it in, return that value flagged as custom.
 * Otherwise return the definition's name.
 *
 * The caller renders custom names in italics to signal they are user-supplied.
 */
export function assetDisplayName(
	asset: { assetId: string; customValues?: Record<string, string> },
	def:   { name: string; customFields?: Array<{ id: string; type: string }> } | undefined,
): { text: string; custom: boolean } {
	if (!def) return { text: asset.assetId, custom: false };
	const nameField = (def.customFields ?? []).find((f) => f.type === 'string');
	if (nameField) {
		const custom = asset.customValues?.[nameField.id]?.trim();
		if (custom) return { text: custom, custom: true };
	}
	return { text: def.name, custom: false };
}

/**
 * Compute the XP cost of moving an asset from its snapshot state to its
 * draft state, plus a one-shot purchase cost (3 XP for adding a new asset,
 * 0 for editing one already owned).
 *
 *   • Ability XP: 2 per new enable (false → true since snapshot). Disables
 *     are free (Ironsworn RAW: XP spent is sunk).
 *   • Rarity XP: only when `draftRarityId` differs from `snapshotRarityId`
 *     AND a new rarity is selected. Cleared rarities aren't refunded.
 *   • Toggling on then off within the dialog is free (state-based diff,
 *     not history-based).
 *
 * Pure function — exposed for unit testing the snapshot/diff edge cases.
 */
export function computeAssetXpDiff(args: {
	snapshotAbilities: boolean[];
	draftAbilities:    boolean[];
	snapshotRarityId?: string;
	draftRarityId?:    string;
	/** Returns the XP cost for a given rarity id, or 0 if unknown. */
	rarityXpCost:      (id: string) => number;
	/** 3 in add mode (new asset purchase), 0 in edit mode. */
	purchaseCost:      number;
}): number {
	const { snapshotAbilities, draftAbilities, snapshotRarityId, draftRarityId, rarityXpCost, purchaseCost } = args;
	let newEnables = 0;
	for (let i = 0; i < draftAbilities.length; i++) {
		if (!snapshotAbilities[i] && draftAbilities[i]) newEnables++;
	}
	let rarityXp = 0;
	if (draftRarityId !== snapshotRarityId && draftRarityId) {
		rarityXp = rarityXpCost(draftRarityId);
	}
	return purchaseCost + newEnables * 2 + rarityXp;
}

/**
 * Reconcile an imported `globalValues` map against the current catalogue.
 *   • Drops counter ids no asset declares (orphans from an older catalogue).
 *   • Drops non-numeric values (corrupted exports).
 *   • Clamps numeric values to [0, canonical maxValue] when the canonical
 *     definition provides a fixed-number maxValue. Array-typed maxValue is
 *     left unclamped (it depends on per-asset ability state we don't have
 *     at import time).
 *
 * Returns a new object — the input is not mutated. Pass an empty knownIds
 * set (or call it before the catalogue loads) and the function will return
 * the input unchanged for safety.
 */
export function reconcileGlobalValues(
	values: Record<string, string> | undefined,
	knownDefs: Map<string, { maxValue?: number | number[] }>,
): Record<string, string> {
	if (!values) return {};
	// If we don't know any global counters (catalogue not loaded), pass
	// through unchanged rather than wiping the user's saved data.
	if (knownDefs.size === 0) return { ...values };

	const out: Record<string, string> = {};
	for (const [id, raw] of Object.entries(values)) {
		const def = knownDefs.get(id);
		if (!def) continue; // unknown counter id — drop
		const n = Number(raw);
		if (!Number.isFinite(n)) continue;
		let clamped = Math.max(0, Math.floor(n));
		if (typeof def.maxValue === 'number') clamped = Math.min(clamped, def.maxValue);
		out[id] = String(clamped);
	}
	return out;
}
