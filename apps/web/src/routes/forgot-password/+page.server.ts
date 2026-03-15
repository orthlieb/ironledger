import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { INTERNAL_API_URL } from '$lib/server/config.js';

export const load: PageServerLoad = async () => {
	return {};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form  = await request.formData();
		const email = (form.get('email') as string | null) ?? '';

		if (!email) {
			return fail(400, { error: 'Email is required.', email, sent: false });
		}

		try {
			await fetch(`${INTERNAL_API_URL}/api/v1/auth/forgot-password`, {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email,
					// hCaptcha test token — always passes in dev
					captchaToken: '10000000-aaaa-bbbb-cccc-000000000001',
				}),
			});
		} catch {
			return fail(503, { error: 'Could not reach the API server. Please try again.', email, sent: false });
		}

		// Always return success regardless of whether the email exists.
		// The API deliberately returns 202 to prevent email enumeration.
		return { sent: true, email };
	},
};
