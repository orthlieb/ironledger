/**
 * log-order.spec.ts — the log's newest entry at the top (the default) or at
 * the bottom, as a command line prints its output (Settings → Appearance →
 * Newest log entry; docs/log.md). A setting of this browser only.
 *
 * Entries are injected (window.__testLog, from hooks.client.ts) and found by
 * id, so entries other specs write don't matter.
 */
import { test, expect, type Page } from '@playwright/test';
import { settleHome } from './helpers/home';

async function openHome(page: Page) {
	await page.goto('/home');
	await settleHome(page);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	await page.waitForFunction(() => !!(window as any).__testLog, undefined, { timeout: 8_000 });
}

async function inject(page: Page, title: string, id: string) {
	await page.evaluate(
		([t, i]) =>
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(window as any).__testLog.appendLog(t, '<div>An entry to put in order.</div>', i),
		[title, id],
	);
	await expect(page.locator(`.log-entry[data-entry-id="${id}"]`)).toBeVisible();
}

/** The entries' ids in the order the log shows them. */
const shownIds = (page: Page) =>
	page
		.locator('.log-entry')
		.evaluateAll((els) => els.map((e) => e.getAttribute('data-entry-id') ?? ''));

/** Settings → Appearance → Newest log entry → Top or Bottom. */
async function setNewest(page: Page, where: 'Top' | 'Bottom') {
	await expect(async () => {
		await page.locator('.hamburger-btn').click();
		await expect(page.locator('.hm-menu')).toBeVisible({ timeout: 1_000 });
	}).toPass({ timeout: 10_000 });
	await page.locator('.hm-item', { hasText: /settings/i }).click();
	const dialog = page.locator('.settings-dialog');
	await expect(dialog).toBeVisible();
	await dialog.locator('.sd-tab', { hasText: /^Appearance$/ }).click();
	const row = dialog.locator('.sd-row', { hasText: 'Newest log entry' });
	await row.locator('.sd-seg-btn', { hasText: where }).click();
	await expect(row.locator('.sd-seg-btn', { hasText: where })).toHaveAttribute('data-state', 'on');
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
}

test.describe('Log order', () => {
	test('newest at the top by default, at the bottom when set, and remembered', async ({ page }) => {
		await openHome(page);
		const [one, two, three] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
		await inject(page, 'Order one', one);
		await inject(page, 'Order two', two);

		// The default: the newest first.
		let ids = await shownIds(page);
		expect(ids.indexOf(two)).toBeLessThan(ids.indexOf(one));

		await setNewest(page, 'Bottom');
		ids = await shownIds(page);
		expect(ids.indexOf(two)).toBeGreaterThan(ids.indexOf(one));

		// A new entry lands at the bottom, scrolled into view.
		await inject(page, 'Order three', three);
		ids = await shownIds(page);
		expect(ids.at(-1)).toBe(three);
		const log = page.locator('.log-entries');
		await expect
			.poll(() => log.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop <= 2))
			.toBe(true);

		// This browser remembers it.
		await openHome(page);
		ids = await shownIds(page);
		expect(ids.indexOf(three)).toBeGreaterThan(ids.indexOf(two));
		expect(ids.indexOf(two)).toBeGreaterThan(ids.indexOf(one));

		await setNewest(page, 'Top');
		ids = await shownIds(page);
		expect(ids.indexOf(three)).toBeLessThan(ids.indexOf(two));
	});
});
