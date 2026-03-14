import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The app is now a single-page experience at /characters.
// Direct links to /characters/:id redirect there.
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	throw redirect(302, '/characters');
};
