/**
 * Starting-stat arrays for character creation.
 *
 * Ironsworn ships one array (the "standard array" — 3/2/2/1/1); Lodestar's
 * *Alternate Stat Arrays* rule offers two more, tuned to shift the tone
 * of a campaign up or down. When Lodestar is enabled the New Character
 * dialog offers the picker; otherwise the standard array is the only
 * option and the picker collapses.
 *
 * `rollStats` shuffles an array's values across the five stats via
 * Fisher-Yates. `rng` is injectable so tests can drive it deterministically.
 */

/** The five character stats, in the order the stat row displays them and
 *  the order values from a StatArray map onto by `rollStats`. */
export const STATS = ['edge', 'heart', 'iron', 'shadow', 'wits'] as const;

/** Stat key type — one of `STATS`. */
export type Stat = (typeof STATS)[number];

/** A chosen bag of five stat values to distribute across the five stats. */
export interface StatArray {
	/** Stable id — the value the array picker binds to. */
	id: string;
	/** Human label shown in the picker. */
	label: string;
	/** One-line tone description ("higher stats … more in control", etc.). */
	hint: string;
	/** Exactly five values; `rollStats` shuffles this list, not the stat order. */
	values: readonly [number, number, number, number, number];
	/** When true, the array picker starts on this option. At most one array
	 *  per source ruleset should carry this flag; when none does, the picker
	 *  falls back to `arrays[0]`. Kept separate from list order so the
	 *  dropdown can present arrays in a canonical rulebook order (Lodestar
	 *  lists Challenging → Perilous → Grim by tone-escalation) while still
	 *  pre-selecting the RAW default. */
	default?: boolean;
}

/** Ironsworn's standard array — the Lodestar "Perilous" default reuses this
 *  bag, so the base game and Lodestar's default agree on values (the label +
 *  hint differ). Used both stand-alone (no Lodestar) and via `LODESTAR_ARRAYS`. */
export const BASE_ARRAY: StatArray = {
	id: 'standard',
	label: 'Standard Array',
	hint: 'The default Ironsworn starting array — a moderately dangerous campaign.',
	values: [3, 2, 2, 1, 1],
	default: true,
};

/** Lodestar's *Alternate Stat Arrays* — one bag per tone.
 *  Source: Lodestar's "Fine-tune the tone and challenge of your Ironsworn
 *  campaign" rule; Perilous is the RAW default (and reuses the standard
 *  array's values). Values quoted verbatim from the ruleset; list order
 *  follows the rulebook's tone-escalation Challenging → Perilous → Grim,
 *  independent of which one is the default pick. */
export const LODESTAR_ARRAYS: readonly StatArray[] = [
	{
		id: 'challenging',
		label: 'Challenging',
		hint: 'Higher stats put your character more in control.',
		values: [4, 3, 3, 2, 2],
	},
	{
		id: 'perilous',
		label: 'Perilous',
		hint: 'The standard Ironsworn array — a moderately dangerous campaign.',
		values: [3, 2, 2, 1, 1],
		default: true,
	},
	{
		id: 'grim',
		label: 'Grim',
		hint: 'Lower stats create a riskier and more chaotic story.',
		values: [3, 2, 1, 1, 0],
	},
];

/** The arrays offered to the user right now.
 *
 *  @param lodestarEnabled - true when the Lodestar ruleset is loaded (typically
 *    `isSourceEnabled('lodestar')`), returning its three options; false → just
 *    `BASE_ARRAY` so the caller renders a single non-configurable choice. */
export function availableStatArrays(lodestarEnabled: boolean): readonly StatArray[] {
	return lodestarEnabled ? LODESTAR_ARRAYS : [BASE_ARRAY];
}

/** Roll a stat distribution: shuffles `array.values` uniformly (Fisher-Yates)
 *  and maps the shuffled positions onto edge/heart/iron/shadow/wits in the
 *  order `STATS` declares. `rng` defaults to `Math.random` so tests can drop
 *  in a deterministic generator.
 *
 *  This never mutates `array` or `array.values` — the shuffle runs on a
 *  local copy. */
export function rollStats(array: StatArray, rng: () => number = Math.random): Record<Stat, number> {
	const shuffled = [...array.values];
	// Fisher-Yates: walk from the end, swap element i with a random one in [0, i].
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	const out = {} as Record<Stat, number>;
	for (let i = 0; i < STATS.length; i++) out[STATS[i]] = shuffled[i];
	return out;
}
