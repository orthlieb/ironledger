import type { LayoutServerLoad } from './$types';

// Passes the user to every page via data.user
export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user,
	};
};
