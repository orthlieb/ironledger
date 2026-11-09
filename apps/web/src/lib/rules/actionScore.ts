/**
 * The action score of an action roll: the action die (0 when momentum
 * cancels it) plus the stat and any adds. Ironsworn caps it at 10, so a 10
 * on a challenge die can't be beaten however big the adds.
 */

/** The most an action score can be. */
export const ACTION_SCORE_MAX = 10;

/** The action score, and `raw`, what the die, stat and adds summed to before
 *  the cap (more than `score` only when the cap cut it down). */
export function actionScore(
	die: number,
	stat: number,
	adds: number,
): { score: number; raw: number } {
	const raw = die + stat + adds;
	return { score: Math.min(ACTION_SCORE_MAX, raw), raw };
}

/** The score as the roll line shows it, bold; a capped one after its sum,
 *  struck through ("<s>12</s> 10"), as a cancelled action die is. */
export function actionScoreHtml({ score, raw }: { score: number; raw: number }): string {
	return raw > score
		? `<s>${raw}</s>&thinsp;<strong>${score}</strong>`
		: `<strong>${score}</strong>`;
}
