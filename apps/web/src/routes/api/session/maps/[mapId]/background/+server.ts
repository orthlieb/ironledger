/**
 * SvelteKit BFF proxy for /api/session/maps/:mapId/background
 *
 * GET    → raw image bytes (ETag revalidated) → Fastify /api/v1/session/maps/:mapId/background
 * PUT    → upload { dataUrl }                 → Fastify PUT ...
 * DELETE → clear the background pointer       → Fastify DELETE ...
 *
 * GET preserves the caching contract: forwards If-None-Match, relays 304,
 * copies ETag / Cache-Control / Content-Type so the browser can revalidate.
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '$lib/server/config.js';

function authHeader(locals: App.Locals): Record<string, string> {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	return { Authorization: `Bearer ${locals.accessToken}` };
}

function passHeaders(res: Response): Headers {
	const headers = new Headers();
	for (const name of ['etag', 'cache-control', 'content-type']) {
		const v = res.headers.get(name);
		if (v) headers.set(name, v);
	}
	return headers;
}

export const GET: RequestHandler = async ({ locals, params, request }) => {
	const upstream: Record<string, string> = authHeader(locals);
	const inm = request.headers.get('if-none-match');
	if (inm) upstream['If-None-Match'] = inm;
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/session/maps/${params.mapId}/background`, {
		headers: upstream,
	});
	if (res.status === 304) return new Response(null, { status: 304, headers: passHeaders(res) });
	return new Response(res.body, { status: res.status, headers: passHeaders(res) });
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	const body = await request.text();
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/session/maps/${params.mapId}/background`, {
		method: 'PUT',
		headers: { ...authHeader(locals), 'Content-Type': 'application/json' },
		body,
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/session/maps/${params.mapId}/background`, {
		method: 'DELETE',
		headers: authHeader(locals),
	});
	return new Response(null, { status: res.status });
};
