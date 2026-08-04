/**
 * viewModeStore.svelte.ts — Reactive home-page layout mode state.
 *
 * Three modes: `grid` (current 2×2 deck of panels + log column), `log`
 * (log dominant, other panels tabbed alongside), `tabs` (mobile-style,
 * log at the bottom).
 *
 * The store persists the user's choice to localStorage and mirrors it
 * on `html[data-view]` so CSS can scope layout rules. Mobile
 * (<900 px) always renders tabs regardless of the stored value; the
 * store keeps the desktop preference intact for when the viewport
 * grows back.
 *
 * Consumers:
 *   • `HamburgerMenu` — nested "View" submenu, radio-style with a
 *     check on the active mode.
 *   • Global `Alt+V` in the layout — cycles grid → log → tabs → grid.
 *   • `+page.svelte` (home) — future layout swap wired off
 *     `viewMode.mode`; today the store is inert on the layout side.
 */

const KEY = 'ironledger:layout:mode';

export type ViewMode = 'grid' | 'log' | 'tabs';
export const VIEW_MODES: ViewMode[] = ['grid', 'log', 'tabs'];
export const DEFAULT_VIEW_MODE: ViewMode = 'grid';

function readSaved(): ViewMode {
	if (typeof window === 'undefined') return DEFAULT_VIEW_MODE;
	const v = localStorage.getItem(KEY);
	return v === 'grid' || v === 'log' || v === 'tabs' ? v : DEFAULT_VIEW_MODE;
}

// One shared reactive record — components import `viewMode` and read
// `viewMode.mode`. Same pattern the app already uses for mapListState /
// entityMarkerIndexState.
export const viewMode = $state<{ mode: ViewMode }>({ mode: readSaved() });

/** Set + persist + reflect on `<html data-view>`. */
export function setViewMode(m: ViewMode): void {
	viewMode.mode = m;
	if (typeof window === 'undefined') return;
	if (m === DEFAULT_VIEW_MODE) {
		// Keep localStorage clean when the user picks the default —
		// removes stale entries after mode-list changes.
		localStorage.removeItem(KEY);
	} else {
		localStorage.setItem(KEY, m);
	}
	document.documentElement.setAttribute('data-view', m);
}

/** Cycle forward through `VIEW_MODES` (grid → log → tabs → grid). */
export function cycleViewMode(): void {
	const i = VIEW_MODES.indexOf(viewMode.mode);
	const next = VIEW_MODES[(i + 1) % VIEW_MODES.length];
	setViewMode(next);
}
