// The admin UI has moved into the Admin tab of the main home page.
// This route redirects to /home for all users (admins will see the Admin tab there).
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	throw redirect(302, '/home');
};
