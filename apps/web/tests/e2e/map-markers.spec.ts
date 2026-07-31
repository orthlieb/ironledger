/**
 * map-markers.spec.ts — Map marker lifecycle: create, edit (name / icon /
 * colour), persist, delete.
 *
 * The only prior map coverage (map.spec.ts) stops at the dialog chrome — it
 * never touches a marker. This spec drives the full marker flow through the
 * real UI:
 *
 *   • Create — click an empty grid square (`.mp-grid-capture`) to arm the
 *     "+ Marker" toolbar button, then drop a pin. Placing opens the marker
 *     properties dialog (`.mp-props-dialog`) on the fresh, empty marker.
 *   • Edit name — the `#mp-props-name` input live-writes the marker's label
 *     (`.mp-marker-label` on the canvas).
 *   • Edit icon — "Change icon" opens the icon picker (`.mp-icon-dialog`);
 *     picking "No icon" drops the glyph (label-only, centred), picking a real
 *     tile restores it (`.mp-marker-icon`).
 *   • Edit colour — "Icon colour" opens Pickr (portalled `.pcr-app`); a swatch
 *     click recolours the marker (`<g fill>` on the icon).
 *   • Persist — every edit PUTs to `/api/session/maps/:id/markers`, so a marker
 *     survives a full reload.
 *   • Delete — the editor's DELETE button removes the pin outright.
 *
 * Idempotency: markers persist server-side, so `clearMapMarkers()` runs before
 * each test (the map + its background stay; only markers are wiped). A fresh
 * page each test then loads a marker-free map from the server.
 */
import { test, expect, type Page } from '@playwright/test';
import { resetAll, seedCommunity, clearMapMarkers } from './helpers/reset';

const CM_AREA = '.home-area--communities';

// Tiny 1×1 red PNG — same fixture map.spec uses for a background.
const PNG_1X1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
	'base64',
);

// New markers start black (DEFAULT_MARKER_COLOR); Pickr offers these 8 swatches.
const DEFAULT_MARKER_COLOR = '#000000';
const SWATCHES = [
	'#e63946',
	'#f4a261',
	'#e9c46a',
	'#2a9d8f',
	'#457b9d',
	'#8e44ad',
	'#111111',
	'#f1faee',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function waitForHome(page: Page): Promise<void> {
	await page
		.locator(`${CM_AREA} .cm-empty, ${CM_AREA} .cm-body`)
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
}

/** Make the seeded community the active connection so its stage shows the map
 *  button. v2 auto-selects the first connection; if not, pick it from the
 *  header switcher. Waits for either the "Add map" (empty) or "Open map"
 *  (has-background) affordance. */
async function selectSeededCommunity(page: Page): Promise<void> {
	await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
	if (
		!(await page
			.locator(`${CM_AREA} .cm-tab`)
			.first()
			.isVisible()
			.catch(() => false))
	) {
		await page.locator(`${CM_AREA} .cm-hdr-combobox`).click();
		await page.locator('.mp-cmd-popover .mp-cmd-item:not(.mp-cmd-item--action)').first().click();
	}
	await expect(
		page.locator(`${CM_AREA} [aria-label="Add map"], ${CM_AREA} [aria-label="Open map"]`).first(),
	).toBeVisible({ timeout: 6_000 });
}

/** Open the MapDialog for the active community. Uploads a background the first
 *  time (empty map → "Add map" file input), or clicks "Open map" thereafter. */
async function openMap(page: Page): Promise<void> {
	const add = page.locator(`${CM_AREA} [aria-label="Add map"]`);
	if (await add.count()) {
		await add.locator('input[type="file"]').setInputFiles({
			name: 'community-map.png',
			mimeType: 'image/png',
			buffer: PNG_1X1,
		});
	} else {
		await page.locator(`${CM_AREA} [aria-label="Open map"]`).click();
	}
	await expect(page.locator('.mp-dialog')).toBeVisible({ timeout: 15_000 });
	await expect(page.locator('.mp-grid-capture')).toBeVisible({ timeout: 8_000 });
}

/** Click an empty grid square then "+ Marker" to drop a pin. Leaves the marker
 *  properties dialog open on the new (empty) marker. */
async function placeMarker(page: Page): Promise<void> {
	const grid = page.locator('.mp-grid-capture');
	const box = await grid.boundingBox();
	if (!box) throw new Error('grid capture has no bounding box');
	// A modest inset lands on a real snap point without hugging an edge.
	await grid.click({ position: { x: box.width * 0.4, y: box.height * 0.45 } });
	const addBtn = page.locator('[aria-label="Add marker"]');
	await expect(addBtn).toBeEnabled({ timeout: 3_000 });
	await addBtn.click();
	await expect(page.locator('.mp-props-dialog')).toBeVisible({ timeout: 5_000 });
}

const marker = (page: Page) => page.locator('.mp-marker').first();
const markerLabel = (page: Page) => page.locator('.mp-marker-label');
const markerIconFill = (page: Page) => page.locator('.mp-marker .mp-marker-icon g').first();

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Map markers — lifecycle', () => {
	test.beforeAll(async () => {
		await resetAll();
		await seedCommunity('Marker Test Community');
	});

	test.beforeEach(async ({ page }) => {
		await clearMapMarkers(); // markers persist server-side — start each test clean
		await page.goto('/home');
		await waitForHome(page);
		await selectSeededCommunity(page);
		await openMap(page);
	});

	test('clicking a square then + Marker creates a pin and opens its editor', async ({ page }) => {
		await expect(page.locator('.mp-marker')).toHaveCount(0);

		await placeMarker(page);

		// The new marker is on the canvas and its editor is open, empty.
		await expect(page.locator('.mp-marker')).toHaveCount(1);
		await expect(page.locator('#mp-props-name')).toHaveValue('');
		// A fresh marker carries the default black icon.
		await expect(markerIconFill(page)).toHaveAttribute('fill', DEFAULT_MARKER_COLOR);
	});

	test('editing name, icon and colour renders on the marker', async ({ page }) => {
		await placeMarker(page);
		const m = marker(page);

		// ── Name ──────────────────────────────────────────────────────────────
		await page.locator('#mp-props-name').fill('Ancient Ruins');
		await expect(markerLabel(page)).toHaveText('Ancient Ruins');

		// ── Icon: drop the glyph (label-only), then restore a real icon ────────
		await page.locator('[aria-label="Change icon"]').click();
		await expect(page.locator('.mp-icon-dialog')).toBeVisible();
		await page.locator('.mp-icon-tile--none').click();
		await expect(page.locator('.mp-icon-dialog')).not.toBeVisible();
		await expect(m.locator('.mp-marker-icon')).toHaveCount(0);
		await expect(page.locator('.mp-marker-label--centered')).toHaveText('Ancient Ruins');

		await page.locator('[aria-label="Change icon"]').click();
		await expect(page.locator('.mp-icon-dialog')).toBeVisible();
		await page.locator('.mp-icon-tile:not(.mp-icon-tile--none)').first().click();
		await expect(page.locator('.mp-icon-dialog')).not.toBeVisible();
		await expect(m.locator('.mp-marker-icon')).toHaveCount(1);

		// ── Colour: default black → a Pickr swatch ─────────────────────────────
		// Pickr (useAsButton) rewrites the trigger's aria-label to "toggle color
		// picker dialog", so reach it by its stable class instead.
		await expect(markerIconFill(page)).toHaveAttribute('fill', DEFAULT_MARKER_COLOR);
		await page.locator('.mp-sel-color-btn').click();
		await expect(page.locator('.pcr-app')).toBeVisible();
		await page.locator('.pcr-app .pcr-swatches button').nth(3).click();

		await expect(markerIconFill(page)).not.toHaveAttribute('fill', DEFAULT_MARKER_COLOR);
		const fill = (await markerIconFill(page).getAttribute('fill'))?.toLowerCase();
		expect(SWATCHES).toContain(fill);

		// OK commits (edits already applied live) and closes the editor.
		await page.locator('.mp-props-footer .btn-primary').click();
		await expect(page.locator('.mp-props-dialog')).not.toBeVisible();
		await expect(markerLabel(page)).toHaveText('Ancient Ruins');
	});

	test('a created marker survives a full reload (server persistence)', async ({ page }) => {
		await placeMarker(page);
		await page.locator('#mp-props-name').fill('Persisted Keep');
		await expect(markerLabel(page)).toHaveText('Persisted Keep');
		await page.locator('.mp-props-footer .btn-primary').click(); // OK
		await expect(page.locator('.mp-props-dialog')).not.toBeVisible();

		// Full reload — the marker must come back from the server.
		await page.reload();
		await waitForHome(page);
		await selectSeededCommunity(page);
		await openMap(page);

		await expect(page.locator('.mp-marker')).toHaveCount(1);
		await expect(markerLabel(page)).toHaveText('Persisted Keep', { timeout: 8_000 });
	});

	test('deleting a marker removes it from the map', async ({ page }) => {
		await placeMarker(page);
		await page.locator('#mp-props-name').fill('Doomed Marker');
		await expect(page.locator('.mp-marker')).toHaveCount(1);

		await page.locator('[aria-label="Delete marker"]').click();

		await expect(page.locator('.mp-props-dialog')).not.toBeVisible();
		await expect(page.locator('.mp-marker')).toHaveCount(0);
	});
});
