/**
 * map-icon-lightbox.spec.ts — the Choose Icon dialog's hover lightbox.
 *
 * On the Icons tab, hovering a tile with a mouse shows the icon enlarged
 * beside it (`.mp-icon-lightbox`), and leaving the tile hides it. It is a
 * hover affordance only: on a phone a tap — or the tile that lands under
 * the finger as the dialog opens — can fire an enter that iOS doesn't
 * report as touch, and with no hover to end it the lightbox stuck over the
 * grid. So on a device without hover it never shows, whatever the pointer
 * type says.
 */
import { test, expect, type Page } from '@playwright/test';
import { resetAll, clearMapMarkers } from './helpers/reset';

// Tiny 1×1 red PNG — the background map-markers.spec uploads.
const PNG_1X1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
	'base64',
);

/** Open the map, place a marker and open its icon picker on the Icons tab. */
async function openPicker(page: Page): Promise<void> {
	await page.goto('/home');
	await page
		.locator('[aria-label="Open the campaign map"]')
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
	await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
	await page.locator('[aria-label="Open the campaign map"]').first().click();
	await expect(page.locator('.mp-dialog')).toBeVisible({ timeout: 15_000 });
	await page.locator('.mp-empty-cta').or(page.locator('.mp-bg-image')).first().waitFor({
		timeout: 10_000,
	});
	await page.locator('#mp-file-input').setInputFiles({
		name: 'campaign-map.png',
		mimeType: 'image/png',
		buffer: PNG_1X1,
	});
	await expect(page.locator('.mp-grid-capture')).toBeVisible({ timeout: 8_000 });
	const grid = page.locator('.mp-grid-capture');
	const box = await grid.boundingBox();
	if (!box) throw new Error('grid capture has no bounding box');
	await page.locator('[aria-label="Add marker"]').click();
	await grid.click({ position: { x: box.width * 0.4, y: box.height * 0.45 } });
	await expect(page.locator('.mp-props-dialog')).toBeVisible({ timeout: 5_000 });
	await page.locator('[aria-label="Change icon"]').click();
	await expect(page.locator('.mp-icon-dialog')).toBeVisible();
}

/** Move the mouse onto the middle of the `n`th icon tile (not the label-only one). */
async function hoverTile(page: Page, n = 3): Promise<void> {
	const tile = page.locator('.mp-icon-tile:not(.mp-icon-tile--none)').nth(n);
	const b = await tile.boundingBox();
	if (!b) throw new Error('tile has no bounding box');
	await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
}

const lightbox = (page: Page) => page.locator('.mp-icon-lightbox');

test.beforeAll(async () => {
	await resetAll();
});
test.beforeEach(async () => {
	await clearMapMarkers();
});

test.describe('Choose Icon lightbox — with a mouse', () => {
	test('hovering a tile shows it enlarged; leaving hides it', async ({ page }) => {
		await openPicker(page);
		await hoverTile(page);
		await expect(lightbox(page)).toBeVisible();
		// Off every tile (onto the search row): gone.
		const search = await page.locator('.mp-icon-search-row').boundingBox();
		if (!search) throw new Error('search row has no bounding box');
		await page.mouse.move(search.x + 4, search.y + search.height / 2, { steps: 4 });
		await expect(lightbox(page)).toHaveCount(0);
	});
});

test.describe('Choose Icon lightbox — on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('never shows, even for an enter reported as a mouse', async ({ page }) => {
		await openPicker(page);
		// What iOS sends — a mouse-type enter on a device with no hover — is
		// the case that stuck.
		await hoverTile(page);
		await page.waitForTimeout(400); // past the lightbox's 120 ms delay
		await expect(lightbox(page)).toHaveCount(0);
		// And tapping a tile picks it, leaving no lightbox behind.
		await page.locator('.mp-icon-tile:not(.mp-icon-tile--none)').nth(4).tap();
		await page.waitForTimeout(400);
		await expect(lightbox(page)).toHaveCount(0);
	});
});
