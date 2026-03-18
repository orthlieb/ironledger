import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Only verify auth here. Character data is loaded client-side after mount
// so the app shell renders immediately without waiting for the API.
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	return {};
};

// Create and delete are handled client-side via the BFF API (/api/characters).
