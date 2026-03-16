/**
 * SvelteKit BFF proxy for /api/admin/audit
 *
 * GET    — audit log (security events), with optional ?search= filter
 * DELETE — clear the audit log
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '$lib/server/config.js';

function authHeader(locals: App.Locals): Record<string, string> {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	return { Authorization: `Bearer ${locals.accessToken}` };
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const search = url.searchParams.get('search') ?? '';
	const apiUrl = search
		? `${INTERNAL_API_URL}/api/v1/admin/audit?search=${encodeURIComponent(search)}`
		: `${INTERNAL_API_URL}/api/v1/admin/audit`;
	const res = await fetch(apiUrl, {
		headers: authHeader(locals),
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};

export const DELETE: RequestHandler = async ({ locals }) => {
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/admin/audit`, {
		method: 'DELETE',
		headers: authHeader(locals),
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
