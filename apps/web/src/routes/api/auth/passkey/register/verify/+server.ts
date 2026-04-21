/** Proxy POST /api/v1/auth/passkey/register/verify. */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '$lib/server/config.js';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	const body = await request.text();
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/auth/passkey/register/verify`, {
		method:  'POST',
		headers: {
			Authorization: `Bearer ${locals.accessToken}`,
			'Content-Type': 'application/json',
		},
		body,
	});
	return new Response(res.body, {
		status:  res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
