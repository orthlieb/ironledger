/**
 * SvelteKit BFF proxy for /api/admin/logs
 *
 * GET    ?file=api-out|api-error|web-out|web-error&lines=200
 *   → tails the requested PM2 log file from disk
 * DELETE ?file=api-out|api-error|web-out|web-error
 *   → truncates the requested PM2 log file to zero bytes (keeps PM2's
 *     open handle valid; next write appends to the empty file)
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '$lib/server/config.js';

function authHeader(locals: App.Locals): Record<string, string> {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	return { Authorization: `Bearer ${locals.accessToken}` };
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const params = url.searchParams.toString();
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/admin/logs${params ? `?${params}` : ''}`, {
		headers: authHeader(locals),
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};

export const DELETE: RequestHandler = async ({ locals, url }) => {
	const params = url.searchParams.toString();
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/admin/logs${params ? `?${params}` : ''}`, {
		method: 'DELETE',
		headers: authHeader(locals),
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
