import type { RequestHandler } from './$types';
import { INTERNAL_API_URL } from '#lib/server/config.js';
import { apiFetch } from '#lib/server/apiFetch.js';

/** Called by the client-side auth.logout() helper. Same as /logout's action. */
export const POST: RequestHandler = async ({ locals, cookies }) => {
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
			// Best effort — clear the cookies regardless
		}
	}

	// All three: with `rt` left behind, hooks.server.ts would sign the player
	// straight back in on the next request.
	cookies.delete('access_token', { path: '/' });
	cookies.delete('rt', { path: '/' });
	cookies.delete('remember', { path: '/' });
	return new Response(null, { status: 204 });
};
