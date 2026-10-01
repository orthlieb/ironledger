/**
 * map-everything.spec.ts — Standalone map dedupe on Everything re-import.
 *
 * An Everything bundle is a full backup that carries campaign maps
 * alongside characters / connections / expeditions / log. This spec pins
 * one narrow regression: re-importing a bundle whose only map is a
 * STANDALONE (no-owner) map with the same name as an existing one must
 * surface the Map-already-exists prompt, not silently duplicate.
 *
 * The wider owner-relink coverage that used to live here was removed
 * alongside the per-entity "+ Map" / "Map" header buttons — new owned
 * maps no longer exist as a UI concept. The database still keeps
 * owner_kind / owner_id for backward-compat with imported bundles, but
 * the DB-side path isn't exercised from an E2E anymore.
 *
 * Import results are asserted server-side via fetchMaps() to avoid
 * fragile map-switcher UI navigation.
 */
import { test, expect, type Page } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { resetAll, clearAllMaps, fetchMaps } from './helpers/reset';

// Narrow to the home page's hidden input (data-import-root) rather than any
// `.zip` file input — the ImportDialog has its own `.imd-file` with the same
// `accept`, and matching both would make the selector ambiguous once the
// dialog is open mid-test.
const ZIP_INPUT = 'input[type="file"][data-import-root="home"]';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function waitForHome(page: Page): Promise<void> {
	await page
		.locator('[aria-label="Open the campaign map"]')
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
	await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
}

/** A minimal Everything zip whose only content is one STANDALONE map (no
 *  owner) named `mapName`, carrying a single marker. Used to prove the
 *  standalone-map dedupe path: re-import of the same name must not
 *  duplicate. */
function everythingZipWithStandaloneMap(mapName: string, markerLabel: string): Buffer {
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
				name: mapName,
				markers: [
					{ id: 'x', x: 5, y: 5, label: markerLabel, icon: 'misc/marker', color: '#457b9d' },
				],
				settings: {},
				// deliberately no ownerKind / ownerName — standalone map.
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

test.describe('Everything import — standalone map dedupes by name (regression)', () => {
	test('re-import of the same standalone map prompts to Replace, does not duplicate', async ({
		page,
	}) => {
		await resetAll();
		await clearAllMaps();
		expect(await fetchMaps()).toHaveLength(0);

		await page.goto('/home');
		await waitForHome(page);

		// 1st import: fresh session, no prompt — the standalone map is created.
		await importZip(page, everythingZipWithStandaloneMap('Regional Overview', 'First Marker'));
		await expect.poll(async () => (await fetchMaps()).length, { timeout: 10_000 }).toBe(1);

		// Close the ImportDialog before the 2nd upload so its overlay doesn't
		// linger and race the next import cycle.
		await page.locator('.imd-footer .btn-primary', { hasText: /Done/ }).click();
		await expect(page.locator('.imd-overlay')).toHaveCount(0);

		// 2nd import: dedupe fires and surfaces the Map-already-exists prompt.
		await importZip(page, everythingZipWithStandaloneMap('Regional Overview', 'Second Marker'));

		await expect(page.locator('.moc-dialog')).toBeVisible({ timeout: 8_000 });
		await page.locator('.moc-radio', { hasText: /Replace the existing map/ }).click();
		await page.locator('.moc-footer button', { hasText: /^Continue$/ }).click();
		await expect(page.locator('.moc-dialog')).not.toBeVisible({ timeout: 5_000 });

		// Still exactly one map — and its marker was replaced in place, not
		// added alongside the first.
		await expect.poll(async () => (await fetchMaps()).length, { timeout: 10_000 }).toBe(1);
		const maps = await fetchMaps();
		expect(maps[0].markers.some((k) => k.label === 'Second Marker')).toBeTruthy();
		expect(maps[0].markers.some((k) => k.label === 'First Marker')).toBeFalsy();
	});

	test('re-import + Skip on the prompt leaves ONE map (no silent duplicate)', async ({ page }) => {
		// Regression guard. Before this test the "skip" branch of the
		// Everything importer called applyMapImport(...) on the conflict,
		// which silently created a second standalone map of the same name
		// — exactly the "duplicate maps after import" symptom the dedupe
		// was supposed to prevent. Skip must literally skip.
		await resetAll();
		await clearAllMaps();
		expect(await fetchMaps()).toHaveLength(0);

		await page.goto('/home');
		await waitForHome(page);

		await importZip(page, everythingZipWithStandaloneMap('Regional Overview', 'First Marker'));
		await expect.poll(async () => (await fetchMaps()).length, { timeout: 10_000 }).toBe(1);

		await page.locator('.imd-footer .btn-primary', { hasText: /Done/ }).click();
		await expect(page.locator('.imd-overlay')).toHaveCount(0);

		await importZip(page, everythingZipWithStandaloneMap('Regional Overview', 'Second Marker'));
		await expect(page.locator('.moc-dialog')).toBeVisible({ timeout: 8_000 });
		await page.locator('.moc-radio', { hasText: /Keep existing/ }).click();
		await page.locator('.moc-footer button', { hasText: /^Continue$/ }).click();
		await expect(page.locator('.moc-dialog')).not.toBeVisible({ timeout: 5_000 });

		// Still exactly one map (the incoming was dropped), and the
		// existing marker is untouched — Skip means Skip.
		await expect.poll(async () => (await fetchMaps()).length, { timeout: 10_000 }).toBe(1);
		const maps = await fetchMaps();
		expect(maps[0].markers.some((k) => k.label === 'First Marker')).toBeTruthy();
		expect(maps[0].markers.some((k) => k.label === 'Second Marker')).toBeFalsy();
	});

	test('map switch after import PATCHes /session/state cleanly (no 400)', async ({ page }) => {
		// Regression guard. persistActiveMapIdToSession used to fall through
		// to `cur ?? { charId:'', foeId:'', expeditionId:'' }` — so a session
		// whose stored state existed but was missing any of those fields
		// (common right after a bundle import that wrote only activeMapId)
		// PATCHed an incomplete body and the API's zod schema returned 400.
		// Every map switch from the picker fired one. Fix: always default
		// the required strings before PATCHing. Guard: intercept the network
		// request and prove the response comes back 2xx.
		await resetAll();
		await clearAllMaps();
		await page.goto('/home');
		await waitForHome(page);

		// Two standalone maps to switch between. Import each separately so
		// they end up as two distinct map rows.
		await importZip(page, everythingZipWithStandaloneMap('Map Alpha', 'Alpha Marker'));
		await expect.poll(async () => (await fetchMaps()).length, { timeout: 10_000 }).toBe(1);
		await page.locator('.imd-footer .btn-primary', { hasText: /Done/ }).click();
		await expect(page.locator('.imd-overlay')).toHaveCount(0);
		await importZip(page, everythingZipWithStandaloneMap('Map Beta', 'Beta Marker'));
		await expect.poll(async () => (await fetchMaps()).length, { timeout: 10_000 }).toBe(2);
		await page.locator('.imd-footer .btn-primary', { hasText: /Done/ }).click();
		await expect(page.locator('.imd-overlay')).toHaveCount(0);

		// Watch every PATCH /api/session/state until we've switched the map;
		// any 400 is the regression. `page.on('response')` cleans itself up
		// when the test ends.
		const patchFailures: Array<{ url: string; status: number }> = [];
		page.on('response', (res) => {
			const url = res.url();
			if (url.includes('/api/session/state') && res.request().method() === 'PATCH') {
				if (res.status() >= 400) patchFailures.push({ url, status: res.status() });
			}
		});

		// Open the map dialog, then switch through the picker. This is the
		// exact path the production console trace pointed at (bits-ui
		// Combobox onSelect → switchMap → persistActiveMapIdToSession).
		await page.locator('[aria-label="Open the campaign map"]').first().click();
		await expect(page.locator('.mp-dialog')).toBeVisible({ timeout: 8_000 });
		await page.locator('.mp-picker-btn').click();
		await page
			.locator('.cb-popover .cb-item:not(.cb-item--action)')
			.filter({ hasText: 'Map Beta' })
			.first()
			.click();
		// Give the PATCH a chance to complete.
		await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

		expect(
			patchFailures,
			`PATCH /api/session/state must return 2xx; got: ${JSON.stringify(patchFailures)}`,
		).toHaveLength(0);
	});

	test('picking a file through the ImportDialog runs runImport once (progress total matches done)', async ({
		page,
	}) => {
		// Regression guard. The document-level capture `change` listener used
		// to match ANY `input[type="file"][accept=".zip,…"]`, including the
		// ImportDialog's own `.imd-file`. When the user picked a file through
		// the dialog, BOTH the capture handler AND the dialog's own onchange
		// fired → runImport ran twice concurrently → the shared progress
		// state showed something like "76 of 39" (~2× the real count) and
		// every step ran twice. The hidden input now carries
		// `data-import-root="home"` and the capture handler is scoped to it;
		// the dialog's `.imd-file` only drives its own onchange.
		await resetAll();
		await clearAllMaps();
		await page.goto('/home');
		await waitForHome(page);

		// Open the ImportDialog from the menu so its `.imd-file` input is
		// mounted and the double-fire path is in play.
		await page.evaluate(() => {
			document.dispatchEvent(new CustomEvent('il-menu-action', { detail: { action: 'import' } }));
		});
		const dialog = page.locator('.imd-dialog');
		await expect(dialog).toBeVisible({ timeout: 5_000 });

		// Pick a bundle through the DIALOG's own input, not the hidden one.
		await dialog.locator('.imd-file').setInputFiles({
			name: 'everything.zip',
			mimeType: 'application/zip',
			buffer: everythingZipWithStandaloneMap('Dialog Pick', 'Dialog Marker'),
		});

		// If runImport ran twice, two maps named "Dialog Pick" would land
		// (pre-dedupe-fix behaviour) OR the second pass would hit the "map
		// name already exists" prompt (post-dedupe-fix). Either way the map
		// count misbehaves. Correct behaviour: exactly one map created.
		await expect.poll(async () => (await fetchMaps()).length, { timeout: 15_000 }).toBe(1);

		// Also prove the progress bar settled with done ≤ total. "76 of 39"
		// shaped tags shouldn't be possible.
		const progressText = await page
			.locator('.imd-progress-label')
			.first()
			.textContent({ timeout: 5_000 })
			.catch(() => '');
		if (progressText && /Importing (\d+) of (\d+)/.test(progressText)) {
			const [, done, total] = progressText.match(/Importing (\d+) of (\d+)/)!;
			expect(Number(done), 'progress done must not exceed total').toBeLessThanOrEqual(
				Number(total),
			);
		}
	});
});
