import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { INTERNAL_API_URL } from '$env/static/private';

export const load: PageServerLoad = async ({ locals }) => {
	// Already logged in? Skip login page.
	if (locals.user) throw redirect(302, '/characters');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const email    = (form.get('email')    as string | null) ?? '';
		const password = (form.get('password') as string | null) ?? '';

		if (!email || !password) {
			return fail(400, { error: 'Email and password are required.', email });
		}

		let res: Response;
		try {
			res = await fetch(`${INTERNAL_API_URL}/api/v1/auth/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email,
					password,
					// Use the hCaptcha test token in all non-production envs.
					// Replace with a real frontend widget token in production.
					captchaToken: '10000000-aaaa-bbbb-cccc-000000000001',
				}),
			});
		} catch {
			return fail(503, { error: 'Could not reach the API server.', email });
		}

		if (res.status === 401) {
			return fail(401, { error: 'Invalid email or password.', email });
		}
		if (!res.ok) {
			return fail(res.status, { error: 'Login failed. Please try again.', email });
		}

		const body = (await res.json()) as { accessToken: string };

		// Set the access token in an HttpOnly cookie.
		// The SvelteKit server reads this in hooks.server.ts and in proxy routes.
		cookies.set('access_token', body.accessToken, {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: process.env.NODE_ENV === 'production',
			maxAge: 900, // 15 minutes — matches JWT TTL
		});

		// Fastify sets its own 'rt' refresh-token cookie automatically.
		throw redirect(302, '/characters');
	},
};
