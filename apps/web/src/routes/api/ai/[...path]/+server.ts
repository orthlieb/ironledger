/**
 * SvelteKit BFF proxy for /api/ai/* → Fastify /api/v1/ai/*.
 *
 * Forwards the auth cookie as a bearer token and pipes the response through —
 * including the streaming SSE body of /api/ai/generate. The browser never sees
 * a provider key or calls a provider directly.
 */
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '$lib/server/config.js';

type Method = 'GET' | 'PUT' | 'POST' | 'DELETE';

async function proxy(
	method: Method,
	{ locals, params, request }: Parameters<RequestHandler>[0],
): Promise<Response> {
	if (!locals.accessToken) throw error(401, 'Not authenticated');

	const headers: Record<string, string> = { Authorization: `Bearer ${locals.accessToken}` };
	// Only forward a JSON content-type when there's an actual body. A body-less
	// POST (e.g. /test/:provider) must NOT claim application/json — Fastify would
	// reject the empty payload as "Invalid JSON body".
	const raw = method === 'GET' || method === 'DELETE' ? '' : await request.text();
	const body = raw.length > 0 ? raw : undefined;
	if (body !== undefined) headers['Content-Type'] = 'application/json';

	const res = await fetch(`${INTERNAL_API_URL}/api/v1/ai/${params.path}`, {
		method,
		headers,
		body,
		// Client disconnect (e.g. Stop mid-generation) aborts the upstream call.
		signal: request.signal,
	});

	// Preserve the upstream content type so text/event-stream streams through.
	return new Response(res.body, {
		status: res.status,
		headers: {
			'Content-Type': res.headers.get('content-type') ?? 'application/json',
			'Cache-Control': 'no-cache, no-transform',
		},
	});
}

export const GET: RequestHandler = (event) => proxy('GET', event);
export const PUT: RequestHandler = (event) => proxy('PUT', event);
export const POST: RequestHandler = (event) => proxy('POST', event);
export const DELETE: RequestHandler = (event) => proxy('DELETE', event);
