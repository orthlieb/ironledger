/**
 * communities.spec.ts — Communities area (v2): add and delete communities and NPCs.
 *
 * v2 layout: the Communities area shares the bottom-right cell with NPCs in a
 * single combined deck. Each entry is a .cm-spine in the same nav list — kind
 * is distinguished by the stage delete-button's aria-label ("Delete NPC" vs
 * "Delete community").
 */
import { test, expect } from '@playwright/test';
import { resetCommunities } from './helpers/reset';

const CM_AREA = '.home-area--communities';
const CM_HEADER = `${CM_AREA} .cm-header`;
const CM_SPINE = `${CM_AREA} .cm-spine`;
const CM_STAGE = `${CM_AREA} .cm-stage`;

async function waitForCommunitiesLoaded(page: import('@playwright/test').Page) {
	await expect(page.locator(`${CM_AREA} .cm-loading`)).not.toBeVisible({ timeout: 10_000 });
	await page
		.locator(`${CM_AREA} .cm-empty, ${CM_AREA} .cm-body`)
		.first()
		.waitFor({ timeout: 10_000, state: 'attached' });
	// Allow both community and NPC stores to finish populating their spine items.
	await page.waitForTimeout(500);
}

/** Walk all spines; return how many have the given kind ("npc" or "community"). */
async function countByKind(
	page: import('@playwright/test').Page,
	kind: 'npc' | 'community',
): Promise<number> {
	const spines = page.locator(CM_SPINE);
	const total = await spines.count();
	let matched = 0;
	for (let i = 0; i < total; i++) {
		await spines.nth(i).click();
		const aria =
			(await page.locator(`${CM_AREA} .cm-stage-delete-btn`).getAttribute('aria-label')) ?? '';
		if (kind === 'npc' && aria === 'Delete NPC') matched++;
		else if (kind === 'community' && aria === 'Delete community') matched++;
	}
	return matched;
}

/** Click a spine whose stage delete-btn matches the target kind; returns its locator. */
async function selectSpineOfKind(page: import('@playwright/test').Page, kind: 'npc' | 'community') {
	const spines = page.locator(CM_SPINE);
	const total = await spines.count();
	for (let i = 0; i < total; i++) {
		await spines.nth(i).click();
		const aria =
			(await page.locator(`${CM_AREA} .cm-stage-delete-btn`).getAttribute('aria-label')) ?? '';
		if (kind === 'npc' && aria === 'Delete NPC') return spines.nth(i);
		if (kind === 'community' && aria === 'Delete community') return spines.nth(i);
	}
	return null;
}

test.describe('Communities area (v2)', () => {
	test.beforeAll(async () => {
		await resetCommunities();
	});

	test.beforeEach(async ({ page }) => {
		await page.goto('/home');
		await waitForCommunitiesLoaded(page);
	});

	test('shows + Community and + NPC buttons', async ({ page }) => {
		await expect(page.locator(`${CM_HEADER} button:has-text("+ Community")`)).toBeVisible();
		await expect(page.locator(`${CM_HEADER} button:has-text("+ NPC")`)).toBeVisible();
	});

	// ── Communities ──────────────────────────────────────────────────────────

	test('clicking + Community opens the new-community dialog', async ({ page }) => {
		await page.locator(`${CM_HEADER} button:has-text("+ Community")`).click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 15_000 });
		await expect(page.locator('dialog.confirm-modal[open] .cm-title')).toContainText(
			'New Community',
		);
		await page.keyboard.press('Escape');
	});

	test('can add a community via Generate Randomly', async ({ page }) => {
		const before = await page.locator(CM_SPINE).count();
		await page.locator(`${CM_HEADER} button:has-text("+ Community")`).click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 15_000 });
		await page.locator('dialog.confirm-modal[open] button:has-text("Generate Randomly")').click();
		await expect(page.locator(CM_SPINE)).not.toHaveCount(before, { timeout: 8_000 });
	});

	test('can add a community via Create Manually', async ({ page }) => {
		const before = await page.locator(CM_SPINE).count();
		await page.locator(`${CM_HEADER} button:has-text("+ Community")`).click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 15_000 });
		await page.locator('dialog.confirm-modal[open] button:has-text("Create Manually")').click();
		await expect(page.locator('dialog.confirm-modal[open]')).not.toBeVisible({ timeout: 3_000 });
		await expect(page.locator(CM_SPINE)).toHaveCount(before + 1, { timeout: 5_000 });
	});

	test('Escape closes the New Community dialog without creating', async ({ page }) => {
		const before = await page.locator(CM_SPINE).count();
		await page.locator(`${CM_HEADER} button:has-text("+ Community")`).click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 15_000 });
		await page.keyboard.press('Escape');
		await expect(page.locator('dialog.confirm-modal[open]')).not.toBeVisible({ timeout: 3_000 });
		await expect(page.locator(CM_SPINE)).toHaveCount(before);
	});

	test('can delete a community', async ({ page }) => {
		// Ensure at least one community exists.
		const existingCommunities = await countByKind(page, 'community');
		if (existingCommunities === 0) {
			await page.locator(`${CM_HEADER} button:has-text("+ Community")`).click();
			await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 15_000 });
			await page.locator('dialog.confirm-modal[open] button:has-text("Generate Randomly")').click();
			await expect(page.locator(CM_SPINE)).not.toHaveCount(0, { timeout: 8_000 });
		}

		const spineBefore = await page.locator(CM_SPINE).count();
		// Select a community spine and delete.
		const target = await selectSpineOfKind(page, 'community');
		expect(target).not.toBeNull();

		await page.locator(`${CM_AREA} .cm-stage-delete-btn`).click();
		const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
		await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
		await confirmBtn.click();
		await expect(page.locator(CM_SPINE)).toHaveCount(spineBefore - 1, { timeout: 5_000 });
	});

	// ── NPCs ─────────────────────────────────────────────────────────────────

	test('clicking + NPC opens the new-NPC dialog', async ({ page }) => {
		await page.locator(`${CM_HEADER} button:has-text("+ NPC")`).click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 15_000 });
		await expect(page.locator('dialog.confirm-modal[open] .cm-title')).toContainText('New NPC');
		await page.keyboard.press('Escape');
	});

	test('can add an NPC via Generate Randomly', async ({ page }) => {
		const before = await page.locator(CM_SPINE).count();
		await page.locator(`${CM_HEADER} button:has-text("+ NPC")`).click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 15_000 });
		await page.locator('dialog.confirm-modal[open] button:has-text("Generate Randomly")').click();
		await expect(page.locator(CM_SPINE)).not.toHaveCount(before, { timeout: 8_000 });
	});

	test('can add an NPC via Create Manually', async ({ page }) => {
		const before = await page.locator(CM_SPINE).count();
		await page.locator(`${CM_HEADER} button:has-text("+ NPC")`).click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 15_000 });
		await page.locator('dialog.confirm-modal[open] button:has-text("Create Manually")').click();
		await expect(page.locator('dialog.confirm-modal[open]')).not.toBeVisible({ timeout: 3_000 });
		await expect(page.locator(CM_SPINE)).toHaveCount(before + 1, { timeout: 5_000 });
	});

	test('Escape closes the New NPC dialog without creating', async ({ page }) => {
		const before = await page.locator(CM_SPINE).count();
		await page.locator(`${CM_HEADER} button:has-text("+ NPC")`).click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 15_000 });
		await page.keyboard.press('Escape');
		await expect(page.locator('dialog.confirm-modal[open]')).not.toBeVisible({ timeout: 3_000 });
		await expect(page.locator(CM_SPINE)).toHaveCount(before);
	});

	test('can delete an NPC', async ({ page }) => {
		const existingNpcs = await countByKind(page, 'npc');
		if (existingNpcs === 0) {
			await page.locator(`${CM_HEADER} button:has-text("+ NPC")`).click();
			await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 15_000 });
			await page.locator('dialog.confirm-modal[open] button:has-text("Generate Randomly")').click();
			await expect(page.locator(CM_SPINE)).not.toHaveCount(0, { timeout: 8_000 });
		}

		const spineBefore = await page.locator(CM_SPINE).count();
		const target = await selectSpineOfKind(page, 'npc');
		expect(target).not.toBeNull();

		await page.locator(`${CM_AREA} .cm-stage-delete-btn`).click();
		const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
		await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
		await confirmBtn.click();
		await expect(page.locator(CM_SPINE)).toHaveCount(spineBefore - 1, { timeout: 5_000 });
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: delete all communities and NPCs', async ({ page }) => {
		const spines = page.locator(CM_SPINE);
		let count = await spines.count();
		while (count > 0) {
			await spines.first().click();
			const deleteBtn = page.locator(`${CM_AREA} .cm-stage-delete-btn`).first();
			if (!(await deleteBtn.isVisible({ timeout: 2_000 }).catch(() => false))) break;
			await deleteBtn.click();
			const confirmBtn = page.locator('dialog.confirm-modal[open] button.btn-danger');
			await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
			await confirmBtn.click();
			count--;
			if (count > 0) {
				await expect(spines).toHaveCount(count, { timeout: 5_000 });
			}
		}
	});
});
