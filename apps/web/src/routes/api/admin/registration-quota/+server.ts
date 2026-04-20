/**
 * Admin BFF proxy for the daily registration quota.
 *   GET  → current status (+ usage today + reset time)
 *   PUT  → set the daily cap (body: { daily: number | null })
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

export const GET: RequestHandler = async ({ locals }) => {
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/admin/registration-quota/status`, {
		headers: authHeader(locals),
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	const body = await request.text();
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/admin/registration-quota`, {
		method: 'PUT',
		headers: authHeader(locals),
		body,
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
