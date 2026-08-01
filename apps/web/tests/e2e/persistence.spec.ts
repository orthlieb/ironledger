/**
 * persistence.spec.ts — Data survives a logout / login cycle.
 *
 * Each test:
 *   1. Creates or selects data in the UI
 *   2. Clears the auth cookie (simulates logout)
 *   3. Re-authenticates via the API (simulates login)
 *   4. Navigates back and verifies data is still present
 *
 * v2: each area is a header combobox switcher (no spine/rail). Live counts
 * come from data-* attributes; the active entity's name is the combobox trigger
 * value. Creates are name-first dialogs; deletes live behind a gear → options
 * dialog. Status fields use the shared <SegmentedRadio> (aria-label +
 * aria-checked).
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';
import { resetAll, seedNpc } from './helpers/reset';
import type { Page } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:3000';
const TEST_EMAIL = 'test@ironledger.local';
const TEST_PASSWORD = 'IronLedgerTest2024!';

const CHAR_AREA = '.home-area--characters';
const CHAR_COMBOBOX = `${CHAR_AREA} .ca-hdr-combobox`;
const FOE_AREA = '.home-area--foes';
const FOE_COMBOBOX = `${FOE_AREA} .fa-hdr-combobox`;
const EXP_AREA = '.home-area--expeditions';
const EXP_COMBOBOX = `${EXP_AREA} .ea-hdr-combobox`;
const CM_AREA = '.home-area--communities';
const CM_COMBOBOX = `${CM_AREA} .cm-hdr-combobox`;

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
	await settle(page);
}

// ── Wait helpers ──────────────────────────────────────────────────────────────

/** Let initial loads + hydration settle before interacting with comboboxes. */
async function settle(page: Page): Promise<void> {
	await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
}

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

// ── Count helpers (live data-* attributes) ──────────────────────────────────

async function charCount(page: Page): Promise<number> {
	return Number(
		(await page.locator(`${CHAR_AREA} .ca-header-actions`).getAttribute('data-char-count')) ?? '0',
	);
}
async function foeCount(page: Page): Promise<number> {
	return Number((await page.locator(`${FOE_AREA} .fa-area`).getAttribute('data-foe-count')) ?? '0');
}
async function expCount(page: Page): Promise<number> {
	return Number(
		(await page.locator(`${EXP_AREA} .ea-header-actions`).getAttribute('data-exp-count')) ?? '0',
	);
}
async function cmCount(page: Page): Promise<number> {
	return Number(
		(await page.locator(`${CM_AREA} .cm-header-actions`).getAttribute('data-entry-count')) ?? '0',
	);
}

/** The active entity's display name from an area combobox trigger. */
async function activeName(page: Page, combo: string): Promise<string> {
	return (await page.locator(`${combo} .mp-combobox-value`).innerText()).trim();
}

/** Select a connection by name via the connections combobox. */
async function selectConnection(page: Page, name: string) {
	await page.locator(CM_COMBOBOX).click();
	await page
		.locator('.mp-cmd-popover .mp-cmd-item:not(.mp-cmd-item--action)', { hasText: name })
		.first()
		.click();
	await expect(page.locator('.mp-cmd-popover'))
		.toBeHidden({ timeout: 3_000 })
		.catch(() => {});
}

// ── Create helpers (name-first dialogs) ─────────────────────────────────────

async function createChar(page: Page) {
	await page.locator(CHAR_COMBOBOX).click();
	await page.locator('.mp-cmd-item--action', { hasText: /New character/i }).click();
	await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5_000 });
	await page.locator('.confirm-modal .co-input').first().fill('Persist Char');
	await page.locator('.confirm-modal .btn-primary').click();
	await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
}
async function addFoe(page: Page) {
	await page.locator(FOE_COMBOBOX).click();
	await page.locator('.mp-cmd-item--action', { hasText: /New foe/i }).click();
	await expect(page.locator('.foe-dialog')).toBeVisible({ timeout: 5_000 });
	await page.locator('.foe-dialog .fd-tile').first().click();
	await page.locator('.foe-dialog button:has-text("Add to Foes")').click();
	await expect(page.locator('.foe-dialog')).not.toBeVisible({ timeout: 5_000 });
}
async function createJourney(page: Page) {
	await page.locator(EXP_COMBOBOX).click();
	await page.locator('.mp-cmd-item--action', { hasText: /New Journey/i }).click();
	await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5_000 });
	await page.locator('.confirm-modal .co-input').first().fill('Persist Journey');
	await page.locator('.confirm-modal button:has-text("Create")').click();
	await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
}
async function createCommunity(page: Page) {
	await page.locator(CM_COMBOBOX).click();
	await page.locator('.mp-cmd-item--action', { hasText: /New Community/i }).click();
	await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5_000 });
	await page.locator('.confirm-modal .co-input').first().fill('Persist Community');
	await page.locator('.confirm-modal button:has-text("Create")').click();
	await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 8_000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Data persistence across logout / login (v2)', () => {
	test.beforeAll(async () => {
		await resetAll();
	});

	test('characters survive logout and login', async ({ page }) => {
		await page.goto('/home');
		await waitForCharactersArea(page);
		await settle(page);

		if ((await charCount(page)) === 0) await createChar(page);
		const expected = await charCount(page);
		expect(expected).toBeGreaterThan(0);

		await logout(page);
		await loginAndGoHome(page);

		expect(await charCount(page)).toBe(expected);
	});

	test('foe encounters survive logout and login', async ({ page }) => {
		await page.goto('/home');
		await waitForFoesArea(page);
		await settle(page);

		const before = await foeCount(page);
		await addFoe(page);
		expect(await foeCount(page)).toBe(before + 1);

		await page.waitForTimeout(600);
		await logout(page);
		await loginAndGoHome(page);
		await waitForFoesArea(page);

		expect(await foeCount(page)).toBe(before + 1);
	});

	test('expeditions (journeys) survive logout and login', async ({ page }) => {
		await page.goto('/home');
		await waitForExpeditionsArea(page);
		await settle(page);

		const before = await expCount(page);
		await createJourney(page);
		expect(await expCount(page)).toBe(before + 1);

		await page.waitForTimeout(600);
		await logout(page);
		await loginAndGoHome(page);
		await waitForExpeditionsArea(page);

		expect(await expCount(page)).toBe(before + 1);
	});

	test('communities survive logout and login', async ({ page }) => {
		await page.goto('/home');
		await waitForCommunitiesArea(page);
		await settle(page);

		const before = await cmCount(page);
		await createCommunity(page);
		expect(await cmCount(page)).toBe(before + 1);

		await page.waitForTimeout(600);
		await logout(page);
		await loginAndGoHome(page);
		await waitForCommunitiesArea(page);

		expect(await cmCount(page)).toBe(before + 1);
	});

	test('active character / foe / expedition / community selections survive login', async ({
		page,
	}) => {
		await page.goto('/home');
		await waitForCharactersArea(page);
		await waitForFoesArea(page);
		await waitForExpeditionsArea(page);
		await waitForCommunitiesArea(page);
		await settle(page);

		// Ensure at least one item in each area — the newest becomes active.
		if ((await charCount(page)) === 0) await createChar(page);
		if ((await foeCount(page)) === 0) await addFoe(page);
		if ((await expCount(page)) === 0) await createJourney(page);
		if ((await cmCount(page)) === 0) await createCommunity(page);

		// Record each area's active entity name (its combobox trigger value).
		const activeChar = await activeName(page, CHAR_COMBOBOX);
		const activeFoe = await activeName(page, FOE_COMBOBOX);
		const activeExp = await activeName(page, EXP_COMBOBOX);
		const activeCm = await activeName(page, CM_COMBOBOX);

		// Allow any debounced saves to flush.
		await page.waitForTimeout(600);
		await logout(page);
		await loginAndGoHome(page);
		await waitForFoesArea(page);
		await waitForExpeditionsArea(page);
		await waitForCommunitiesArea(page);

		expect(await activeName(page, CHAR_COMBOBOX)).toBe(activeChar);
		expect(await activeName(page, FOE_COMBOBOX)).toBe(activeFoe);
		expect(await activeName(page, EXP_COMBOBOX)).toBe(activeExp);
		expect(await activeName(page, CM_COMBOBOX)).toBe(activeCm);
	});

	test('session log entries survive logout and login', async ({ page }) => {
		await page.goto('/home');
		await waitForCharactersArea(page);
		await settle(page);

		const uniqueText = `E2E persistence ${Date.now()}`;

		await page
			.getByRole('button', { name: /^note$/i })
			.first()
			.click();
		await expect(page.locator('.notes-dialog')).toBeVisible({ timeout: 3_000 });
		await page.locator('.notes-dialog .nd-textarea').fill(uniqueText);
		await page.locator('.notes-dialog .nd-add-btn').click();
		await expect(page.locator('.notes-dialog')).not.toBeVisible({ timeout: 3_000 });

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

	// ── Status fields (vanquished / complete / deceased) survive ───────────────
	// The active segment is read via its stable aria-label + aria-checked on the
	// shared <SegmentedRadio> (works whether the label is shown or icon-only).

	test('foe vanquished status survives logout and login', async ({ page }) => {
		await page.goto('/home');
		await waitForFoesArea(page);
		await settle(page);

		if ((await foeCount(page)) === 0) await addFoe(page);
		const vanq = page.locator(
			`${FOE_AREA} .sr[aria-label="Foe status"] .sr-btn[aria-label="Mark vanquished"]`,
		);
		await expect(vanq).toBeVisible({ timeout: 5_000 });
		await vanq.click();
		await expect(vanq).toHaveAttribute('aria-checked', 'true');

		await page.waitForTimeout(2000);
		await logout(page);
		await loginAndGoHome(page);
		await waitForFoesArea(page);

		await expect(
			page.locator(
				`${FOE_AREA} .sr[aria-label="Foe status"] .sr-btn[aria-label="Mark vanquished"]`,
			),
		).toHaveAttribute('aria-checked', 'true', { timeout: 8_000 });
	});

	test('expedition complete status survives logout and login', async ({ page }) => {
		await page.goto('/home');
		await waitForExpeditionsArea(page);
		await settle(page);

		if ((await expCount(page)) === 0) await createJourney(page);
		const complete = page.locator(
			`${EXP_AREA} .sr[aria-label="Expedition status"] .sr-btn[aria-label="Mark complete"]`,
		);
		await expect(complete).toBeVisible({ timeout: 5_000 });
		await complete.click();
		await expect(complete).toHaveAttribute('aria-checked', 'true');

		await page.waitForTimeout(2000);
		await logout(page);
		await loginAndGoHome(page);
		await waitForExpeditionsArea(page);

		await expect(
			page.locator(
				`${EXP_AREA} .sr[aria-label="Expedition status"] .sr-btn[aria-label="Mark complete"]`,
			),
		).toHaveAttribute('aria-checked', 'true', { timeout: 8_000 });
	});

	test('NPC deceased status survives logout and login', async ({ page }) => {
		await seedNpc('Deceased Persist NPC');
		await page.goto('/home');
		await waitForCommunitiesArea(page);
		await settle(page);

		// Other connections may already exist, so explicitly select the NPC.
		await selectConnection(page, 'Deceased Persist NPC');
		const deceased = page.locator(
			`${CM_AREA} .sr[aria-label="NPC status"] .sr-btn[aria-label="Mark deceased"]`,
		);
		await expect(deceased).toBeVisible({ timeout: 5_000 });
		await deceased.click();
		await expect(deceased).toHaveAttribute('aria-checked', 'true');

		await page.waitForTimeout(2000);
		await logout(page);
		await loginAndGoHome(page);
		await waitForCommunitiesArea(page);

		await selectConnection(page, 'Deceased Persist NPC');
		await expect(
			page.locator(`${CM_AREA} .sr[aria-label="NPC status"] .sr-btn[aria-label="Mark deceased"]`),
		).toHaveAttribute('aria-checked', 'true', { timeout: 8_000 });
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: remove all foes, expeditions, and connections', async ({ page }) => {
		await page.goto('/home');
		await waitForFoesArea(page);
		await settle(page);

		for (let g = 0; g < 30 && (await foeCount(page)) > 0; g++) {
			await page.locator(`${FOE_AREA} .fa-hdr-settings-btn`).click();
			await page.locator('.co-dialog button.btn-danger').click();
			await page.locator('.confirm-modal button.btn-danger').click();
			await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
		}
		for (let g = 0; g < 30 && (await expCount(page)) > 0; g++) {
			await page.locator(`${EXP_AREA} .ea-hdr-settings-btn`).click();
			await page.locator('.co-dialog button.btn-danger').click();
			await page.locator('.confirm-modal button.btn-danger').click();
			await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
		}
		for (let g = 0; g < 30 && (await cmCount(page)) > 0; g++) {
			await page.locator(`${CM_AREA} .cm-hdr-settings-btn`).click();
			await page.locator('.co-dialog button.btn-danger').click();
			await page.locator('.confirm-modal button.btn-danger').click();
			await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
		}
		expect(await foeCount(page)).toBe(0);
		expect(await expCount(page)).toBe(0);
		expect(await cmCount(page)).toBe(0);
	});
});
