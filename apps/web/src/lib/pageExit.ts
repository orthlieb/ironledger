/**
 * Page exit — save pending edits before the page goes away.
 *
 * Edits autosave on a delay (a 1.5 s debounce, then one request per changed
 * entity), so an edit made just before a reload, a tab close, or the browser
 * killing a backgrounded tab would be lost. This module runs the registered
 * flushes at the last reliable moments the page gets:
 *
 * - `pagehide`: reload, close, or navigation away.
 * - `visibilitychange` to hidden: tab switch or app switch. On mobile a hidden
 *   page can be discarded without ever seeing `pagehide`.
 *
 * Requests started while the flushes run are sent with `keepalive`, so the
 * browser finishes them even after the page is gone. A flush on hide is
 * harmless when the page comes back: it only saves sooner than the debounce
 * would have.
 *
 *   onPageExit(() => saver.flush());          // register; returns unregister
 *   fetch(url, { ...keepaliveInit(body) });    // in code a flush can reach
 */

type Handler = () => void;

const handlers = new Set<Handler>();
let installed = false;
let exiting = false;

/**
 * Bytes left for keepalive bodies in the current exit. Browsers cap the
 * bodies of in-flight keepalive requests at 64 KiB in total and reject a
 * request that would go over, so stay a little under that.
 */
const KEEPALIVE_BUDGET = 60 * 1024;
let budget = KEEPALIVE_BUDGET;

/** Run `fn` when the page is hidden or unloading. Returns an unregister function. */
export function onPageExit(fn: Handler): () => void {
	install();
	handlers.add(fn);
	return () => {
		handlers.delete(fn);
	};
}

/** True while page-exit flushes are running. */
export function isPageExiting(): boolean {
	return exiting;
}

/**
 * Extra `fetch` options for a request with this body. While the page is
 * exiting this is `{ keepalive: true }`, if the body still fits the keepalive
 * budget; otherwise it's `{}`. A request over the budget is sent normally:
 * it still completes if the page survives, as after a tab switch.
 */
export function keepaliveInit(body?: BodyInit | null): { keepalive?: true } {
	if (!exiting) return {};
	const size = typeof body === 'string' ? new TextEncoder().encode(body).length : 0;
	if (size > budget) return {};
	budget -= size;
	return { keepalive: true };
}

/** Run every registered flush now (exported for tests). */
export function runPageExit(): void {
	if (exiting) return;
	exiting = true;
	budget = KEEPALIVE_BUDGET;
	try {
		for (const fn of [...handlers]) {
			try {
				fn();
			} catch (err) {
				console.error('[pageExit] flush failed:', err);
			}
		}
	} finally {
		exiting = false;
	}
}

function install(): void {
	if (installed || typeof window === 'undefined') return;
	installed = true;
	window.addEventListener('pagehide', runPageExit);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') runPageExit();
	});
}
