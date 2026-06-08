import type { Handle, HandleServerError } from '@sveltejs/kit';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:3000';

// Credential/vulnerability scanner paths. Nginx blocks these at the edge, but
// if a request reaches this process (e.g. direct-to-port in dev, or a gap in
// the Nginx ruleset), short-circuit with a silent 404 instead of letting
// SvelteKit's router log a red "[404]" error for every probe.
const SCANNER_PATTERN =
	/(?:^|\/)(?:\.env|\.git|\.aws|\.ssh|\.htaccess|wp-admin|wp-login|xmlrpc\.php|phpmyadmin|adminer|config\.php|server-status|actuator)(?:\/|$|\.)/i;

export const handle: Handle = async ({ event, resolve }) => {
	if (SCANNER_PATTERN.test(event.url.pathname)) {
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

// 404s for unauthenticated, non-existent paths are not errors — scanners probe
// constantly and legitimate users mistype URLs. SvelteKit's default error
// logger treats every 404 as ERROR-level, which floods PM2 logs. Downgrade
// 404 → warn; keep 5xx at error.
export const handleError: HandleServerError = ({ error, status }) => {
	const message = error instanceof Error ? error.message : String(error);
	if (status === 404) {
		console.warn(`[web] 404 ${message}`);
		return { message: 'Not found' };
	}
	console.error('[web]', error);
	return { message: message || 'Internal error' };
};
