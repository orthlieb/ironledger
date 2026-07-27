/**
 * places.spec.ts — Places (v2): add and delete places in the combined Connections deck.
 *
 * Places are a third kind of Connection entry alongside communities and NPCs.
 * They share the CommunitiesArea card component (see CommunitiesArea.svelte),
 * but live in their own store / DB kind (see migration 0015_places.sql).
 *
 * The stage delete-button's aria-label distinguishes kinds:
 *   community → "Delete community"
 *   npc       → "Delete npc"
 *   place     → "Delete place"
 */
import { test, expect } from '@playwright/test';
import { resetCommunities } from './helpers/reset';

const CM_AREA = '.home-area--communities';
const CM_HEADER = `${CM_AREA} .cm-header`;
const CM_ROW = `${CM_AREA} .cm-row`;

async function waitForConnectionsLoaded(page: import('@playwright/test').Page) {
	await expect(page.locator(`${CM_AREA} .cm-loading`)).not.toBeVisible({ timeout: 10_000 });
	await page
		.locator(`${CM_AREA} .cm-empty, ${CM_AREA} .cm-body`)
		.first()
		.waitFor({ timeout: 10_000, state: 'attached' });
	await page.waitForTimeout(500);
}

/** Count rows whose stage delete-btn aria-label matches the given kind. */
async function countByKind(
	page: import('@playwright/test').Page,
	kind: 'npc' | 'community' | 'place',
): Promise<number> {
	const rows = page.locator(CM_ROW);
	const total = await rows.count();
	let matched = 0;
	for (let i = 0; i < total; i++) {
		await rows.nth(i).click();
		const aria =
			(await page.locator(`${CM_AREA} .cm-stage-delete-btn`).getAttribute('aria-label')) ?? '';
		if (aria === `Delete ${kind}`) matched++;
	}
	return matched;
}

/** Click the first row of the given kind; returns its locator (or null). */
async function selectRowOfKind(
	page: import('@playwright/test').Page,
	kind: 'npc' | 'community' | 'place',
) {
	const rows = page.locator(CM_ROW);
	const total = await rows.count();
	for (let i = 0; i < total; i++) {
		await rows.nth(i).click();
		const aria =
			(await page.locator(`${CM_AREA} .cm-stage-delete-btn`).getAttribute('aria-label')) ?? '';
		if (aria === `Delete ${kind}`) return rows.nth(i);
	}
	return null;
}

test.describe('Places (v2)', () => {
	test.beforeAll(async () => {
		await resetCommunities();
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForConnectionsLoaded(page);
	});

	test('the toolbar exposes a + Place button', async ({ page }) => {
		await expect(page.locator(`${CM_HEADER} button:has-text("+ Place")`)).toBeVisible();
	});

	test('clicking + Place opens the New Place dialog', async ({ page }) => {
		await page.locator(`${CM_HEADER} button:has-text("+ Place")`).click();
		await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 15_000 });
		await expect(page.locator('.confirm-modal .cm-title')).toContainText('New Place');
		await page.keyboard.press('Escape');
	});

	test('can add a place via Random', async ({ page }) => {
		const before = await page.locator(CM_ROW).count();
		await page.locator(`${CM_HEADER} button:has-text("+ Place")`).click();
		await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 15_000 });
		await page.locator('.confirm-modal button:has-text("Random")').click();
		await expect(page.locator(CM_ROW)).not.toHaveCount(before, { timeout: 8_000 });
	});

	test('can add a place via Create', async ({ page }) => {
		const before = await page.locator(CM_ROW).count();
		await page.locator(`${CM_HEADER} button:has-text("+ Place")`).click();
		await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 15_000 });
		await page.locator('.confirm-modal button:has-text("Create")').click();
		await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 3_000 });
		await expect(page.locator(CM_ROW)).toHaveCount(before + 1, { timeout: 5_000 });
	});

	test('Escape closes the New Place dialog without creating', async ({ page }) => {
		const before = await page.locator(CM_ROW).count();
		await page.locator(`${CM_HEADER} button:has-text("+ Place")`).click();
		await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 15_000 });
		await page.keyboard.press('Escape');
		await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 3_000 });
		await expect(page.locator(CM_ROW)).toHaveCount(before);
	});

	test('a place row shows the Place badge and place accent', async ({ page }) => {
		// Ensure at least one place exists.
		const existingPlaces = await countByKind(page, 'place');
		if (existingPlaces === 0) {
			await page.locator(`${CM_HEADER} button:has-text("+ Place")`).click();
			await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 15_000 });
			await page.locator('.confirm-modal button:has-text("Random")').click();
			await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
		}
		const target = await selectRowOfKind(page, 'place');
		expect(target).not.toBeNull();
		// The badge in the row is the singular kind label.
		await expect(target!.locator('.cm-row-badge')).toContainText('Place');
	});

	test('a place has no Settlement Trouble dice button on the Core tab', async ({ page }) => {
		// Seed a place if none exists, then open it.
		const existingPlaces = await countByKind(page, 'place');
		if (existingPlaces === 0) {
			await page.locator(`${CM_HEADER} button:has-text("+ Place")`).click();
			await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 15_000 });
			await page.locator('.confirm-modal button:has-text("Create")').click();
			await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 3_000 });
		}
		const target = await selectRowOfKind(page, 'place');
		expect(target).not.toBeNull();
		// The community trouble-oracle dice button is community-only; it must
		// NOT be visible when a place is selected.
		await expect(page.locator(`${CM_AREA} .cm-dice-btn`)).toHaveCount(0);
	});

	test('the Places filter chip limits the rail to place rows', async ({ page }) => {
		// Ensure we have at least one place and one non-place row.
		const existingPlaces = await countByKind(page, 'place');
		if (existingPlaces === 0) {
			await page.locator(`${CM_HEADER} button:has-text("+ Place")`).click();
			await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 15_000 });
			await page.locator('.confirm-modal button:has-text("Create")').click();
			await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 3_000 });
		}
		const existingCommunities = await countByKind(page, 'community');
		if (existingCommunities === 0) {
			await page.locator(`${CM_HEADER} button:has-text("+ Community")`).click();
			await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 15_000 });
			await page.locator('.confirm-modal button:has-text("Create")').click();
			await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 3_000 });
		}

		// Open the filter panel and click Places.
		await page.locator(`${CM_AREA} .cm-filter-toggle`).click();
		await page.locator(`${CM_AREA} .cm-filter-tag`).filter({ hasText: 'Places' }).click();

		// Every visible row is now a place.
		const rows = page.locator(CM_ROW);
		const visible = await rows.count();
		expect(visible).toBeGreaterThan(0);
		for (let i = 0; i < visible; i++) {
			await rows.nth(i).click();
			const aria =
				(await page.locator(`${CM_AREA} .cm-stage-delete-btn`).getAttribute('aria-label')) ?? '';
			expect(aria).toBe('Delete place');
		}
	});

	test('can delete a place', async ({ page }) => {
		const existingPlaces = await countByKind(page, 'place');
		if (existingPlaces === 0) {
			await page.locator(`${CM_HEADER} button:has-text("+ Place")`).click();
			await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 15_000 });
			await page.locator('.confirm-modal button:has-text("Random")').click();
			await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
		}
		const rowBefore = await page.locator(CM_ROW).count();
		const target = await selectRowOfKind(page, 'place');
		expect(target).not.toBeNull();

		await page.locator(`${CM_AREA} .cm-stage-delete-btn`).click();
		const confirmBtn = page.locator('.confirm-modal button.btn-danger');
		await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
		await confirmBtn.click();
		await expect(page.locator(CM_ROW)).toHaveCount(rowBefore - 1, { timeout: 5_000 });
	});
});
