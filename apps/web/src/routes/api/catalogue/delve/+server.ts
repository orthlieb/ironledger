/**
 * SvelteKit BFF proxy for /api/catalogue/delve
 *
 * Forwards to the Fastify catalogue endpoint (no auth required — delve
 * data is public, read-only game data). Passes ETag headers through so the
 * browser can take advantage of 304 Not Modified caching.
 */
import type { RequestHandler } from './$types';
import { INTERNAL_API_URL } from '$lib/server/config.js';

export const GET: RequestHandler = async ({ request }) => {
	const upstream = await fetch(`${INTERNAL_API_URL}/api/v1/catalogue/delve`, {
		headers: {
			'If-None-Match': request.headers.get('If-None-Match') ?? '',
		},
	});

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
	};
	const cc   = upstream.headers.get('Cache-Control');
	const etag = upstream.headers.get('ETag');
	if (cc)   headers['Cache-Control'] = cc;
	if (etag) headers['ETag']          = etag;

	return new Response(upstream.body, { status: upstream.status, headers });
};
