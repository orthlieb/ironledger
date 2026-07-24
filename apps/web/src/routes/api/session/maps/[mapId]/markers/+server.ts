/**
 * SvelteKit BFF proxy for /api/session/maps/:mapId/markers
 *
 * PUT → Fastify PUT /api/v1/session/maps/:mapId/markers
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '$lib/server/config.js';

function authHeader(locals: App.Locals): Record<string, string> {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	return { Authorization: `Bearer ${locals.accessToken}` };
}

export const PUT: RequestHandler = async ({ locals, params, request }) => {
	const body = await request.text();
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/session/maps/${params.mapId}/markers`, {
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
