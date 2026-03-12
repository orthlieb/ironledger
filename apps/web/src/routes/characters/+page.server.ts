import { redirect, error } from '@sveltejs/kit';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { INTERNAL_API_URL } from '$env/static/private';
import type { CharacterSummary } from '$lib/api.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	const res = await fetch(`${INTERNAL_API_URL}/api/v1/characters`, {
		headers: { Authorization: `Bearer ${locals.accessToken}` },
	});

	if (!res.ok) throw error(res.status, 'Failed to load characters.');

	const chars = (await res.json()) as CharacterSummary[];
	return { characters: chars };
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		if (!locals.user) throw redirect(302, '/login');

		const form = await request.formData();
		const name = ((form.get('name') as string | null) ?? '').trim() || 'New Character';

		const res = await fetch(`${INTERNAL_API_URL}/api/v1/characters`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${locals.accessToken}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ name, data: {} }),
		});

		if (!res.ok) return fail(res.status, { error: 'Could not create character.' });

		const char = (await res.json()) as { id: string };
		throw redirect(302, `/characters/${char.id}`);
	},
};
