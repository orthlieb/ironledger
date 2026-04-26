/**
 * supply-sync.spec.ts — Party supply is always in sync across all characters.
 *
 * Covers:
 *   • New character inherits current party supply on creation
 *   • Imported character syncs all chars to max(existing, imported) supply
 *   • Increasing supply on one char syncs all others (+ button)
 *   • Decreasing supply on one char syncs all others (− button)
 *   • Supply resource-link click in the log echoes the change to all chars
 *   • GCB supply chip updates immediately when supply changes (Characters tab)
 *   • GCB supply chip updates when log resource-link is clicked on Adventure tab
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function gotoCharactersTab(page: Page) {
	await page.goto('/home');
	await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 10000 });
	await page.locator('.tab-btn[data-tab="characters"]').click();
	await expect(page.locator('.char-toolbar')).toBeVisible({ timeout: 5000 });
}

/** Wait until at least N character cards exist, creating new ones as needed. */
async function ensureCharCount(page: Page, n: number) {
	await page.locator('.char-list--characters > .char-card, .empty-tab').first()
		.waitFor({ timeout: 8000, state: 'attached' });
	while (await page.locator('.char-list--characters > .char-card').count() < n) {
		await page.locator('.char-toolbar button.btn-primary').click();
		await expect(page.locator('.char-list--characters > .char-card'))
			.not.toHaveCount(await page.locator('.char-list--characters > .char-card').count() - 1, { timeout: 6000 });
	}
}

/** Read the displayed supply value from a char-card locator. */
async function getSupply(card: Locator): Promise<number> {
	const tile = card.locator('.res-tile').filter({ hasText: 'Supply' });
	const text = await tile.locator('.res-value').textContent();
	return parseInt(text ?? '0', 10);
}

/** Set a char's supply to a specific value by clicking +/- buttons. */
async function setSupply(card: Locator, target: number) {
	const tile = card.locator('.res-tile').filter({ hasText: 'Supply' });
	for (let attempts = 0; attempts < 10; attempts++) {
		const cur = await getSupply(card);
		if (cur === target) break;
		if (cur < target) await tile.locator('button[aria-label="Increase Supply"]').click();
		else              await tile.locator('button[aria-label="Decrease Supply"]').click();
		await card.page().waitForTimeout(80);
	}
}

/** Build a minimal valid character manifest for import. */
function makeCharManifest(name: string, supply: number) {
	return {
		manifest: {
			app:        'Iron Ledger',
			version:    '1.0.0',
			exportedAt: new Date().toISOString(),
			type:       'character',
			count:      1,
		},
		data: {
			name,
			data: {
				name,
				edge: 1, heart: 1, iron: 1, shadow: 1, wits: 1,
				momentum: 2, health: 5, spirit: 5, supply,
				xp: 0, bonds: 0, failures: 0,
				wounded: false, unprepared: false, shaken: false, encumbered: false,
				maimed: false, corrupted: false, cursed: false, tormented: false,
				vows: [], assets: [],
			},
		},
	};
}

/** Read the supply value from the GCB chip on the Adventure tab. */
async function getGcbSupply(page: Page): Promise<number> {
	const text = await page.locator('.gc-chip[title="supply"] .gc-chip-value').textContent();
	const match = (text ?? '').match(/\d+/);
	return match ? parseInt(match[0], 10) : -1;
}

/** Upload a JSON blob via the hidden file input (bypasses import confirm dialog). */
async function uploadImport(page: Page, payload: unknown) {
	const fileInput = page.locator('input[type="file"][accept=".json,application/json"]');
	await fileInput.setInputFiles({
		name:     'test-import.json',
		mimeType: 'application/json',
		buffer:   Buffer.from(JSON.stringify(payload)),
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Party supply sync', () => {
	test.beforeEach(async ({ page }) => {
		await gotoCharactersTab(page);
	});

	// ── New character creation inherits party supply ──────────────────────────

	test('new character inherits party supply on creation', async ({ page }) => {
		await ensureCharCount(page, 1);

		// Set first char's supply to a known non-default value
		const cards = page.locator('.char-list--characters > .char-card');
		const firstCard = cards.first();
		await firstCard.click();
		await setSupply(firstCard, 4);

		// Create a second character
		const beforeCount = await cards.count();
		await page.locator('.char-toolbar button.btn-primary').click();
		await expect(cards).not.toHaveCount(beforeCount, { timeout: 6000 });

		// New char (first in list after creation) should have supply = 4
		const newCard = cards.first();
		await expect(newCard.locator('.res-tile').filter({ hasText: 'Supply' }).locator('.res-value'))
			.toHaveText('4', { timeout: 4000 });
	});

	// ── Increment syncs all ───────────────────────────────────────────────────

	test('increasing supply on one char syncs to all others', async ({ page }) => {
		await ensureCharCount(page, 2);

		const cards = page.locator('.char-list--characters > .char-card');

		// Normalise both to supply 2
		await cards.first().click();
		await setSupply(cards.first(), 2);
		await cards.nth(1).click();
		await setSupply(cards.nth(1), 2);

		// Increment on first char
		await cards.first().click();
		const supplyTile = cards.first().locator('.res-tile').filter({ hasText: 'Supply' });
		await supplyTile.locator('button[aria-label="Increase Supply"]').click();
		await page.waitForTimeout(200);

		// Both cards should now show 3
		const secondTile = cards.nth(1).locator('.res-tile').filter({ hasText: 'Supply' });
		await expect(supplyTile.locator('.res-value')).toHaveText('3', { timeout: 3000 });
		await expect(secondTile.locator('.res-value')).toHaveText('3', { timeout: 3000 });
	});

	// ── Decrement syncs all ───────────────────────────────────────────────────

	test('decreasing supply on one char syncs to all others', async ({ page }) => {
		await ensureCharCount(page, 2);

		const cards = page.locator('.char-list--characters > .char-card');

		// Normalise both to supply 3
		await cards.first().click();
		await setSupply(cards.first(), 3);
		await cards.nth(1).click();
		await setSupply(cards.nth(1), 3);

		// Decrement on second char
		await cards.nth(1).click();
		const supplyTile2 = cards.nth(1).locator('.res-tile').filter({ hasText: 'Supply' });
		await supplyTile2.locator('button[aria-label="Decrease Supply"]').click();
		await page.waitForTimeout(200);

		// Both cards should now show 2
		const supplyTile1 = cards.first().locator('.res-tile').filter({ hasText: 'Supply' });
		await expect(supplyTile1.locator('.res-value')).toHaveText('2', { timeout: 3000 });
		await expect(supplyTile2.locator('.res-value')).toHaveText('2', { timeout: 3000 });
	});

	// ── Log resource-link click syncs all ─────────────────────────────────────

	test('supply resource-link click in log syncs all chars', async ({ page }) => {
		await ensureCharCount(page, 2);

		const cards = page.locator('.char-list--characters > .char-card');

		// Normalise both to supply 3
		await cards.first().click();
		await setSupply(cards.first(), 3);
		await cards.nth(1).click();
		await setSupply(cards.nth(1), 3);

		// Get the active char's ID from the DOM
		await cards.first().click();
		const activeCard = page.locator('.char-card--active').first();
		const charId = await activeCard.getAttribute('data-char-id');
		expect(charId).toBeTruthy();

		// Inject a fake log entry with a supply resource link for that char
		const entryId = 'test-supply-link-entry';
		await page.evaluate(
			({ cId, eId }) => {
				// Use the globally exposed appendLog from the log store module
				const html = `<div>Resupply: <a class="resource-link" data-resource="supply" data-value="-1" data-entry-id="${eId}" data-char-id="${cId}">−1 supply</a></div>`;
				(window as any).__testLog?.appendLog('__session__', 'Test — Supply', html, eId);
			},
			{ cId: charId, eId: entryId }
		);

		// The log is only rendered on the adventure tab — navigate there so the
		// injected entry is visible before we try to click the link.
		await page.click('.tab-btn[data-tab="adventure"]');
		await expect(page.locator('.adventure-gcb')).toBeVisible({ timeout: 5000 });

		// Click the supply link in the log
		const supplyLink = page.locator(`.resource-link[data-entry-id="${entryId}"]`).first();
		await supplyLink.waitFor({ timeout: 5000 });
		await supplyLink.click();
		await page.waitForTimeout(300);

		// Navigate back to the characters tab to verify the supply values
		await page.click('.tab-btn[data-tab="characters"]');
		await expect(page.locator('.char-toolbar')).toBeVisible({ timeout: 5000 });

		// Both chars should now show supply = 2
		const tile1 = cards.first().locator('.res-tile').filter({ hasText: 'Supply' });
		const tile2 = cards.nth(1).locator('.res-tile').filter({ hasText: 'Supply' });
		await expect(tile1.locator('.res-value')).toHaveText('2', { timeout: 3000 });
		await expect(tile2.locator('.res-value')).toHaveText('2', { timeout: 3000 });
	});

	// ── Import syncs to max ───────────────────────────────────────────────────

	test('importing a character syncs all chars to max supply', async ({ page }) => {
		await ensureCharCount(page, 1);

		const cards = page.locator('.char-list--characters > .char-card');

		// Set existing char to supply 2
		await cards.first().click();
		await setSupply(cards.first(), 2);

		const beforeCount = await cards.count();

		// Import a character with supply 5 (higher than existing)
		await uploadImport(page, makeCharManifest('Supply Test Import', 5));
		await expect(cards).not.toHaveCount(beforeCount, { timeout: 8000 });
		await page.waitForTimeout(300);

		// All cards should have supply = 5 (max of 2 and 5)
		const count = await cards.count();
		for (let i = 0; i < count; i++) {
			const tile = cards.nth(i).locator('.res-tile').filter({ hasText: 'Supply' });
			await expect(tile.locator('.res-value')).toHaveText('5', { timeout: 4000 });
		}
	});

	test('importing a character with lower supply does not reduce party supply', async ({ page }) => {
		await ensureCharCount(page, 1);

		const cards = page.locator('.char-list--characters > .char-card');

		// Set existing char to supply 4
		await cards.first().click();
		await setSupply(cards.first(), 4);

		const beforeCount = await cards.count();

		// Import a character with supply 1 (lower than existing)
		await uploadImport(page, makeCharManifest('Low Supply Import', 1));
		await expect(cards).not.toHaveCount(beforeCount, { timeout: 8000 });
		await page.waitForTimeout(300);

		// All cards should have supply = 4 (max of 4 and 1)
		const count = await cards.count();
		for (let i = 0; i < count; i++) {
			const tile = cards.nth(i).locator('.res-tile').filter({ hasText: 'Supply' });
			await expect(tile.locator('.res-value')).toHaveText('4', { timeout: 4000 });
		}
	});

	// ── GCB chip stays in sync with Characters tab changes ───────────────────

	test('GCB supply chip reflects supply changed via +/- button on Characters tab', async ({ page }) => {
		await ensureCharCount(page, 1);

		const cards = page.locator('.char-list--characters > .char-card');
		await cards.first().click();
		await setSupply(cards.first(), 2);

		// Switch to Adventure tab — GCB becomes visible
		await page.locator('.tab-btn[data-tab="adventure"]').click();
		await expect(page.locator('.global-context')).toBeVisible({ timeout: 5000 });

		// GCB should immediately show supply = 2 (not a stale value from page load)
		const gcbVal = await getGcbSupply(page);
		expect(gcbVal).toBe(2);
	});

	test('GCB supply chip updates when log resource-link is clicked on Adventure tab', async ({ page }) => {
		await ensureCharCount(page, 2);

		const cards = page.locator('.char-list--characters > .char-card');

		// Normalise both chars to supply 3
		await cards.first().click();
		await setSupply(cards.first(), 3);
		await cards.nth(1).click();
		await setSupply(cards.nth(1), 3);

		// Get the active char's ID
		await cards.first().click();
		const activeCard = page.locator('.char-card--active').first();
		const charId = await activeCard.getAttribute('data-char-id');
		expect(charId).toBeTruthy();

		// Switch to Adventure tab so GCB + LogPanel are both visible
		await page.locator('.tab-btn[data-tab="adventure"]').click();
		await expect(page.locator('.global-context')).toBeVisible({ timeout: 5000 });

		// GCB should show supply = 3 at this point
		expect(await getGcbSupply(page)).toBe(3);

		// Inject a fake log entry with a −1 supply link for the active char
		const entryId = 'test-gcb-supply-link';
		await page.evaluate(
			({ cId, eId }) => {
				const logBody = document.querySelector('.log-entries');
				if (!logBody) return;
				const div = document.createElement('div');
				div.className = 'log-entry';
				div.innerHTML = `<div class="entry-body"><a class="resource-link" data-resource="supply" data-value="-1" data-entry-id="${eId}" data-char-id="${cId}">−1 supply</a></div>`;
				logBody.prepend(div);
			},
			{ cId: charId, eId: entryId }
		);

		// Click the supply link in the log
		const supplyLink = page.locator(`.resource-link[data-entry-id="${entryId}"]`).first();
		await supplyLink.waitFor({ timeout: 3000 });
		await supplyLink.click();
		await page.waitForTimeout(300);

		// GCB supply chip should update to 2
		await expect(page.locator('.gc-chip[title="supply"] .gc-chip-value'))
			.toContainText('2', { timeout: 3000 });

		// Switching back to Characters tab — both chars should also show 2
		await page.locator('.tab-btn[data-tab="characters"]').click();
		await expect(page.locator('.char-toolbar')).toBeVisible({ timeout: 5000 });

		const tile1 = cards.first().locator('.res-tile').filter({ hasText: 'Supply' });
		const tile2 = cards.nth(1).locator('.res-tile').filter({ hasText: 'Supply' });
		await expect(tile1.locator('.res-value')).toHaveText('2', { timeout: 4000 });
		await expect(tile2.locator('.res-value')).toHaveText('2', { timeout: 4000 });
	});
});
