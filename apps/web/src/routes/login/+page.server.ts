import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { INTERNAL_API_URL, HCAPTCHA_SITE_KEY } from '$lib/server/config.js';

const TAGLINES = [
	'Your ledger awaits. Try not to die filling it in.',
	'Roll dice. Suffer consequences. Build character.',
	'Where every miss is just a plot twist.',
	"An oracle said you'd be fine. The oracle was wrong.",
	'Speak, friend, and enter.',
	'One does not simply walk into the Ironlands.',
	'Adventure awaits... prove you are worthy.',
	'A man, a plan, an axe, Ironsworn!',
	'Challenge roll, miss, mark a debility, repeat.',
];

const THIRTY_DAYS = 30 * 24 * 60 * 60; // seconds

export const load: PageServerLoad = async ({ locals }) => {
	// Already logged in? Skip login page.
	if (locals.user) {
		throw redirect(302, '/home');
	}
	const tagline = TAGLINES[Math.floor(Math.random() * TAGLINES.length)];
	return {
		hcaptchaSiteKey: HCAPTCHA_SITE_KEY,
		isDev: process.env.NODE_ENV !== 'production',
		tagline,
	};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const email = (form.get('email') as string | null) ?? '';
		const password = (form.get('password') as string | null) ?? '';
		const captchaToken = (form.get('h-captcha-response') as string | null) ?? '';
		const rememberMe = form.get('rememberMe') === 'on';

		if (!email || !password) {
			return fail(400, { error: 'Email and password are required.', email });
		}

		const isDev = process.env.NODE_ENV !== 'production';
		if (!captchaToken && !isDev) {
			return fail(400, { error: 'Please complete the captcha.', email });
		}

		let res: Response;
		try {
			res = await fetch(`${INTERNAL_API_URL}/api/v1/auth/login`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password, captchaToken }),
			});
		} catch {
			return fail(503, { error: 'Could not reach the API server.', email });
		}

		if (res.status === 401) {
			return fail(401, { error: 'Invalid email or password.', email });
		}
		if (res.status === 503) {
			// Could be maintenance mode — check the body
			const body = (await res.json().catch(() => ({}))) as { message?: string };
			const message =
				body.message ?? 'The system is currently under maintenance. Please try again later.';
			return fail(503, { maintenance: true, message, email });
		}
		if (!res.ok) {
			return fail(res.status, { error: 'Login failed. Please try again.', email });
		}

		const body = (await res.json()) as { accessToken: string };

		// Extract the refresh token from the Fastify Set-Cookie header so we can
		// store it in the browser's cookie jar (Fastify ↔ SvelteKit are separate
		// servers, so the browser never receives Fastify's Set-Cookie directly).
		const setCookieHeader = res.headers.get('set-cookie') ?? '';
		const rtMatch = setCookieHeader.match(/(?:^|,)\s*rt=([^;,]+)/);
		const refreshToken = rtMatch?.[1];

		// Set the access token — short-lived JWT used by hooks.server.ts for auth.
		// With remember-me the cookie persists 30 days; auto-refresh keeps it alive.
		cookies.set('access_token', body.accessToken, {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: process.env.NODE_ENV === 'production',
			maxAge: rememberMe ? THIRTY_DAYS : 900,
		});

		// Store the refresh token so hooks.server.ts can silently renew the access
		// token when it expires (every 15 min) without interrupting the session.
		// Without remember-me this is a session cookie — deleted on browser close.
		if (refreshToken) {
			cookies.set('rt', refreshToken, {
				path: '/',
				httpOnly: true,
				sameSite: 'strict',
				secure: process.env.NODE_ENV === 'production',
				...(rememberMe ? { maxAge: THIRTY_DAYS } : {}),
			});
		}

		// Everyone goes to /home; admins see the Admin tab there.
		throw redirect(302, '/home');
	},
};
