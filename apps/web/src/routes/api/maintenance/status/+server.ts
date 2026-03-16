/**
 * Public BFF proxy for maintenance status.
 * No auth required — all users (including logged-out) can check.
 */
import type { RequestHandler } from './$types';
import { INTERNAL_API_URL } from '$lib/server/config.js';

export const GET: RequestHandler = async () => {
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/maintenance/status`);
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
