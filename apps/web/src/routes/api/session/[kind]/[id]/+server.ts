/**
 * SvelteKit BFF proxy for /api/session/[kind]/[id]
 *
 * PATCH  → update one entity → Fastify PATCH  /api/v1/session/:kind/:id
 * DELETE → delete one entity → Fastify DELETE /api/v1/session/:kind/:id
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
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/session/${params.kind}/${params.id}`, {
		method: 'PATCH',
		headers: { ...authHeader(locals), 'Content-Type': 'application/json' },
		body,
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/session/${params.kind}/${params.id}`, {
		method: 'DELETE',
		headers: authHeader(locals),
	});
	return new Response(null, { status: res.status });
};
