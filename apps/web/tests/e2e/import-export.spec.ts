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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { resetAll, getTestToken, seedCommunity } from './helpers/reset';
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
	await page.locator('.cb-item--action', { hasText: /New character/i }).click();
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
			await page.locator('.cb-item--action', { hasText: /New character/i }).click();
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
		// Re-importing into the same (non-wiped) account, the bundled default
		// map name-collides with the one already present → the owner-conflict
		// prompt. This test only cares about the portrait, so Skip it.
		const mapConflict = page.locator('.moc-dialog');
		await mapConflict.waitFor({ state: 'visible', timeout: 8_000 }).then(
			() => mapConflict.locator('.moc-footer .btn', { hasText: /^Skip$/ }).click(),
			() => {}, // no conflict prompt — nothing to dismiss
		);
		await expectImportOk(page);
		// Dismiss the ImportDialog so it doesn't cover the switcher below.
		await page.locator('.imd-footer .btn-primary', { hasText: /Done/ }).click();

		// Select the freshly imported character from the switcher, open Background.
		await page.locator(`${CHAR_AREA} .ca-hdr-combobox`).click();
		await page
			.locator('.cb-popover .cb-item:not(.cb-item--action)', { hasText: uniqueName })
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
// Containment re-linking. A connection stores its parent as a `within` ref
// (`"kind:id"`), but ids are minted per-user, so the export records the parent
// BY NAME + KIND (`withinRef { kind, name }`) and import resolves it back to the
// current parent's id — mirroring how bundled maps re-link owners by name. This
// flow exercises BOTH directions: import resolves a legacy `withinSettlementName`
// to `within`, then export lifts `within` back to a portable `withinRef`.
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

		// Export everything and inspect the body: the place must carry a portable
		// withinRef { kind: 'community', name: 'Havenport' } (proving import
		// resolved the legacy name link into `within`, and export lifted it back
		// to a name reference) and must NOT carry any raw id/legacy field.
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
		expect(deep?.withinRef).toEqual({ kind: 'community', name: 'Havenport' });
		expect(deep?.within).toBeUndefined();
		expect(deep?.withinSettlementId).toBeUndefined();
		expect(deep?.withinSettlementName).toBeUndefined();
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

		// Place — present AND re-linked (via `within`) to the community's NEW id
		// (not the old one). Seeded with the legacy withinSettlementId; the
		// round-trip migrates it to a `within` ref resolved by name.
		const hall = state.places.find((p: { name: string }) => p.name === 'The Sunken Hall');
		expect(hall, 'place round-tripped').toBeDefined();
		expect(hall.within, 'place re-linked to community').toBe(`community:${bellmark.id}`);
		expect(hall.withinSettlementId, 'legacy field dropped').toBeUndefined();

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

// ---------------------------------------------------------------------------
// Marker → entity link re-resolution on import
//
// A map marker's entityId is "kind:uuid" from the exporting account. On
// import the exporter's uuid is meaningless once the entity's id differs
// (a merge, or a cross-account restore), so the exporter stamps each linked
// marker with the entity's NAME and the importer re-resolves (kind, name) →
// the live id. Verified via the server's entity-marker index.
// ---------------------------------------------------------------------------

test.describe('Import — marker entity re-link', () => {
	test.beforeEach(async () => {
		await resetAll();
	});

	test('a map marker re-links to a same-named entity, not the exported id', async ({ page }) => {
		// Seed a community with a KNOWN server id + name, then load so the store
		// holds it (the importer resolves marker links against the live stores).
		const commId = await seedCommunity('Relink Haven');
		await gotoHome(page);

		// A standalone map zip whose one marker points at a FOREIGN community id
		// but carries the resolvable entityName.
		const mapZip = zipSync({
			'manifest.json': strToU8(
				JSON.stringify({ app: 'Iron Ledger', version: '1.0.0', type: 'map', body: 'map.json' }),
			),
			'map.json': strToU8(
				JSON.stringify({
					name: 'Relink Test Map',
					markers: [
						{
							id: 'mk-relink-1',
							x: 5,
							y: 5,
							label: 'Haven pin',
							icon: 'settlement',
							entityId: 'community:00000000-dead-4000-8000-000000000000',
							entityName: 'Relink Haven',
						},
					],
					settings: {},
				}),
			),
		});
		await page.locator(ZIP_INPUT).setInputFiles({
			name: 'relink.zip',
			mimeType: 'application/zip',
			buffer: Buffer.from(mapZip),
		});
		await expect(page.locator('.imd-badge--ok')).toBeVisible({ timeout: 5_000 });

		// The marker now points at the SEEDED community's id — not the foreign one.
		const index = await page.evaluate(async () => {
			const res = await fetch('/api/session/maps/entity-markers', { credentials: 'include' });
			return (await res.json()) as { index?: Record<string, unknown> };
		});
		const keys = Object.keys(index.index ?? {});
		expect(keys).toContain(`community:${commId}`);
		expect(keys).not.toContain('community:00000000-dead-4000-8000-000000000000');
	});

	test('a marker linked to a LANDMARK re-links by name too', async ({ page }) => {
		// Same mechanism as settlements, but the marker points at a place — guards
		// against the re-link only being wired for communities.
		const tok = await getTestToken();
		const placeId = crypto.randomUUID();
		await fetch(`${V1}/session/places`, {
			method: 'PATCH',
			headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				places: [
					{
						id: placeId,
						name: 'Relink Vale',
						region: '',
						location: '',
						locationDescription: '',
						trouble: '',
						notes: '',
						createdAt: Date.now(),
					},
				],
			}),
		});
		await gotoHome(page);
		const mapZip = zipSync({
			'manifest.json': strToU8(
				JSON.stringify({ app: 'Iron Ledger', version: '1.0.0', type: 'map', body: 'map.json' }),
			),
			'map.json': strToU8(
				JSON.stringify({
					name: 'Landmark Relink Map',
					markers: [
						{
							id: 'mk-relink-place',
							x: 4,
							y: 4,
							label: 'Vale pin',
							icon: 'landmark',
							entityId: 'place:00000000-dead-4000-8000-000000000001',
							entityName: 'Relink Vale',
						},
					],
					settings: {},
				}),
			),
		});
		await page.locator(ZIP_INPUT).setInputFiles({
			name: 'relink-place.zip',
			mimeType: 'application/zip',
			buffer: Buffer.from(mapZip),
		});
		await expect(page.locator('.imd-badge--ok')).toBeVisible({ timeout: 5_000 });
		const index = await page.evaluate(async () => {
			const res = await fetch('/api/session/maps/entity-markers', { credentials: 'include' });
			return (await res.json()) as { index?: Record<string, unknown> };
		});
		const keys = Object.keys(index.index ?? {});
		expect(keys).toContain(`place:${placeId}`);
		expect(keys).not.toContain('place:00000000-dead-4000-8000-000000000001');
	});

	test('an unresolvable marker link is dropped (pin kept, no dead link)', async ({ page }) => {
		await gotoHome(page); // no matching community seeded
		const mapZip = zipSync({
			'manifest.json': strToU8(
				JSON.stringify({ app: 'Iron Ledger', version: '1.0.0', type: 'map', body: 'map.json' }),
			),
			'map.json': strToU8(
				JSON.stringify({
					name: 'Orphan Link Map',
					markers: [
						{
							id: 'mk-orphan-1',
							x: 3,
							y: 3,
							label: 'Ghost pin',
							icon: 'settlement',
							entityId: 'community:11111111-dead-4000-8000-000000000000',
							entityName: 'Nonexistent Town',
						},
					],
					settings: {},
				}),
			),
		});
		await page.locator(ZIP_INPUT).setInputFiles({
			name: 'orphan.zip',
			mimeType: 'application/zip',
			buffer: Buffer.from(mapZip),
		});
		await expect(page.locator('.imd-badge--ok')).toBeVisible({ timeout: 5_000 });

		// No entity-marker back-references at all — the dead link was dropped,
		// but the pin itself survived (the map has one marker).
		const state = await page.evaluate(async () => {
			const index = await fetch('/api/session/maps/entity-markers', {
				credentials: 'include',
			}).then((r) => r.json());
			const maps = await fetch('/api/session/maps', { credentials: 'include' }).then((r) =>
				r.json(),
			);
			const detailId = (maps.maps ?? []).find(
				(m: { name?: string }) => m.name === 'Orphan Link Map',
			)?.id;
			const detail = detailId
				? await fetch(`/api/session/maps/${detailId}`, { credentials: 'include' }).then((r) =>
						r.json(),
					)
				: null;
			return {
				indexKeys: Object.keys(index.index ?? {}),
				markerCount: Array.isArray(detail?.markers) ? detail.markers.length : 0,
				firstMarkerHasEntity: !!detail?.markers?.[0]?.entityId,
			};
		});
		expect(state.indexKeys).not.toContain('community:11111111-dead-4000-8000-000000000000');
		expect(state.markerCount).toBe(1); // pin kept
		expect(state.firstMarkerHasEntity).toBe(false); // link dropped
	});
});

// ---------------------------------------------------------------------------
// Rich round-trip — the bundled YRT starter (static/about/yrt-starter.zip) is
// the app's most content-dense archive: ~15 settlements + ~22 landmarks with
// portraits, a regional map with entity-linked markers, characters, and
// expeditions. Import it through the real dialog, add one containment edge to
// exercise the "graph", then export → wipe → re-import and assert the whole
// world came back byte-for-meaning: same names per kind, the SAME entities
// still carry portraits, the map markers still resolve, and the within link
// survives. This is the test that would have caught portraits silently not
// round-tripping.
// ---------------------------------------------------------------------------

const STARTER_ZIP = fileURLToPath(new URL('../../static/about/yrt-starter.zip', import.meta.url));

/** A structural snapshot of the whole world, keyed by NAME (ids are minted
 *  per-import, so names are the stable identity across a round-trip). */
async function worldSummary(page: import('@playwright/test').Page) {
	return await page.evaluate(async () => {
		const s = await (await fetch('/api/session', { credentials: 'include' })).json();
		const chars = await (await fetch('/api/characters', { credentials: 'include' })).json();
		const mapList = ((await (await fetch('/api/session/maps', { credentials: 'include' })).json())
			.maps ?? []) as Array<{ id: string }>;
		const communities = (s.communities ?? []) as Array<Record<string, unknown>>;
		const places = (s.places ?? []) as Array<Record<string, unknown>>;
		const cp = [...communities, ...places];
		const idset = new Set([
			...communities.map((c) => `community:${c.id}`),
			...places.map((p) => `place:${p.id}`),
		]);
		const nameById = new Map<string, string>([
			...communities.map((c) => [`community:${c.id}`, c.name as string] as const),
			...places.map((p) => [`place:${p.id}`, p.name as string] as const),
		]);
		const maps: Array<{
			name: string;
			markers: number;
			linked: number;
			linkedNames: string[];
			linkedKinds: string[];
		}> = [];
		for (const m of mapList) {
			const det = await (
				await fetch(`/api/session/maps/${m.id}`, { credentials: 'include' })
			).json();
			const markers = (det.markers ?? []) as Array<{ entityId?: string }>;
			const resolved = markers.filter((mk) => mk.entityId && idset.has(mk.entityId));
			maps.push({
				name: det.name,
				markers: markers.length,
				linked: resolved.length,
				// The specific entities each marker resolves to, by NAME — so a
				// round-trip must re-link every marker to the SAME settlement/
				// landmark, not merely keep the count.
				linkedNames: resolved.map((mk) => nameById.get(mk.entityId as string) as string).sort(),
				// Which kinds are linked — lets a test assert both settlements and
				// landmarks are exercised.
				linkedKinds: [
					...new Set(resolved.map((mk) => (mk.entityId as string).split(':')[0])),
				].sort(),
			});
		}
		const withinPairs = cp
			.filter((e) => typeof e.within === 'string')
			.map((e) => ({ child: e.name as string, parent: nameById.get(e.within as string) }))
			.filter((x) => x.parent)
			.sort((a, b) => a.child.localeCompare(b.child));
		const sorted = (a: string[]) => a.slice().sort();
		return {
			communities: sorted(communities.map((c) => c.name as string)),
			places: sorted(places.map((p) => p.name as string)),
			npcCount: (s.npcs ?? []).length,
			expeditions: sorted((s.expeditions ?? []).map((e: { name: string }) => e.name)),
			characters: sorted((Array.isArray(chars) ? chars : []).map((c: { name: string }) => c.name)),
			portraitNames: sorted(cp.filter((e) => e.portraitEtag).map((e) => e.name as string)),
			maps: maps.sort((a, b) => a.name.localeCompare(b.name)),
			withinPairs,
		};
	});
}

async function importZipBytes(page: import('@playwright/test').Page, bytes: Buffer, name: string) {
	await page.locator(ZIP_INPUT).setInputFiles({ name, mimeType: 'application/zip', buffer: bytes });
	await expectImportOk(page, 45_000);
}

test.describe('Import / Export — YRT starter rich round-trip', () => {
	test.beforeAll(async () => {
		await resetAll();
	});

	test('the bundled starter survives import → export → re-import with maps, portraits, and the within graph intact', async ({
		page,
	}) => {
		test.setTimeout(120_000);
		await gotoHome(page);

		// 1. Import the real bundled starter and confirm it landed rich content.
		await importZipBytes(page, readFileSync(STARTER_ZIP), 'yrt-starter.zip');
		const imported = await worldSummary(page);
		expect(imported.communities.length, 'settlements imported').toBeGreaterThan(10);
		expect(imported.places.length, 'landmarks imported').toBeGreaterThan(10);
		expect(imported.portraitNames.length, 'portraits imported').toBeGreaterThan(10);
		expect(imported.maps.length, 'a map imported').toBeGreaterThan(0);
		expect(imported.maps[0].linked, 'map markers link to entities').toBeGreaterThan(0);
		// The regional map links markers to BOTH settlements and landmarks, so the
		// round-trip equality below actually exercises both kinds.
		expect(imported.maps[0].linkedKinds, 'markers link settlements AND landmarks').toEqual([
			'community',
			'place',
		]);

		// 2. Add one containment edge (settlement within a landmark) so the graph
		//    is part of what round-trips. Reload so the export reads it.
		await page.evaluate(async () => {
			const s = await (await fetch('/api/session', { credentials: 'include' })).json();
			const c = (s.communities ?? [])[0];
			const p = (s.places ?? [])[0];
			await fetch(`/api/session/communities/${c.id}`, {
				method: 'PATCH',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...c, within: `place:${p.id}` }),
			});
		});
		await gotoHome(page);
		const before = await worldSummary(page);
		expect(before.withinPairs.length, 'within edge present before export').toBeGreaterThan(0);

		// 3. Export everything.
		await openExportDialog(page);
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.locator('.exd-dialog .btn-primary').click(),
		]);
		const exported = await downloadBuffer(download);
		expect(exported.length).toBeGreaterThan(0);

		// 4. Wipe and re-import the produced archive.
		await resetAll();
		await gotoHome(page);
		await importZipBytes(page, exported, 'roundtrip.zip');
		const after = await worldSummary(page);

		// 5. Everything came back, keyed by name — including portraits, the map +
		//    its resolved markers, and the containment edge.
		expect(after.communities).toEqual(before.communities);
		expect(after.places).toEqual(before.places);
		expect(after.npcCount).toEqual(before.npcCount);
		expect(after.expeditions).toEqual(before.expeditions);
		expect(after.characters).toEqual(before.characters);
		expect(after.portraitNames, 'the same entities still carry portraits').toEqual(
			before.portraitNames,
		);
		expect(after.maps, 'map + resolved marker links round-trip').toEqual(before.maps);
		expect(after.withinPairs, 'the within graph round-trips by name').toEqual(before.withinPairs);

		// Portrait BYTES survived the round-trip, not just the etag flag: fetch a
		// restored connection's portrait and confirm it comes back with content.
		const portrait = await page.evaluate(async () => {
			const s = await (await fetch('/api/session', { credentials: 'include' })).json();
			const comm = (s.communities ?? []).find((c: { portraitEtag?: string }) => c.portraitEtag);
			const place = (s.places ?? []).find((p: { portraitEtag?: string }) => p.portraitEtag);
			const hit = comm
				? { kind: 'communities', id: comm.id }
				: place
					? { kind: 'places', id: place.id }
					: null;
			if (!hit) return { checked: false, status: 0, bytes: 0 };
			const res = await fetch(`/api/session/${hit.kind}/${hit.id}/portrait`, {
				credentials: 'include',
			});
			const bytes = res.ok ? (await res.arrayBuffer()).byteLength : 0;
			return { checked: true, status: res.status, bytes };
		});
		expect(portrait.checked, 'a restored connection has a portrait to check').toBe(true);
		expect(portrait.status).toBe(200);
		expect(portrait.bytes).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Markdown export — folder-per-kind, one file per entity, with working
// relative links (Obsidian/GitHub both resolve them), honouring the dialog
// selection. Regression guard for: MD ignoring the checklist, one big
// connections.md, and dead [[wikilinks]].
// ---------------------------------------------------------------------------

test.describe('Import / Export — Markdown structure', () => {
	const GV = 'md-green-vale';
	test.beforeAll(async () => {
		await resetAll();
		const tok = await getTestToken();
		const h = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
		const base = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
			id,
			name,
			region: '',
			location: '',
			locationDescription: '',
			trouble: '',
			notes: '',
			createdAt: Date.now(),
			...extra,
		});
		await fetch(`${V1}/session/places`, {
			method: 'PATCH',
			headers: h,
			body: JSON.stringify({ places: [base(GV, 'Green Vale')] }),
		});
		await fetch(`${V1}/session/communities`, {
			method: 'PATCH',
			headers: h,
			body: JSON.stringify({
				communities: [
					base('md-riverton', 'Riverton', { within: `place:${GV}` }),
					base('md-lakeside', 'Lakeside'),
				],
			}),
		});
		// Give Riverton a portrait so the MD export's image handling is exercised
		// (bytes → images/ file, referenced from the entity file with ../images/).
		const TINY_PNG =
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==';
		const put = await fetch(`${V1}/session/communities/md-riverton/portrait`, {
			method: 'PUT',
			headers: h,
			body: JSON.stringify({ dataUrl: `data:image/png;base64,${TINY_PNG}` }),
		});
		const { etag } = (await put.json()) as { etag: string };
		await fetch(`${V1}/session/communities/md-riverton`, {
			method: 'PATCH',
			headers: h,
			body: JSON.stringify(
				base('md-riverton', 'Riverton', { within: `place:${GV}`, portraitEtag: etag }),
			),
		});
	});

	async function exportMarkdown(page: import('@playwright/test').Page) {
		await openExportDialog(page);
		await page.locator('.exd-segbtn', { hasText: 'Markdown' }).click();
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.locator('.exd-dialog .btn-primary').click(),
		]);
		return unzipSync(new Uint8Array(await downloadBuffer(download)));
	}

	test('writes one file per entity with working relative links + a README index', async ({
		page,
	}) => {
		await gotoHome(page);
		const entries = exportMarkdownNames(await exportMarkdown(page));
		// Folder-per-kind, file-per-entity — not one big connections.md.
		expect(entries.names).toContain('README.md');
		expect(entries.names).toContain('connections/riverton.md');
		expect(entries.names).toContain('connections/green-vale.md');
		expect(entries.names).toContain('connections/lakeside.md');
		expect(entries.names).not.toContain('connections.md');
		// The within link is a working relative markdown link, not a dead wikilink.
		expect(entries.riverton).toContain('[Green Vale](green-vale.md)');
		expect(entries.riverton).not.toContain('[[Green Vale]]');
		// README links into the folder.
		expect(entries.readme).toContain('(connections/riverton.md)');
		// Portrait bytes are written under images/ and referenced from the entity
		// file one folder up (../images/…), not left as a dead/absolute link.
		expect(entries.names.some((n) => n.startsWith('images/'))).toBe(true);
		expect(entries.riverton).toContain('![Portrait](../images/');
	});

	test('obeys the selection — deselected entities get no file', async ({ page }) => {
		await gotoHome(page);
		await openExportDialog(page);
		await page.locator('.exd-segbtn', { hasText: 'Markdown' }).click();
		// Clear everything, then pick only Riverton.
		await page.locator('.exd-selectall').click();
		await page.locator('.fb-input').fill('Riverton');
		await page.locator('.exd-item', { hasText: 'Riverton' }).click();
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.locator('.exd-dialog .btn-primary').click(),
		]);
		const names = Object.keys(unzipSync(new Uint8Array(await downloadBuffer(download))));
		expect(names).toContain('connections/riverton.md');
		expect(names).not.toContain('connections/lakeside.md');
		expect(names).not.toContain('connections/green-vale.md');
	});
});

function exportMarkdownNames(entries: Record<string, Uint8Array>) {
	return {
		names: Object.keys(entries),
		riverton: entries['connections/riverton.md']
			? strFromU8(entries['connections/riverton.md'])
			: '',
		readme: entries['README.md'] ? strFromU8(entries['README.md']) : '',
	};
}
