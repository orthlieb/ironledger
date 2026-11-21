import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { INTERNAL_API_URL, HCAPTCHA_SITE_KEY } from '#lib/server/config.js';
import { apiFetch } from '#lib/server/apiFetch.js';

export const load: PageServerLoad = async ({ url }) => {
	// Prefill from ?email= (the log-in page passes it).
	const email = (url.searchParams.get('email') ?? '').slice(0, 254);

	// Block during maintenance, as the other sign-in pages do.
	try {
		const maintRes = await apiFetch(`${INTERNAL_API_URL}/api/v1/maintenance/status`);
		if (maintRes.ok) {
			const maint = (await maintRes.json()) as { enabled?: boolean; message?: string };
			if (maint.enabled) {
				return {
					maintenance: true,
					maintenanceMessage:
						maint.message ?? 'The system is currently under maintenance. Please try again later.',
					hcaptchaSiteKey: HCAPTCHA_SITE_KEY,
					isDev: process.env.NODE_ENV !== 'production',
					email,
				};
			}
		}
	} catch {
		/* ignore — don't block the page if the status endpoint is down */
	}

	return {
		hcaptchaSiteKey: HCAPTCHA_SITE_KEY,
		isDev: process.env.NODE_ENV !== 'production',
		email,
	};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const email = (form.get('email') as string | null) ?? '';
		const captchaToken = (form.get('h-captcha-response') as string | null) ?? '';

		if (!email) {
			return fail(400, { error: 'Email is required.', email, sent: false });
		}

		const isDev = process.env.NODE_ENV !== 'production';
		if (!captchaToken && !isDev) {
			return fail(400, { error: 'Please complete the captcha.', email, sent: false });
		}

		try {
			await apiFetch(`${INTERNAL_API_URL}/api/v1/auth/resend-verification`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, captchaToken }),
			});
		} catch {
			return fail(503, {
				error: 'Could not reach the API server. Please try again.',
				email,
				sent: false,
			});
		}

		// Always return success regardless of whether the email exists or is
		// already verified. The API deliberately returns 202 to prevent
		// email enumeration.
		return { sent: true, email };
	},
};
