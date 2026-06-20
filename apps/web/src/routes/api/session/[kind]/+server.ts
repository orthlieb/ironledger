/**
 * SvelteKit BFF proxy for /api/session/[kind]
 *
 * [kind] ∈ { encounters, expeditions, communities, npcs }. Static siblings
 * (state/, log/) take routing precedence, so they never reach here.
 *
 * PATCH → replace the whole collection  → Fastify PATCH /api/v1/session/:kind
 * POST  → create one entity             → Fastify POST  /api/v1/session/:kind
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '$lib/server/config.js';

function authHeader(locals: App.Locals): Record<string, string> {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	return { Authorization: `Bearer ${locals.accessToken}` };
}

async function forward(method: 'PATCH' | 'POST', locals: App.Locals, kind: string, body: string) {
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/session/${kind}`, {
		method,
		headers: { ...authHeader(locals), 'Content-Type': 'application/json' },
		body,
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
}

export const PATCH: RequestHandler = async ({ locals, request, params }) =>
	forward('PATCH', locals, params.kind, await request.text());

export const POST: RequestHandler = async ({ locals, request, params }) =>
	forward('POST', locals, params.kind, await request.text());
