/**
 * map-marker-card.spec.ts — where the selected marker's info card
 * (`.mk-card`, MarkerCard.svelte) hangs.
 *
 * Beside the marker when the card fits to one side of it; below (or above)
 * it when it doesn't. On a phone neither side of a mid-screen marker has
 * room for the card, and the popover's flip only tried the other side — so
 * the card ran off the left edge of the screen.
 */
import { test, expect, type Page } from '@playwright/test';
import { resetAll, clearMapMarkers } from './helpers/reset';

// Tiny 1×1 red PNG — the background map-markers.spec uploads.
const PNG_1X1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
	'base64',
);

/** Open the map, place a named marker mid-map and close its editor, which
 *  leaves the marker selected — and its card open. */
async function openCard(page: Page): Promise<void> {
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
	await expect(page.locator('.mp-empty-cta')).toHaveCount(0, { timeout: 8_000 });
	const grid = page.locator('.mp-grid-capture');
	await expect(grid).toBeVisible({ timeout: 8_000 });
	const box = await grid.boundingBox();
	if (!box) throw new Error('grid capture has no bounding box');
	await page.locator('[aria-label="Add marker"]').click();
	await grid.click({ position: { x: box.width * 0.5, y: box.height * 0.45 } });
	await expect(page.locator('.mp-props-dialog')).toBeVisible({ timeout: 5_000 });
	await page.locator('#mp-props-name').fill('Termin');
	await page.locator('.mp-props-footer .btn-primary').click(); // OK
	await expect(page.locator('.mp-props-dialog')).not.toBeVisible();
	await expect(page.locator('.mk-card')).toBeVisible();
}

/** The card's and the marker's on-screen boxes, once the card has settled. */
async function boxes(page: Page) {
	// The popover positions on the next frames; let it settle.
	await page.waitForTimeout(300);
	const card = await page.locator('.mk-card').boundingBox();
	const marker = await page.locator('.mp-marker .mp-marker-icon').first().boundingBox();
	if (!card || !marker) throw new Error('card or marker has no bounding box');
	return { card, marker };
}

test.beforeAll(async () => {
	await resetAll();
});
test.beforeEach(async () => {
	await clearMapMarkers();
});

test.describe('Marker card — on a wide screen', () => {
	test('hangs beside the marker', async ({ page }) => {
		await openCard(page);
		const { card, marker } = await boxes(page);
		const beside = card.x >= marker.x + marker.width || card.x + card.width <= marker.x;
		expect(beside, 'card beside the marker').toBe(true);
	});
});

test.describe('Marker card — on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('stays on screen, below or above a mid-screen marker', async ({ page }) => {
		await openCard(page);
		const { card, marker } = await boxes(page);
		const vw = 390;
		const vh = 844;
		expect(card.x, 'left edge on screen').toBeGreaterThanOrEqual(0);
		expect(card.x + card.width, 'right edge on screen').toBeLessThanOrEqual(vw);
		expect(card.y, 'top edge on screen').toBeGreaterThanOrEqual(0);
		expect(card.y + card.height, 'bottom edge on screen').toBeLessThanOrEqual(vh);
		const offMarker = card.y >= marker.y + marker.height || card.y + card.height <= marker.y;
		expect(offMarker, 'card clear of the marker').toBe(true);
	});
});
