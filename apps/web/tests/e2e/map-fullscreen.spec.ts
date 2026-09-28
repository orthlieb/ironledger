/**
 * map-fullscreen.spec.ts — Map dialog's fullscreen toggle + mobile auto-mode.
 *
 * The dialog sizes to 80vw × 80vh on desktop by default and 90vw × 90vh
 * on mobile via an aspect-preserving JS fit. A header toggle
 * (`[aria-label="Fullscreen" | "Restore dialog size"]`) swaps in the
 * `.mp-dialog--fullscreen` variant that fills the viewport
 * (100vw × 100dvh, no rounding). The choice persists per-device via
 * `localStorage['ironledger:map:fullscreen']`.
 *
 *   • Desktop — the toggle exists, clicking swaps the variant class,
 *     and the dialog's dimensions grow to match the viewport.
 *   • Persistence — the localStorage entry sticks across a reload +
 *     re-open; the dialog comes back fullscreen.
 *   • Mobile — the toggle isn't rendered at all; the variant class is
 *     present unconditionally so the dialog fills the phone.
 *   • Chrome — the title reads "Maps"; the drag grip is hidden on
 *     mobile since the fullscreen surface has no parent to drag
 *     against.
 */
import { test, expect, type Page } from '@playwright/test';
import { resetAll } from './helpers/reset';

async function waitForHome(page: Page): Promise<void> {
	await page
		.locator('[aria-label="Open the campaign map"]')
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
	await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
}

async function openMap(page: Page): Promise<void> {
	await page.locator('[aria-label="Open the campaign map"]').first().click();
	await expect(page.locator('.mp-dialog')).toBeVisible({ timeout: 15_000 });
}

test.describe('Map dialog — fullscreen toggle (desktop)', () => {
	test.beforeAll(async () => {
		await resetAll();
	});

	test.beforeEach(async ({ page }) => {
		// Reset the persisted preference before every test so one test's
		// fullscreen click doesn't leak into the next.
		await page.goto('/home');
		await page.evaluate(() => localStorage.removeItem('ironledger:map:fullscreen'));
		await page.reload();
		await waitForHome(page);
	});

	test('title reads "Maps" and the fullscreen toggle is rendered', async ({ page }) => {
		await openMap(page);
		await expect(page.locator('.mp-dialog .dh-title')).toHaveText('Maps');
		await expect(page.locator('[aria-label="Fullscreen"]')).toBeVisible();
	});

	test('clicking the toggle enters fullscreen; clicking again exits', async ({ page }) => {
		await openMap(page);
		const dialog = page.locator('.mp-dialog');
		await expect(dialog).not.toHaveClass(/mp-dialog--fullscreen/);

		await page.locator('[aria-label="Fullscreen"]').click();
		await expect(dialog).toHaveClass(/mp-dialog--fullscreen/);
		// Fullscreen fills the viewport (allow a ~2 px rounding gap).
		const dims = await dialog.evaluate((el: Element) => {
			const r = (el as HTMLElement).getBoundingClientRect();
			return { w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
		});
		expect(Math.abs(dims.w - dims.vw)).toBeLessThan(2);
		expect(Math.abs(dims.h - dims.vh)).toBeLessThan(2);

		await page.locator('[aria-label="Restore dialog size"]').click();
		await expect(dialog).not.toHaveClass(/mp-dialog--fullscreen/);
	});

	test('choice persists across reload + re-open', async ({ page }) => {
		await openMap(page);
		await page.locator('[aria-label="Fullscreen"]').click();
		await expect(page.locator('.mp-dialog')).toHaveClass(/mp-dialog--fullscreen/);
		// localStorage carries the flag.
		const saved = await page.evaluate(() => localStorage.getItem('ironledger:map:fullscreen'));
		expect(saved).toBe('1');

		await page.reload();
		await waitForHome(page);
		await openMap(page);
		// The re-opened dialog is fullscreen without another click.
		await expect(page.locator('.mp-dialog')).toHaveClass(/mp-dialog--fullscreen/);
	});
});

test.describe('Map dialog — mobile auto-fullscreen', () => {
	test.beforeAll(async () => {
		await resetAll();
	});

	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 400, height: 700 });
		await page.goto('/home');
		// Clear the desktop-side toggle so the mobile case isn't just
		// coincidentally on because a previous run flipped it.
		await page.evaluate(() => localStorage.removeItem('ironledger:map:fullscreen'));
		await page.reload();
		await waitForHome(page);
	});

	test('no toggle is rendered; dialog auto-fullscreens; drag grip is hidden', async ({ page }) => {
		await openMap(page);
		const dialog = page.locator('.mp-dialog');
		// Auto-fullscreen — the variant class is on the dialog without
		// any explicit user gesture.
		await expect(dialog).toHaveClass(/mp-dialog--fullscreen/);
		// No fullscreen button to press.
		await expect(page.locator('[aria-label="Fullscreen"]')).toHaveCount(0);
		await expect(page.locator('[aria-label="Restore dialog size"]')).toHaveCount(0);
		// Drag grip is styled to `display: none` at this width.
		const gripDisplay = await page
			.locator('.mp-dialog .drag-grip')
			.first()
			.evaluate((el: Element) => getComputedStyle(el).display);
		expect(gripDisplay).toBe('none');
	});
});
