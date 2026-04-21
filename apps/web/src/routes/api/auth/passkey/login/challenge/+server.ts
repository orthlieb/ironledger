/** Proxy POST /api/v1/auth/passkey/login/challenge (public). */
import type { RequestHandler } from './$types';
import { INTERNAL_API_URL } from '$lib/server/config.js';

export const POST: RequestHandler = async () => {
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/auth/passkey/login/challenge`, {
		method: 'POST',
	});
	return new Response(res.body, {
		status:  res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
