import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { INTERNAL_API_URL, HCAPTCHA_SITE_KEY } from '$lib/server/config.js';

export const load: PageServerLoad = async ({ locals }) => {
	// Already logged in? Skip registration.
	if (locals.user) throw redirect(302, '/home');

	// Single round-trip: maintenance / admin lock / daily quota all fold
	// into a single { closed } field with reason + message. The /register
	// page shows the closed-state UI on load (not on submit) whenever any
	// gate is tripped, so visitors see the wall before typing anything.
	try {
		const res = await fetch(`${INTERNAL_API_URL}/api/v1/registration/status`);
		if (res.ok) {
			const body = (await res.json()) as {
				closed: { reason: 'maintenance' | 'locked' | 'quota'; message: string } | null;
			};
			if (body.closed) {
				return {
					registrationClosed: true,
					closedReason: body.closed.reason,
					closedMessage: body.closed.message,
					hcaptchaSiteKey: HCAPTCHA_SITE_KEY,
					isDev: process.env.NODE_ENV !== 'production',
				};
			}
		}
	} catch {
		/* ignore — don't block the page if the status endpoint is down */
	}

	return { hcaptchaSiteKey: HCAPTCHA_SITE_KEY, isDev: process.env.NODE_ENV !== 'production' };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const email = (form.get('email') as string | null) ?? '';
		const password = (form.get('password') as string | null) ?? '';
		const confirm = (form.get('confirm') as string | null) ?? '';
		const captchaToken = (form.get('h-captcha-response') as string | null) ?? '';
		const displayNameRaw = (form.get('displayName') as string | null) ?? '';
		const displayName = displayNameRaw.trim();
		// Checkbox is default-on client-side but only submits `on` when checked.
		const seedStarter = form.get('seedStarter') === 'on';

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
				method: 'POST',
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
			return fail(503, {
				error: 'Could not reach the API server. Please try again.',
				email,
				displayName,
			});
		}

		if (!res.ok) {
			const body = (await res.json().catch(() => ({}))) as { message?: string };
			return fail(res.status, {
				error: body.message ?? 'Registration failed. Please try again.',
				email,
				displayName,
			});
		}

		// Persist the starter-seed choice across the email-verification round-trip
		// via a client-readable cookie. /home consumes + clears it on first load;
		// see the seed-starter block in apps/web/src/routes/home/+page.svelte.
		// httpOnly=false because the client fetches + imports the zip; secure/
		// sameSite match the auth cookie set by verify-email/+page.server.ts.
		// Name uses underscores (not colons like our localStorage keys) so no
		// browser or proxy silently normalises it away.
		if (seedStarter) {
			cookies.set('il_seed_starter', '1', {
				path: '/',
				httpOnly: false,
				sameSite: 'strict',
				secure: process.env.NODE_ENV === 'production',
				maxAge: 7 * 24 * 60 * 60, // 7 days — plenty of time to click the email link
			});
		}

		throw redirect(302, '/register/sent');
	},
};
