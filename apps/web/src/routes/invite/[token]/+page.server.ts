import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { INTERNAL_API_URL } from '$lib/server/config.js';

const THIRTY_DAYS = 30 * 24 * 60 * 60;

export const load: PageServerLoad = async ({ params, locals }) => {
	// If they're already signed in, we still let the page render — they can
	// log out and accept as the invited identity, or navigate away.

	let res: Response;
	try {
		res = await fetch(`${INTERNAL_API_URL}/api/v1/invites/${params.token}`);
	} catch {
		return { token: params.token, error: 'Could not reach the server. Please try again.' };
	}

	if (!res.ok) {
		const body = (await res.json().catch(() => ({}))) as { message?: string };
		return {
			token: params.token,
			error: body.message ?? 'This invitation link is no longer valid.',
			alreadySignedIn: !!locals.user,
		};
	}

	const preview = (await res.json()) as {
		email: string;
		displayName: string | null;
		expiresAt: string;
	};
	return { token: params.token, preview, alreadySignedIn: !!locals.user };
};

export const actions: Actions = {
	default: async ({ request, params, cookies }) => {
		const form = await request.formData();
		const password = (form.get('password') as string | null) ?? '';
		const confirm = (form.get('confirm') as string | null) ?? '';
		const displayName = ((form.get('displayName') as string | null) ?? '').trim();

		if (!password || !confirm) {
			return fail(400, { error: 'Please enter and confirm your password.', displayName });
		}
		if (password !== confirm) {
			return fail(400, { error: 'Passwords do not match.', displayName });
		}
		if (password.length < 12) {
			return fail(400, { error: 'Password must be at least 12 characters.', displayName });
		}

		let res: Response;
		try {
			res = await fetch(`${INTERNAL_API_URL}/api/v1/invites/${params.token}/accept`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					password,
					...(displayName ? { displayName } : {}),
				}),
			});
		} catch {
			return fail(503, { error: 'Could not reach the server. Please try again.', displayName });
		}

		if (!res.ok) {
			const body = (await res.json().catch(() => ({}))) as { message?: string };
			return fail(res.status, {
				error: body.message ?? 'We could not accept this invitation. It may have expired.',
				displayName,
			});
		}

		const body = (await res.json()) as { accessToken: string };

		// Extract the refresh token from Fastify's Set-Cookie and mirror it
		// into the browser's cookie jar (same pattern as login/+page.server.ts).
		const setCookieHeader = res.headers.get('set-cookie') ?? '';
		const rtMatch = setCookieHeader.match(/(?:^|,)\s*rt=([^;,]+)/);
		const refreshToken = rtMatch?.[1];

		// Invited users don't have a remember-me toggle; default to the same
		// 30-day persistence used by login's remember-me path — invitation is
		// a deliberate act and we want them to stay signed in.
		cookies.set('access_token', body.accessToken, {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: process.env.NODE_ENV === 'production',
			maxAge: THIRTY_DAYS,
		});

		if (refreshToken) {
			cookies.set('rt', refreshToken, {
				path: '/',
				httpOnly: true,
				sameSite: 'strict',
				secure: process.env.NODE_ENV === 'production',
				maxAge: THIRTY_DAYS,
			});
		}

		throw redirect(302, '/home');
	},
};
