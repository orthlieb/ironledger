/**
 * logOrderStore.svelte.ts — where the log puts its newest entry: at the top
 * (the default) or at the bottom, as a command line prints its output.
 *
 * A preference of this browser only (localStorage), set in Settings →
 * Appearance → Newest log entry. The log itself is unchanged: it's stored
 * newest-first, pages from the newest, and exports oldest-first; only the
 * order a page is shown in follows this.
 */

const KEY = 'ironledger:log:newest';

export type LogNewest = 'top' | 'bottom';
export const DEFAULT_LOG_NEWEST: LogNewest = 'top';

function readSaved(): LogNewest {
	if (typeof window === 'undefined') return DEFAULT_LOG_NEWEST;
	try {
		return localStorage.getItem(KEY) === 'bottom' ? 'bottom' : DEFAULT_LOG_NEWEST;
	} catch {
		return DEFAULT_LOG_NEWEST; // storage blocked: the default
	}
}

/** Read `logOrder.newest`; set it with setLogNewest. */
export const logOrder = $state<{ newest: LogNewest }>({ newest: readSaved() });

/** Set and remember where the newest entry goes. The default isn't stored. */
export function setLogNewest(n: LogNewest): void {
	logOrder.newest = n;
	if (typeof window === 'undefined') return;
	try {
		if (n === DEFAULT_LOG_NEWEST) localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, n);
	} catch {
		// Storage blocked: it holds for this visit only.
	}
}
