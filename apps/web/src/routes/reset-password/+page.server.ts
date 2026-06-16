import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { INTERNAL_API_URL } from '$lib/server/config.js';

export const load: PageServerLoad = async ({ url }) => {
	// Block password reset during maintenance — same gate as /forgot-password.
	try {
		const maintRes = await fetch(`${INTERNAL_API_URL}/api/v1/maintenance/status`);
		if (maintRes.ok) {
			const maint = (await maintRes.json()) as { enabled?: boolean; message?: string };
			if (maint.enabled) {
				return {
					maintenance: true,
					maintenanceMessage:
						maint.message ?? 'The system is currently under maintenance. Please try again later.',
					token: '',
				};
			}
		}
	} catch {
		/* ignore — don't block the page if the status endpoint is down */
	}

	// Token is in the query string of the email link (sendPasswordResetEmail
	// in apps/api/src/lib/mailer.ts builds `${APP_URL}/reset-password?token=…`).
	// We don't validate it here — the API endpoint does that authoritatively
	// when the form submits — but a missing or empty token means the link is
	// malformed and we should warn the user up front.
	const token = url.searchParams.get('token') ?? '';

	return { token };
};

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const token = (form.get('token') as string | null) ?? '';
		const password = (form.get('password') as string | null) ?? '';
		const confirm = (form.get('confirm') as string | null) ?? '';

		if (!token) {
			return fail(400, { error: 'Reset token is missing. Please use the link from your email.' });
		}
		if (!password) {
			return fail(400, { error: 'New password is required.' });
		}
		if (password !== confirm) {
			return fail(400, { error: 'Passwords do not match.' });
		}

		let res: Response;
		try {
			res = await fetch(`${INTERNAL_API_URL}/api/v1/auth/reset-password`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token, password }),
			});
		} catch {
			return fail(503, { error: 'Could not reach the API server. Please try again.' });
		}

		if (!res.ok) {
			// API surfaces AuthError + PwnedPasswordError as { message, statusCode, … }.
			// Pass the server-side message through verbatim so the user sees
			// the actual reason (expired token, weak password, breached password).
			const body = (await res.json().catch(() => null)) as { message?: string } | null;
			return fail(res.status, {
				error:
					body?.message ??
					'We could not reset your password. The link may have expired — please request a new one.',
			});
		}

		return { sent: true };
	},
};
