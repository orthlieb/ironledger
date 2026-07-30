import { appendLog, enrichOutcomeLinks } from '$lib/log.svelte.js';
import { setStart, setEnd, clearSection } from '$lib/sectionStore.svelte.js';
import { triggerSessionExpired } from '$lib/sessionGuard.svelte.js';

// Expose log helpers on window so Playwright E2E tests can inject mock log
// entries against the production build (vite preview), not just dev mode.
// Not security-sensitive — these are the same functions any user action can
// invoke through the UI; exposing them on window just removes the click
// path. If we later want to restrict to CI, gate on a SvelteKit env flag
// rather than `import.meta.env.DEV` (which is hard-false after `vite build`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__testLog = { appendLog, enrichOutcomeLinks };
// Section markers — Playwright uses these to skip the hover-reveal on the
// per-entry ▲ / ▼ buttons.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__testSection = { setStart, setEnd, clearSection };

// ── Session-death detector ─────────────────────────────────────────────────
// The SvelteKit BFF proxies (`/api/session/*`, `/api/characters/*`,
// `/api/admin/*`) return 401 when the SSR hook can't produce a valid
// access token. Individual store fetches used to swallow that into a
// silent error field, leaving the user staring at a "blank" panel
// with no signal that their session had died. This wrapper watches
// every browser fetch, detects the first 401 on an auth-gated path,
// and hands off to `triggerSessionExpired()` which shows the banner
// and hard-navs to /login. Non-API requests (assets, external URLs)
// and /api/auth/* (login attempts return 401 for bad credentials,
// which is not the same thing) are ignored.
function isAuthGatedApiUrl(url: string): boolean {
	try {
		const u = new URL(url, window.location.origin);
		if (u.origin !== window.location.origin) return false;
		if (!u.pathname.startsWith('/api/')) return false;
		if (u.pathname.startsWith('/api/auth/')) return false;
		return true;
	} catch {
		return false;
	}
}
const _origFetch = window.fetch.bind(window);
window.fetch = async function patchedFetch(input, init) {
	const res = await _origFetch(input, init);
	if (res.status === 401) {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		if (isAuthGatedApiUrl(url)) triggerSessionExpired();
	}
	return res;
};
