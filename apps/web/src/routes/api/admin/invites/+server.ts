/**
 * Admin BFF proxy for invite list + create.
 * GET  — list all invites (pending + accepted + revoked + expired)
 * POST — create an invitation (body: { email, displayName? })
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
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/admin/invites`, {
		headers: authHeader(locals),
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const body = await request.text();
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/admin/invites`, {
		method: 'POST',
		headers: authHeader(locals),
		body,
	});
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
