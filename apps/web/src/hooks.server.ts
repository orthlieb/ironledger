import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get('access_token');

	if (token) {
		try {
			// Decode JWT payload — Fastify verifies the signature when we call it.
			// We just need the claims for SSR page rendering.
			const [, payloadB64] = token.split('.');
			const payload = JSON.parse(
				Buffer.from(payloadB64, 'base64url').toString('utf8'),
			) as { sub?: string; email?: string; exp?: number };

			if (payload.exp && payload.exp * 1000 > Date.now()) {
				event.locals.accessToken = token;
				event.locals.user = {
					id: payload.sub ?? '',
					email: payload.email ?? '',
				};
			} else {
				// Expired — clear so login redirect works
				event.locals.accessToken = null;
				event.locals.user = null;
			}
		} catch {
			event.locals.accessToken = null;
			event.locals.user = null;
		}
	} else {
		event.locals.accessToken = null;
		event.locals.user = null;
	}

	return resolve(event);
};
