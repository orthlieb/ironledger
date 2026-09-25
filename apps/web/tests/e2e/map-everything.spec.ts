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

const ZIP_INPUT = 'input[type="file"][accept=".zip,application/zip"]';

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
});
