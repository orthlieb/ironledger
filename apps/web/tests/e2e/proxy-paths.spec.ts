/**
 * proxy-paths.spec.ts — a route parameter can't climb out of its route.
 *
 * SvelteKit decodes route parameters, so before the fix an id of "../log"
 * turned DELETE /api/session/npcs/..%2Flog into DELETE /api/v1/session/log
 * upstream, wiping the player's whole log; "../../admin/users/<id>/role"
 * reached the admin API with the visitor's token. Ids like these arrive in
 * shared backup files. Now each parameter is encoded as one path segment.
 */
import { test, expect } from '@playwright/test';

test.describe('BFF proxy paths', () => {
	test('an id of "../log" deletes nothing but that (non-existent) entity', async ({ request }) => {
		const id = crypto.randomUUID();
		const add = await request.post('/api/session/log', {
			data: { id, title: 'Canary', html: '<p>canary</p>', ts: new Date().toISOString() },
		});
		expect(add.status()).toBe(201);

		const del = await request.delete('/api/session/npcs/..%2Flog');
		expect(del.status()).toBeLessThan(500);

		const log = await (await request.get('/api/session/log')).json();
		const entries = Array.isArray(log) ? log : (log.entries ?? []);
		expect(entries.some((e: { id: string }) => e.id === id)).toBe(true);
		await request.delete(`/api/session/log/${id}`);
	});

	test('"." and ".." on their own are refused', async ({ request }) => {
		expect((await request.delete('/api/session/npcs/..')).status()).toBeGreaterThanOrEqual(400);
		expect((await request.delete('/api/session/npcs/.')).status()).toBeGreaterThanOrEqual(400);
	});

	test('the AI proxy reaches only the AI routes', async ({ request }) => {
		expect((await request.get('/api/ai/config')).status()).toBe(200);
		expect((await request.get('/api/ai/..%2Fadmin%2Fstats')).status()).toBe(404);
		expect((await request.get('/api/ai/anything-else')).status()).toBe(404);
	});
});
