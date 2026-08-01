/**
 * places.spec.ts — Places (v2): add and delete places in the Connections deck.
 *
 * Places are a third kind of Connection entry alongside communities and NPCs,
 * created from the same header combobox ("+ New Place…") and sharing the
 * CommunitiesArea card. The live entry count is on `.cm-header-actions`
 * (`data-entry-count`); deletion is via the header gear → options dialog.
 *
 * (The pre-combobox rail features — per-row `.cm-row-badge` and the
 * `.cm-filter-*` kind chips — were removed in the v2 header refactor, so the
 * tests that exercised them are gone.)
 */
import { test, expect, type Page } from '@playwright/test';
import { resetCommunities } from './helpers/reset';

const CM_AREA = '.home-area--communities';
const CM_HEADER = `${CM_AREA} .cm-header`;
const CM_COMBOBOX = `${CM_HEADER} .cm-hdr-combobox`;
const CM_ACTIONS = `${CM_AREA} .cm-header-actions`;

async function waitForConnectionsLoaded(page: Page) {
	await expect(page.locator(`${CM_AREA} .cm-loading`)).not.toBeVisible({ timeout: 10_000 });
	await page
		.locator(`${CM_AREA} .cm-empty, ${CM_AREA} .cm-body`)
		.first()
		.waitFor({ timeout: 10_000, state: 'attached' });
	await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
}

async function entryCount(page: Page): Promise<number> {
	return Number((await page.locator(CM_ACTIONS).getAttribute('data-entry-count')) ?? '0');
}

async function openNew(page: Page, kind: 'Community' | 'NPC' | 'Place') {
	await page.locator(CM_COMBOBOX).click();
	await page.locator('.mp-cmd-item--action', { hasText: new RegExp(`New ${kind}`, 'i') }).click();
	await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 15_000 });
}

/** Create a connection of the given kind via Random; it becomes the active entry. */
// New-* dialogs are name-first: Create is disabled until named. Roll a name
// from the dice (or fill one) then commit.
async function createViaRandom(page: Page, kind: 'Community' | 'NPC' | 'Place') {
	await openNew(page, kind);
	await page.locator('.confirm-modal [aria-label="Random name"]').first().click();
	await page.locator('.confirm-modal button:has-text("Create")').click();
	await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 8_000 });
}

async function deleteActive(page: Page) {
	await page.locator(`${CM_HEADER} .cm-hdr-settings-btn`).click();
	await page.locator('.co-dialog button.btn-danger').click();
	const confirmBtn = page.locator('.confirm-modal button.btn-danger');
	await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
	await confirmBtn.click();
	await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
}

test.describe('Places (v2)', () => {
	test.beforeAll(async () => {
		await resetCommunities();
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForConnectionsLoaded(page);
	});

	test('the switcher opens the New Place dialog', async ({ page }) => {
		await openNew(page, 'Place');
		await expect(page.locator('.confirm-modal .cm-title')).toContainText('New Place');
		await page.keyboard.press('Escape');
	});

	test('can add a place via Random', async ({ page }) => {
		const before = await entryCount(page);
		await createViaRandom(page, 'Place');
		expect(await entryCount(page)).toBe(before + 1);
	});

	test('can add a place via Create', async ({ page }) => {
		const before = await entryCount(page);
		await openNew(page, 'Place');
		await page.locator('.confirm-modal .co-input').first().fill('E2E Place');
		await page.locator('.confirm-modal button:has-text("Create")').click();
		await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 3_000 });
		expect(await entryCount(page)).toBe(before + 1);
	});

	test('Escape closes the New Place dialog without creating', async ({ page }) => {
		const before = await entryCount(page);
		await openNew(page, 'Place');
		await page.keyboard.press('Escape');
		await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 3_000 });
		expect(await entryCount(page)).toBe(before);
	});

	test('a place has no Settlement Trouble dice button', async ({ page }) => {
		// The community trouble-oracle dice button is community-only; it must
		// NOT appear when the active connection is a place.
		await createViaRandom(page, 'Place');
		await expect(page.locator(`${CM_AREA} .cm-dice-btn`)).toHaveCount(0);
	});

	test('can delete a place', async ({ page }) => {
		await createViaRandom(page, 'Place');
		const before = await entryCount(page);
		await deleteActive(page);
		expect(await entryCount(page)).toBe(before - 1);
	});
});
