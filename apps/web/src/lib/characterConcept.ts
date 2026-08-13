// =============================================================================
// Iron Ledger — Character concept → oracle key resolution (pure).
//
// The NewNPC dialog and NPC card ask for concepts ("give me a disposition")
// rather than concrete oracle keys. Which table backs each concept depends
// on which extensions are enabled and which are suppressing which. This
// module holds the pure logic — the preference map + the resolver — so
// unit tests can exercise every extension-toggle combination without
// standing up the reactive Svelte store.
//
// The `.svelte.ts` oracle store re-exports a thin wrapper that plumbs the
// live reactive state (_oracles, suppressedOracleKeys(), isSourceEnabled)
// into this pure function.
// =============================================================================

/** Character-composition concepts the NewNPC dialog + NPC card understand. */
export type CharacterConcept =
	'role' | 'goal' | 'revealedDetails' | 'activity' | 'disposition' | 'firstLook';

/** Minimal oracle shape the resolver needs. */
export interface CharacterOracleCandidate {
	key: string;
	source: string;
}

/** Oracle keys that could back each concept, in preference order (first
 *  visible key wins). Adding a new supersession later — e.g. a Starforged
 *  Character NPC Nature — is a one-line entry here. */
export const CHARACTER_CONCEPT_KEYS: Record<CharacterConcept, string[]> = {
	role: ['characterRole'],
	goal: ['characterGoal'],
	revealedDetails: ['characterDescriptor'],
	activity: ['charActivity'],
	disposition: ['lodestarCharacterDisposition', 'charDisposition'],
	firstLook: ['characterFirstLook'],
};

/**
 * Resolve a character concept to the oracle that should back it right now,
 * honoring both extension source-gating and the suppression list. Returns
 * null when nothing visible backs the concept.
 *
 * Pure — takes the oracle list, suppression set, and enabled-source
 * predicate as arguments so it can be tested without the reactive store.
 * The `.svelte.ts` wrapper reads the live reactive state.
 */
export function resolveCharacterConcept<T extends CharacterOracleCandidate>(
	concept: CharacterConcept,
	oracles: T[],
	suppressed: ReadonlySet<string>,
	isSourceEnabled: (source: string) => boolean,
): T | null {
	for (const key of CHARACTER_CONCEPT_KEYS[concept]) {
		const o = oracles.find((x) => x.key === key);
		if (!o) continue;
		if (suppressed.has(o.key)) continue;
		if (!isSourceEnabled(o.source)) continue;
		return o;
	}
	return null;
}
