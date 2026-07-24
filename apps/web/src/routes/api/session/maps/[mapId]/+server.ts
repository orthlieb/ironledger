/**
 * SvelteKit BFF proxy for /api/session/maps/:mapId
 *
 * GET    → Fastify GET    /api/v1/session/maps/:mapId  (full map)
 * PATCH  → Fastify PATCH  /api/v1/session/maps/:mapId  (rename / reorder)
 * DELETE → Fastify DELETE /api/v1/session/maps/:mapId  (remove the map)
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '$lib/server/config.js';

function authHeader(locals: App.Locals): Record<string, string> {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	return { Authorization: `Bearer ${locals.accessToken}` };
}

export const GET: RequestHandler = async ({ locals, params }) => {
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/session/maps/${params.mapId}`, {
		headers: authHeader(locals),
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const body = await request.text();
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/session/maps/${params.mapId}`, {
		method: 'PATCH',
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

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/session/maps/${params.mapId}`, {
		method: 'DELETE',
		headers: authHeader(locals),
	});
	return new Response(null, { status: res.status });
};
