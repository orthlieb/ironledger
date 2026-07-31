/**
 * map-everything.spec.ts — Maps ride along in the "Everything" export/import.
 *
 * An Everything bundle is a full backup, so it must carry campaign maps
 * (markers + background) alongside characters / connections / expeditions /
 * log. This spec proves the round-trip end to end:
 *
 *   1. Create a map with a named marker (via the community stage).
 *   2. Export → Everything (JSON). Assert the downloaded `.zip` nests the map
 *      under `maps/<id>/` — `map.json` carries the marker, `background.jpg`
 *      carries the uploaded image.
 *   3. Delete every map (clean slate), then import the *same* exported zip.
 *   4. Assert (server-side) the map and its marker come back.
 *
 * The two tests are serial and share the exported bytes so step 3 feeds on the
 * real export output — the strongest possible round-trip.
 */
import { test, expect, type Page, type Download } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { resetAll, seedCommunity, clearMapMarkers, clearAllMaps, fetchMaps } from './helpers/reset';

const CM_AREA = '.home-area--communities';
const ZIP_INPUT = 'input[type="file"][accept=".zip,application/zip"]';
const MARKER_NAME = 'Export Ruins';

const PNG_1X1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
	'base64',
);

// Shared across the two serial tests: the real Everything zip from test 1.
let exportedZip: Buffer | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function waitForHome(page: Page): Promise<void> {
	await page
		.locator(`${CM_AREA} .cm-empty, ${CM_AREA} .cm-body`)
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
}

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

/** Drop a marker and give it a name, then commit + close the map dialog. */
async function createNamedMarker(page: Page, name: string): Promise<void> {
	const grid = page.locator('.mp-grid-capture');
	const box = await grid.boundingBox();
	if (!box) throw new Error('grid capture has no bounding box');
	await grid.click({ position: { x: box.width * 0.4, y: box.height * 0.45 } });
	const addBtn = page.locator('[aria-label="Add marker"]');
	await expect(addBtn).toBeEnabled({ timeout: 3_000 });
	await addBtn.click();
	await expect(page.locator('.mp-props-dialog')).toBeVisible({ timeout: 5_000 });
	await page.locator('#mp-props-name').fill(name);
	await expect(page.locator('.mp-marker-label')).toHaveText(name);
	await page.locator('.mp-props-footer .btn-primary').click(); // OK
	await expect(page.locator('.mp-props-dialog')).not.toBeVisible();
	// Give the marker PUT time to land before we leave the dialog.
	await page.waitForTimeout(600);
	await page.keyboard.press('Escape'); // close the map dialog
	await expect(page.locator('.mp-dialog')).not.toBeVisible({ timeout: 5_000 });
}

async function downloadBuffer(download: Download): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const c of await download.createReadStream())
		chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
	return Buffer.concat(chunks);
}

/** Hamburger → Export → Everything (JSON) → download the zip. */
async function exportEverythingZip(page: Page): Promise<Buffer> {
	await page.locator('.hamburger-btn').click();
	await page.locator('.hm-item', { hasText: /Export/ }).click();
	await expect(page.locator('.export-dialog')).toBeVisible();
	await page.locator('.export-dialog #export-content').click();
	await page.locator('.bui-select-content .bui-select-item', { hasText: /^Everything$/ }).click();
	// Everything exposes a Zip / Markdown choice — "Zip" is the JSON-body
	// bundle (the re-importable form that nests maps/); Markdown is one-way.
	await page.locator('.export-dialog .ed-seg-btn', { hasText: /^Zip$/ }).click();
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.locator('.export-dialog .btn-primary').click(),
	]);
	return downloadBuffer(download);
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Everything export/import — maps ride along', () => {
	test.beforeAll(async () => {
		await resetAll();
		await clearAllMaps();
		await seedCommunity('Everything Map Community');
	});

	test('Everything export nests maps under maps/<id>/ with markers + background', async ({
		page,
	}) => {
		await clearMapMarkers();
		await page.goto('/home');
		await waitForHome(page);
		await selectSeededCommunity(page);
		await openMap(page);
		await createNamedMarker(page, MARKER_NAME);

		const zip = await exportEverythingZip(page);
		exportedZip = zip; // hand to the import test

		const entries = unzipSync(new Uint8Array(zip));
		const paths = Object.keys(entries);

		// The everything body is still present…
		expect(paths).toContain('everything.json');
		// …and at least one map is nested under maps/<id>/.
		const mapJsonPath = paths.find((p) => /^maps\/[^/]+\/map\.json$/.test(p));
		expect(mapJsonPath, `no maps/<id>/map.json in: ${paths.join(', ')}`).toBeTruthy();

		const mapBody = JSON.parse(strFromU8(entries[mapJsonPath!])) as {
			markers: Array<{ label?: string }>;
		};
		expect(mapBody.markers.map((m) => m.label)).toContain(MARKER_NAME);

		// The uploaded background rides along as raw bytes next to it.
		const dir = mapJsonPath!.replace(/map\.json$/, '');
		expect(paths).toContain(`${dir}background.jpg`);
	});

	test('importing an Everything zip restores the maps it carried', async ({ page }) => {
		expect(exportedZip, 'export test must run first').toBeTruthy();

		// Full clean slate so the bundle re-imports without name collisions
		// (Everything carries the seeded community too) and with zero maps.
		await resetAll();
		await clearAllMaps();
		expect(await fetchMaps()).toHaveLength(0);

		await page.goto('/home');
		await waitForHome(page);
		await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});

		await page.locator(ZIP_INPUT).setInputFiles({
			name: 'everything.zip',
			mimeType: 'application/zip',
			buffer: exportedZip!,
		});
		await expect(page.locator('.error-bar')).not.toBeVisible({ timeout: 5_000 });

		// The map comes back from the server with its marker (poll — reassembly
		// is a chain of async PUTs after the entity import).
		await expect
			.poll(
				async () =>
					(await fetchMaps()).some((m) => m.markers?.some((k) => k.label === MARKER_NAME)),
				{
					timeout: 10_000,
				},
			)
			.toBe(true);
	});
});
