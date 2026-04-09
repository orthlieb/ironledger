/**
 * SvelteKit BFF proxy for /api/session/log/[entryId]
 *
 * PATCH  → update html / note / source on a single entry
 * DELETE → remove a single entry
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '$lib/server/config.js';

function authHeader(locals: App.Locals): Record<string, string> {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	return { Authorization: `Bearer ${locals.accessToken}` };
}

export const PATCH: RequestHandler = async ({ locals, request, params }) => {
	const body = await request.text();
	const res = await fetch(
		`${INTERNAL_API_URL}/api/v1/session/log/${params.entryId}`,
		{
			method: 'PATCH',
			headers: { ...authHeader(locals), 'Content-Type': 'application/json' },
			body,
		},
	);
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const res = await fetch(
		`${INTERNAL_API_URL}/api/v1/session/log/${params.entryId}`,
		{
			method: 'DELETE',
			headers: authHeader(locals),
		},
	);
	return new Response(null, { status: res.status });
};
