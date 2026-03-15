/**
 * SvelteKit BFF proxy for /api/session
 *
 * GET  → forward to Fastify GET /api/v1/session
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '$lib/server/config.js';

function authHeader(locals: App.Locals): Record<string, string> {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	return { Authorization: `Bearer ${locals.accessToken}` };
}

export const GET: RequestHandler = async ({ locals }) => {
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/session`, {
		headers: authHeader(locals),
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
