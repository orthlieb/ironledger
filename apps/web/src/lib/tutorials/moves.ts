/**
 * What the tutorials that make moves share (fightFoe, makeCamp): telling
 * the rolls and notes they lead the player to make from those already in
 * the log, and doing small things in the Moves dialog for them.
 */
import { getLog } from '#lib/log.svelte.js';
import { tourTarget } from './tour.js';

/** Phones and tablets (and the Tabs view) show one panel at a time. */
export const tabbed = () => !!tourTarget('tab-foes');

/** The log's move rolls, newest first. */
const rolls = () =>
	[...document.querySelectorAll<HTMLElement>('.log-entry')].filter((e) =>
		e.querySelector('.move-outcome'),
	);

/**
 * The rolls and notes made since the tour began; make it as the tour
 * starts. `newRoll` finds the newest roll it hasn't been told of, for a
 * step to point at; `done` tells it of the ones there now, as that step
 * ends; `wroteNote` is whether a note has gone in the log since.
 */
export function logWatch() {
	const seen = new Set(rolls().map((e) => e.dataset['entryId']));
	const before = new Set(getLog().map((e) => e.id));
	return {
		newRoll: () => rolls().find((e) => !seen.has(e.dataset['entryId'])) ?? null,
		done: () => rolls().forEach((e) => seen.add(e.dataset['entryId'])),
		wroteNote: () => getLog().some((e) => e.title === 'Note' && !before.has(e.id)),
	};
}

/** Click the first link of `kind` left in `entry` (one not yet used). */
export function use(entry: Element | undefined, kind: string) {
	entry?.querySelector<HTMLElement>(`a.${kind}`)?.click();
}

/** Close the Moves dialog, should an outcome's link have opened it (Pay
 *  the Price, on a miss): the next step is elsewhere. */
export function closeMoves() {
	const dialog = document.querySelector('.moves-dialog');
	if (!dialog) return;
	const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button')];
	(
		dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]') ??
		buttons.find((b) => b.textContent?.trim() === 'Close')
	)?.click();
}

/** In the search box `el` holds, search for `text`, unless the move `id`
 *  is already showing. */
export function searchFor(el: Element | undefined, id: string, text: string) {
	if (tourTarget(id)) return;
	const input = el?.querySelector('input');
	if (!input) return;
	input.value = text;
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Choose whichever of the stats `el` lists is highest. */
export function pickHighest(el: Element | undefined) {
	const rows = [...(el?.querySelectorAll<HTMLElement>('.md-stat-row-btn') ?? [])];
	const value = (row: HTMLElement) => Number(row.querySelector('.md-sval')?.textContent ?? 0);
	const best = rows.reduce<HTMLElement | undefined>(
		(top, row) => (!top || value(row) > value(top) ? row : top),
		undefined,
	);
	best?.click();
}
