/**
 * Admin BFF proxy for maintenance mode control.
 * POST — enable maintenance; DELETE — disable maintenance.
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '$lib/server/config.js';

function authHeader(locals: App.Locals): Record<string, string> {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	return {
		Authorization: `Bearer ${locals.accessToken}`,
		'Content-Type': 'application/json',
	};
}

export const POST: RequestHandler = async ({ locals, request }) => {
	const body = await request.text();
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/admin/maintenance`, {
		method: 'POST',
		headers: authHeader(locals),
		body,
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};

export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/admin/maintenance`, {
		method: 'DELETE',
		headers: { Authorization: `Bearer ${locals.accessToken}` },
	});
	if (res.status === 204) {
		return new Response(null, { status: 204 });
	}
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
