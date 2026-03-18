import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { INTERNAL_API_URL } from '$lib/server/config.js';

export const load: PageServerLoad = async ({ locals }) => {
	// Already logged in? Skip registration.
	if (locals.user) throw redirect(302, '/home');
	return {};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form     = await request.formData();
		const email    = (form.get('email')    as string | null) ?? '';
		const password = (form.get('password') as string | null) ?? '';
		const confirm  = (form.get('confirm')  as string | null) ?? '';

		if (!email || !password || !confirm) {
			return fail(400, { error: 'All fields are required.', email });
		}

		if (password !== confirm) {
			return fail(400, { error: 'Passwords do not match.', email });
		}

		if (password.length < 12) {
			return fail(400, { error: 'Password must be at least 12 characters.', email });
		}

		let res: Response;
		try {
			res = await fetch(`${INTERNAL_API_URL}/api/v1/auth/register`, {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email,
					password,
					// hCaptcha test token — always passes in dev (secret starts with 0x0000…)
					captchaToken: '10000000-aaaa-bbbb-cccc-000000000001',
				}),
			});
		} catch {
			return fail(503, { error: 'Could not reach the API server. Please try again.', email });
		}

		if (!res.ok) {
			const body = await res.json().catch(() => ({})) as { message?: string };
			return fail(res.status, {
				error: body.message ?? 'Registration failed. Please try again.',
				email,
			});
		}

		throw redirect(302, '/register/sent');
	},
};
