import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { apiFetch, clientAddress, withClientAddress } from '#lib/server/apiFetch.js';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:3000';

// Credential/vulnerability scanner paths. Nginx blocks these at the edge, but
// if a request reaches this process (e.g. direct-to-port in dev, or a gap in
// the Nginx ruleset), short-circuit with a silent 404 instead of letting
// SvelteKit's router log a red "[404]" error for every probe. Keep this in
// sync with the matching block rules in infra/nginx/nginx.conf.
const SCANNER_PATTERN =
	/(?:^|\/)(?:\.env|\.git|\.aws|\.ssh|\.htaccess|wordpress|wp|wp-[a-z0-9-]+|xmlrpc\.php|phpmyadmin|adminer|config\.php|server-status|server-info|actuator|vendor|cgi-bin|_ignition|telescope|_profiler|solr)(?:\/|$|\.)/i;

// Server-side script extensions this app never serves — a bare `.php` (or ASP/
// JSP/CGI) request is always a probe. The app is SvelteKit + static assets, so
// blanket-404ing these is safe.
const SCANNER_EXT = /\.(?:php|phtml|asp|aspx|cgi|jsp)(?:$|\/)/i;

interface Refreshed {
	accessToken: string;
	/** The rotated refresh token, from the API's Set-Cookie. */
	rt?: string;
}

/**
 * Refreshes in flight, or just done, by refresh token. A page fires several
 * requests at once; once the access token has expired, each would refresh
 * with the same `rt`. The first rotates it, and the rest would present a
 * revoked token, which the API treats as theft: it revokes the whole session
 * and the player is signed out. So requests share one refresh per `rt`, and
 * its result for a few seconds (for requests already on their way with the
 * old cookie). One web process serves every request, so a Map is enough.
 */
const refreshes = new Map<string, Promise<Refreshed | null>>();
const REFRESH_SHARE_MS = 10_000;

function refreshOnce(rt: string): Promise<Refreshed | null> {
	const pending = refreshes.get(rt);
	if (pending) return pending;
	const p = (async (): Promise<Refreshed | null> => {
		try {
			const res = await apiFetch(`${INTERNAL_API_URL}/api/v1/auth/refresh`, {
				method: 'POST',
				headers: { Cookie: `rt=${rt}` },
			});
			if (!res.ok) return null;
			const body = (await res.json()) as { accessToken: string };
			const newRt = (res.headers.get('set-cookie') ?? '').match(/(?:^|,)\s*rt=([^;,]+)/)?.[1];
			return { accessToken: body.accessToken, rt: newRt };
		} catch {
			return null;
		}
	})();
	refreshes.set(rt, p);
	void p.then((r) => {
		// A failure isn't shared: the next request may try again.
		if (!r) refreshes.delete(rt);
		else setTimeout(() => refreshes.delete(rt), REFRESH_SHARE_MS).unref?.();
	});
	return p;
}

// Every call this request makes to the API names the visitor (see apiFetch),
// so the API's per-IP limits and security log see real addresses.
export const handle: Handle = (input) =>
	withClientAddress(clientAddress(input.event), () => handleRequest(input));

const handleRequest: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	if (SCANNER_PATTERN.test(path) || SCANNER_EXT.test(path)) {
		return new Response(null, { status: 404 });
	}

	const token = event.cookies.get('access_token');

	if (token) {
		try {
			// Decode JWT payload — Fastify verifies the signature when we call it.
			// We just need the claims for SSR page rendering.
			const [, payloadB64] = token.split('.');
			const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
				sub?: string;
				email?: string;
				role?: string;
				exp?: number;
			};

			if (payload.exp && payload.exp * 1000 > Date.now()) {
				// Token is still valid.
				event.locals.accessToken = token;
				event.locals.user = {
					id: payload.sub ?? '',
					email: payload.email ?? '',
					role: payload.role ?? 'user',
				};
				return resolve(event);
			}
			// Token expired — fall through to refresh attempt below.
		} catch {
			// Malformed token — fall through to refresh attempt.
		}
	}

	// No valid access token. Try to silently refresh using the refresh token
	// cookie (set during login and stored with the browser's cookie jar).
	const rt = event.cookies.get('rt');
	if (rt) {
		const fresh = await refreshOnce(rt);
		if (fresh) {
			// Decode to get claims and exp.
			const [, payloadB64] = fresh.accessToken.split('.');
			const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
				sub?: string;
				email?: string;
				role?: string;
				exp?: number;
			};

			const secure = process.env.NODE_ENV === 'production';
			event.cookies.set('access_token', fresh.accessToken, {
				path: '/',
				httpOnly: true,
				sameSite: 'strict',
				secure,
				maxAge: 900,
			});

			// Re-set the rotated refresh token, keeping its kind: 30 days if the
			// player ticked "Remember me" (the login page's `remember` cookie),
			// otherwise a session cookie that goes when the browser closes.
			if (fresh.rt) {
				const remember = event.cookies.get('remember') === '1';
				event.cookies.set('rt', fresh.rt, {
					path: '/',
					httpOnly: true,
					sameSite: 'strict',
					secure,
					...(remember ? { maxAge: 30 * 24 * 60 * 60 } : {}),
				});
			}

			event.locals.accessToken = fresh.accessToken;
			event.locals.user = {
				id: payload.sub ?? '',
				email: payload.email ?? '',
				role: payload.role ?? 'user',
			};
			return resolve(event);
		}

		// Refresh failed — clear cookies so the user gets a clean login redirect.
		event.cookies.delete('access_token', { path: '/' });
		event.cookies.delete('rt', { path: '/' });
		event.cookies.delete('remember', { path: '/' });
	}

	event.locals.accessToken = null;
	event.locals.user = null;

	return resolve(event);
};

// SvelteKit 3 sends every error through here, tagged by `kind`.
// - 'app': thrown on purpose with error(...). Expected, so log nothing and
//   keep its status and message (SvelteKit 2 never passed these here).
// - 'framework' / 'validation': SvelteKit's own, chiefly 404s for unknown
//   paths. Those aren't errors: scanners probe constantly and people mistype
//   URLs, and logging them at ERROR level floods the PM2 logs. So 404 → warn;
//   anything else stays at error level.
// - 'unknown': thrown by our code or code it calls.
export const handleError: HandleServerError = ({ kind, error, event }) => {
	if (kind === 'app') return;
	if (kind === 'framework' || kind === 'validation') {
		if (error.status === 404) {
			console.warn(`[web] 404 ${event.url.pathname}`);
			return { message: 'Not found' };
		}
		console.error('[web]', error);
		return;
	}
	// Logged in full here; the browser gets a generic line (a raw message like
	// "fetch failed" or a stack detail tells an outsider about the internals).
	console.error('[web]', error);
	return { message: 'Something went wrong. Please try again.' };
};
