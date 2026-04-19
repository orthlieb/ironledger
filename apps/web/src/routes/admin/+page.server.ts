/**
 * /admin route guard.
 *
 * Admin UI lives entirely in +page.svelte and fetches its data client-side,
 * so this server load only enforces auth + role. Non-admins and unauthenticated
 * users are bounced out.
 */
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	if (locals.user.role !== 'admin') throw redirect(302, '/home');
	return {};
};
