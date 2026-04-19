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

	// Block registration when locked by admin.
	try {
		const lockRes = await fetch(`${INTERNAL_API_URL}/api/v1/admin/registration-lock/status`);
		if (lockRes.ok) {
			const lock = await lockRes.json() as { locked?: boolean; message?: string };
			if (lock.locked) {
				return {
					registrationLocked: true,
					registrationLockMessage: lock.message ?? 'New account registration is currently disabled.',
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
		const displayNameRaw = (form.get('displayName')      as string | null) ?? '';
		const displayName  = displayNameRaw.trim();

		if (!email || !password || !confirm) {
			return fail(400, { error: 'All fields are required.', email, displayName });
		}

		if (password !== confirm) {
			return fail(400, { error: 'Passwords do not match.', email, displayName });
		}

		if (password.length < 12) {
			return fail(400, { error: 'Password must be at least 12 characters.', email, displayName });
		}

		const isDev = process.env.NODE_ENV !== 'production';
		if (!captchaToken && !isDev) {
			return fail(400, { error: 'Please complete the captcha.', email, displayName });
		}

		let res: Response;
		try {
			res = await fetch(`${INTERNAL_API_URL}/api/v1/auth/register`, {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email,
					password,
					captchaToken,
					// Only send the field if the user filled it — backend defaults to email.
					...(displayName ? { displayName } : {}),
				}),
			});
		} catch {
			return fail(503, { error: 'Could not reach the API server. Please try again.', email, displayName });
		}

		if (!res.ok) {
			const body = await res.json().catch(() => ({})) as { message?: string };
			return fail(res.status, {
				error: body.message ?? 'Registration failed. Please try again.',
				email,
				displayName,
			});
		}

		throw redirect(302, '/register/sent');
	},
};
