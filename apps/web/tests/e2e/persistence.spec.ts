/**
 * persistence.spec.ts — Data survives a logout / login cycle.
 *
 * Each test:
 *   1. Creates or selects data in the UI
 *   2. Clears the auth cookie (simulates logout)
 *   3. Re-authenticates via the API (simulates login)
 *   4. Navigates back and verifies data is still present
 *
 * Covered:
 *   • Characters   — created character still exists
 *   • Foes         — encounter still appears in the Foes list
 *   • Expeditions  — journey still appears in the Expeditions list
 *   • Communities  — community still appears in the Communities list
 *   • Session state — active character selection survives in the GCB
 *   • Session log  — log entry (note) is still visible after re-login
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';
import type { Page } from '@playwright/test';

const API_BASE      = 'http://127.0.0.1:3000';
const TEST_EMAIL    = 'test@ironledger.local';
const TEST_PASSWORD = 'IronLedgerTest2024!';

// ── Auth helpers ──────────────────────────────────────────────────────────────

/** Clear the access_token cookie — equivalent to logging out. */
async function logout(page: Page): Promise<void> {
	await page.context().clearCookies();
}

/** Authenticate via the API and inject the cookie, then navigate to /home. */
async function loginAndGoHome(page: Page): Promise<void> {
	const apiCtx = await playwrightRequest.newContext({ baseURL: API_BASE });
	const res = await apiCtx.post('/api/v1/auth/login', {
		data: { email: TEST_EMAIL, password: TEST_PASSWORD, captchaToken: 'dev-bypass' },
	});
	if (!res.ok()) throw new Error(`Re-login failed: ${res.status()} ${await res.text()}`);
	const body = await res.json() as { accessToken: string };
	await apiCtx.dispose();

	await page.context().addCookies([{
		name:     'access_token',
		value:    body.accessToken,
		domain:   'localhost',
		path:     '/',
		httpOnly: true,
		sameSite: 'Strict',
		secure:   false,
	}]);

	await page.goto('/home');
	await page.waitForURL(/\/home/, { timeout: 10_000 });
	// Wait for the initial DB data load to complete
	await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 10_000 });
}

// ── Tab navigation helpers ────────────────────────────────────────────────────
// Each helper clicks the tab AND waits for a tab-specific ready element so
// we know the content has fully rendered before interacting with it.

async function goToCharactersTab(page: Page): Promise<void> {
	await page.click('.tab-btn[data-tab="characters"]');
	await expect(page.locator('.char-toolbar')).toBeVisible({ timeout: 8_000 });
	await page.locator('.char-list--characters > .char-card, .empty-tab')
		.first().waitFor({ timeout: 8_000, state: 'attached' });
}

async function goToFoesTab(page: Page): Promise<void> {
	await page.click('.tab-btn[data-tab="foes"]');
	await expect(page.locator('.char-toolbar')).toBeVisible({ timeout: 8_000 });
	// Wait for the + Foe button in the toolbar (class-based, not text, to avoid CSS-uppercase mismatch)
	await expect(page.locator('.char-toolbar button.btn-primary').first())
		.toBeVisible({ timeout: 8_000 });
}

async function goToExpeditionsTab(page: Page): Promise<void> {
	await page.click('.tab-btn[data-tab="expeditions"]');
	await expect(page.locator('.char-toolbar')).toBeVisible({ timeout: 8_000 });
	// Buttons are "+ Journey" and "+ Site" (rendered uppercase by CSS)
	await expect(page.locator('.char-toolbar button.btn-primary').first()).toBeVisible({ timeout: 8_000 });
}

async function goToCommunitiesTab(page: Page): Promise<void> {
	await page.click('.tab-btn[data-tab="communities"]');
	await expect(page.locator('.char-toolbar')).toBeVisible({ timeout: 8_000 });
	await expect(page.locator('.char-toolbar button.btn-primary').first()).toBeVisible({ timeout: 8_000 });
}

async function goToAdventureTab(page: Page): Promise<void> {
	await page.click('.tab-btn[data-tab="adventure"]');
	await expect(page.locator('.adventure-gcb')).toBeVisible({ timeout: 8_000 });
	// Brief stabilization pause for Svelte hydration (the GCB renders via SSR but
	// action buttons are added client-side; adventure.spec.ts relies on the same timing)
	await page.waitForTimeout(400);
}

// ── Character helpers ─────────────────────────────────────────────────────────

/** Ensure at least one character exists; select it. */
async function ensureCharacterSelected(page: Page): Promise<void> {
	await goToCharactersTab(page);
	const cards = page.locator('.char-list--characters > .char-card');
	if (await cards.count() === 0) {
		await page.click('.char-toolbar button.btn-primary');
		await expect(page.locator('.char-card--active')).toBeVisible({ timeout: 5_000 });
	} else {
		await cards.first().click();
		await expect(page.locator('.char-card--active')).toBeVisible({ timeout: 3_000 });
	}
}

// ── GCB helpers ───────────────────────────────────────────────────────────────

/** Select the first real (non-None) character from the GCB character tile popover.
 *  Returns the name selected, or '' if none available. */
async function selectCharacterInGcb(page: Page): Promise<string> {
	const charTileBtn = page.locator('.gc-tile').first().locator('.gc-tile-btn');
	await expect(charTileBtn).toBeVisible({ timeout: 5_000 });

	await charTileBtn.click();
	await expect(page.locator('.gc-popover').first()).toBeVisible({ timeout: 2_000 });

	// Find a popover item that isn't the "(None)" placeholder
	const items = page.locator('.gc-popover .gc-popover-item');
	const count = await items.count();

	for (let i = 0; i < count; i++) {
		const item = items.nth(i);
		const text = (await item.textContent().catch(() => ''))?.trim() ?? '';
		if (text && !text.toLowerCase().includes('none')) {
			await item.click();
			// Let the PATCH /api/session/state request complete
			await page.waitForTimeout(800);
			return text;
		}
	}

	await page.keyboard.press('Escape');
	return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Data persistence across logout / login', () => {

	// ── 1. Characters ──────────────────────────────────────────────────────────

	test('characters survive logout and login', async ({ page }) => {
		await page.goto('/home');
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8_000 });
		await goToCharactersTab(page);

		const before = await page.locator('.char-list--characters > .char-card').count();
		if (before === 0) {
			await page.click('.char-toolbar button.btn-primary');
			await expect(page.locator('.char-card--active')).toBeVisible({ timeout: 5_000 });
		}
		const expectedCount = Math.max(before, 1);

		await logout(page);
		await loginAndGoHome(page);
		await goToCharactersTab(page);

		await expect(page.locator('.char-list--characters > .char-card'))
			.toHaveCount(expectedCount, { timeout: 8_000 });
	});

	// ── 2. Foes (encounters) ───────────────────────────────────────────────────

	test('foe encounters survive logout and login', async ({ page }) => {
		await page.goto('/home');
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8_000 });
		await goToFoesTab(page);

		const foeBefore = await page.locator('.char-list--foes .char-card').count();

		await page.locator('.char-toolbar button.btn-primary').first().click();
		await expect(page.locator('dialog.foe-dialog[open]')).toBeVisible({ timeout: 5_000 });
		const foeTile = page.locator('dialog.foe-dialog .fd-tile').first();
		await expect(foeTile).toBeVisible({ timeout: 8_000 });
		await foeTile.click();
		const addBtn = page.locator('dialog.foe-dialog button:has-text("Add to Foes")');
		await expect(addBtn).toBeVisible({ timeout: 3_000 });
		await addBtn.click();
		await expect(page.locator('dialog.foe-dialog[open]')).not.toBeVisible({ timeout: 5_000 });
		await expect(page.locator('.char-list--foes .char-card'))
			.toHaveCount(foeBefore + 1, { timeout: 5_000 });

		// Give the auto-save a moment to persist
		await page.waitForTimeout(600);

		await logout(page);
		await loginAndGoHome(page);
		await goToFoesTab(page);

		await expect(page.locator('.char-list--foes .char-card'))
			.toHaveCount(foeBefore + 1, { timeout: 8_000 });
	});

	// ── 3. Expeditions ────────────────────────────────────────────────────────

	test('expeditions (journeys) survive logout and login', async ({ page }) => {
		await page.goto('/home');
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8_000 });
		await goToExpeditionsTab(page);

		const expBefore = await page.locator('.char-list--expeditions .char-card').count();

		// Button text is "+ Journey" (CSS uppercases it to display "+ JOURNEY")
		await page.locator('.char-toolbar button', { hasText: /journey/i }).first().click();
		// The journey dialog uses radio buttons; "Dangerous" is pre-selected by default.
		// Just find and click the "Start Journey" confirm button.
		const startJourneyBtn = page.locator('button:has-text("Start Journey")');
		await expect(startJourneyBtn).toBeVisible({ timeout: 5_000 });
		await startJourneyBtn.click();
		await expect(page.locator('.char-list--expeditions .char-card'))
			.toHaveCount(expBefore + 1, { timeout: 5_000 });

		await page.waitForTimeout(600);

		await logout(page);
		await loginAndGoHome(page);
		await goToExpeditionsTab(page);

		await expect(page.locator('.char-list--expeditions .char-card'))
			.toHaveCount(expBefore + 1, { timeout: 8_000 });
	});

	// ── 4. Communities ────────────────────────────────────────────────────────

	test('communities survive logout and login', async ({ page }) => {
		await page.goto('/home');
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8_000 });
		await goToCommunitiesTab(page);

		const commBefore = await page.locator('.char-list--communities .char-card').count();

		// Button text contains "Community" (case-insensitive, CSS may uppercase it).
		// Clicking it opens a dialog — click "Generate Randomly" to create immediately,
		// or "Create Manually" as a fallback if Generate is not available.
		await page.locator('.char-toolbar button', { hasText: /community/i }).first().click();
		// Wait for the creation dialog to appear
		const generateBtn = page.getByRole('button', { name: /generate randomly/i });
		const createManualBtn = page.getByRole('button', { name: /create manually/i });
		await expect(generateBtn.or(createManualBtn).first()).toBeVisible({ timeout: 5_000 });
		if (await generateBtn.isVisible().catch(() => false)) {
			await generateBtn.click();
		} else {
			await createManualBtn.click();
		}
		// Wait for the dialog to close and a card to appear
		await expect(page.locator('.char-list--communities .char-card'))
			.not.toHaveCount(commBefore, { timeout: 10_000 });

		await page.waitForTimeout(600);

		await logout(page);
		await loginAndGoHome(page);
		await goToCommunitiesTab(page);

		await expect(page.locator('.char-list--communities .char-card'))
			.toHaveCount(commBefore + 1, { timeout: 8_000 });
	});

	// ── 5. Session state — active character survives in GCB ───────────────────

	test('active character selection in GCB survives logout and login', async ({ page }) => {
		await page.goto('/home');
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8_000 });

		// Ensure a character exists first (on characters tab), then go to adventure
		await ensureCharacterSelected(page);
		await goToAdventureTab(page);
		const selectedName = await selectCharacterInGcb(page);
		if (!selectedName) {
			test.skip(true, 'No character available to select in GCB');
			return;
		}

		// Verify it shows in the tile
		await expect(page.locator('.gc-tile').first().locator('.gc-tile-btn'))
			.toContainText(selectedName, { timeout: 3_000 });

		await logout(page);
		await loginAndGoHome(page);
		await goToAdventureTab(page);

		// Character tile should still show the same name after re-login
		await expect(page.locator('.gc-tile').first().locator('.gc-tile-btn'))
			.toContainText(selectedName, { timeout: 8_000 });
	});

	// ── 6. Session log ────────────────────────────────────────────────────────

	test('session log entries survive logout and login', async ({ page }) => {
		await page.goto('/home');
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8_000 });
		await goToAdventureTab(page);

		// Use a timestamp so we can find this specific entry after re-login
		const uniqueText = `E2E persistence ${Date.now()}`;

		// Add a Note via the NOTE action button. Use role+name to avoid matching
		// hidden duplicate elements from the responsive layout's multiple button sets.
		await page.getByRole('button', { name: /note/i }).first().click();
		await expect(page.locator('.notes-dialog[open]')).toBeVisible({ timeout: 3_000 });
		await page.locator('.notes-dialog .nd-textarea').fill(uniqueText);
		await page.locator('.notes-dialog .nd-add-btn').click();
		await expect(page.locator('.notes-dialog[open]')).not.toBeVisible({ timeout: 3_000 });

		// Verify entry appeared in the log
		await expect(page.locator('.log-entry').filter({ hasText: uniqueText }))
			.toBeVisible({ timeout: 5_000 });

		// Give the background POST /api/session/log time to complete
		await page.waitForTimeout(1_200);

		await logout(page);
		await loginAndGoHome(page);
		await goToAdventureTab(page);

		// Wait for the async log fetch (initLog fires on mount)
		await expect(page.locator('.log-entry').filter({ hasText: uniqueText }))
			.toBeVisible({ timeout: 10_000 });
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: remove foe added during this spec', async ({ page }) => {
		await page.goto('/home');
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8_000 });
		await goToFoesTab(page);

		const cards = page.locator('.char-list--foes .char-card');
		let count = await cards.count();
		while (count > 0) {
			await cards.first().click();
			const delBtn = page.locator('.fc-del-btn').first();
			await expect(delBtn).toBeVisible({ timeout: 3_000 });
			await delBtn.click();
			const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
			await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
			await confirmBtn.click();
			count--;
			if (count > 0) await expect(cards).toHaveCount(count, { timeout: 5_000 });
		}
	});

	test('cleanup: remove expedition added during this spec', async ({ page }) => {
		await page.goto('/home');
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8_000 });
		await goToExpeditionsTab(page);

		const cards = page.locator('.char-list--expeditions .char-card');
		let count = await cards.count();
		while (count > 0) {
			await cards.first().click();
			const delBtn = page.locator('.sc-del-btn, .jc-del-btn').first();
			await expect(delBtn).toBeVisible({ timeout: 3_000 });
			await delBtn.click();
			const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
			await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
			await confirmBtn.click();
			count--;
			if (count > 0) await expect(cards).toHaveCount(count, { timeout: 5_000 });
		}
	});

	test('cleanup: remove community added during this spec', async ({ page }) => {
		await page.goto('/home');
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8_000 });
		await goToCommunitiesTab(page);

		const cards = page.locator('.char-list--communities .char-card');
		let count = await cards.count();
		while (count > 0) {
			await cards.first().click();
			// CommunityCard: .cc-del-btn, NpcCard: .nc-del-btn
			const delBtn = page.locator('.cc-del-btn, .nc-del-btn').first();
			if (!await delBtn.isVisible({ timeout: 2_000 }).catch(() => false)) break;
			await delBtn.click();
			const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
			await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
			await confirmBtn.click();
			count--;
			if (count > 0) await expect(cards).toHaveCount(count, { timeout: 5_000 });
		}
	});
});
