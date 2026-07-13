// =============================================================================
// Iron Ledger — matched-dice narrative note
//
// In Ironsworn a "match" (both challenge d10s show the same number) only carries
// special meaning on a strong hit or a miss — it signals a twist. A match on a
// weak hit has no special rule, so no note is added there.
//
// `hits1`/`hits2` follow the outcome convention used across the roll components:
// strong = both true, weak = exactly one true, miss = neither.
// =============================================================================

const STRONG_MATCH_NOTE =
	'A positive twist: beyond the clear success, something unexpected and good ' +
	'happens. Envision it, or Ask the Oracle.';

const MISS_MATCH_NOTE =
	'A dangerous turn: the miss brings a serious complication or a new threat. ' +
	'Envision it, or Ask the Oracle.';

/**
 * HTML for the matched-dice explanatory note, or '' when no note applies
 * (no match, or a weak-hit match). Rendered as a sibling after the outcome line.
 */
export function matchNoteHtml(hits1: boolean, hits2: boolean, isMatch: boolean): string {
	if (!isMatch) return '';
	if (hits1 && hits2) return `<div class="roll-match-note">${STRONG_MATCH_NOTE}</div>`;
	if (!hits1 && !hits2) return `<div class="roll-match-note">${MISS_MATCH_NOTE}</div>`;
	return ''; // weak hit — no special meaning in Ironsworn
}
