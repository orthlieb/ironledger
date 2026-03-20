import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { INTERNAL_API_URL } from '$lib/server/config.js';

export const actions: Actions = {
	default: async ({ cookies, locals }) => {
		// Tell Fastify to revoke the refresh token (best effort)
		if (locals.accessToken) {
			try {
				await fetch(`${INTERNAL_API_URL}/api/v1/auth/logout`, {
					method: 'POST',
					headers: { Authorization: `Bearer ${locals.accessToken}` },
				});
			} catch {
				// Ignore — we clear the cookie regardless
			}
		}

		cookies.delete('access_token', {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: process.env.NODE_ENV === 'production',
		});
		throw redirect(302, '/login');
	},
};
