/**
 * map-buildings.spec.ts — the Choose Icon dialog's Buildings tab.
 *
 * The picker has three tabs: Icons, Buildings and Settlement builder. The
 * Buildings tab (SettlementBuilder with kind="building") generates one
 * building — in any culture, optionally walled, on land or water, ruined —
 * and "Use this" stores its RECIPE on the marker (`settlement.building`).
 * This spec drives it through the real UI:
 *
 *   • Tabs — the three tabs, in order.
 *   • Controls — a building's own knobs (Building, Culture, Walls, Ground,
 *     Ruined); Wall shape only once there are walls; none of the
 *     settlement-only ones (Size, On stilts, Harbour); and no Walls at all
 *     for the Wall, which comes in its own material.
 *   • Persist — the recipe the tab makes reaches the server intact
 *     (asserted via the API: the marker schema once stripped `ground` and
 *     `stilts`), the marker survives a full reload, and re-opening the
 *     picker lands on the Buildings tab with the building pre-selected.
 *
 * The builder's selects are the bits-ui Select wrapper: the trigger is a
 * button named by its aria-label, its options carry `data-value`.
 */
import { test, expect, type Page } from '@playwright/test';
import { resetAll, clearMapMarkers, fetchMaps } from './helpers/reset';

// Tiny 1×1 red PNG — the background map-markers.spec uploads.
const PNG_1X1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
	'base64',
);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function waitForHome(page: Page): Promise<void> {
	await page
		.locator('[aria-label="Open the campaign map"]')
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
	await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
}

/** Open the MapDialog and make sure the active map has a background. */
async function openMap(page: Page): Promise<void> {
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

/** + Marker, then click the map: leaves the new marker's editor open. */
async function placeMarker(page: Page): Promise<void> {
	const grid = page.locator('.mp-grid-capture');
	const box = await grid.boundingBox();
	if (!box) throw new Error('grid capture has no bounding box');
	const addBtn = page.locator('[aria-label="Add marker"]');
	await expect(addBtn).toBeEnabled({ timeout: 3_000 });
	await addBtn.click();
	await grid.click({ position: { x: box.width * 0.4, y: box.height * 0.45 } });
	await expect(page.locator('.mp-props-dialog')).toBeVisible({ timeout: 5_000 });
}

const picker = (page: Page) => page.locator('.mp-icon-dialog');
const tab = (page: Page, name: string) => picker(page).locator('[role="tab"]', { hasText: name });
/** A builder select's trigger, by its aria-label. */
const select = (page: Page, label: string) => picker(page).locator(`button[aria-label="${label}"]`);
const options = (page: Page) => page.locator('.bui-select-content [role="option"]');

/** Open the picker from the marker editor and switch to the Buildings tab. */
async function openBuildings(page: Page): Promise<void> {
	await page.locator('[aria-label="Change icon"]').click();
	await expect(picker(page)).toBeVisible();
	await tab(page, 'Buildings').click();
	await expect(select(page, 'Building')).toBeVisible();
}

/** Choose `value` in the builder select labelled `label`. */
async function choose(page: Page, label: string, value: string): Promise<void> {
	await select(page, label).click();
	await page.locator(`.bui-select-content [role="option"][data-value="${value}"]`).click();
	await expect(page.locator('.bui-select-content')).toHaveCount(0);
}

/** The big preview has drawn (generation runs in a worker). */
async function drawn(page: Page): Promise<void> {
	await expect(picker(page).locator('.sb-big svg')).toBeVisible({ timeout: 30_000 });
	await expect(picker(page).locator('.sb-big .sb-drawing')).toHaveCount(0);
}

/** The first map's markers, as the server stored them. */
async function storedMarkers(): Promise<
	Array<{ label?: string; settlement?: Record<string, unknown> }>
> {
	const maps = await fetchMaps();
	return (maps[0]?.markers ?? []) as Array<{
		label?: string;
		settlement?: Record<string, unknown>;
	}>;
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Map markers — Buildings tab', () => {
	test.beforeAll(async () => {
		await resetAll();
	});

	test.beforeEach(async ({ page }) => {
		await clearMapMarkers();
		await page.goto('/home');
		await waitForHome(page);
		await openMap(page);
		await placeMarker(page);
	});

	test('the picker offers Icons, Buildings and Settlement builder, in that order', async ({
		page,
	}) => {
		await page.locator('[aria-label="Change icon"]').click();
		await expect(picker(page)).toBeVisible();
		// By accessible name: the third tab carries a short label for phones
		// alongside its long one (CSS shows one), so its text holds both.
		const tabs = picker(page).getByRole('tab');
		await expect(tabs).toHaveCount(3);
		await expect(tabs.nth(0)).toHaveAccessibleName('Icons');
		await expect(tabs.nth(1)).toHaveAccessibleName('Buildings');
		await expect(tabs.nth(2)).toHaveAccessibleName('Settlement builder');
	});

	test('a building has its own knobs, and a wall building has no walls', async ({ page }) => {
		await openBuildings(page);
		const dlg = picker(page);

		// A building's knobs — and none of a settlement's.
		for (const label of ['Building', 'Culture', 'Walls', 'Ground'])
			await expect(select(page, label), label).toBeVisible();
		await expect(dlg.getByRole('checkbox', { name: 'Ruined' })).toBeVisible();
		await expect(select(page, 'Settlement size')).toHaveCount(0);
		await expect(dlg.getByRole('checkbox', { name: 'On stilts' })).toHaveCount(0);
		await expect(dlg.getByRole('checkbox', { name: 'Harbour' })).toHaveCount(0);
		await drawn(page);

		// No walls by default, so no wall shape — until there are walls.
		await expect(select(page, 'Walls')).toHaveText(/None/);
		await expect(select(page, 'Wall shape')).toHaveCount(0);
		await choose(page, 'Walls', 'hedge');
		await expect(select(page, 'Wall shape')).toBeVisible();

		// A wall building comes in its own material: no Walls, no Wall shape.
		await choose(page, 'Building', 'wall');
		await expect(select(page, 'Walls')).toHaveCount(0);
		await expect(select(page, 'Wall shape')).toHaveCount(0);
		await expect(select(page, 'Ground')).toBeVisible();
		await drawn(page);

		// Ruined shows the ruin's own knobs.
		await dlg.getByRole('checkbox', { name: 'Ruined' }).click();
		await expect(dlg.getByRole('checkbox', { name: 'Burned' })).toBeVisible();

		// The Settlement builder keeps the settlement's knobs.
		await tab(page, 'Settlement builder').click();
		await expect(select(page, 'Settlement size')).toBeVisible();
		await expect(dlg.getByRole('checkbox', { name: 'On stilts' })).toBeVisible();
		await expect(dlg.getByRole('checkbox', { name: 'Harbour' })).toBeVisible();
	});

	test('a building saves its recipe and comes back after a reload', async ({ page }) => {
		await page.locator('#mp-props-name').fill('Elf Tower');
		await openBuildings(page);

		await choose(page, 'Building', 'round-tower');
		// Whichever culture the list offers second (extensions can supersede
		// base cultures, so don't hard-code a key).
		await select(page, 'Culture').click();
		const second = options(page).nth(1);
		const culture = await second.getAttribute('data-value');
		expect(culture).toBeTruthy();
		await second.click();
		await expect(page.locator('.bui-select-content')).toHaveCount(0);
		await choose(page, 'Walls', 'hedge');
		await choose(page, 'Wall shape', 'square');
		await choose(page, 'Ground', 'water');
		await drawn(page);

		// The whole tab fits the dialog: "Use this" is on screen unscrolled.
		await expect(picker(page).getByRole('button', { name: 'Use this' })).toBeInViewport();
		await picker(page).getByRole('button', { name: 'Use this' }).click();
		await expect(picker(page)).not.toBeVisible();
		await page.locator('.mp-props-footer .btn-primary').click(); // OK
		await expect(page.locator('.mp-props-dialog')).not.toBeVisible();

		// The whole recipe reached the server — ground included.
		await expect
			.poll(async () => (await storedMarkers())[0]?.settlement, { timeout: 8_000 })
			.toMatchObject({
				building: 'round-tower',
				culture,
				walls: 'hedge',
				wallShape: 'square',
				ground: 'water',
			});

		// Full reload: the marker draws again, and its picker opens on the
		// Buildings tab with the same building chosen.
		await page.reload();
		await waitForHome(page);
		await openMap(page);
		await expect(page.locator('.mp-marker')).toHaveCount(1);
		await expect(page.locator('.mp-marker .mp-marker-icon')).toHaveCount(1, { timeout: 8_000 });
		const b = await page.locator('.mp-marker .mp-marker-icon').first().boundingBox();
		if (!b) throw new Error('marker icon has no bounding box');
		// Markers are hit-tested through .mp-grid-capture: click the icon's centre.
		await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
		await page.locator('[aria-label="Edit marker"]').click();
		await expect(page.locator('.mp-props-dialog')).toBeVisible();
		await page.locator('[aria-label="Change icon"]').click();
		await expect(picker(page)).toBeVisible();
		await expect(picker(page).locator('[role="tab"][data-state="active"]')).toHaveText('Buildings');
		await expect(select(page, 'Building')).toHaveText(/Round tower/);
		await expect(select(page, 'Walls')).toHaveText(/Hedge/);
		await expect(select(page, 'Ground')).toHaveText(/Water/);
	});
});
