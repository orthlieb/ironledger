/**
 * badgeStyles.ts — shared rank/difficulty pill styling.
 *
 * Single source of truth for the rank pill style (translucent rank tint +
 * rank hue as text) that was copy-pasted as `rankBadgeStyle` / `diffBadgeStyle`
 * across FoesArea, FoePickerDialog, DenizenDialog, and ExpeditionsArea.
 */
import { RANK_COLORS } from '$lib/foeStore.svelte.js';

/** Expedition difficulty label → foe rank number (1–5). */
export const DIFFICULTY_RANK: Record<string, number> = {
	troublesome: 1,
	dangerous: 2,
	formidable: 3,
	extreme: 4,
	epic: 5,
};

/** Inline style for a rank pill (1–5): translucent tint + rank hue as text. */
export function rankBadgeStyle(rank: number): string {
	const rc = RANK_COLORS[rank];
	return rc ? `background:${rc.bg}22; color:${rc.bg}` : '';
}

/** Inline style for an expedition difficulty pill (maps the label to a rank). */
export function difficultyBadgeStyle(difficulty: string): string {
	return rankBadgeStyle(DIFFICULTY_RANK[difficulty] ?? 2);
}
