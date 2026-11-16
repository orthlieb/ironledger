import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { INTERNAL_API_URL } from '#lib/server/config.js';
import { apiFetch } from '#lib/server/apiFetch.js';

export const actions: Actions = {
	default: async ({ cookies, locals }) => {
		// Tell Fastify to revoke the refresh token (best effort). It reads the
		// token from its `rt` cookie, which lives in this server's cookie jar,
		// so pass it on: without it nothing was revoked, and a copied `rt` kept
		// working for its full 30 days after logging out.
		const rt = cookies.get('rt');
		if (locals.accessToken) {
			try {
				await apiFetch(`${INTERNAL_API_URL}/api/v1/auth/logout`, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${locals.accessToken}`,
						...(rt ? { Cookie: `rt=${rt}` } : {}),
					},
				});
			} catch {
				// Ignore — we clear the cookies regardless
			}
		}

		cookies.delete('access_token', { path: '/' });
		cookies.delete('rt', { path: '/' });
		cookies.delete('remember', { path: '/' });
		throw redirect(302, '/login');
	},
};
