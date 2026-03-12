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

/** Clamp a number between min and max (inclusive). */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
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
	return `${fullBoxes}/${boxes} boxes, ${remaining}/4 ticks`;
}

/** Merge incoming DB data onto defaults, safe against missing keys from old saves. */
export function hydrateCharacter(raw: Record<string, unknown>): CharacterData {
	return { ...DEFAULT_CHARACTER, ...raw } as CharacterData;
}
