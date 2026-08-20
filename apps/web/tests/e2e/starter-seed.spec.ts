/**
 * starter-seed.spec.ts — Starter Ironlands auto-import.
 *
 * When a new user checks the "Start with the Starter Ironlands" box on
 * /register, the server drops an `il_seed_starter=1` cookie that /home
 * consumes on first load: fetches /about/ironlands-starter.zip, wraps it
 * as a File, and drives it through the same hidden file-input the manual
 * Import Data flow uses. The cookie is cleared immediately so an aborted
 * run can't loop, and the import is gated on the account being empty so
 * a stale cookie never overwrites real saga data.
 *
 * This spec doesn't exercise the register → email-verify plumbing (that
 * lives in registration-quota.spec.ts). It exercises the seed-consumption
 * side end-to-end: reset the test user's data, set the cookie, load /home,
 * and assert the starter's places land — and that no import-error surface
 * was ever shown, matching the "the import happens without errors" ask.
 */

import { test, expect, type Page } from '@playwright/test';
import { resetAll } from './helpers/reset';

const CM_AREA = '.home-area--communities';
const CM_ACTIONS = `${CM_AREA} .cm-header-actions`;

async function entryCount(page: Page): Promise<number> {
	const s = await page.locator(CM_ACTIONS).getAttribute('data-entry-count');
	return Number(s ?? '0');
}

test.describe('Starter Ironlands seed (post-register cookie flow)', () => {
	test.beforeEach(async () => {
		// Wipe everything the seed would auto-import — the /home hook is gated
		// on the account being empty, so a leftover row from a prior test would
		// make it silently no-op.
		await resetAll();
	});

	test('with il_seed_starter=1 cookie, /home auto-imports places from the starter zip', async ({
		page,
	}) => {
		// Fail the test if the /home hook logs its "auto-import failed" warning
		// or if the import pipeline surfaces an error into the .import-error
		// banner. Attached before navigation so we don't miss a race.
		const importFailures: string[] = [];
		page.on('console', (msg) => {
			const text = msg.text();
			if (msg.type() === 'warning' && text.includes('[seed-starter]')) {
				importFailures.push(text);
			}
		});

		// Set the seed cookie at the app origin (baseURL is http://localhost:5173
		// per playwright.config.ts). Using `url` lets Playwright resolve domain +
		// path from a single string.
		await page.context().addCookies([
			{
				name: 'il_seed_starter',
				value: '1',
				url: 'http://localhost:5173',
				sameSite: 'Strict',
			},
		]);

		await page.goto('/home');

		// The Connections area's data-entry-count reflects communities + NPCs +
		// places. Starter carries places (no communities, no NPCs), so the count
		// climbing above zero is proof the import round-tripped through the
		// stores + persisted to the API. Give the fetch + parseImportZip pipeline
		// a generous window — it walks the whole zip and dispatches to every
		// entity store.
		await expect
			.poll(() => entryCount(page), { timeout: 20_000, intervals: [500, 1000, 2000] })
			.toBeGreaterThan(0);

		// The .import-error banner is where onImportFile surfaces any user-
		// facing failure (ImportError). Must never be visible on the happy path.
		await expect(page.locator('.import-error')).toHaveCount(0);
		expect(importFailures).toEqual([]);

		// Cookie should be gone — the hook clears it up front so we don't loop.
		const cookies = await page.context().cookies();
		expect(cookies.find((c) => c.name === 'il_seed_starter')).toBeUndefined();
	});

	test('without the cookie, /home imports nothing (baseline)', async ({ page }) => {
		await page.goto('/home');
		// No cookie set → the seed hook returns early → count stays 0.
		await expect(page.locator(CM_ACTIONS)).toBeVisible({ timeout: 10_000 });
		expect(await entryCount(page)).toBe(0);
	});
});
