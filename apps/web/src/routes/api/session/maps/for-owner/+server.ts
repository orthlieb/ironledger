/**
 * SvelteKit BFF proxy for /api/session/maps/for-owner
 *
 * GET → Fastify GET /api/v1/session/maps/for-owner?kind=&id=&name=
 *
 * Get-or-create the map owned by a first-class entity (Site,
 * Community, Place, Journey). Returns the full UserMap detail so the
 * client can hydrate mapState in one round-trip.
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '$lib/server/config.js';

function authHeader(locals: App.Locals): Record<string, string> {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	return { Authorization: `Bearer ${locals.accessToken}` };
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const kind = url.searchParams.get('kind') ?? '';
	const id = url.searchParams.get('id') ?? '';
	const name = url.searchParams.get('name') ?? '';
	const qs = new URLSearchParams({ kind, id });
	if (name) qs.set('name', name);
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/session/maps/for-owner?${qs.toString()}`, {
		headers: authHeader(locals),
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
