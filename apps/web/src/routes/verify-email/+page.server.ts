import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { INTERNAL_API_URL } from '$lib/server/config.js';

export const load: PageServerLoad = async ({ url, cookies }) => {
	const token = url.searchParams.get('token');

	if (!token) {
		return { error: 'Missing verification token. Please use the link from your email.' };
	}

	let res: Response;
	try {
		res = await fetch(`${INTERNAL_API_URL}/api/v1/auth/verify-email`, {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify({ token }),
		});
	} catch {
		return { error: 'Could not reach the API server. Please try again.' };
	}

	if (!res.ok) {
		const body = await res.json().catch(() => ({})) as { message?: string };
		return {
			error: body.message ?? 'Verification failed. The link may have expired — please register again.',
		};
	}

	const body = (await res.json()) as { accessToken: string };

	// Set the access token — user is now logged in.
	cookies.set('access_token', body.accessToken, {
		path:     '/',
		httpOnly: true,
		sameSite: 'strict',
		secure:   process.env.NODE_ENV === 'production',
		maxAge:   900, // 15 minutes — matches JWT TTL
	});

	throw redirect(302, '/characters');
};
