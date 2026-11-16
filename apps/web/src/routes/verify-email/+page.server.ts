import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { INTERNAL_API_URL } from '#lib/server/config.js';
import { apiFetch } from '#lib/server/apiFetch.js';

/**
 * The link in the verification email lands here. Opening it changes nothing:
 * mail scanners fetch links, and a link spent on GET could be spent by one.
 * The player presses "Verify my email", which posts the token. Verifying
 * proves the inbox, not the password, so it signs no one in (see the API's
 * verifyEmail): the player signs in next.
 */
export const load: PageServerLoad = async ({ url }) => {
	// Block email verification during maintenance.
	try {
		const maintRes = await apiFetch(`${INTERNAL_API_URL}/api/v1/maintenance/status`);
		if (maintRes.ok) {
			const maint = (await maintRes.json()) as { enabled?: boolean; message?: string };
			if (maint.enabled) {
				return {
					maintenance: true,
					maintenanceMessage:
						maint.message ?? 'The system is currently under maintenance. Please try again later.',
					error: null,
					token: '',
				};
			}
		}
	} catch {
		/* ignore — don't block the page if the status endpoint is down */
	}

	const token = url.searchParams.get('token') ?? '';
	if (!token) {
		return { error: 'Missing verification token. Please use the link from your email.', token };
	}
	return { error: null, token };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const token = String(form.get('token') ?? '');
		if (!token) {
			return fail(400, {
				error: 'Missing verification token. Please use the link from your email.',
			});
		}

		let res: Response;
		try {
			res = await apiFetch(`${INTERNAL_API_URL}/api/v1/auth/verify-email`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token }),
			});
		} catch {
			return fail(503, { error: 'Could not reach the API server. Please try again.' });
		}

		if (!res.ok) {
			const body = (await res.json().catch(() => ({}))) as { message?: string };
			return fail(res.status, {
				error: body.message ?? 'Verification failed. The link may have expired: ask for a new one.',
			});
		}
		return { verified: true };
	},
};
