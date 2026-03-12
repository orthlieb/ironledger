import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { INTERNAL_API_URL } from '$lib/server/config.js';
import type { CharacterFull } from '$lib/api.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	const res = await fetch(`${INTERNAL_API_URL}/api/v1/characters`, {
		headers: { Authorization: `Bearer ${locals.accessToken}` },
	});

	if (!res.ok) throw error(res.status, 'Failed to load characters.');

	const chars = (await res.json()) as CharacterFull[];
	return { characters: chars };
};

// Create and delete are handled client-side via the BFF API (/api/characters).
