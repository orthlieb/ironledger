/**
 * Public BFF proxy: validate an invite token and return the preview.
 */
import type { RequestHandler } from './$types';
import { INTERNAL_API_URL } from '#lib/server/config.js';
import { apiFetch, pathSegment } from '#lib/server/apiFetch.js';

export const GET: RequestHandler = async ({ params }) => {
	const res = await apiFetch(`${INTERNAL_API_URL}/api/v1/invites/${pathSegment(params.token)}`);
	return new Response(res.body, {
		status: res.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
