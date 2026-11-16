import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { INTERNAL_API_URL } from '#lib/server/config.js';

export const load: PageServerLoad = async ({ url, cookies }) => {
	// Block email verification during maintenance.
	try {
		const maintRes = await fetch(`${INTERNAL_API_URL}/api/v1/maintenance/status`);
		if (maintRes.ok) {
			const maint = (await maintRes.json()) as { enabled?: boolean; message?: string };
			if (maint.enabled) {
				return {
					maintenance: true,
					maintenanceMessage:
						maint.message ?? 'The system is currently under maintenance. Please try again later.',
					error: null,
				};
			}
		}
	} catch {
		/* ignore — don't block the page if the status endpoint is down */
	}

	const token = url.searchParams.get('token');

	if (!token) {
		return { error: 'Missing verification token. Please use the link from your email.' };
	}

	let res: Response;
	try {
		res = await fetch(`${INTERNAL_API_URL}/api/v1/auth/verify-email`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token }),
		});
	} catch {
		return { error: 'Could not reach the API server. Please try again.' };
	}

	if (!res.ok) {
		const body = (await res.json().catch(() => ({}))) as { message?: string };
		return {
			error: body.message ?? 'Verification failed. The link may have expired: ask for a new one.',
		};
	}

	const body = (await res.json()) as { accessToken: string };

	// Set the access token — user is now logged in.
	cookies.set('access_token', body.accessToken, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: process.env.NODE_ENV === 'production',
		maxAge: 900, // 15 minutes — matches JWT TTL
	});

	// And the refresh token, as the log-in page does, so hooks.server.ts can
	// renew the access token. Without it a brand-new player was signed out
	// 15 minutes after verifying. A session cookie: the log-in page's
	// "remember me" is what makes it last 30 days.
	const rt = (res.headers.get('set-cookie') ?? '').match(/(?:^|,)\s*rt=([^;,]+)/)?.[1];
	if (rt) {
		cookies.set('rt', rt, {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: process.env.NODE_ENV === 'production',
		});
	}

	throw redirect(302, '/home');
};
