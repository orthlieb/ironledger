/**
 * Public BFF proxy for the combined system status endpoint.
 * Returns { maintenance, broadcast }. Polled by +layout.svelte every 10s.
 */
import type { RequestHandler } from './$types';
import { INTERNAL_API_URL } from '$lib/server/config.js';

export const GET: RequestHandler = async () => {
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/system/status`);
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
