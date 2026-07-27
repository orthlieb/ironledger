/**
 * dialog-header.spec.ts — the shared <DialogHeader> is draggable.
 *
 * Every dialog's open/close is exercised across the suite; this is the one
 * behaviour nothing else asserts: dragging a dialog by its header (via the
 * `draggable` action that now lives inside <DialogHeader>) actually moves it.
 */
import { test, expect } from '@playwright/test';
import { resetCharacters, seedCharacter } from './helpers/reset';

test.describe('DialogHeader', () => {
	test.beforeAll(async () => {
		await resetCharacters();
		await seedCharacter(); // GlobalContextBar action buttons need an active character
	});

	test.afterAll(async () => {
		await resetCharacters();
	});

	test('dragging a dialog by its header moves it', async ({ page }) => {
		await page.goto('/home');

		// Open the Roll Dice dialog (a single-view <DialogHeader> dialog).
		// DialogHeader's `use:draggable` works on both native `<dialog>` and
		// bits-ui `Dialog.Content` (a div with role="dialog"), so target
		// the specific dialog class instead of the tag — this stays green as
		// more dialogs migrate.
		await page.locator('.act-btn').filter({ hasText: 'Roll' }).first().click();
		const dialog = page.locator('.dice-dialog');
		await expect(dialog).toBeVisible({ timeout: 10_000 });
		const header = dialog.locator('.dh-header');
		await expect(header).toBeVisible();

		const before = await dialog.boundingBox();
		const grab = await header.boundingBox();
		if (!before || !grab) throw new Error('no bounding box');

		// Drag the header down-right by ~(80, 60).
		await page.mouse.move(grab.x + 40, grab.y + grab.height / 2);
		await page.mouse.down();
		await page.mouse.move(grab.x + 120, grab.y + grab.height / 2 + 60, { steps: 6 });
		await page.mouse.up();

		const after = await dialog.boundingBox();
		if (!after) throw new Error('no bounding box after drag');
		expect(after.x).toBeGreaterThan(before.x + 50);
		expect(after.y).toBeGreaterThan(before.y + 40);
	});
});
