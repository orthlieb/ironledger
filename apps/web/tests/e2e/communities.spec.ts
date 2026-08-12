/**
 * communities.spec.ts — Connections area (v2): add and delete communities, NPCs.
 *
 * v2 layout: the Connections area (communities + NPCs + places) is driven by a
 * header combobox switcher (`.cm-hdr-combobox`), not a rail of `.cm-row`s.
 * Creating goes combobox → "+ New Settlement…/NPC…/Place…" → a Random/Create
 * dialog. The live entry count is exposed on `.cm-header-actions` via the
 * `data-entry-count` attribute. Deleting is via the header gear
 * (`.cm-hdr-settings-btn`) → ConnectionOptionsDialog → "Delete this …".
 */
import { test, expect, type Page } from '@playwright/test';
import { resetCommunities } from './helpers/reset';

const CM_AREA = '.home-area--communities';
const CM_HEADER = `${CM_AREA} .cm-header`;
const CM_COMBOBOX = `${CM_HEADER} .cm-hdr-combobox`;
const CM_ACTIONS = `${CM_AREA} .cm-header-actions`;

async function waitForCommunitiesLoaded(page: Page) {
	await expect(page.locator(`${CM_AREA} .cm-loading`)).not.toBeVisible({ timeout: 10_000 });
	await page
		.locator(`${CM_AREA} .cm-empty, ${CM_AREA} .cm-body`)
		.first()
		.waitFor({ timeout: 10_000, state: 'attached' });
	// Let initial loads + hydration settle before interacting — the combobox
	// trigger doesn't reliably open its popover mid-hydration.
	await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
}

/** Total connection count (communities + NPCs + places), read from the header. */
async function entryCount(page: Page): Promise<number> {
	const raw = await page.locator(CM_ACTIONS).getAttribute('data-entry-count');
	return Number(raw ?? '0');
}

/** Open the New-{kind} dialog via the header combobox action item. */
async function openNew(page: Page, kind: 'Settlement' | 'NPC' | 'Place') {
	await page.locator(CM_COMBOBOX).click();
	await page.locator('.mp-cmd-item--action', { hasText: new RegExp(`New ${kind}`, 'i') }).click();
	await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 15_000 });
}

// New-* dialogs are name-first: Create is disabled until the name field has a
// value. Fill it directly, or roll one from the dice, then commit.
async function fillAndCreate(page: Page, name = 'E2E Connection') {
	await page.locator('.confirm-modal .co-input').first().fill(name);
	await page.locator('.confirm-modal button:has-text("Create")').click();
	await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 8_000 });
}
async function rollAndCreate(page: Page) {
	await page.locator('.confirm-modal [aria-label="Random name"]').first().click();
	await page.locator('.confirm-modal button:has-text("Create")').click();
	await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 8_000 });
}

/** Delete the currently-active connection via the header gear + options dialog. */
async function deleteActive(page: Page) {
	await page.locator(`${CM_HEADER} .cm-hdr-settings-btn`).click();
	await page.locator('.co-dialog button.btn-danger').click();
	const confirmBtn = page.locator('.confirm-modal button.btn-danger');
	await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
	await confirmBtn.click();
	await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
}

test.describe('Connections area (v2)', () => {
	test.beforeAll(async () => {
		await resetCommunities();
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForCommunitiesLoaded(page);
	});

	test('shows the connection switcher combobox', async ({ page }) => {
		await expect(page.locator(CM_COMBOBOX)).toBeVisible();
	});

	// ── Communities ──────────────────────────────────────────────────────────

	test('the switcher opens the new-community dialog', async ({ page }) => {
		await openNew(page, 'Settlement');
		await expect(page.locator('.confirm-modal .cm-title')).toContainText('New Settlement');
		await page.keyboard.press('Escape');
	});

	test('New Settlement dialog: name-oracle picker + mode-aware Also-randomize fields', async ({
		page,
	}) => {
		await openNew(page, 'Settlement');
		const dialog = page.locator('.confirm-modal');
		await expect(dialog).toBeVisible();
		// Name randomizer: a Name Oracle <Select> + a d6 button.
		await expect(dialog.locator('.bui-select-trigger').first()).toBeVisible();
		await expect(dialog.locator('.dice-btn').first()).toBeVisible();
		// Region is now an Also-randomize checkbox, not an oracle picker (#nc-region).
		await expect(dialog.locator('#nc-region')).toHaveCount(0);
		await expect(dialog.locator('.nn-check-label', { hasText: /^Region$/ })).toHaveCount(1);
		// Lodestar is default-on → the on-reveal settlement fields are offered.
		for (const label of ['Type', 'Condition', 'First Look']) {
			await expect(
				dialog.locator('.nn-check-label', { hasText: new RegExp(`^${label}$`) }),
			).toHaveCount(1);
		}
		await page.keyboard.press('Escape');
	});

	test('can add a community via Random', async ({ page }) => {
		const before = await entryCount(page);
		await openNew(page, 'Settlement');
		await rollAndCreate(page);
		expect(await entryCount(page)).toBe(before + 1);
	});

	test('can add a community via Create', async ({ page }) => {
		const before = await entryCount(page);
		await openNew(page, 'Settlement');
		await fillAndCreate(page);
		expect(await entryCount(page)).toBe(before + 1);
	});

	test('Escape closes the New Settlement dialog without creating', async ({ page }) => {
		const before = await entryCount(page);
		await openNew(page, 'Settlement');
		await page.keyboard.press('Escape');
		await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 3_000 });
		expect(await entryCount(page)).toBe(before);
	});

	test('can delete a community', async ({ page }) => {
		// Create one via Random — it becomes the active entry.
		await openNew(page, 'Settlement');
		await rollAndCreate(page);
		const before = await entryCount(page);
		await deleteActive(page);
		expect(await entryCount(page)).toBe(before - 1);
	});

	// ── NPCs ─────────────────────────────────────────────────────────────────

	test('the switcher opens the new-NPC dialog', async ({ page }) => {
		await openNew(page, 'NPC');
		await expect(page.locator('.confirm-modal .cm-title')).toContainText('New NPC');
		await page.keyboard.press('Escape');
	});

	test('can add an NPC via Random', async ({ page }) => {
		const before = await entryCount(page);
		await openNew(page, 'NPC');
		await rollAndCreate(page);
		expect(await entryCount(page)).toBe(before + 1);
	});

	test('can add an NPC via Create', async ({ page }) => {
		const before = await entryCount(page);
		await openNew(page, 'NPC');
		await fillAndCreate(page);
		expect(await entryCount(page)).toBe(before + 1);
	});

	test('Escape closes the New NPC dialog without creating', async ({ page }) => {
		const before = await entryCount(page);
		await openNew(page, 'NPC');
		await page.keyboard.press('Escape');
		await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 3_000 });
		expect(await entryCount(page)).toBe(before);
	});

	test('can delete an NPC', async ({ page }) => {
		await openNew(page, 'NPC');
		await rollAndCreate(page);
		const before = await entryCount(page);
		await deleteActive(page);
		expect(await entryCount(page)).toBe(before - 1);
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: delete all connections', async ({ page }) => {
		for (let guard = 0; guard < 30; guard++) {
			if ((await entryCount(page)) === 0) break;
			await deleteActive(page);
		}
		expect(await entryCount(page)).toBe(0);
		await expect(page.locator(`${CM_AREA} .cm-empty`)).toBeVisible({ timeout: 5_000 });
	});
});
