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
import { test, expect } from '@playwright/test';
import { resetAll } from './helpers/reset';

const CHAR_AREA = '.home-area--characters';

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
}

/** Open Hamburger → Export dialog, select a content option. */
async function openExportDialog(page: import('@playwright/test').Page, content: string) {
	await page.locator('.hamburger-btn').click();
	await page.locator('.menu-item:has-text("Export...")').click();
	await expect(page.locator('.export-dialog[open]')).toBeVisible();
	await page.locator('.ed-select').selectOption(content);
}

/** Upload a JSON blob via the hidden file input. */
async function uploadImport(
	page: import('@playwright/test').Page,
	payload: unknown,
	filename = 'test-import.json',
) {
	const fileInput = page.locator('input[type="file"][accept=".json,application/json"]');
	await fileInput.setInputFiles({
		name: filename,
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(payload)),
	});
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
		// 'foes' was removed from the export menu in commit 7eff969 — foes now
		// only ship as part of an Everything export.
		for (const val of [
			'character',
			'all-characters',
			'log',
			'communities',
			'expeditions',
			'everything',
		]) {
			await expect(
				page.locator(`.export-dialog[open] .ed-select option[value="${val}"]`).first(),
			).toBeAttached();
		}
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
		await expect(page.locator('.export-dialog[open]')).not.toBeVisible();
	});

	test('Everything export downloads a JSON file with correct name pattern', async ({ page }) => {
		await openExportDialog(page, 'everything');
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.locator('.export-dialog .btn-primary').click(),
		]);
		expect(download.suggestedFilename()).toMatch(
			/^ironledger-export-\d{4}-\d{2}-\d{2}_\d{4}\.json$/,
		);
	});

	test('All Characters JSON export downloads a JSON file', async ({ page }) => {
		// All Characters is JSON-only — no format selector.
		await openExportDialog(page, 'all-characters');
		// all-characters is JSON-only — there is no Format segmented control to
		// click (the picker auto-pins exportFormat to 'json' on change).
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.locator('.export-dialog .btn-primary').click(),
		]);
		expect(download.suggestedFilename()).toMatch(/^all-characters-.*\.json$/);
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

	test('exported Everything JSON has correct manifest structure', async ({ page }) => {
		await openExportDialog(page, 'everything');
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.locator('.export-dialog .btn-primary').click(),
		]);
		const stream = await download.createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of stream)
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		const json = JSON.parse(Buffer.concat(chunks).toString());

		expect(json.manifest).toBeDefined();
		expect(json.manifest.type).toBe('everything');
		expect(json.manifest.app).toBe('Iron Ledger');
		expect(json.data).toBeDefined();
		expect(Array.isArray(json.data.characters)).toBe(true);
		expect(Array.isArray(json.data.log)).toBe(true);
		expect(Array.isArray(json.data.communities)).toBe(true);
		expect(Array.isArray(json.data.npcs)).toBe(true);
		expect(Array.isArray(json.data.expeditions)).toBe(true);
		expect(json.data.session).toBeDefined();
		// Foes are transient and Markdown-only — never in the JSON export.
		expect(json.data.foes).toBeUndefined();
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
		const big = {
			manifest: { type: 'log', app: 'Iron Ledger', version: '1.0.0', exportedAt: '', count: 0 },
			data: [],
			_pad: 'x'.repeat(6 * 1024 * 1024),
		};
		await uploadImport(page, big, 'huge.json');
		await expect(page.locator('.error-bar')).toBeVisible({ timeout: 5_000 });
		await expect(page.locator('.error-bar-msg')).toContainText('too large');
	});

	test('rejects invalid (non-JSON) files with a user-friendly error', async ({ page }) => {
		const fileInput = page.locator('input[type="file"][accept=".json,application/json"]');
		await fileInput.setInputFiles({
			name: 'bad.json',
			mimeType: 'application/json',
			buffer: Buffer.from('this is not valid json }{'),
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
