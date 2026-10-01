/**
 * SvelteKit BFF proxy for /api/session/[kind]/batch
 *
 * PUT → upsert many entities of one kind in a single server transaction.
 * Forwards to Fastify `PUT /api/v1/session/:kind/batch`. Used by the
 * import pipeline to collapse N serial POST / PATCH round-trips into
 * one PUT so a big "Everything" bundle lands without blowing the
 * per-user rate limit.
 *
 * Collides-with-id note: an entity whose id happened to be the literal
 * string "batch" would route here instead of to the sibling `[id]`
 * handler. Entity ids are UUIDs across the app, so this isn't reachable
 * in practice; if it ever becomes a concern, rename the segment.
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '$lib/server/config.js';

function authHeader(locals: App.Locals): Record<string, string> {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	return { Authorization: `Bearer ${locals.accessToken}` };
}

export const PUT: RequestHandler = async ({ locals, request, params }) => {
	const body = await request.text();
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/session/${params.kind}/batch`, {
		method: 'PUT',
		headers: { ...authHeader(locals), 'Content-Type': 'application/json' },
		body,
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
