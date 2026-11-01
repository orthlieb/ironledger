/**
 * Remembered selection — which entry each home area had open, so a reload
 * re-opens it instead of whatever happens to be first in the list.
 *
 * "First" isn't stable anyway: characters come back sorted by `updatedAt`,
 * which every autosave bumps, so before this a reload usually landed on a
 * different character from the one you'd been editing.
 *
 * Kept per device in localStorage, like the other layout preferences. An id
 * that no longer exists (deleted, or another account on this browser) falls
 * back to the first entry.
 */

export type SelectionArea = 'characters' | 'foes' | 'expeditions' | 'connections';

const key = (area: SelectionArea) => `ironledger:selected:${area}`;

/** Remember the area's open entry. Ignores null, so an area that briefly
 *  has nothing selected (mounting, after a delete) doesn't forget it. */
export function rememberSelection(area: SelectionArea, id: string | null | undefined): void {
	if (!id) return;
	try {
		localStorage.setItem(key(area), id);
	} catch {
		// Storage blocked (private mode, quota): just don't remember.
	}
}

/** The entry an area should open by itself: the remembered one if it's
 *  still in `ids`, else the first. Null when `ids` is empty. */
export function initialSelection(area: SelectionArea, ids: readonly string[]): string | null {
	if (ids.length === 0) return null;
	let saved: string | null = null;
	try {
		saved = localStorage.getItem(key(area));
	} catch {
		// Storage blocked: fall back to the first entry.
	}
	return saved && ids.includes(saved) ? saved : ids[0]!;
}
