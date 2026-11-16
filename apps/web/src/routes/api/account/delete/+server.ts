/**
 * SvelteKit BFF route: the signed-in player deletes their own account.
 *
 * POST { password } → Fastify POST /api/v1/auth/delete-account. On success
 * both auth cookies go, so the browser is signed out at once; the page then
 * leaves for /login?deleted=1.
 */
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { INTERNAL_API_URL } from '#lib/server/config.js';
import { apiFetch } from '#lib/server/apiFetch.js';

export const POST: RequestHandler = async ({ locals, request, cookies }) => {
	if (!locals.accessToken) throw error(401, 'Not authenticated');
	const { password } = (await request.json().catch(() => ({}))) as { password?: unknown };
	if (typeof password !== 'string' || !password) throw error(400, 'Password is required');

	const res = await apiFetch(`${INTERNAL_API_URL}/api/v1/auth/delete-account`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${locals.accessToken}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ password }),
	});
	const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };

	if (!res.ok) {
		return json(
			{ message: body.message ?? 'The account could not be deleted.', code: body.code },
			{ status: res.status },
		);
	}

	cookies.delete('access_token', { path: '/' });
	cookies.delete('rt', { path: '/' });
	cookies.delete('remember', { path: '/' });
	return json({ message: 'Account deleted.' });
};
