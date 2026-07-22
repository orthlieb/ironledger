/**
 * SvelteKit BFF proxy for /api/session/map/background
 *
 * GET    → forward to Fastify GET /api/v1/session/map/background (raw bytes)
 *          Passes through ETag / If-None-Match and returns 304 unchanged.
 * PUT    → forward to Fastify PUT /api/v1/session/map/background (data URL)
 * DELETE → forward to Fastify DELETE /api/v1/session/map/background
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '$lib/server/config.js';

function authHeader(locals: App.Locals): Record<string, string> {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	return { Authorization: `Bearer ${locals.accessToken}` };
}

export const GET: RequestHandler = async ({ locals, request }) => {
	const ifNoneMatch = request.headers.get('if-none-match') ?? undefined;
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/session/map/background`, {
		headers: {
			...authHeader(locals),
			...(ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {}),
		},
	});
	// Pass image bytes + ETag through untouched.
	const headers: Record<string, string> = {};
	for (const h of ['content-type', 'etag', 'cache-control']) {
		const v = res.headers.get(h);
		if (v) headers[h] = v;
	}
	return new Response(res.body, { status: res.status, headers });
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	const body = await request.text();
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/session/map/background`, {
		method: 'PUT',
		headers: {
			...authHeader(locals),
			'Content-Type': 'application/json',
		},
		body,
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};

export const DELETE: RequestHandler = async ({ locals }) => {
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/session/map/background`, {
		method: 'DELETE',
		headers: authHeader(locals),
	});
	return new Response(null, { status: res.status });
};
