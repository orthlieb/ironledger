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
import { resetAll, getTestToken } from './helpers/reset';
import { settleHome } from './helpers/home';

const CHAR_AREA = '.home-area--characters';
const ZIP_INPUT = 'input[type="file"][accept=".zip,application/zip"]';

// The ImportDialog surfaces progress + result. A clean import lands on the
// "done" stage with the ✓ badge; a rejected archive (too large, bad JSON,
// over the item/nesting caps) lands on the "error" stage with the message in
// its `.imd-errlist`.
const IMD_DONE_OK = '.imd-badge--ok';
const IMD_ERRLIST = '.imd-errlist';

/** Assert the ImportDialog reached a clean success (done, no issues). */
async function expectImportOk(page: import('@playwright/test').Page, timeout = 5_000) {
	await expect(page.locator(IMD_DONE_OK)).toBeVisible({ timeout });
}

/** Assert the ImportDialog failed and its error list mentions `text`. */
async function expectImportError(
	page: import('@playwright/test').Page,
	text: string | RegExp,
	timeout = 5_000,
) {
	await expect(page.locator(IMD_ERRLIST)).toBeVisible({ timeout });
	await expect(page.locator(IMD_ERRLIST)).toContainText(text, { timeout });
}

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

/** Open Hamburger → Export. The dialog is a single filter+checklist that opens
 *  with every item selected and Zip as the default format. */
async function openExportDialog(page: import('@playwright/test').Page) {
	await page.locator('.hamburger-btn').click();
	await page.locator('.hm-item', { hasText: /Export/ }).click();
	await expect(page.locator('.exd-dialog')).toBeVisible();
}

/** Create one character via the switcher (name-first confirm dialog), unless a
 *  character tab already exists. Gives the export checklist something to hold. */
async function seedCharacter(page: import('@playwright/test').Page, name = 'Export Seed') {
	const hasChar = await page
		.locator(`${CHAR_AREA} .ca-tab`)
		.first()
		.isVisible()
		.catch(() => false);
	if (hasChar) return;
	await page.locator(`${CHAR_AREA} .ca-hdr-combobox`).click();
	await page.locator('.mp-cmd-item--action', { hasText: /New character/i }).click();
	await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5_000 });
	await page.locator('.confirm-modal .co-input').first().fill(name);
	await page.locator('.confirm-modal .btn-primary').click();
	await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
	await expect(page.locator(`${CHAR_AREA} .ca-tab`).first()).toBeVisible({ timeout: 8_000 });
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
	// The dialog is a checklist of what exists, and Export is disabled when
	// nothing is selected — so seed one character to have something to export.
	test.beforeEach(async ({ page }) => {
		await gotoHome(page);
		await seedCharacter(page);
	});

	test('opens as a searchable checklist with Select all and both formats', async ({ page }) => {
		await openExportDialog(page);
		await expect(page.locator('.fb-input')).toBeVisible();
		await expect(page.locator('.exd-selectall')).toBeVisible();
		// Both output formats are always offered (no per-content-type hiding).
		await expect(page.locator('.exd-segbtn', { hasText: /^Zip archive/ })).toBeVisible();
		await expect(page.locator('.exd-segbtn', { hasText: /^Markdown/ })).toBeVisible();
	});

	test('Cancel closes the dialog without exporting', async ({ page }) => {
		await openExportDialog(page);
		await page.locator('.exd-footer .btn:not(.btn-primary)').click();
		await expect(page.locator('.exd-dialog')).not.toBeVisible();
	});

	test('Everything export downloads a .zip with correct name pattern', async ({ page }) => {
		await openExportDialog(page);
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.locator('.exd-dialog .btn-primary').click(),
		]);
		expect(download.suggestedFilename()).toMatch(
			/^ironledger-export-\d{4}-\d{2}-\d{2}_\d{4}\.zip$/,
		);
	});

	test('exported Everything zip has correct manifest + body structure', async ({ page }) => {
		await openExportDialog(page);
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.locator('.exd-dialog .btn-primary').click(),
		]);
		// The export is a zip: manifest.json + a body JSON file it points at.
		const entries = unzipSync(new Uint8Array(await downloadBuffer(download)));
		const manifest = JSON.parse(strFromU8(entries['manifest.json']));
		const data = JSON.parse(strFromU8(entries[manifest.body ?? 'everything.json']));

		expect(manifest.type).toBe('everything');
		expect(manifest.app).toBe('Iron Ledger');
		// The seeded character is present; session always is; foes never are
		// (transient, Markdown-only). Empty categories are simply omitted.
		expect(Array.isArray(data.characters)).toBe(true);
		expect(data.characters.length).toBeGreaterThan(0);
		expect(data.session).toBeDefined();
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
		await expectImportOk(page);
	});

	test('imports a valid log JSON without errors', async ({ page }) => {
		const payload = makeManifest(
			'log',
			[{ title: 'Face Danger', html: '<div>A roll was made.</div>', ts: Date.now(), note: '' }],
			1,
		);
		await uploadImport(page, payload);
		await expectImportOk(page);
	});
});

// ---------------------------------------------------------------------------
// Import — security hardening
// ---------------------------------------------------------------------------

test.describe('Import — security', () => {
	test.beforeEach(async ({ page }) => {
		await gotoHome(page);
	});

	test('rejects files over 20 MB with a user-friendly error', async ({ page }) => {
		// The pad must live inside `data` so it lands in the zip's decompressed
		// body file — that's what the size cap measures (a highly-repetitive
		// string compresses to almost nothing, so the zip itself stays tiny).
		const big = makeManifest('log', ['x'.repeat(21 * 1024 * 1024)], 1);
		await uploadImport(page, big, 'huge.json');
		await expectImportError(page, 'too large');
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
		await expectImportError(page, 'not valid JSON');
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
		await expectImportOk(page);
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
		await expectImportOk(page);
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
		await expectImportOk(page);
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
		await expectImportError(page, 'too many items', 10_000);
	});

	test('rejects JSON with excessive nesting depth', async ({ page }) => {
		let deep: unknown = 'leaf';
		for (let i = 0; i < 15; i++) deep = { child: deep };
		const payload = makeManifest('character', { name: 'Deep', data: { nested: deep } }, 1);
		await uploadImport(page, payload);
		await expectImportError(page, 'deeply nested');
	});
});

// ---------------------------------------------------------------------------
// Import dialog — stages (progress → done / error / review)
//
// The ImportDialog is the user-facing surface for every import. These tests
// pin its three terminal stages directly: a clean archive lands on "done", a
// malformed one lands on "error", and a mixed archive pauses on the validate
// "review" stage so the user can choose to import just the valid rows.
// ---------------------------------------------------------------------------

test.describe('Import dialog', () => {
	test.beforeEach(async ({ page }) => {
		await gotoHome(page);
	});

	test('well-formatted archive → done stage with a success summary', async ({ page }) => {
		const payload = makeManifest('character', { name: 'Wayfarer', data: { edge: 1 } }, 1);
		await uploadImport(page, payload);
		// Done stage: green ✓ badge, "Import complete", and a summary line.
		await expect(page.locator('.imd-badge--ok')).toBeVisible({ timeout: 5_000 });
		await expect(page.locator('.imd-state-title')).toContainText('Import complete');
		await expect(page.locator('.imd-state-sub')).toContainText('1 character');
		// No issue list on a clean import.
		await expect(page.locator(IMD_ERRLIST)).toHaveCount(0);
	});

	test('badly-formatted archive → error stage listing the problem', async ({ page }) => {
		const bad = zipSync({
			'manifest.json': strToU8(
				JSON.stringify({ app: 'Iron Ledger', version: '1.0.0', type: 'log', body: 'data.json' }),
			),
			'data.json': strToU8('{ not json ]['),
		});
		await page.locator(ZIP_INPUT).setInputFiles({
			name: 'broken.zip',
			mimeType: 'application/zip',
			buffer: Buffer.from(bad),
		});
		await expect(page.locator('.imd-badge--err')).toBeVisible({ timeout: 5_000 });
		await expect(page.locator('.imd-state-title')).toContainText('Import failed');
		await expectImportError(page, 'not valid JSON');
	});

	test('mixed archive → review stage, then imports only the valid rows', async ({ page }) => {
		// Two communities: one valid, one with a blank name (invalid). The
		// validate pass drops the nameless one and pauses for confirmation.
		const payload = makeManifest('communities', {
			communities: [
				{ id: 'c-good', name: 'Havenport' },
				{ id: 'c-bad', name: '   ' },
			],
			npcs: [],
			places: [],
		});
		await uploadImport(page, payload);

		// Review stage: one item flagged, one still importable.
		await expect(page.locator('.imd-state-title')).toContainText('couldn’t be read', {
			timeout: 5_000,
		});
		await expect(page.locator('.imd-state-sub')).toContainText('1 valid item');
		await expect(page.locator(IMD_ERRLIST)).toContainText('missing or invalid name');

		// Confirm: import the one valid community.
		await page.locator('.imd-footer .btn-primary', { hasText: /Import 1 valid item/ }).click();

		// Lands on done-with-issues: warn badge, the skipped row still listed.
		await expect(page.locator('.imd-badge--warn')).toBeVisible({ timeout: 5_000 });
		await expect(page.locator('.imd-state-sub')).toContainText('1 connection');
	});

	test('review stage → Cancel imports nothing', async ({ page }) => {
		const payload = makeManifest('communities', {
			communities: [{ id: 'c-bad', name: '' }],
			npcs: [],
			places: [],
		});
		await uploadImport(page, payload);
		await expect(page.locator('.imd-state-title')).toContainText('couldn’t be read', {
			timeout: 5_000,
		});
		// Cancel returns to the chooser (idle) without applying anything.
		await page.locator('.imd-footer .btn', { hasText: /^Cancel$/ }).click();
		await expect(page.locator('.imd-drop')).toBeVisible({ timeout: 5_000 });
	});

	// The per-category "Connections" export writes the body file as a full
	// { manifest, data } envelope (not the bare payload). This used to import
	// zero rows while reporting success ("Nothing new to import"). Guard it.
	test('wrapped-body connections archive imports its rows (not a no-op)', async ({ page }) => {
		const inner = {
			manifest: { app: 'Iron Ledger', version: '1.0.0', type: 'communities', count: 2 },
			data: {
				communities: [{ id: 'c-wrap', name: 'Wrapped Reach' }],
				npcs: [],
				places: [{ id: 'p-wrap', name: 'Wrapped Hollow' }],
			},
		};
		const wrapped = zipSync({
			'manifest.json': strToU8(
				JSON.stringify({
					app: 'Iron Ledger',
					version: '1.0.0',
					type: 'communities',
					count: 2,
					body: 'communities.json',
				}),
			),
			'communities.json': strToU8(JSON.stringify(inner)),
		});
		await page.locator(ZIP_INPUT).setInputFiles({
			name: 'communities.zip',
			mimeType: 'application/zip',
			buffer: Buffer.from(wrapped),
		});
		await expect(page.locator('.imd-badge--ok')).toBeVisible({ timeout: 5_000 });
		// The rows landed — summary counts them, not "Nothing new to import".
		await expect(page.locator('.imd-state-sub')).toContainText('2 connections');
		await expect(page.locator('.imd-state-sub')).not.toContainText('Nothing new');
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

		// ── Export everything — the portrait becomes an images/ file, referenced
		//    from the character inside the Everything body. ─
		await openExportDialog(page);
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.locator('.exd-dialog .btn-primary').click(),
		]);
		const entries = unzipSync(new Uint8Array(await downloadBuffer(download)));
		const manifest = JSON.parse(strFromU8(entries['manifest.json']));
		const bodyName = manifest.body ?? 'everything.json';
		const body = JSON.parse(strFromU8(entries[bodyName]));
		const char = body.characters[0];
		// Self-contained: portrait bytes live in an images/ entry, referenced by
		// portraitFile — NOT an inline data: URL, and no etag in the file.
		expect(char.data.portraitFile).toMatch(/^images\//);
		expect(entries[char.data.portraitFile]).toBeDefined();
		expect(char.data.portrait).toBeUndefined();
		expect(char.data.portraitEtag).toBeUndefined();

		// ── Re-import under a unique name — portrait must come back from the blob endpoint ──
		const uniqueName = `Roundtrip ${Date.now()}`;
		char.name = uniqueName; // outer display name
		char.data.name = uniqueName; // inner data.name — what the switcher renders
		body.characters = [char];
		const reentries: Record<string, Uint8Array> = { ...entries };
		reentries[bodyName] = strToU8(JSON.stringify(body));
		await page.locator(ZIP_INPUT).setInputFiles({
			name: 'roundtrip.zip',
			mimeType: 'application/zip',
			buffer: Buffer.from(zipSync(reentries)),
		});
		await expectImportOk(page);
		// Dismiss the ImportDialog so it doesn't cover the switcher below.
		await page.locator('.imd-footer .btn-primary', { hasText: /Done/ }).click();

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

// ---------------------------------------------------------------------------
// Place → parent settlement re-linking. A Place stores its parent as
// `withinSettlementId`, but ids are minted per-user, so the export records the
// parent BY NAME (`withinSettlementName`) and import resolves it back to the
// current settlement's id — mirroring how bundled maps re-link owners by name.
// This one flow exercises BOTH directions: import resolves name→id (the place
// gets linked), then export resolves id→name (emits withinSettlementName).
// ---------------------------------------------------------------------------

test.describe('Import / Export — Place ↔ settlement re-linking', () => {
	test.beforeAll(async () => {
		await resetAll();
	});
	test.beforeEach(async ({ page }) => {
		await gotoHome(page);
	});

	test('a nested place re-links by name on import and re-exports by name', async ({ page }) => {
		// Import a settlement + a place that references it ONLY by name (no id).
		const payload = makeManifest(
			'communities',
			{
				communities: [
					{
						id: 'imp-havenport',
						name: 'Havenport',
						region: 'Ragged Coast',
						location: '',
						locationDescription: '',
						trouble: '',
						notes: '',
					},
				],
				npcs: [],
				places: [
					{
						id: 'imp-the-deep',
						name: 'The Deep',
						region: '',
						location: 'Cistern',
						locationDescription: '',
						trouble: '',
						notes: '',
						withinSettlementName: 'Havenport',
					},
				],
			},
			2,
		);
		await uploadImport(page, payload);
		await expectImportOk(page);

		// Reload so the stores refetch from the server — the imported entities are
		// now persisted with their final ids and the resolved parent link.
		await gotoHome(page);

		// Export everything and inspect the body: the place must carry
		// withinSettlementName === "Havenport" (proving import resolved the link)
		// and must NOT carry a raw withinSettlementId.
		await openExportDialog(page);
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.locator('.exd-dialog .btn-primary').click(),
		]);
		const entries = unzipSync(new Uint8Array(await downloadBuffer(download)));
		const manifest = JSON.parse(strFromU8(entries['manifest.json']));
		const data = JSON.parse(strFromU8(entries[manifest.body ?? 'everything.json']));

		const deep = (data.places as Array<Record<string, unknown>>).find((p) => p.name === 'The Deep');
		expect(deep).toBeDefined();
		expect(deep?.withinSettlementName).toBe('Havenport');
		expect(deep?.withinSettlementId).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Full round-trip — export one of every entity type through the real export
// dialog, wipe the account, re-import the produced zip, and verify each type
// came back with its data intact (including the place → settlement re-link).
//
// This exercises the ACTUAL exporter → importer contract end to end (not a
// hand-built fixture), so a body-shape drift between the two — the class of
// bug that made a real communities export silently import nothing — fails
// here immediately.
// ---------------------------------------------------------------------------

const V1 = 'http://127.0.0.1:3000/api/v1';

test.describe('Import / Export — full round-trip', () => {
	// Distinctive ids/names so we can assert each survived and re-linked.
	const COMMUNITY_ID = 'rt-comm-1';

	test.beforeAll(async () => {
		await resetAll();
		const tok = await getTestToken();
		const h = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

		// One of each entity type, each with a distinctive field to assert on.
		await fetch(`${V1}/characters`, {
			method: 'POST',
			headers: h,
			body: JSON.stringify({
				name: 'Rook Vanguard',
				data: { stats: { edge: 3, heart: 1, iron: 2, shadow: 2, wits: 1 }, momentum: 7 },
			}),
		}).then((r) => expect(r.ok, 'seed character').toBeTruthy());

		await fetch(`${V1}/session/communities`, {
			method: 'PATCH',
			headers: h,
			body: JSON.stringify({
				communities: [
					{
						id: COMMUNITY_ID,
						name: 'Bellmark',
						region: 'The Deep Wilds',
						location: '',
						locationDescription: '',
						trouble: 'Failing harvest',
						notes: '',
						createdAt: Date.now(),
					},
				],
			}),
		}).then((r) => expect(r.ok, 'seed community').toBeTruthy());

		await fetch(`${V1}/session/npcs`, {
			method: 'PATCH',
			headers: h,
			body: JSON.stringify({
				npcs: [
					{
						id: 'rt-npc-1',
						name: 'Old Salt',
						role: 'Harbor guide',
						goal: '',
						descriptor: '',
						relationship: 'friendly',
						location: '',
						notes: '',
						createdAt: Date.now(),
					},
				],
			}),
		}).then((r) => expect(r.ok, 'seed npc').toBeTruthy());

		// Place nested inside the community by id — the export lifts this to a
		// name reference, the import must re-resolve it to the new community id.
		await fetch(`${V1}/session/places`, {
			method: 'PATCH',
			headers: h,
			body: JSON.stringify({
				places: [
					{
						id: 'rt-place-1',
						name: 'The Sunken Hall',
						region: 'The Deep Wilds',
						location: '',
						locationDescription: 'A drowned temple',
						trouble: '',
						notes: '',
						situationalNotes: '',
						withinSettlementId: COMMUNITY_ID,
						createdAt: Date.now(),
					},
				],
			}),
		}).then((r) => expect(r.ok, 'seed place').toBeTruthy());

		await fetch(`${V1}/session/expeditions`, {
			method: 'PATCH',
			headers: h,
			body: JSON.stringify({
				expeditions: [
					{
						id: 'rt-journey-1',
						type: 'journey',
						name: 'The Long Road',
						objective: 'Reach the coast',
						difficulty: 'dangerous',
						ticks: 8,
						notes: '',
						complete: false,
					},
					{
						id: 'rt-site-1',
						type: 'site',
						name: 'Barrowdeep',
						theme: 'Ravaged',
						domain: 'Barrow',
						difficulty: 'formidable',
						ticks: 0,
						denizens: [],
						notes: '',
						complete: false,
					},
				],
			}),
		}).then((r) => expect(r.ok, 'seed expeditions').toBeTruthy());

		await fetch(`${V1}/session/log`, {
			method: 'POST',
			headers: h,
			body: JSON.stringify({
				id: '11111111-1111-4111-8111-111111111111',
				title: 'Round-trip Marker',
				html: '<div>A distinctive log line.</div>',
				ts: new Date().toISOString(),
			}),
		}).then((r) => expect(r.ok, 'seed log').toBeTruthy());
	});

	test('export everything, wipe, re-import, and every type returns intact', async ({ page }) => {
		await gotoHome(page);

		// 1. Export everything through the real dialog (opens fully selected).
		await openExportDialog(page);
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.locator('.exd-dialog .btn-primary').click(),
		]);
		const zipBytes = await downloadBuffer(download);
		expect(zipBytes.length).toBeGreaterThan(0);

		// 2. Wipe the account and confirm it's empty on a fresh load.
		await resetAll();
		await gotoHome(page);
		const empty = await page.evaluate(async () => {
			const s = await fetch('/api/session', { credentials: 'include' }).then((r) => r.json());
			const chars = await fetch('/api/characters', { credentials: 'include' }).then((r) =>
				r.json(),
			);
			return {
				chars: chars.length,
				communities: (s.communities ?? []).length,
				npcs: (s.npcs ?? []).length,
				places: (s.places ?? []).length,
				expeditions: (s.expeditions ?? []).length,
			};
		});
		expect(empty).toEqual({ chars: 0, communities: 0, npcs: 0, places: 0, expeditions: 0 });

		// 3. Re-import the produced zip.
		await page.locator(ZIP_INPUT).setInputFiles({
			name: 'roundtrip.zip',
			mimeType: 'application/zip',
			buffer: zipBytes,
		});
		await expect(page.locator('.imd-badge--ok')).toBeVisible({ timeout: 10_000 });
		await expect(page.locator('.imd-errlist')).toHaveCount(0);

		// 4. Verify every type came back with its data intact.
		const state = await page.evaluate(async () => {
			const s = await fetch('/api/session', { credentials: 'include' }).then((r) => r.json());
			const chars = await fetch('/api/characters', { credentials: 'include' }).then((r) =>
				r.json(),
			);
			const log = await fetch('/api/session/log?limit=100', { credentials: 'include' }).then((r) =>
				r.json(),
			);
			return {
				chars,
				communities: s.communities ?? [],
				npcs: s.npcs ?? [],
				places: s.places ?? [],
				expeditions: s.expeditions ?? [],
				log: Array.isArray(log) ? log : (log.entries ?? []),
			};
		});

		// Character — name + a distinctive stat.
		const rook = state.chars.find((c: { name: string }) => c.name === 'Rook Vanguard');
		expect(rook, 'character round-tripped').toBeDefined();
		expect(rook.data?.stats?.edge).toBe(3);

		// Community — name + region.
		const bellmark = state.communities.find((c: { name: string }) => c.name === 'Bellmark');
		expect(bellmark, 'community round-tripped').toBeDefined();
		expect(bellmark.region).toBe('The Deep Wilds');

		// NPC.
		expect(state.npcs.find((n: { name: string }) => n.name === 'Old Salt')).toBeDefined();

		// Place — present AND re-linked to the community's NEW id (not the old one).
		const hall = state.places.find((p: { name: string }) => p.name === 'The Sunken Hall');
		expect(hall, 'place round-tripped').toBeDefined();
		expect(hall.withinSettlementId, 'place re-linked to community').toBe(bellmark.id);

		// Expeditions — both types with their discriminating fields.
		const journey = state.expeditions.find((e: { name: string }) => e.name === 'The Long Road');
		const site = state.expeditions.find((e: { name: string }) => e.name === 'Barrowdeep');
		expect(journey?.type).toBe('journey');
		expect(journey?.difficulty).toBe('dangerous');
		expect(site?.type).toBe('site');
		expect(site?.domain).toBe('Barrow');

		// Log — the distinctive entry is back.
		expect(
			state.log.some((e: { title?: string }) => e.title === 'Round-trip Marker'),
			'log entry round-tripped',
		).toBeTruthy();
	});
});
