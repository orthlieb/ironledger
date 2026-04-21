/**
 * Proxy POST /api/v1/auth/passkey/login/verify (public).
 *
 * The SvelteKit server sits between the browser and Fastify. Fastify sets
 * the `rt` refresh-token cookie in its response; SvelteKit lives on a
 * different port, so the browser never sees Fastify's Set-Cookie header
 * directly. Same pattern as /login/+page.server.ts: extract the rt value
 * from the upstream Set-Cookie, write it to the SvelteKit cookie jar, and
 * also set the access_token cookie so the layout's auth check passes.
 */
import type { RequestHandler } from './$types';
import { INTERNAL_API_URL } from '$lib/server/config.js';

const THIRTY_DAYS = 30 * 24 * 60 * 60;

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await request.text();
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/auth/passkey/login/verify`, {
		method:  'POST',
		headers: { 'Content-Type': 'application/json' },
		body,
	});

	const text = await res.text();
	if (!res.ok) {
		return new Response(text, {
			status:  res.status,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const json = JSON.parse(text) as { user: unknown; accessToken: string };
	const setCookieHeader = res.headers.get('set-cookie') ?? '';
	const rtMatch = setCookieHeader.match(/(?:^|,)\s*rt=([^;,]+)/);
	const refreshToken = rtMatch?.[1];

	cookies.set('access_token', json.accessToken, {
		path:     '/',
		httpOnly: true,
		sameSite: 'strict',
		secure:   process.env.NODE_ENV === 'production',
		maxAge:   THIRTY_DAYS,
	});
	if (refreshToken) {
		cookies.set('rt', refreshToken, {
			path:     '/',
			httpOnly: true,
			sameSite: 'strict',
			secure:   process.env.NODE_ENV === 'production',
			maxAge:   THIRTY_DAYS,
		});
	}

	return new Response(JSON.stringify(json), {
		status:  200,
		headers: { 'Content-Type': 'application/json' },
	});
};
