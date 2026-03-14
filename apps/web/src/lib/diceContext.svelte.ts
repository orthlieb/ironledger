// =============================================================================
// Iron Ledger — Active Dice Context
//
// Module-level $state that CharacterSheet writes to when it becomes the
// active character. The layout reads it to enable the dice button and
// supply charId + live data to DiceRollerDialog.
// =============================================================================

import type { CharacterData } from '$lib/types.js';

export interface DiceCtx {
	charId:   string;
	charName: string;
	data:     CharacterData; // direct reference to CharacterSheet's $state — always live
}

let _ctx = $state<DiceCtx | null>(null);

/** Reactive context for the currently active character. Null when no character is selected. */
export function getActiveDiceCtx(): DiceCtx | null { return _ctx; }

/** Set (or clear) the active dice context. Called by CharacterSheet. */
export function setActiveDiceCtx(ctx: DiceCtx | null): void { _ctx = ctx; }
