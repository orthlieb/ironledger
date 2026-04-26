/**
 * import-export.spec.ts — Import / Export dialog and security hardening.
 *
 * Covers:
 *   • Export dialog content options and format selector visibility
 *   • File download verification (name, structure)
 *   • Happy-path import round-trip
 *   • Security: oversized file, invalid JSON, prototype pollution, XSS via log HTML
 */
import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to /home and wait for the page to finish loading. */
async function gotoHome(page: import('@playwright/test').Page) {
	await page.goto('/home');
	await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 10000 });
}

/** Open Hamburger → Export dialog, select a content option. */
async function openExportDialog(
	page: import('@playwright/test').Page,
	content: string,
) {
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
		name:     filename,
		mimeType: 'application/json',
		buffer:   Buffer.from(JSON.stringify(payload)),
	});
}

/** Build a minimal valid manifest-wrapped payload. */
function makeManifest(type: string, data: unknown, count = 0) {
	return {
		manifest: {
			app:        'Iron Ledger',
			version:    '1.0.0',
			exportedAt: new Date().toISOString(),
			type,
			count,
		},
		data,
	};
}

// ---------------------------------------------------------------------------
// Export dialog
// ---------------------------------------------------------------------------

test.describe('Export dialog', () => {
	test.beforeEach(async ({ page }) => {
		await gotoHome(page);
	});

	test('opens and lists all content options', async ({ page }) => {
		await openExportDialog(page, 'character');
		// The dialog renders two copies of .ed-select for responsive layout; query
		// options at page level with .first() so Playwright doesn't choke on duplicates.
		for (const val of ['character', 'all-characters', 'log', 'communities', 'foes', 'expeditions', 'everything']) {
			await expect(
				page.locator(`.export-dialog[open] .ed-select option[value="${val}"]`).first()
			).toBeAttached();
		}
	});

	test('hides format selector when Everything is chosen', async ({ page }) => {
		await openExportDialog(page, 'everything');
		// Format row is inside {#if exportContent !== 'everything'} — should not exist
		await expect(page.locator('.ed-label:has-text("Format")')).not.toBeVisible();
	});

	test('shows format selector for non-Everything options', async ({ page }) => {
		await openExportDialog(page, 'all-characters');
		await expect(page.locator('.ed-label:has-text("Format")')).toBeVisible();
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
		expect(download.suggestedFilename()).toMatch(/^ironledger-export-\d{4}-\d{2}-\d{2}_\d{4}\.json$/);
	});

	test('All Characters JSON export downloads a JSON file', async ({ page }) => {
		await openExportDialog(page, 'all-characters');
		// Ensure JSON is selected
		await page.locator('.ed-seg-btn:has-text("JSON")').click();
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
		for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		const json = JSON.parse(Buffer.concat(chunks).toString());

		expect(json.manifest).toBeDefined();
		expect(json.manifest.type).toBe('everything');
		expect(json.manifest.app).toBe('Iron Ledger');
		expect(json.data).toBeDefined();
		expect(Array.isArray(json.data.characters)).toBe(true);
		expect(Array.isArray(json.data.log)).toBe(true);
		expect(Array.isArray(json.data.communities)).toBe(true);
		expect(Array.isArray(json.data.npcs)).toBe(true);
		expect(Array.isArray(json.data.foes)).toBe(true);
		expect(Array.isArray(json.data.expeditions)).toBe(true);
		expect(json.data.session).toBeDefined();
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
		const payload = makeManifest('character', { name: 'Test Pilgrim', data: { edge: 2, heart: 3 } }, 1);
		await uploadImport(page, payload);
		await expect(page.locator('.error-bar')).not.toBeVisible({ timeout: 5000 });
	});

	test('imports a valid log JSON without errors', async ({ page }) => {
		const payload = makeManifest('log', [
			{ title: 'Face Danger', html: '<div>A roll was made.</div>', ts: Date.now(), note: '' },
		], 1);
		await uploadImport(page, payload);
		await expect(page.locator('.error-bar')).not.toBeVisible({ timeout: 5000 });
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
		// 6 MB of padding — well over the limit
		const big = { manifest: { type: 'log', app: 'Iron Ledger', version: '1.0.0', exportedAt: '', count: 0 }, data: [], _pad: 'x'.repeat(6 * 1024 * 1024) };
		await uploadImport(page, big, 'huge.json');
		await expect(page.locator('.error-bar')).toBeVisible({ timeout: 5000 });
		await expect(page.locator('.error-bar-msg')).toContainText('too large');
	});

	test('rejects invalid (non-JSON) files with a user-friendly error', async ({ page }) => {
		const fileInput = page.locator('input[type="file"][accept=".json,application/json"]');
		await fileInput.setInputFiles({
			name:     'bad.json',
			mimeType: 'application/json',
			buffer:   Buffer.from('this is not valid json }{'),
		});
		await expect(page.locator('.error-bar')).toBeVisible({ timeout: 5000 });
		await expect(page.locator('.error-bar-msg')).toContainText('not valid JSON');
	});

	test('silently drops __proto__ keys — no prototype pollution', async ({ page }) => {
		const poisoned = makeManifest('character', {
			name: 'Poison Pilgrim',
			data: {
				// Attempt to pollute Object.prototype via JSON import
				'__proto__':   { isAdmin: true },
				'constructor': { name: 'pwned' },
				edge:          1,
			},
		}, 1);
		await uploadImport(page, poisoned);
		// No crash, no error bar
		await expect(page.locator('.error-bar')).not.toBeVisible({ timeout: 5000 });
		// Object.prototype must not have been polluted
		const polluted = await page.evaluate(() => (({} as Record<string,unknown>).isAdmin));
		expect(polluted).toBeUndefined();
	});

	test('sanitizes <script> tags in imported log HTML', async ({ page }) => {
		const payload = makeManifest('log', [{
			title: 'Malicious Entry',
			html:  '<div>Safe text</div><script>window.__xss_test = true;</script>',
			ts:    Date.now(),
			note:  '',
		}], 1);
		await uploadImport(page, payload);
		await expect(page.locator('.error-bar')).not.toBeVisible({ timeout: 5000 });
		// The script must not have executed
		const xssRan = await page.evaluate(() => (window as unknown as Record<string, unknown>).__xss_test);
		expect(xssRan).toBeUndefined();
	});

	test('sanitizes event-handler attributes in imported log HTML', async ({ page }) => {
		const payload = makeManifest('log', [{
			title: 'Handler Entry',
			html:  '<img src="x" onerror="window.__onerror_test=true;">',
			ts:    Date.now(),
			note:  '',
		}], 1);
		await uploadImport(page, payload);
		await expect(page.locator('.error-bar')).not.toBeVisible({ timeout: 5000 });
		// onerror must not fire
		await page.waitForTimeout(500);
		const handlerRan = await page.evaluate(() => (window as unknown as Record<string, unknown>).__onerror_test);
		expect(handlerRan).toBeUndefined();
	});

	test('rejects JSON with array exceeding item limit', async ({ page }) => {
		// 1001 items — over the 1000 limit
		const payload = makeManifest('log', Array.from({ length: 1001 }, (_, i) => ({
			title: `Entry ${i}`, html: '<div>x</div>', ts: Date.now(), note: '',
		})), 1001);
		await uploadImport(page, payload);
		await expect(page.locator('.error-bar')).toBeVisible({ timeout: 10_000 });
		await expect(page.locator('.error-bar-msg')).toContainText('too many items', { timeout: 5000 });
	});

	test('rejects JSON with excessive nesting depth', async ({ page }) => {
		// Build a 15-deep nested object — over the MAX_DEPTH of 12
		let deep: unknown = 'leaf';
		for (let i = 0; i < 15; i++) deep = { child: deep };
		const payload = makeManifest('character', { name: 'Deep', data: { nested: deep } }, 1);
		await uploadImport(page, payload);
		await expect(page.locator('.error-bar')).toBeVisible({ timeout: 5000 });
		await expect(page.locator('.error-bar-msg')).toContainText('deeply nested');
	});
});
