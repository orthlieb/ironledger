/** Proxy DELETE /api/v1/auth/passkey/credentials/:id. */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '$lib/server/config.js';

export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/auth/passkey/credentials/${params.id}`, {
		method:  'DELETE',
		headers: { Authorization: `Bearer ${locals.accessToken}` },
	});
	return new Response(res.body, {
		status:  res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
