/**
 * SvelteKit BFF proxy for /api/session/maps/entity-markers
 *
 * GET → Fastify GET /api/v1/session/maps/entity-markers
 *
 * Returns `{ index: { [entityId]: EntityMarkerRef[] } }` — a cross-map
 * index used by entity cards to render "📍 On map at (x, y)" chips.
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '$lib/server/config.js';

function authHeader(locals: App.Locals): Record<string, string> {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	return { Authorization: `Bearer ${locals.accessToken}` };
}

export const GET: RequestHandler = async ({ locals }) => {
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/session/maps/entity-markers`, {
		headers: authHeader(locals),
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
