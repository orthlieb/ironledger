/**
 * persistence.spec.ts — Data survives a logout / login cycle.
 *
 * Each test:
 *   1. Creates or selects data in the UI
 *   2. Clears the auth cookie (simulates logout)
 *   3. Re-authenticates via the API (simulates login)
 *   4. Navigates back and verifies data is still present
 *
 * Covered (v2 — no tabs, no GCB):
 *   • Characters   — created character still exists
 *   • Foes         — encounter still appears in the Foes list
 *   • Expeditions  — journey still appears in the Expeditions list
 *   • Communities  — community still appears in the Communities list
 *   • Session state — active character spine selection survives
 *   • Session log  — log entry (note) is still visible after re-login
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';
import { resetAll } from './helpers/reset';
import type { Page } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:3000';
const TEST_EMAIL = 'test@ironledger.local';
const TEST_PASSWORD = 'IronLedgerTest2024!';

const CHAR_AREA = '.home-area--characters';
const CHAR_HEADER = `${CHAR_AREA} .ca-header`;
const CHAR_SPINE = `${CHAR_AREA} .ca-spine`;

const FOE_AREA = '.home-area--foes';
const FOE_HEADER = `${FOE_AREA} .fa-header`;
const FOE_SPINE = `${FOE_AREA} .fa-spine`;

const EXP_AREA = '.home-area--expeditions';
const EXP_HEADER = `${EXP_AREA} .ea-header`;
const EXP_SPINE = `${EXP_AREA} .ea-spine`;

const CM_AREA = '.home-area--communities';
const CM_HEADER = `${CM_AREA} .cm-header`;
const CM_ROW = `${CM_AREA} .cm-row`;

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
	const body = (await res.json()) as { accessToken: string };
	await apiCtx.dispose();

	await page.context().addCookies([
		{
			name: 'access_token',
			value: body.accessToken,
			domain: 'localhost',
			path: '/',
			httpOnly: true,
			sameSite: 'Strict',
			secure: false,
		},
	]);

	await page.goto('/home');
	await page.waitForURL(/\/home/, { timeout: 10_000 });
	await waitForCharactersArea(page);
}

// ── Wait helpers ──────────────────────────────────────────────────────────────

async function waitForCharactersArea(page: Page) {
	await expect(page.locator(`${CHAR_AREA} .ca-loading`)).not.toBeVisible({ timeout: 12_000 });
	await page
		.locator(`${CHAR_AREA} .ca-empty, ${CHAR_AREA} .ca-body`)
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
}

async function waitForFoesArea(page: Page) {
	await expect(page.locator(`${FOE_AREA} .fa-loading`)).not.toBeVisible({ timeout: 12_000 });
	await page
		.locator(`${FOE_AREA} .fa-empty, ${FOE_AREA} .fa-body`)
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
}

async function waitForExpeditionsArea(page: Page) {
	await expect(page.locator(`${EXP_AREA} .ea-loading`)).not.toBeVisible({ timeout: 12_000 });
	await page
		.locator(`${EXP_AREA} .ea-empty, ${EXP_AREA} .ea-body`)
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
}

async function waitForCommunitiesArea(page: Page) {
	await expect(page.locator(`${CM_AREA} .cm-loading`)).not.toBeVisible({ timeout: 12_000 });
	await page
		.locator(`${CM_AREA} .cm-empty, ${CM_AREA} .cm-body`)
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
}

// ── Character helpers ─────────────────────────────────────────────────────────

async function ensureCharacterSelected(page: Page): Promise<void> {
	await waitForCharactersArea(page);
	if ((await page.locator(CHAR_SPINE).count()) === 0) {
		await page.locator(`${CHAR_HEADER} button:has-text("+ Character")`).click();
		await expect(page.locator(CHAR_SPINE)).not.toHaveCount(0, { timeout: 8_000 });
	}
	// Wait for the card tabs — proves activeChar AND activeData are populated.
	await expect(page.locator(`${CHAR_AREA} .ca-tab`).first()).toBeVisible({ timeout: 8_000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Data persistence across logout / login (v2)', () => {
	test.beforeAll(async () => {
		await resetAll();
	});

	// ── 1. Characters ──────────────────────────────────────────────────────────

	test('characters survive logout and login', async ({ page }) => {
		await page.goto('/home');
		await waitForCharactersArea(page);

		const before = await page.locator(CHAR_SPINE).count();
		if (before === 0) {
			await page.locator(`${CHAR_HEADER} button:has-text("+ Character")`).click();
			await expect(page.locator(CHAR_SPINE)).not.toHaveCount(0, { timeout: 8_000 });
		}
		const expectedCount = Math.max(before, 1);

		await logout(page);
		await loginAndGoHome(page);

		await expect(page.locator(CHAR_SPINE)).toHaveCount(expectedCount, { timeout: 8_000 });
	});

	// ── 2. Foes (encounters) ───────────────────────────────────────────────────

	test('foe encounters survive logout and login', async ({ page }) => {
		await page.goto('/home');
		await waitForFoesArea(page);

		const before = await page.locator(FOE_SPINE).count();

		await page.locator(`${FOE_HEADER} button:has-text("+ Foe")`).click();
		await expect(page.locator('dialog.foe-dialog[open]')).toBeVisible({ timeout: 5_000 });
		const foeTile = page.locator('dialog.foe-dialog .fd-tile').first();
		await expect(foeTile).toBeVisible({ timeout: 8_000 });
		await foeTile.click();
		const addBtn = page.locator('dialog.foe-dialog button:has-text("Add to Foes")');
		await expect(addBtn).toBeVisible({ timeout: 3_000 });
		await addBtn.click();
		await expect(page.locator('dialog.foe-dialog[open]')).not.toBeVisible({ timeout: 5_000 });
		await expect(page.locator(FOE_SPINE)).toHaveCount(before + 1, { timeout: 5_000 });

		await page.waitForTimeout(600);

		await logout(page);
		await loginAndGoHome(page);
		await waitForFoesArea(page);

		await expect(page.locator(FOE_SPINE)).toHaveCount(before + 1, { timeout: 8_000 });
	});

	// ── 3. Expeditions ────────────────────────────────────────────────────────

	test('expeditions (journeys) survive logout and login', async ({ page }) => {
		await page.goto('/home');
		await waitForExpeditionsArea(page);

		const before = await page.locator(EXP_SPINE).count();

		await page.locator(`${EXP_HEADER} button:has-text("+ Journey")`).click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5_000 });
		await page.locator('dialog.confirm-modal[open] button:has-text("Start Journey")').click();
		await expect(page.locator(EXP_SPINE)).toHaveCount(before + 1, { timeout: 5_000 });

		await page.waitForTimeout(600);

		await logout(page);
		await loginAndGoHome(page);
		await waitForExpeditionsArea(page);

		await expect(page.locator(EXP_SPINE)).toHaveCount(before + 1, { timeout: 8_000 });
	});

	// ── 4. Communities ────────────────────────────────────────────────────────

	test('communities survive logout and login', async ({ page }) => {
		await page.goto('/home');
		await waitForCommunitiesArea(page);

		const before = await page.locator(CM_ROW).count();

		await page.locator(`${CM_HEADER} button:has-text("+ Community")`).click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5_000 });
		const generateBtn = page.getByRole('button', { name: /generate randomly/i });
		const createManualBtn = page.getByRole('button', { name: /create manually/i });
		await expect(generateBtn.or(createManualBtn).first()).toBeVisible({ timeout: 5_000 });
		if (await generateBtn.isVisible().catch(() => false)) {
			await generateBtn.click();
		} else {
			await createManualBtn.click();
		}
		await expect(page.locator(CM_ROW)).not.toHaveCount(before, { timeout: 10_000 });

		await page.waitForTimeout(600);

		await logout(page);
		await loginAndGoHome(page);
		await waitForCommunitiesArea(page);

		await expect(page.locator(CM_ROW)).toHaveCount(before + 1, { timeout: 8_000 });
	});

	// ── 5. Active spine selections survive logout / login ─────────────────────
	//
	// v2 areas auto-select the first item on mount (no per-user session-state
	// restoration yet). This test verifies that after a logout / login cycle the
	// same first items are re-selected in all four areas — i.e. the data is
	// preserved server-side and auto-selection restores the expected active state.

	test('active character, foe, expedition, and community spine selections survive logout and login', async ({
		page,
	}) => {
		await page.goto('/home');
		await waitForCharactersArea(page);
		await waitForFoesArea(page);
		await waitForExpeditionsArea(page);
		await waitForCommunitiesArea(page);

		// ── Ensure at least one item in each area ──────────────────────────────

		if ((await page.locator(CHAR_SPINE).count()) === 0) {
			await page.locator(`${CHAR_HEADER} button:has-text("+ Character")`).click();
			await expect(page.locator(CHAR_SPINE)).not.toHaveCount(0, { timeout: 8_000 });
		}

		if ((await page.locator(FOE_SPINE).count()) === 0) {
			await page.locator(`${FOE_HEADER} button:has-text("+ Foe")`).click();
			await expect(page.locator('dialog.foe-dialog[open]')).toBeVisible({ timeout: 5_000 });
			await expect(page.locator('dialog.foe-dialog .fd-tile').first()).toBeVisible({
				timeout: 8_000,
			});
			await page.locator('dialog.foe-dialog .fd-tile').first().click();
			await expect(page.locator('dialog.foe-dialog button:has-text("Add to Foes")')).toBeVisible({
				timeout: 3_000,
			});
			await page.locator('dialog.foe-dialog button:has-text("Add to Foes")').click();
			await expect(page.locator('dialog.foe-dialog[open]')).not.toBeVisible({ timeout: 5_000 });
			await expect(page.locator(FOE_SPINE)).not.toHaveCount(0, { timeout: 5_000 });
		}

		if ((await page.locator(EXP_SPINE).count()) === 0) {
			await page.locator(`${EXP_HEADER} button:has-text("+ Journey")`).click();
			await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5_000 });
			await page.locator('dialog.confirm-modal[open] button:has-text("Start Journey")').click();
			await expect(page.locator(EXP_SPINE)).not.toHaveCount(0, { timeout: 5_000 });
		}

		if ((await page.locator(CM_ROW).count()) === 0) {
			await page.locator(`${CM_HEADER} button:has-text("+ Community")`).click();
			await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5_000 });
			const generateBtn = page.getByRole('button', { name: /generate randomly/i });
			if (await generateBtn.isVisible().catch(() => false)) {
				await generateBtn.click();
			} else {
				await page.getByRole('button', { name: /create manually/i }).click();
			}
			await expect(page.locator(CM_ROW)).not.toHaveCount(0, { timeout: 10_000 });
		}

		// ── Click the first spine in each area and record its displayed name ───

		await page.locator(CHAR_SPINE).first().click();
		await page.locator(FOE_SPINE).first().click();
		await page.locator(EXP_SPINE).first().click();
		await page.locator(CM_ROW).first().click();

		await expect(page.locator(`${CHAR_SPINE}.ca-spine--active`)).toBeVisible({ timeout: 3_000 });
		await expect(page.locator(`${FOE_SPINE}.fa-spine--active`)).toBeVisible({ timeout: 3_000 });
		await expect(page.locator(`${EXP_SPINE}.ea-spine--active`)).toBeVisible({ timeout: 3_000 });
		await expect(page.locator(`${CM_ROW}.cm-row--active`)).toBeVisible({ timeout: 3_000 });

		const activeCharName = (
			await page.locator(`${CHAR_SPINE}.ca-spine--active .ca-spine-name`).first().textContent()
		)?.trim();
		const activeFoeName = (
			await page.locator(`${FOE_SPINE}.fa-spine--active .fa-spine-name`).first().textContent()
		)?.trim();
		const activeExpName = (
			await page.locator(`${EXP_SPINE}.ea-spine--active .ea-spine-name`).first().textContent()
		)?.trim();
		const activeCmName = (
			await page.locator(`${CM_ROW}.cm-row--active .cm-row-name`).first().textContent()
		)?.trim();

		// Allow any debounced saves to flush.
		await page.waitForTimeout(600);

		// ── Logout + login ─────────────────────────────────────────────────────

		await logout(page);
		await loginAndGoHome(page);
		await waitForFoesArea(page);
		await waitForExpeditionsArea(page);
		await waitForCommunitiesArea(page);

		// ── Verify the same first items are auto-selected ──────────────────────

		await expect(page.locator(`${CHAR_SPINE}.ca-spine--active`)).toBeVisible({ timeout: 8_000 });
		await expect(page.locator(`${FOE_SPINE}.fa-spine--active`)).toBeVisible({ timeout: 8_000 });
		await expect(page.locator(`${EXP_SPINE}.ea-spine--active`)).toBeVisible({ timeout: 8_000 });
		await expect(page.locator(`${CM_ROW}.cm-row--active`)).toBeVisible({ timeout: 8_000 });

		expect(
			(
				await page.locator(`${CHAR_SPINE}.ca-spine--active .ca-spine-name`).first().textContent()
			)?.trim(),
		).toBe(activeCharName);
		expect(
			(
				await page.locator(`${FOE_SPINE}.fa-spine--active .fa-spine-name`).first().textContent()
			)?.trim(),
		).toBe(activeFoeName);
		expect(
			(
				await page.locator(`${EXP_SPINE}.ea-spine--active .ea-spine-name`).first().textContent()
			)?.trim(),
		).toBe(activeExpName);
		expect(
			(await page.locator(`${CM_ROW}.cm-row--active .cm-row-name`).first().textContent())?.trim(),
		).toBe(activeCmName);
	});

	// ── 6. Session log ────────────────────────────────────────────────────────

	test('session log entries survive logout and login', async ({ page }) => {
		await page.goto('/home');
		await waitForCharactersArea(page);

		const uniqueText = `E2E persistence ${Date.now()}`;

		// Add a Note via the app-nav Note button.
		await page
			.getByRole('button', { name: /^note$/i })
			.first()
			.click();
		await expect(page.locator('.notes-dialog[open]')).toBeVisible({ timeout: 3_000 });
		await page.locator('.notes-dialog .nd-textarea').fill(uniqueText);
		await page.locator('.notes-dialog .nd-add-btn').click();
		await expect(page.locator('.notes-dialog[open]')).not.toBeVisible({ timeout: 3_000 });

		await expect(page.locator('.log-entry').filter({ hasText: uniqueText })).toBeVisible({
			timeout: 5_000,
		});

		await page.waitForTimeout(1_200);

		await logout(page);
		await loginAndGoHome(page);

		await expect(page.locator('.log-entry').filter({ hasText: uniqueText })).toBeVisible({
			timeout: 10_000,
		});
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: remove foe added during this spec', async ({ page }) => {
		await page.goto('/home');
		await waitForFoesArea(page);

		const spines = page.locator(FOE_SPINE);
		let count = await spines.count();
		while (count > 0) {
			await spines.first().click();
			const delBtn = page.locator(`${FOE_AREA} .fa-stage-delete-btn`).first();
			await expect(delBtn).toBeVisible({ timeout: 3_000 });
			await delBtn.click();
			const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
			await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
			await confirmBtn.click();
			count--;
			if (count > 0) await expect(spines).toHaveCount(count, { timeout: 5_000 });
		}
	});

	test('cleanup: remove expedition added during this spec', async ({ page }) => {
		await page.goto('/home');
		await waitForExpeditionsArea(page);

		const spines = page.locator(EXP_SPINE);
		let count = await spines.count();
		while (count > 0) {
			await spines.first().click();
			const delBtn = page.locator(`${EXP_AREA} .ea-stage-delete-btn`).first();
			await expect(delBtn).toBeVisible({ timeout: 3_000 });
			await delBtn.click();
			const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
			await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
			await confirmBtn.click();
			count--;
			if (count > 0) await expect(spines).toHaveCount(count, { timeout: 5_000 });
		}
	});

	test('cleanup: remove community added during this spec', async ({ page }) => {
		await page.goto('/home');
		await waitForCommunitiesArea(page);

		const spines = page.locator(CM_ROW);
		let count = await spines.count();
		while (count > 0) {
			await spines.first().click();
			const delBtn = page.locator(`${CM_AREA} .cm-stage-delete-btn`).first();
			if (!(await delBtn.isVisible({ timeout: 2_000 }).catch(() => false))) break;
			await delBtn.click();
			const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
			await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
			await confirmBtn.click();
			count--;
			if (count > 0) await expect(spines).toHaveCount(count, { timeout: 5_000 });
		}
	});
});
