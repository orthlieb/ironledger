import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { INTERNAL_API_URL, HCAPTCHA_SITE_KEY } from '$lib/server/config.js';

export const load: PageServerLoad = async ({ locals }) => {
	// Already logged in? Skip registration.
	if (locals.user) throw redirect(302, '/home');

	// Block registration during maintenance.
	try {
		const maintRes = await fetch(`${INTERNAL_API_URL}/api/v1/maintenance/status`);
		if (maintRes.ok) {
			const maint = await maintRes.json() as { enabled?: boolean; message?: string };
			if (maint.enabled) {
				return {
					maintenance: true,
					maintenanceMessage: maint.message ?? 'The system is currently under maintenance. Please try again later.',
					hcaptchaSiteKey: HCAPTCHA_SITE_KEY,
					isDev: process.env.NODE_ENV !== 'production',
				};
			}
		}
	} catch { /* ignore — don't block the page if the status endpoint is down */ }

	return { hcaptchaSiteKey: HCAPTCHA_SITE_KEY, isDev: process.env.NODE_ENV !== 'production' };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form         = await request.formData();
		const email        = (form.get('email')              as string | null) ?? '';
		const password     = (form.get('password')           as string | null) ?? '';
		const confirm      = (form.get('confirm')            as string | null) ?? '';
		const captchaToken = (form.get('h-captcha-response') as string | null) ?? '';

		if (!email || !password || !confirm) {
			return fail(400, { error: 'All fields are required.', email });
		}

		if (password !== confirm) {
			return fail(400, { error: 'Passwords do not match.', email });
		}

		if (password.length < 12) {
			return fail(400, { error: 'Password must be at least 12 characters.', email });
		}

		const isDev = process.env.NODE_ENV !== 'production';
		if (!captchaToken && !isDev) {
			return fail(400, { error: 'Please complete the captcha.', email });
		}

		let res: Response;
		try {
			res = await fetch(`${INTERNAL_API_URL}/api/v1/auth/register`, {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password, captchaToken }),
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
