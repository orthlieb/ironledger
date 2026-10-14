/**
 * map-layers.spec.ts — marker layers on the campaign map.
 *
 * The toolbar's Layers button (MapLayersMenu) lists the map's layers, the
 * default layer first. A new layer becomes the one new markers go on; a
 * hidden layer's markers aren't drawn; the marker editor's Layer field
 * moves a marker between layers; deleting a layer moves its markers to the
 * default layer. Layers live in the map's settings, so the list and what's
 * shown survive a reload.
 */
import { test, expect, type Page } from '@playwright/test';
import { clearAllMaps, fetchMaps } from './helpers/reset';

// Tiny 1×1 red PNG — the background map-markers.spec uploads.
const PNG_1X1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
	'base64',
);

/** Open the map and give it a background, so markers can be placed. */
async function openMap(page: Page): Promise<void> {
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
	await expect(page.locator('.mp-grid-capture')).toBeVisible({ timeout: 8_000 });
}

/** Place a named marker at a fraction of the map, and close its editor. */
async function placeMarker(page: Page, name: string, fx: number, fy: number): Promise<void> {
	const grid = page.locator('.mp-grid-capture');
	const box = await grid.boundingBox();
	if (!box) throw new Error('grid capture has no bounding box');
	await page.locator('[aria-label="Add marker"]').click();
	await grid.click({ position: { x: box.width * fx, y: box.height * fy } });
	await expect(page.locator('.mp-props-dialog')).toBeVisible({ timeout: 5_000 });
	await page.locator('#mp-props-name').fill(name);
	await page.locator('.mp-props-footer .btn-primary').click(); // OK
	await expect(page.locator('.mp-props-dialog')).not.toBeVisible();
}

const markers = (page: Page) => page.locator('.mp-marker');
const popover = (page: Page) => page.locator('.ml-popover');
const row = (page: Page, name: string) =>
	popover(page).locator('.ml-row', { has: page.locator('.ml-label', { hasText: name }) });

async function openLayers(page: Page): Promise<void> {
	if (await popover(page).isVisible()) return;
	await page.locator('[aria-label="Layers"]').click();
	await expect(popover(page)).toBeVisible();
}
async function closeLayers(page: Page): Promise<void> {
	await page.keyboard.press('Escape');
	await expect(popover(page)).toHaveCount(0);
}

/** The active map's settings and markers, as the server stored them. */
async function stored(): Promise<{
	layers: Array<{ id: string; name: string; hidden?: boolean }>;
	markers: Array<{ label?: string; layer?: string }>;
}> {
	const [map] = (await fetchMaps()) as unknown as Array<{
		settings?: { layers?: Array<{ id: string; name: string; hidden?: boolean }> };
		markers: Array<{ label?: string; layer?: string }>;
	}>;
	return { layers: map?.settings?.layers ?? [], markers: map?.markers ?? [] };
}

test.beforeEach(async () => {
	await clearAllMaps(); // layers live in the map's settings — start each test fresh
});

test('a new layer takes new markers; hiding it hides them, through a reload', async ({ page }) => {
	await openMap(page);
	await placeMarker(page, 'Oakhold', 0.3, 0.4);

	// Just the default layer, with the one marker on it.
	await openLayers(page);
	await expect(popover(page).locator('.ml-row')).toHaveCount(1);
	await expect(row(page, 'Default').locator('.ml-count')).toHaveText('1');
	// No deleting the default layer.
	await expect(page.locator('[aria-label="Delete Default"]')).toHaveCount(0);

	// A new layer, named straight away, becomes the one new markers go on.
	await popover(page).locator('.ml-add').click();
	const input = popover(page).locator('.ml-name-input');
	await expect(input).toBeFocused();
	await input.fill('Dungeons');
	await input.press('Enter');
	await expect(row(page, 'Dungeons')).toHaveClass(/ml-row--active/);
	await closeLayers(page);

	await placeMarker(page, 'Pit of Bones', 0.6, 0.5);
	await expect(markers(page)).toHaveCount(2);
	await openLayers(page);
	await expect(row(page, 'Dungeons').locator('.ml-count')).toHaveText('1');

	// Hide it: its marker goes; the default layer's stays.
	await page.locator('[aria-label="Hide Dungeons"]').click();
	await expect(markers(page)).toHaveCount(1);
	await expect(page.locator('.mp-marker-label')).toHaveText('Oakhold');
	await expect(page.locator('[aria-label="Layers"]')).toHaveClass(/ml-trigger--filtered/);

	// The server has it all: the layer, hidden, and the marker on it.
	await expect
		.poll(async () => (await stored()).layers.find((l) => l.name === 'Dungeons')?.hidden)
		.toBe(true);
	const { layers, markers: rows } = await stored();
	const dungeons = layers.find((l) => l.name === 'Dungeons')!;
	expect(rows.find((m) => m.label === 'Pit of Bones')?.layer).toBe(dungeons.id);
	expect(rows.find((m) => m.label === 'Oakhold')?.layer).toBeUndefined();

	// Still hidden after a reload.
	await page.reload();
	await openMap(page);
	await expect(markers(page)).toHaveCount(1);
	await openLayers(page);
	await page.locator('[aria-label="Show Dungeons"]').click();
	await expect(markers(page)).toHaveCount(2);
});

test('the editor moves a marker between layers; deleting a layer keeps its markers', async ({
	page,
}) => {
	await openMap(page);
	await placeMarker(page, 'Oakhold', 0.3, 0.4);
	await openLayers(page);
	await popover(page).locator('.ml-add').click();
	await popover(page).locator('.ml-name-input').fill('Roads');
	await popover(page).locator('.ml-name-input').press('Enter');
	// New markers back on the default layer.
	await row(page, 'Default').locator('.ml-name').click();
	await expect(row(page, 'Default')).toHaveClass(/ml-row--active/);
	await closeLayers(page);

	// Move Oakhold to Roads in its editor.
	await page.locator('[aria-label="Edit marker"]').click();
	await expect(page.locator('.mp-props-dialog')).toBeVisible();
	await page.locator('.mp-props-dialog button[aria-label="Layer"]').click();
	await page.locator('.bui-select-content [role="option"]', { hasText: 'Roads' }).click();
	await page.locator('.mp-props-footer .btn-primary').click(); // OK
	await openLayers(page);
	await expect(row(page, 'Roads').locator('.ml-count')).toHaveText('1');
	await expect(row(page, 'Default').locator('.ml-count')).toHaveText('0');

	// Hide Roads, then delete it: Oakhold comes back, on the default layer.
	await page.locator('[aria-label="Hide Roads"]').click();
	await expect(markers(page)).toHaveCount(0);
	await page.locator('[aria-label="Delete Roads"]').click();
	await expect(row(page, 'Roads')).toHaveCount(0);
	await expect(markers(page)).toHaveCount(1);
	await expect(row(page, 'Default').locator('.ml-count')).toHaveText('1');
	await expect.poll(async () => (await stored()).markers[0]?.layer ?? 'default').toBe('default');
});
