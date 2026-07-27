/**
 * map.spec.ts — MapDialog smoke coverage.
 *
 * Focused on the failure modes we've hit that had zero automated
 * detection until now:
 *   1. Dialog fails to open when triggered from an entity stage.
 *   2. Toolbar renders but its icon buttons are chromeless (the mass-sed
 *      that globbed `.mp-*` selectors produced nested `:global()` that
 *      Svelte silently dropped, so `.mp-btn-icon svg` had 0×0 sizing
 *      and the zoom / settings buttons showed as empty pills).
 *
 * We upload a real (1×1) PNG through the `+ Map` file input on a seeded
 * community, wait for the dialog, then assert the toolbar's SVGs render
 * at their expected pixel size. Anything that breaks icon CSS again
 * fails here.
 */
import { test, expect, type Page } from '@playwright/test';
import { resetAll, seedCommunity } from './helpers/reset';

const CM_AREA = '.home-area--communities';
const CM_ROW = `${CM_AREA} .cm-row`;

// Tiny 1×1 red PNG — same fixture the expeditions spec uses.
const PNG_1X1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
	'base64',
);

async function waitForHome(page: Page): Promise<void> {
	// Wait for at least one card area to render past its loading gate.
	await page
		.locator(`${CM_AREA} .cm-empty, ${CM_AREA} .cm-body`)
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
}

/** Click into the seeded community row so its stage shows the map button. */
async function selectSeededCommunity(page: Page): Promise<void> {
	await page.locator(CM_ROW).first().click();
	await expect(page.locator(`${CM_AREA} .cm-stage-map-btn`).first()).toBeVisible({
		timeout: 6_000,
	});
}

/** Trigger the map-dialog via the "+ Map" file-input on the active entity. */
async function openMapDialogViaUpload(page: Page): Promise<void> {
	// The trigger is a <label> wrapping a hidden <input type="file">.
	// setInputFiles resolves the picker without needing a real click.
	const fileInput = page.locator(`${CM_AREA} .cm-stage-map-btn input[type="file"]`).first();
	await fileInput.setInputFiles({
		name: 'community-map.png',
		mimeType: 'image/png',
		buffer: PNG_1X1,
	});

	// Upload + downscale + persist + open — allow a generous window for
	// the round-trip when CI is slow.
	await expect(page.locator('.mp-dialog')).toBeVisible({ timeout: 15_000 });
}

test.describe('MapDialog — smoke', () => {
	test.beforeAll(async () => {
		await resetAll();
		await seedCommunity('Map Test Community');
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForHome(page);
	});

	test('opens from a community stage', async ({ page }) => {
		await selectSeededCommunity(page);
		await openMapDialogViaUpload(page);

		// The toolbar band must render. Regression from the sed sweep
		// showed as an intact <div class="mp-toolbar"> whose child
		// buttons had no icon chrome — cover both here.
		await expect(page.locator('.mp-toolbar')).toBeVisible();
		await expect(page.locator('.mp-toolbar .mp-btn-add')).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(page.locator('.mp-dialog')).not.toBeVisible({ timeout: 3_000 });
	});

	test('toolbar zoom + settings icons render at non-zero size', async ({ page }) => {
		await selectSeededCommunity(page);
		await openMapDialogViaUpload(page);

		// The zoom cluster: three icon-only buttons (out / in / fit).
		// Each contains a raw `<svg>`. If the icon CSS is broken (see the
		// nested-:global() bug), the SVG stays in the DOM but its
		// computed width/height collapse to 0.
		const zoomSvgs = page.locator('.mp-zoom .mp-btn-icon svg');
		await expect(zoomSvgs).toHaveCount(3);

		for (let i = 0; i < 3; i++) {
			const svg = zoomSvgs.nth(i);
			const box = await svg.boundingBox();
			expect(box, `zoom svg #${i + 1} has no bounding box`).not.toBeNull();
			expect(box!.width).toBeGreaterThan(4);
			expect(box!.height).toBeGreaterThan(4);
		}

		// The settings-gear icon lives in the .mp-tools cluster.
		const gearSvg = page.locator('.mp-btn-gear svg').first();
		await expect(gearSvg).toBeVisible();
		const gearBox = await gearSvg.boundingBox();
		expect(gearBox, 'gear svg has no bounding box').not.toBeNull();
		expect(gearBox!.width).toBeGreaterThan(4);
		expect(gearBox!.height).toBeGreaterThan(4);

		await page.keyboard.press('Escape');
	});

	test('gear button opens the Map Options sub-dialog', async ({ page }) => {
		await selectSeededCommunity(page);
		await openMapDialogViaUpload(page);

		await page.locator('.mp-btn-gear').first().click();
		// MapOptionsDialog uses its own `.mo-*` classes.
		await expect(page.locator('.mo-section').first()).toBeVisible({ timeout: 5_000 });

		// Close the sub-dialog, then the main dialog.
		await page.keyboard.press('Escape');
		await expect(page.locator('.mo-section')).not.toBeVisible({ timeout: 3_000 });
		await expect(page.locator('.mp-dialog')).toBeVisible();
		await page.keyboard.press('Escape');
	});
});
