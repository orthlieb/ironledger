/**
 * SvelteKit BFF proxy for /api/admin/users/:id/clear-data
 *
 * POST — wipe every piece of game data owned by the target user
 * (characters, campaigns, journeys, maps, notes, invites, …) while
 * keeping the account row itself. Used from the admin panel's
 * "Clear data" action. The API server owns the actual cascade.
 *
 * Every sibling admin route has one of these — this one was missed
 * when the endpoint was added, so the browser hit /api/admin/…
 * directly and got 404 (there's no SvelteKit handler at that path
 * to forward it to /api/v1/admin/… on the backend).
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '$lib/server/config.js';

function authHeader(locals: App.Locals): Record<string, string> {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	return { Authorization: `Bearer ${locals.accessToken}` };
}

export const POST: RequestHandler = async ({ locals, params }) => {
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/admin/users/${params.id}/clear-data`, {
		method: 'POST',
		headers: authHeader(locals),
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
