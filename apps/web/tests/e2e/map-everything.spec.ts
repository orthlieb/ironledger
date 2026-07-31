/**
 * map-everything.spec.ts — Maps ride along in the "Everything" export/import,
 * and re-link to their owner entity on the way back in.
 *
 * An Everything bundle is a full backup, so it must carry campaign maps
 * (markers + background + owner linkage) alongside characters / connections /
 * expeditions / log. Coverage:
 *
 *   1. Export nests each owned map under `maps/<id>/` with its markers,
 *      background, and owner recorded BY NAME (ids regenerate on import).
 *   2. Clean restore re-links the map to its (re-imported) owner.
 *   3. Merge-import conflict (owner already has a map) → a Replace / Skip
 *      prompt; both branches verified.
 *
 * Owner linkage + import results are asserted server-side via fetchMaps() to
 * avoid fragile map-switcher UI navigation.
 */
import { test, expect, type Page, type Download } from '@playwright/test';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import {
	resetAll,
	seedCommunity,
	clearMapMarkers,
	clearAllMaps,
	createOwnedMap,
	fetchMaps,
} from './helpers/reset';

const CM_AREA = '.home-area--communities';
const ZIP_INPUT = 'input[type="file"][accept=".zip,application/zip"]';
const COMMUNITY = 'Everything Map Community';
const MARKER_NAME = 'Export Ruins';

const PNG_1X1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
	'base64',
);

// The real Everything zip captured by the export test, reused by the re-link test.
let exportedZip: Buffer | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function waitForHome(page: Page): Promise<void> {
	await page
		.locator(`${CM_AREA} .cm-empty, ${CM_AREA} .cm-body`)
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
	await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
}

async function selectSeededCommunity(page: Page): Promise<void> {
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

/** Drop a marker, name it, commit, and close the map dialog. */
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
	await page.locator('.mp-props-footer .btn-primary').click();
	await expect(page.locator('.mp-props-dialog')).not.toBeVisible();
	await page.waitForTimeout(600); // let the marker PUT land
	await page.keyboard.press('Escape');
	await expect(page.locator('.mp-dialog')).not.toBeVisible({ timeout: 5_000 });
}

async function downloadBuffer(download: Download): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const c of await download.createReadStream())
		chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
	return Buffer.concat(chunks);
}

async function exportEverythingZip(page: Page): Promise<Buffer> {
	await page.locator('.hamburger-btn').click();
	await page.locator('.hm-item', { hasText: /Export/ }).click();
	await expect(page.locator('.export-dialog')).toBeVisible();
	await page.locator('.export-dialog #export-content').click();
	await page.locator('.bui-select-content .bui-select-item', { hasText: /^Everything$/ }).click();
	await page.locator('.export-dialog .ed-seg-btn', { hasText: /^Zip$/ }).click();
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.locator('.export-dialog .btn-primary').click(),
	]);
	return downloadBuffer(download);
}

/** A minimal Everything zip whose only content is one map owned (by name) by
 *  `ownerName`, carrying a single marker. Entity arrays are empty, so import
 *  raises no entity-name collision — isolating the owned-map conflict path. */
function everythingZipWithOwnedMap(ownerName: string, markerLabel: string): Buffer {
	const files: Record<string, Uint8Array> = {
		'manifest.json': strToU8(
			JSON.stringify({
				app: 'Iron Ledger',
				version: '1.0.0',
				type: 'everything',
				body: 'everything.json',
				count: 0,
			}),
		),
		'everything.json': strToU8(JSON.stringify({})),
		'maps/m1/manifest.json': strToU8(
			JSON.stringify({ app: 'Iron Ledger', version: '1.0.0', type: 'map' }),
		),
		'maps/m1/map.json': strToU8(
			JSON.stringify({
				name: 'Bundled Owned Map',
				markers: [
					{ id: 'x', x: 5, y: 5, label: markerLabel, icon: 'misc/marker', color: '#457b9d' },
				],
				settings: {},
				ownerKind: 'community',
				ownerName,
			}),
		),
	};
	return Buffer.from(zipSync(files));
}

async function importZip(page: Page, buffer: Buffer): Promise<void> {
	await page.locator(ZIP_INPUT).setInputFiles({
		name: 'everything.zip',
		mimeType: 'application/zip',
		buffer,
	});
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Everything export/import — maps ride along + re-link to owner', () => {
	test.beforeAll(async () => {
		await resetAll();
		await clearAllMaps();
		await seedCommunity(COMMUNITY);
	});

	test('export records the map under maps/<id>/ with owner, markers + background', async ({
		page,
	}) => {
		await clearMapMarkers();
		await page.goto('/home');
		await waitForHome(page);
		await selectSeededCommunity(page);
		await openMap(page);
		await createNamedMarker(page, MARKER_NAME);

		const zip = await exportEverythingZip(page);
		exportedZip = zip;

		const entries = unzipSync(new Uint8Array(zip));
		const paths = Object.keys(entries);
		expect(paths).toContain('everything.json');

		const mapJsonPath = paths.find((p) => /^maps\/[^/]+\/map\.json$/.test(p));
		expect(mapJsonPath, `no maps/<id>/map.json in: ${paths.join(', ')}`).toBeTruthy();

		const mapBody = JSON.parse(strFromU8(entries[mapJsonPath!])) as {
			markers: Array<{ label?: string }>;
			ownerKind?: string;
			ownerName?: string;
		};
		expect(mapBody.markers.map((m) => m.label)).toContain(MARKER_NAME);
		// Owner captured BY NAME so import can re-link across id regeneration.
		expect(mapBody.ownerKind).toBe('community');
		expect(mapBody.ownerName).toBe(COMMUNITY);

		const dir = mapJsonPath!.replace(/map\.json$/, '');
		expect(paths).toContain(`${dir}background.jpg`);
	});

	test('clean restore re-links the map to its re-imported owner', async ({ page }) => {
		expect(exportedZip, 'export test must run first').toBeTruthy();

		// Clean slate: no entities, no maps → the bundle re-imports without
		// collisions and the map re-links to the fresh community.
		await resetAll();
		await clearAllMaps();
		expect(await fetchMaps()).toHaveLength(0);

		await page.goto('/home');
		await waitForHome(page);
		await importZip(page, exportedZip!);
		await expect(page.locator('.error-bar')).not.toBeVisible({ timeout: 5_000 });

		// The restored map comes back owned by the community (not standalone).
		await expect
			.poll(
				async () => {
					const maps = await fetchMaps();
					const m = maps.find((x) => x.markers?.some((k) => k.label === MARKER_NAME));
					return m ? `${m.ownerKind}:${m.ownerId ? 'has-id' : 'no-id'}` : 'missing';
				},
				{ timeout: 10_000 },
			)
			.toBe('community:has-id');
	});

	test('merge conflict → Skip: existing owned map kept, incoming imported standalone', async ({
		page,
	}) => {
		await resetAll();
		await clearAllMaps();
		const commId = await seedCommunity('Solo Owner');
		await createOwnedMap('community', commId, 'Pre-existing Map'); // owner already has a map

		await page.goto('/home');
		await waitForHome(page);

		await importZip(page, everythingZipWithOwnedMap('Solo Owner', 'Conflict Marker'));

		// The conflict prompt appears — choose Skip.
		await expect(page.locator('.moc-dialog')).toBeVisible({ timeout: 8_000 });
		await page.locator('.moc-footer button', { hasText: /^Skip$/ }).click();
		await expect(page.locator('.moc-dialog')).not.toBeVisible({ timeout: 5_000 });

		await expect.poll(async () => (await fetchMaps()).length, { timeout: 10_000 }).toBe(2);
		const maps = await fetchMaps();
		const owned = maps.find((m) => m.ownerKind === 'community' && m.ownerId === commId);
		const standalone = maps.find((m) => m.ownerKind === null);
		// Existing owned map untouched (no imported marker); incoming went standalone.
		expect(owned?.markers.some((k) => k.label === 'Conflict Marker')).toBeFalsy();
		expect(standalone?.markers.some((k) => k.label === 'Conflict Marker')).toBeTruthy();
	});

	test('merge conflict → Replace: owner’s existing map overwritten in place', async ({ page }) => {
		await resetAll();
		await clearAllMaps();
		const commId = await seedCommunity('Solo Owner');
		await createOwnedMap('community', commId, 'Pre-existing Map');

		await page.goto('/home');
		await waitForHome(page);

		await importZip(page, everythingZipWithOwnedMap('Solo Owner', 'Replacement Marker'));

		await expect(page.locator('.moc-dialog')).toBeVisible({ timeout: 8_000 });
		await page.locator('.moc-radio', { hasText: /Replace the owner/ }).click();
		await page.locator('.moc-footer button', { hasText: /^Continue$/ }).click();
		await expect(page.locator('.moc-dialog')).not.toBeVisible({ timeout: 5_000 });

		// Still one map for the owner, now carrying the imported marker.
		await expect
			.poll(
				async () => {
					const maps = await fetchMaps();
					const owned = maps.find((m) => m.ownerKind === 'community' && m.ownerId === commId);
					return owned?.markers.some((k) => k.label === 'Replacement Marker') ?? false;
				},
				{ timeout: 10_000 },
			)
			.toBe(true);
		expect(await fetchMaps()).toHaveLength(1);
	});
});
