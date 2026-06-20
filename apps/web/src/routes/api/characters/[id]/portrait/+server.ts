/**
 * SvelteKit BFF proxy for /api/characters/[id]/portrait
 *
 * GET    → raw portrait bytes        → Fastify GET    /api/v1/characters/:id/portrait
 * PUT    → store/replace the portrait → Fastify PUT    /api/v1/characters/:id/portrait
 * DELETE → clear the portrait         → Fastify DELETE /api/v1/characters/:id/portrait
 *
 * GET preserves the caching contract end to end (forwards If-None-Match, relays
 * 304, copies ETag/Cache-Control/Content-Type). Mirrors the session portrait
 * proxy.
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

	const res = await fetch(`${INTERNAL_API_URL}/api/v1/characters/${params.id}/portrait`, {
		headers: upstream,
	});
	if (res.status === 304) return new Response(null, { status: 304, headers: passHeaders(res) });
	return new Response(res.body, { status: res.status, headers: passHeaders(res) });
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	const body = await request.text();
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/characters/${params.id}/portrait`, {
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
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/characters/${params.id}/portrait`, {
		method: 'DELETE',
		headers: authHeader(locals),
	});
	return new Response(null, { status: res.status });
};
