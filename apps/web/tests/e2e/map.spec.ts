/**
 * map.spec.ts — MapDialog smoke coverage.
 *
 * Focused on the failure modes we've hit that had zero automated
 * detection until now:
 *   1. Dialog fails to open from the top-nav "Map" button.
 *   2. Toolbar renders but its icon buttons are chromeless (the mass-sed
 *      that globbed `.mp-*` selectors produced nested `:global()` that
 *      Svelte silently dropped, so `.mp-btn-icon svg` had 0×0 sizing
 *      and the zoom / settings buttons showed as empty pills).
 *
 * We open the map from the top-nav bar, upload a real (1×1) PNG through
 * the dialog's own "Add background image" CTA, then assert the toolbar's
 * SVGs render at their expected pixel size. Anything that breaks icon
 * CSS again fails here.
 */
import { test, expect, type Page } from '@playwright/test';
import { resetAll } from './helpers/reset';

// Tiny 1×1 red PNG — same fixture the expeditions spec uses.
const PNG_1X1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
	'base64',
);

async function waitForHome(page: Page): Promise<void> {
	// Wait for the top-nav Map button to attach — proxy for the shell
	// being fully hydrated.
	await page
		.locator('[aria-label="Open the campaign map"]')
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
}

/** Open the shared MapDialog via the top-nav "Map" button, then upload
 *  a background image through the dialog's own "Add background image"
 *  CTA. The upload path is the same one the per-entity buttons used to
 *  hand-roll; going through the dialog's CTA exercises the singular
 *  supported flow now that the per-entity affordances are gone. */
async function openMapDialogViaUpload(page: Page): Promise<void> {
	await page.locator('[aria-label="Open the campaign map"]').first().click();
	await expect(page.locator('.mp-dialog')).toBeVisible({ timeout: 15_000 });
	// A fresh session starts with no background — the CTA is on-screen.
	// Upload directly via the file input the CTA triggers.
	const fileInput = page.locator('#mp-file-input');
	await fileInput.setInputFiles({
		name: 'campaign-map.png',
		mimeType: 'image/png',
		buffer: PNG_1X1,
	});
	// Upload + downscale + persist — allow a generous window for the
	// round-trip when CI is slow.
	await expect(page.locator('.mp-grid-capture')).toBeVisible({ timeout: 8_000 });
}

test.describe('MapDialog — smoke', () => {
	test.beforeAll(async () => {
		await resetAll();
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForHome(page);
	});

	test('opens from the top-nav Map button', async ({ page }) => {
		await openMapDialogViaUpload(page);

		// The toolbar band must render with real buttons. (Markers now drop on
		// canvas click, so there's no dedicated "add" button — assert the gear.)
		await expect(page.locator('.mp-toolbar')).toBeVisible();
		await expect(page.locator('.mp-toolbar .mp-btn-gear')).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(page.locator('.mp-dialog')).not.toBeVisible({ timeout: 3_000 });
	});

	test('toolbar zoom + settings icons render at non-zero size', async ({ page }) => {
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
		await openMapDialogViaUpload(page);

		await page.locator('.mp-btn-gear').first().click();
		// MapOptionsDialog uses its own `.mo-*` classes.
		await expect(page.locator('.mo-section').first()).toBeVisible({ timeout: 5_000 });

		// Close the sub-dialog, then the main dialog. (.mo-section matches every
		// section, so assert none remain rather than a single not-visible.)
		await page.keyboard.press('Escape');
		await expect(page.locator('.mo-section')).toHaveCount(0, { timeout: 3_000 });
		await expect(page.locator('.mp-dialog')).toBeVisible();
		await page.keyboard.press('Escape');
	});
});
