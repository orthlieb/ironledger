// @ts-nocheck
import type { LayoutServerLoad } from './$types';

// Passes the user to every page via data.user
export const load = async ({ locals }: Parameters<LayoutServerLoad>[0]) => {
	return {
		user: locals.user,
	};
};
