import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';

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

export const handle: Handle = async ({ event, resolve }) => {
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
		try {
			const refreshRes = await fetch(`${INTERNAL_API_URL}/api/v1/auth/refresh`, {
				method: 'POST',
				headers: { Cookie: `rt=${rt}` },
			});

			if (refreshRes.ok) {
				const refreshBody = (await refreshRes.json()) as { accessToken: string };
				const newToken = refreshBody.accessToken;

				// Decode to get claims and exp.
				const [, payloadB64] = newToken.split('.');
				const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
					sub?: string;
					email?: string;
					role?: string;
					exp?: number;
				};

				// Determine if we should persist the cookie (remember-me mode).
				// Check if the existing rt cookie had a long maxAge by comparing
				// expiry via the new token payload — if exp is far out, use 30 days.
				// Simpler heuristic: if the original access_token cookie was set with
				// a long maxAge it would still be present (even if expired as a JWT).
				// We just always set 900s here — on next login rememberMe controls it.
				event.cookies.set('access_token', newToken, {
					path: '/',
					httpOnly: true,
					sameSite: 'strict',
					secure: process.env.NODE_ENV === 'production',
					maxAge: 900,
				});

				// Extract new rt from refresh response and re-set it.
				const setCookieHeader = refreshRes.headers.get('set-cookie') ?? '';
				const newRtMatch = setCookieHeader.match(/(?:^|,)\s*rt=([^;,]+)/);
				const newRt = newRtMatch?.[1];
				if (newRt) {
					event.cookies.set('rt', newRt, {
						path: '/',
						httpOnly: true,
						sameSite: 'strict',
						secure: process.env.NODE_ENV === 'production',
						maxAge: 30 * 24 * 60 * 60, // keep refresh token alive
					});
				}

				event.locals.accessToken = newToken;
				event.locals.user = {
					id: payload.sub ?? '',
					email: payload.email ?? '',
					role: payload.role ?? 'user',
				};
				return resolve(event);
			}
		} catch {
			// Refresh failed — clear stale cookies and treat as logged out.
		}

		// Refresh failed — clear cookies so the user gets a clean login redirect.
		event.cookies.delete('access_token', { path: '/' });
		event.cookies.delete('rt', { path: '/' });
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
	console.error('[web]', error);
	const message = error instanceof Error ? error.message : String(error);
	return { message: message || 'Internal error' };
};
