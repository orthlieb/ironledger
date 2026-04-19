/**
 * Public BFF proxy: validate an invite token and return the preview.
 */
import type { RequestHandler } from './$types';
import { INTERNAL_API_URL } from '$lib/server/config.js';

export const GET: RequestHandler = async ({ params }) => {
	const res = await fetch(`${INTERNAL_API_URL}/api/v1/invites/${params.token}`);
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
