import type { RequestHandler } from './$types';
import { INTERNAL_API_URL } from '$env/static/private';

/** Called by the client-side auth.logout() helper. */
export const POST: RequestHandler = async ({ locals, cookies }) => {
	if (locals.accessToken) {
		try {
			await fetch(`${INTERNAL_API_URL}/api/v1/auth/logout`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${locals.accessToken}` },
			});
		} catch {
			// Best effort — clear the cookie regardless
		}
	}

	cookies.delete('access_token', { path: '/' });
	return new Response(null, { status: 204 });
};
