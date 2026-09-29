/**
 * map-markers.spec.ts — Map marker lifecycle: create, edit (name / icon /
 * colour), persist, delete.
 *
 * The only prior map coverage (map.spec.ts) stops at the dialog chrome — it
 * never touches a marker. This spec drives the full marker flow through the
 * real UI:
 *
 *   • Create — click the "+ Marker" toolbar button to arm placement mode,
 *     then click the map (`.mp-grid-capture`) to drop the pin at those
 *     coords. Placing opens the marker properties dialog
 *     (`.mp-props-dialog`) on the fresh, empty marker.
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
 * The map is opened via the top-nav "Map" button (the per-entity Map
 * buttons were removed); if no background has been uploaded yet, the
 * dialog's own "Add background image" CTA does the initial upload.
 *
 * Idempotency: markers persist server-side, so `clearMapMarkers()` runs before
 * each test (the map + its background stay; only markers are wiped). A fresh
 * page each test then loads a marker-free map from the server.
 */
import { test, expect, type Page } from '@playwright/test';
import { resetAll, clearMapMarkers } from './helpers/reset';

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
		.locator('[aria-label="Open the campaign map"]')
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
	await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
}

/** Open the shared MapDialog via the top-nav "Map" button. If the active
 *  map has no background yet, upload the 1×1 PNG through the dialog's
 *  own file input so the grid comes into view. */
async function openMap(page: Page): Promise<void> {
	await page.locator('[aria-label="Open the campaign map"]').first().click();
	await expect(page.locator('.mp-dialog')).toBeVisible({ timeout: 15_000 });
	const cta = page.locator('.mp-empty-cta-btn');
	if (await cta.count()) {
		await page.locator('#mp-file-input').setInputFiles({
			name: 'campaign-map.png',
			mimeType: 'image/png',
			buffer: PNG_1X1,
		});
	}
	await expect(page.locator('.mp-grid-capture')).toBeVisible({ timeout: 8_000 });
}

/** Arm placement via the "+ Marker" toolbar button, then click the map to
 *  drop a pin there. Fresh markers open their properties editor
 *  automatically (they need at least a label / icon before they're
 *  useful), so this leaves the marker properties dialog open on the new
 *  (empty) marker. */
async function placeMarker(page: Page): Promise<void> {
	const grid = page.locator('.mp-grid-capture');
	const box = await grid.boundingBox();
	if (!box) throw new Error('grid capture has no bounding box');
	// Arm placement first — the button used to be gated on a "click a
	// square first" step, but the new flow is + Marker → click map.
	const addBtn = page.locator('[aria-label="Add marker"]');
	await expect(addBtn).toBeEnabled({ timeout: 3_000 });
	await addBtn.click();
	// A modest inset lands away from any canvas edge.
	await grid.click({ position: { x: box.width * 0.4, y: box.height * 0.45 } });
	await expect(page.locator('.mp-props-dialog')).toBeVisible({ timeout: 5_000 });
}

const marker = (page: Page) => page.locator('.mp-marker').first();
const markerLabel = (page: Page) => page.locator('.mp-marker-label');
const markerIconFill = (page: Page) => page.locator('.mp-marker .mp-marker-icon g').first();

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Map markers — lifecycle', () => {
	test.beforeAll(async () => {
		await resetAll();
	});

	test.beforeEach(async ({ page }) => {
		await clearMapMarkers(); // markers persist server-side — start each test clean
		await page.goto('/home');
		await waitForHome(page);
		await openMap(page);
	});

	test('clicking + Marker then the map creates a pin and opens its editor', async ({ page }) => {
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
		await openMap(page);

		await expect(page.locator('.mp-marker')).toHaveCount(1);
		await expect(markerLabel(page)).toHaveText('Persisted Keep', { timeout: 8_000 });
	});

	test('label style + position survive a full reload (server persistence)', async ({ page }) => {
		// Regression: the API's Zod schema for markers didn't declare
		// labelStyle / labelPosition, so Zod's default object-strip silently
		// dropped both before persisting — the toggles worked mid-session
		// and vanished on reload.
		await placeMarker(page);
		await page.locator('#mp-props-name').fill('Styled Manor');
		await page.locator('[aria-label="Bold"]').click();
		await page.locator('[aria-label="Underline"]').click();
		await page.locator('[aria-label="Small caps"]').click();
		await page.locator('.mp-props-footer .btn-primary').click(); // OK
		await expect(page.locator('.mp-props-dialog')).not.toBeVisible();

		await page.reload();
		await waitForHome(page);
		await openMap(page);
		await expect(page.locator('.mp-marker')).toHaveCount(1);

		// The persisted labelStyle serialises straight into the SVG text
		// element's style attribute (see labelStyleCss in MapDialog.svelte);
		// checking substrings avoids caring about serialisation order.
		// Strip whitespace before comparing — browsers normalise `foo:bar`
		// to `foo: bar` (with a space after the colon) when reading the
		// style attribute back, and the assertion shouldn't care either way.
		const rawStyle = await page.locator('.mp-marker-label').first().getAttribute('style');
		const style = (rawStyle ?? '').replace(/\s+/g, '');
		expect(style).toContain('font-weight:800');
		expect(style).toContain('text-decoration:underline');
		expect(style).toContain('font-variant:small-caps');
	});

	test('deleting a marker removes it from the map', async ({ page }) => {
		await placeMarker(page);
		await page.locator('#mp-props-name').fill('Doomed Marker');
		await expect(page.locator('.mp-marker')).toHaveCount(1);

		await page.locator('[aria-label="Delete marker"]').click();

		await expect(page.locator('.mp-props-dialog')).not.toBeVisible();
		await expect(page.locator('.mp-marker')).toHaveCount(0);
	});

	// ── Edit toolbar button + Ctrl/Cmd+E ──────────────────────────────────
	test('Edit button and Ctrl+E open the properties dialog on a selected marker', async ({
		page,
	}) => {
		const editBtn = page.locator('[aria-label="Edit marker"]');

		// With no marker selected the button is disabled — nothing to edit.
		await expect(editBtn).toBeDisabled();

		// Place a marker, name it, close via OK — the marker stays selected
		// (that's the whole "editor closed but selection kept" contract).
		await placeMarker(page);
		await page.locator('#mp-props-name').fill('Edit Test');
		await page.locator('.mp-props-footer .btn-primary').click(); // OK
		await expect(page.locator('.mp-props-dialog')).not.toBeVisible();

		// The Edit button is now enabled and reopens the editor.
		await expect(editBtn).toBeEnabled();
		await editBtn.click();
		await expect(page.locator('.mp-props-dialog')).toBeVisible();

		// Close the reopened dialog — first Escape shuts the dialog, the
		// marker stays selected (per the parent's Escape guard).
		await page.keyboard.press('Escape');
		await expect(page.locator('.mp-props-dialog')).not.toBeVisible();

		// Ctrl+E is the keyboard shortcut for the same action.
		await page.keyboard.press('Control+e');
		await expect(page.locator('.mp-props-dialog')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('.mp-props-dialog')).not.toBeVisible();

		// Deselecting (empty-grid click) disables the button again.
		const grid = page.locator('.mp-grid-capture');
		const box = await grid.boundingBox();
		if (!box) throw new Error('grid capture has no bounding box');
		await grid.click({ position: { x: box.width * 0.1, y: box.height * 0.1 } });
		await expect(editBtn).toBeDisabled();
	});

	// ── Copy / Paste round-trip ───────────────────────────────────────────
	test('Ctrl+C then Ctrl+V pastes a copy of the selected marker', async ({ page }) => {
		await placeMarker(page);
		await page.locator('#mp-props-name').fill('Copy Source');
		await page.locator('.mp-props-footer .btn-primary').click(); // OK
		await expect(page.locator('.mp-props-dialog')).not.toBeVisible();
		await expect(page.locator('.mp-marker')).toHaveCount(1);

		await page.keyboard.press('Control+c');
		await page.keyboard.press('Control+v');

		// Two markers on the canvas; both carry the source label.
		await expect(page.locator('.mp-marker')).toHaveCount(2);
		await expect(page.locator('.mp-marker-label')).toHaveCount(2);
		const labels = await page.locator('.mp-marker-label').allTextContents();
		expect(labels.filter((t) => t === 'Copy Source')).toHaveLength(2);
	});

	// ── Cut / Paste round-trip ────────────────────────────────────────────
	test('Ctrl+X removes the marker; Ctrl+V drops the copy back on the map', async ({ page }) => {
		await placeMarker(page);
		await page.locator('#mp-props-name').fill('Cut Source');
		await page.locator('.mp-props-footer .btn-primary').click(); // OK
		await expect(page.locator('.mp-props-dialog')).not.toBeVisible();
		await expect(page.locator('.mp-marker')).toHaveCount(1);

		await page.keyboard.press('Control+x');
		await expect(page.locator('.mp-marker')).toHaveCount(0);

		await page.keyboard.press('Control+v');
		await expect(page.locator('.mp-marker')).toHaveCount(1);
		await expect(page.locator('.mp-marker-label')).toHaveText('Cut Source');
	});

	// ── Clipboard preserves labelStyle + labelPosition ────────────────────
	test('paste preserves labelStyle and labelPosition on the copy', async ({ page }) => {
		// Style + position the source: bold + italic + small-caps, top
		// position. Every field flows through the clipboard payload — the
		// pasted copy must render the same style attribute and land at the
		// same relative position around its icon.
		await placeMarker(page);
		await page.locator('#mp-props-name').fill('Styled Source');
		await page.locator('[aria-label="Bold"]').click();
		await page.locator('[aria-label="Italic"]').click();
		await page.locator('[aria-label="Small caps"]').click();

		// Switch to the top position (default is bottom). The Select
		// portal's items carry `data-value` from the bits-ui wrapper, so
		// the option can be reached without depending on the arrow-glyph
		// label text.
		await page.locator('[aria-label="Label position"]').click();
		await page.locator('[role="option"][data-value="top"]').click();

		await page.locator('.mp-props-footer .btn-primary').click(); // OK
		await expect(page.locator('.mp-props-dialog')).not.toBeVisible();

		await page.keyboard.press('Control+c');
		await page.keyboard.press('Control+v');
		await expect(page.locator('.mp-marker')).toHaveCount(2);
		await expect(page.locator('.mp-marker-label')).toHaveCount(2);

		// Both labels carry the styled string.
		const styles = await page.locator('.mp-marker-label').evaluateAll((els) =>
			els.map((el) => ({
				style: (el.getAttribute('style') ?? '').replace(/\s+/g, ''),
				y: parseFloat(el.getAttribute('y') ?? '0'),
				text: el.textContent ?? '',
			})),
		);
		expect(styles).toHaveLength(2);
		for (const s of styles) {
			expect(s.text).toBe('Styled Source');
			expect(s.style).toContain('font-weight:800');
			expect(s.style).toContain('font-style:italic');
			expect(s.style).toContain('font-variant:small-caps');
			// Top-positioned labels sit ABOVE the icon anchor — negative y.
			// (Bottom would be positive.) Preserving labelPosition means
			// both markers have y < 0 here.
			expect(s.y).toBeLessThan(0);
		}
	});

	test('Escape while armed for placement exits placing mode and keeps the dialog open', async ({
		page,
	}) => {
		const addBtn = page.locator('[aria-label="Add marker"]');
		await addBtn.click();
		// Armed — button reads as pressed.
		await expect(addBtn).toHaveClass(/mp-btn-add--armed/);

		await page.keyboard.press('Escape');

		// Placement disarmed, no marker created, dialog still up.
		await expect(addBtn).not.toHaveClass(/mp-btn-add--armed/);
		await expect(page.locator('.mp-marker')).toHaveCount(0);
		// The placingMarker-scoped Escape stopPropagates so bits-ui's
		// Dialog Escape handler doesn't ALSO close the map dialog
		// underneath — same fix as on the ruler tool.
		await expect(page.locator('.mp-dialog')).toBeVisible();
	});
});
