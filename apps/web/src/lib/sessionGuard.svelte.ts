/**
 * Session-death guard.
 *
 * Called by the global fetch wrapper in `hooks.client.ts` when a
 * cookie-authed request (`/api/session/*`, `/api/characters/*`,
 * `/api/admin/*`) comes back 401 — meaning the SvelteKit BFF hook
 * couldn't refresh the JWT and returned "Not authenticated".
 *
 * On the first such hit we flip `expired`, which drives the visible
 * `<SessionExpiredBanner>`, and schedule a hard nav to `/login` so
 * every in-memory store (stale data, dead refs) is wiped in the
 * refresh. Guarded so a burst of 401s doesn't stack redirects.
 */

class SessionState {
	expired = $state(false);
}
export const sessionState = new SessionState();

let _redirectScheduled = false;

export function triggerSessionExpired(): void {
	if (sessionState.expired || _redirectScheduled) return;
	sessionState.expired = true;
	_redirectScheduled = true;

	// A beat for the banner to render + read, then a hard nav so the
	// SvelteKit `handle` hook re-runs against fresh cookies and lands us
	// at /login. Hard nav (not `goto`) also flushes all module-level
	// $state / stores that assumed the user was logged in.
	setTimeout(() => {
		try {
			window.location.href = '/login';
		} catch {
			/* ignore — best-effort */
		}
	}, 2500);
}
