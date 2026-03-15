/**
 * SvelteKit BFF proxy for /api/session/encounters
 *
 * PATCH → forward to Fastify PATCH /api/v1/session/encounters
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '$lib/server/config.js';

function authHeader(locals: App.Locals): Record<string, string> {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	return { Authorization: `Bearer ${locals.accessToken}` };
}

export const PATCH: RequestHandler = async ({ locals, request }) => {
	const body = await request.text();
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/session/encounters`, {
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
