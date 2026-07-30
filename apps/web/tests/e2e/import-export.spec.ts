/**
 * import-export.spec.ts — Import / Export dialog and security hardening.
 *
 * Covers:
 *   • Export dialog content options and format selector visibility
 *   • File download verification (name, structure)
 *   • Happy-path import round-trip
 *   • Security: oversized file, invalid JSON, prototype pollution, XSS via log HTML
 *
 * v2: the home page has no `.loading-tab`; instead the Characters area
 * renders `.ca-loading` while its data is loading. Hamburger + Export
 * dialog are unchanged.
 */
import { test, expect, type Download } from '@playwright/test';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { resetAll } from './helpers/reset';
import { settleHome } from './helpers/home';

const CHAR_AREA = '.home-area--characters';
const ZIP_INPUT = 'input[type="file"][accept=".zip,application/zip"]';

/** value → visible label for the export Content <Select> (bits-ui). */
const CONTENT_LABEL: Record<string, string> = {
	everything: 'Everything',
	character: 'Current Character',
	'all-characters': 'All Characters',
	log: 'Session Log',
	stories: 'Stories',
	communities: 'Connections',
	expeditions: 'Expeditions',
	map: 'All Maps',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to /home and wait for the page to finish loading. */
async function gotoHome(page: import('@playwright/test').Page) {
	await page.goto('/home');
	await expect(page.locator(`${CHAR_AREA} .ca-loading`)).not.toBeVisible({ timeout: 12_000 });
	await page
		.locator(`${CHAR_AREA} .ca-empty, ${CHAR_AREA} .ca-body`)
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
	await settleHome(page);
}

/** Open Hamburger → Export dialog, pick a content option from the bits-ui
 *  <Select> (portalled items, matched by their visible label). */
async function openExportDialog(page: import('@playwright/test').Page, content: string) {
	await page.locator('.hamburger-btn').click();
	await page.locator('.hm-item', { hasText: /Export/ }).click();
	await expect(page.locator('.export-dialog')).toBeVisible();
	await page.locator('.export-dialog #export-content').click();
	await page
		.locator('.bui-select-content .bui-select-item', {
			hasText: new RegExp(`^${CONTENT_LABEL[content]}$`),
		})
		.click();
}

/** Pack a {manifest, data} payload into the .zip bundle the importer accepts. */
function toZip(payload: { manifest?: object; data?: unknown }): Buffer {
	const manifest = { ...(payload.manifest ?? {}), body: 'data.json' };
	return Buffer.from(
		zipSync({
			'manifest.json': strToU8(JSON.stringify(manifest)),
			'data.json': strToU8(JSON.stringify(payload.data)),
		}),
	);
}

/** Upload a payload as a .zip via the hidden file input. */
async function uploadImport(
	page: import('@playwright/test').Page,
	payload: { manifest?: object; data?: unknown },
	filename = 'test-import.zip',
) {
	await page.locator(ZIP_INPUT).setInputFiles({
		name: filename,
		mimeType: 'application/zip',
		buffer: toZip(payload),
	});
}

/** Read a download stream into a Buffer. */
async function downloadBuffer(download: Download): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const c of await download.createReadStream())
		chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
	return Buffer.concat(chunks);
}

/** Build a minimal valid manifest-wrapped payload. */
function makeManifest(type: string, data: unknown, count = 0) {
	return {
		manifest: {
			app: 'Iron Ledger',
			version: '1.0.0',
			exportedAt: new Date().toISOString(),
			type,
			count,
		},
		data,
	};
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Global blank-slate reset (runs once before the first test in this file).
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
	await resetAll();
});

// Export dialog
// ---------------------------------------------------------------------------

test.describe('Export dialog', () => {
	test.beforeEach(async ({ page }) => {
		await gotoHome(page);
	});

	test('opens and lists all content options', async ({ page }) => {
		await openExportDialog(page, 'character');
		// Re-open the Content select and check each option is offered (by label).
		// 'foes' isn't an export option — foes ship inside an Everything export.
		await page.locator('.export-dialog #export-content').click();
		for (const val of [
			'character',
			'all-characters',
			'log',
			'communities',
			'expeditions',
			'everything',
		]) {
			await expect(
				page.locator('.bui-select-content .bui-select-item', {
					hasText: new RegExp(`^${CONTENT_LABEL[val]}$`),
				}),
			).toHaveCount(1);
		}
		await page.keyboard.press('Escape');
	});

	// Format selector visibility was inverted: Everything and Session Log are
	// the only content types with a meaningful Markdown rendering, so they
	// expose the JSON/Markdown choice. All other content types (character,
	// all-characters, communities, expeditions) are JSON-only — the picker
	// hides the Format field and force-resets format='json' on change
	// (see HamburgerMenu.svelte:126,135).
	test('shows format selector when Everything is chosen', async ({ page }) => {
		await openExportDialog(page, 'everything');
		await expect(page.locator('.ed-label:has-text("Format")')).toBeVisible();
	});

	test('shows format selector when Session Log is chosen', async ({ page }) => {
		await openExportDialog(page, 'log');
		await expect(page.locator('.ed-label:has-text("Format")')).toBeVisible();
	});

	test('hides format selector for JSON-only content types', async ({ page }) => {
		await openExportDialog(page, 'all-characters');
		await expect(page.locator('.ed-label:has-text("Format")')).not.toBeVisible();
	});

	test('Cancel closes the dialog without exporting', async ({ page }) => {
		await openExportDialog(page, 'everything');
		await page.locator('.export-dialog .ed-footer .btn:not(.btn-primary)').click();
		await expect(page.locator('.export-dialog')).not.toBeVisible();
	});

	test('Everything export downloads a .zip with correct name pattern', async ({ page }) => {
		await openExportDialog(page, 'everything');
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.locator('.export-dialog .btn-primary').click(),
		]);
		expect(download.suggestedFilename()).toMatch(
			/^ironledger-export-\d{4}-\d{2}-\d{2}_\d{4}\.zip$/,
		);
	});

	test('All Characters export downloads a .zip file', async ({ page }) => {
		// All Characters is JSON-only — no format selector.
		await openExportDialog(page, 'all-characters');
		// all-characters is JSON-only — there is no Format segmented control to
		// click (the picker auto-pins exportFormat to 'json' on change).
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.locator('.export-dialog .btn-primary').click(),
		]);
		expect(download.suggestedFilename()).toMatch(/^all-characters-.*\.zip$/);
	});

	test('Session Log Markdown export downloads a .md file', async ({ page }) => {
		await openExportDialog(page, 'log');
		await page.locator('.ed-seg-btn:has-text("Markdown")').click();
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.locator('.export-dialog .btn-primary').click(),
		]);
		expect(download.suggestedFilename()).toMatch(/^session-log-.*\.md$/);
	});

	test('exported Everything zip has correct manifest + body structure', async ({ page }) => {
		await openExportDialog(page, 'everything');
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.locator('.export-dialog .btn-primary').click(),
		]);
		// The export is a zip: manifest.json + a body JSON file it points at.
		const entries = unzipSync(new Uint8Array(await downloadBuffer(download)));
		const manifest = JSON.parse(strFromU8(entries['manifest.json']));
		const data = JSON.parse(strFromU8(entries[manifest.body ?? 'everything.json']));

		expect(manifest.type).toBe('everything');
		expect(manifest.app).toBe('Iron Ledger');
		expect(Array.isArray(data.characters)).toBe(true);
		expect(Array.isArray(data.log)).toBe(true);
		expect(Array.isArray(data.communities)).toBe(true);
		expect(Array.isArray(data.npcs)).toBe(true);
		expect(Array.isArray(data.expeditions)).toBe(true);
		expect(data.session).toBeDefined();
		// Foes are transient and Markdown-only — never in the export body.
		expect(data.foes).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Import — happy path
// ---------------------------------------------------------------------------

test.describe('Import — happy path', () => {
	test.beforeEach(async ({ page }) => {
		await gotoHome(page);
	});

	test('imports a valid character JSON without errors', async ({ page }) => {
		const payload = makeManifest(
			'character',
			{ name: 'Test Pilgrim', data: { edge: 2, heart: 3 } },
			1,
		);
		await uploadImport(page, payload);
		await expect(page.locator('.error-bar')).not.toBeVisible({ timeout: 5_000 });
	});

	test('imports a valid log JSON without errors', async ({ page }) => {
		const payload = makeManifest(
			'log',
			[{ title: 'Face Danger', html: '<div>A roll was made.</div>', ts: Date.now(), note: '' }],
			1,
		);
		await uploadImport(page, payload);
		await expect(page.locator('.error-bar')).not.toBeVisible({ timeout: 5_000 });
	});
});

// ---------------------------------------------------------------------------
// Import — security hardening
// ---------------------------------------------------------------------------

test.describe('Import — security', () => {
	test.beforeEach(async ({ page }) => {
		await gotoHome(page);
	});

	test('rejects files over 5 MB with a user-friendly error', async ({ page }) => {
		// The pad must live inside `data` so it lands in the zip's decompressed
		// body file — that's what the size cap measures (a highly-repetitive
		// string compresses to almost nothing, so the zip itself stays tiny).
		const big = makeManifest('log', ['x'.repeat(6 * 1024 * 1024)], 1);
		await uploadImport(page, big, 'huge.json');
		await expect(page.locator('.error-bar')).toBeVisible({ timeout: 5_000 });
		await expect(page.locator('.error-bar-msg')).toContainText('too large');
	});

	test('rejects a zip whose body is not valid JSON with a user-friendly error', async ({
		page,
	}) => {
		const bad = zipSync({
			'manifest.json': strToU8(
				JSON.stringify({ app: 'Iron Ledger', version: '1.0.0', type: 'log', body: 'data.json' }),
			),
			'data.json': strToU8('this is not valid json }{'),
		});
		await page.locator(ZIP_INPUT).setInputFiles({
			name: 'bad.zip',
			mimeType: 'application/zip',
			buffer: Buffer.from(bad),
		});
		await expect(page.locator('.error-bar')).toBeVisible({ timeout: 5_000 });
		await expect(page.locator('.error-bar-msg')).toContainText('not valid JSON');
	});

	test('silently drops __proto__ keys — no prototype pollution', async ({ page }) => {
		const poisoned = makeManifest(
			'character',
			{
				name: 'Poison Pilgrim',
				data: {
					__proto__: { isAdmin: true },
					constructor: { name: 'pwned' },
					edge: 1,
				},
			},
			1,
		);
		await uploadImport(page, poisoned);
		await expect(page.locator('.error-bar')).not.toBeVisible({ timeout: 5_000 });
		const polluted = await page.evaluate(() => (({}) as Record<string, unknown>).isAdmin);
		expect(polluted).toBeUndefined();
	});

	test('sanitizes <script> tags in imported log HTML', async ({ page }) => {
		const payload = makeManifest(
			'log',
			[
				{
					title: 'Malicious Entry',
					html: '<div>Safe text</div><script>window.__xss_test = true;</script>',
					ts: Date.now(),
					note: '',
				},
			],
			1,
		);
		await uploadImport(page, payload);
		await expect(page.locator('.error-bar')).not.toBeVisible({ timeout: 5_000 });
		const xssRan = await page.evaluate(
			() => (window as unknown as Record<string, unknown>).__xss_test,
		);
		expect(xssRan).toBeUndefined();
	});

	test('sanitizes event-handler attributes in imported log HTML', async ({ page }) => {
		const payload = makeManifest(
			'log',
			[
				{
					title: 'Handler Entry',
					html: '<img src="x" onerror="window.__onerror_test=true;">',
					ts: Date.now(),
					note: '',
				},
			],
			1,
		);
		await uploadImport(page, payload);
		await expect(page.locator('.error-bar')).not.toBeVisible({ timeout: 5_000 });
		await page.waitForTimeout(500);
		const handlerRan = await page.evaluate(
			() => (window as unknown as Record<string, unknown>).__onerror_test,
		);
		expect(handlerRan).toBeUndefined();
	});

	test('rejects JSON with array exceeding item limit', async ({ page }) => {
		const payload = makeManifest(
			'log',
			Array.from({ length: 1001 }, (_, i) => ({
				title: `Entry ${i}`,
				html: '<div>x</div>',
				ts: Date.now(),
				note: '',
			})),
			1001,
		);
		await uploadImport(page, payload);
		await expect(page.locator('.error-bar')).toBeVisible({ timeout: 10_000 });
		await expect(page.locator('.error-bar-msg')).toContainText('too many items', {
			timeout: 5_000,
		});
	});

	test('rejects JSON with excessive nesting depth', async ({ page }) => {
		let deep: unknown = 'leaf';
		for (let i = 0; i < 15; i++) deep = { child: deep };
		const payload = makeManifest('character', { name: 'Deep', data: { nested: deep } }, 1);
		await uploadImport(page, payload);
		await expect(page.locator('.error-bar')).toBeVisible({ timeout: 5_000 });
		await expect(page.locator('.error-bar-msg')).toContainText('deeply nested');
	});
});

// ---------------------------------------------------------------------------
// Portrait round-trip — export lifts the portrait out to an `images/` file in
// the zip; import reassembles it into the content-addressed blob store and the
// entity references it by etag (rendered from the /portrait endpoint).
// ---------------------------------------------------------------------------

test.describe('Import / Export — portrait round-trip', () => {
	// 1×1 transparent PNG.
	const TINY_PNG =
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==';

	test.beforeAll(async () => {
		await resetAll();
	});
	test.beforeEach(async ({ page }) => {
		await gotoHome(page);
	});

	test('a character portrait survives an export → import round-trip via the blob store', async ({
		page,
	}) => {
		// ── Create a character (name-first) and upload a portrait ─────────────
		if (
			!(await page
				.locator(`${CHAR_AREA} .ca-tab`)
				.first()
				.isVisible()
				.catch(() => false))
		) {
			await page.locator(`${CHAR_AREA} .ca-hdr-combobox`).click();
			await page.locator('.mp-cmd-item--action', { hasText: /New character/i }).click();
			await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5_000 });
			await page.locator('.confirm-modal .co-input').first().fill('Portrait Char');
			await page.locator('.confirm-modal .btn-primary').click();
			await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
		}
		await expect(page.locator(`${CHAR_AREA} .ca-tab`).first()).toBeVisible({ timeout: 8_000 });
		await page.locator(`${CHAR_AREA} .ca-tab`, { hasText: /^Background$/i }).click();
		await page.locator(`${CHAR_AREA} .pu-input`).setInputFiles({
			name: 'portrait.png',
			mimeType: 'image/png',
			buffer: Buffer.from(TINY_PNG, 'base64'),
		});
		await expect(page.locator(`${CHAR_AREA} img.pu-img`)).toBeVisible({ timeout: 5_000 });
		// Let the portrait PUT + the 1500 ms character auto-save settle.
		await page.waitForTimeout(2_400);

		// ── Export the current character — the portrait becomes an images/ file ─
		await openExportDialog(page, 'character');
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.locator('.export-dialog .btn-primary').click(),
		]);
		const entries = unzipSync(new Uint8Array(await downloadBuffer(download)));
		const manifest = JSON.parse(strFromU8(entries['manifest.json']));
		const bodyName = manifest.body ?? 'character.json';
		const body = JSON.parse(strFromU8(entries[bodyName]));
		// Self-contained: portrait bytes live in an images/ entry, referenced by
		// portraitFile — NOT an inline data: URL, and no etag in the file.
		expect(body.data.portraitFile).toMatch(/^images\//);
		expect(entries[body.data.portraitFile]).toBeDefined();
		expect(body.data.portrait).toBeUndefined();
		expect(body.data.portraitEtag).toBeUndefined();

		// ── Re-import under a unique name — portrait must come back from the blob endpoint ──
		const uniqueName = `Roundtrip ${Date.now()}`;
		body.name = uniqueName; // outer display name
		body.data.name = uniqueName; // inner data.name — what the switcher renders
		const reentries: Record<string, Uint8Array> = { ...entries };
		reentries[bodyName] = strToU8(JSON.stringify(body));
		await page.locator(ZIP_INPUT).setInputFiles({
			name: 'roundtrip.zip',
			mimeType: 'application/zip',
			buffer: Buffer.from(zipSync(reentries)),
		});
		await expect(page.locator('.error-bar')).not.toBeVisible({ timeout: 5_000 });

		// Select the freshly imported character from the switcher, open Background.
		await page.locator(`${CHAR_AREA} .ca-hdr-combobox`).click();
		await page
			.locator('.mp-cmd-popover .mp-cmd-item:not(.mp-cmd-item--action)', { hasText: uniqueName })
			.first()
			.click();
		await page.locator(`${CHAR_AREA} .ca-tab`, { hasText: /^Background$/i }).click();

		// The portrait renders from the blob endpoint (a URL, NOT an inline data:
		// URL) — proving the bytes were lifted into the blob store and the entity
		// now references it by etag.
		const img = page.locator(`${CHAR_AREA} img.pu-img`);
		await expect(img).toBeVisible({ timeout: 8_000 });
		const src = await img.getAttribute('src');
		expect(src).toMatch(/\/api\/characters\/[^/]+\/portrait\?v=/);
	});
});
