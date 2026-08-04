// =============================================================================
// Iron Ledger — initiative downgrade
//
// Used by the Lodestar flexible "End the Fight": a move may opt in via
// `initiativeDowngrade`. When the character does NOT have initiative, a strong
// hit counts as a weak hit and a weak hit counts as a miss — the price of
// resolving the fight when you're not in control. A miss stays a miss.
//
// Hit level follows the convention used across the roll components:
//   strong = both dice hit, weak = exactly one, miss = neither.
// The returned booleans re-encode the (possibly downgraded) level so the
// existing outcome helpers (outcomeClass/outcomeLabel/getOutcomeHtml) keep
// working unchanged.
//
// `initiative`: 0 = none, 1 = character has it, 2 = foe has it. "Does not have
// initiative" is anything other than 1.
// =============================================================================

export interface DowngradeResult {
	/** Effective first-die hit after any downgrade. */
	hits1: boolean;
	/** Effective second-die hit after any downgrade. */
	hits2: boolean;
	/** True when a downgrade was actually applied (for the log note). */
	downgraded: boolean;
}

export function applyInitiativeDowngrade(
	hits1: boolean,
	hits2: boolean,
	opts: { enabled: boolean; initiative: number },
): DowngradeResult {
	const rawLevel = (hits1 ? 1 : 0) + (hits2 ? 1 : 0);
	const downgraded = opts.enabled && opts.initiative !== 1 && rawLevel > 0;
	const level = downgraded ? rawLevel - 1 : rawLevel;
	return { hits1: level >= 1, hits2: level >= 2, downgraded };
}
