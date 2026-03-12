import { redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { INTERNAL_API_URL } from '$env/static/private';
import type { CharacterFull } from '$lib/api.js';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(302, '/login');

	const res = await fetch(`${INTERNAL_API_URL}/api/v1/characters/${params.id}`, {
		headers: { Authorization: `Bearer ${locals.accessToken}` },
	});

	if (res.status === 404) throw error(404, 'Character not found.');
	if (!res.ok)            throw error(res.status, 'Failed to load character.');

	const character = (await res.json()) as CharacterFull;
	return { character };
};

export const actions: Actions = {
	delete: async ({ locals, params }) => {
		if (!locals.user) throw redirect(302, '/login');

		await fetch(`${INTERNAL_API_URL}/api/v1/characters/${params.id}`, {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${locals.accessToken}` },
		});

		throw redirect(302, '/characters');
	},
};
