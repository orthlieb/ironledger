import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// /home-v2 — UI prototype (deck-of-cards layout). Auth gate identical to /home.
// All character / foe / community / expedition data loads client-side via the
// existing stores; no server load needed.
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	return {};
};
