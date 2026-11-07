/**
 * tutorials.spec.ts — point-and-click tutorials (#lib/tutorials, on
 * driver.js), followed the way a player would: started from ☰ → Tutorials,
 * each step's control used for real.
 *
 * Create a character: open the switcher, "+ New character…", roll a name,
 * stats and (YRT) a region, leave the rest to be randomized, Create; then
 * on the Background tab, write a bio and add a portrait.
 *
 * Create your first foe: open the switcher, "+ New foe…", search, choose a
 * foe, set how many, Add to Foes; then its pills, marking progress and
 * vanquishing it.
 *
 * The steps find their controls by `data-tour` ids, so these tests also
 * catch a UI change that strands a tutorial (a renamed control, a moved
 * dialog).
 */
import { test, expect, type Page } from '@playwright/test';
import { resetCharacters, resetFoes } from './helpers/reset';
import { settleHome, characterCount, activeCharacterName } from './helpers/home';

const POPOVER = '.driver-popover';

/** A tutorial target, by `data-tour` id. */
const target = (page: Page, id: string) => page.locator(`[data-tour="${id}"]`).first();

/** Open /home with the YRT extension on or off (it adds the region step). */
async function openHome(page: Page, yrt: boolean) {
	await page.addInitScript((on) => {
		localStorage.setItem('ironledger:expansion:yrt', on ? 'on' : 'off');
	}, yrt);
	await page.goto('/home');
	await settleHome(page);
}

/** ☰ → Tutorials → `name`. */
async function startTutorial(page: Page, name = 'Create a character') {
	await page.locator('.hamburger-btn').click();
	await page.locator('.hm-item--sub', { hasText: 'Tutorials' }).click();
	await page.getByRole('menuitem', { name }).click();
}

/** The tour shows the step titled `title` (optionally "n of m"). */
async function expectStep(page: Page, title: string, progress?: string) {
	await expect(page.locator(`${POPOVER} .driver-popover-title`)).toHaveText(title, {
		timeout: 8_000,
	});
	if (progress)
		await expect(page.locator(`${POPOVER} .driver-popover-progress-text`)).toHaveText(progress);
}

const next = (page: Page) => page.locator(`${POPOVER} .driver-popover-next-btn`).click();

/** A 1×1 PNG, for the portrait upload. */
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
	'base64',
);

test.describe('Tutorial — Create a character', () => {
	test.beforeAll(async () => {
		await resetCharacters();
	});

	test('walks through rolling a character, then a bio and a portrait', async ({ page }) => {
		await openHome(page, false);
		const before = await characterCount(page);
		await startTutorial(page);

		await expectStep(page, 'Open the character list', '1 of 9');
		await target(page, 'char-switcher').click();
		await expectStep(page, 'Start a new character', '2 of 9');
		await target(page, 'new-char-action').click();

		await expectStep(page, 'Roll a name', '3 of 9');
		await target(page, 'roll-name').click();
		const name = await target(page, 'new-char-name').locator('input').inputValue();
		expect(name.trim(), 'a rolled name').not.toBe('');
		await next(page);

		await expectStep(page, 'Roll your stats', '4 of 9');
		await target(page, 'roll-stats').click();
		await next(page);

		await expectStep(page, 'Randomize the rest', '5 of 9');
		await next(page);

		await expectStep(page, 'Create your character', '6 of 9');
		await target(page, 'new-char-dialog-confirm').click();

		await expectStep(page, 'Meet your character', '7 of 9');
		await expect.poll(() => activeCharacterName(page)).toBe(name);
		expect(await characterCount(page)).toBe(before + 1);
		await next(page);

		// The rolled details, rewritten as a bio. Next closes the editor.
		await expectStep(page, 'Turn the rolls into a bio', '8 of 9');
		const bio = target(page, 'char-bio');
		await bio.locator('.md-notes-display').click();
		await bio.locator('textarea').fill('Born in the Havens; left to keep a promise.');
		await next(page);

		await expectStep(page, 'Add a portrait', '9 of 9');
		await expect(bio).toContainText('left to keep a promise');
		await target(page, 'char-portrait')
			.locator('input[type="file"]')
			.setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: PNG });
		await expect(target(page, 'char-portrait').locator('img')).toBeVisible({ timeout: 5_000 });
		await next(page); // Done
		await expect(page.locator(POPOVER)).toBeHidden();
	});

	test('rolls whatever is skipped, and with YRT covers the region', async ({ page }) => {
		await openHome(page, true);
		await startTutorial(page);

		await expectStep(page, 'Open the character list', '1 of 10');
		await target(page, 'char-switcher').click();
		await expectStep(page, 'Start a new character');
		// Searching the row out of the list sends the tour back a step;
		// clearing the search brings it forward again.
		await page.keyboard.type('zzz');
		await expectStep(page, 'Open the character list');
		for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
		await expectStep(page, 'Start a new character');
		await target(page, 'new-char-action').click();

		await expectStep(page, 'Roll a name');
		await next(page); // no roll: Next rolls one
		await expectStep(page, 'Roll your stats');
		expect(await target(page, 'new-char-name').locator('input').inputValue()).not.toBe('');
		await next(page);
		await expectStep(page, 'Roll a region of origin', '5 of 10');
		const stats = await target(page, 'new-char-stats')
			.locator('input')
			.evaluateAll((els) => els.map((e) => Number((e as HTMLInputElement).value)));
		expect(
			stats.some((v) => v > 0),
			'stats rolled',
		).toBe(true);
		await next(page);
		await expectStep(page, 'Randomize the rest');
		await expect(
			target(page, 'randomize-origin').locator('.bui-select-value--placeholder'),
			'a region rolled',
		).toHaveCount(0);
		await next(page);

		await expectStep(page, 'Create your character');
		await target(page, 'new-char-dialog-confirm').click();
		await expectStep(page, 'Meet your character', '8 of 10');
		await next(page);
		await expectStep(page, 'Turn the rolls into a bio');
		await next(page);
		await expectStep(page, 'Add a portrait', '10 of 10');
		await next(page);
		await expect(page.locator(POPOVER)).toBeHidden();
	});
});

test.describe('Tutorial — Create a character, on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('starts by showing the Characters tab, and brings up Background', async ({ page }) => {
		await openHome(page, false);
		await page.locator('.mob-tab', { hasText: 'Foes' }).click();
		await startTutorial(page);

		await expectStep(page, 'Your characters', '1 of 10');
		await target(page, 'tab-characters').click();
		await expectStep(page, 'Open the character list', '2 of 10');
		await target(page, 'char-switcher').click();
		await expectStep(page, 'Start a new character');
		await target(page, 'new-char-action').click();
		await expectStep(page, 'Roll a name');
		await next(page);
		await expectStep(page, 'Roll your stats');
		await next(page);
		// Nothing randomized (and it stays that way): the new character's
		// sheet opens on Core, so the tour brings up Background itself.
		await expectStep(page, 'Randomize the rest');
		const ticked = target(page, 'randomize-also').locator('[data-state="checked"]');
		while ((await ticked.count()) > 0) await ticked.first().click();
		await next(page);
		await expectStep(page, 'Create your character');
		await expect(ticked).toHaveCount(0);
		await target(page, 'new-char-dialog-confirm').click();
		await expectStep(page, 'Meet your character');
		await expect(target(page, 'char-tab-core')).toHaveAttribute('data-state', 'active');
		await next(page);
		await expectStep(page, 'Turn the rolls into a bio');
		await expect(target(page, 'char-tab-background')).toHaveAttribute('data-state', 'active');
		await next(page);
		await expectStep(page, 'Add a portrait', '10 of 10');
		await next(page);
		await expect(page.locator(POPOVER)).toBeHidden();
	});
});

test.describe('Tutorial — Create your first foe', () => {
	test.beforeAll(async () => {
		await resetFoes();
	});

	test('walks through finding, sizing and adding a foe, then fighting it', async ({ page }) => {
		await openHome(page, false);
		await startTutorial(page, 'Create your first foe');

		await expectStep(page, 'Open the foe list', '1 of 10');
		await target(page, 'foe-switcher').click();
		await expectStep(page, 'Add a foe', '2 of 10');
		await target(page, 'new-foe-action').click();

		// Clicking Next mustn't dismiss the picker (a bits-ui Dialog closes
		// on a click outside it, and the tour's popover is outside it).
		await expectStep(page, 'Find your foe', '3 of 10');
		await target(page, 'foe-picker-search').locator('input').fill('wolf');
		await next(page);

		await expectStep(page, 'Choose a foe', '4 of 10');
		const tile = target(page, 'foe-picker-grid').locator('.fd-tile').first();
		const name = (await tile.locator('.fd-tile-name').innerText()).trim();
		await tile.click();

		await expectStep(page, 'How many?', '5 of 10');
		await target(page, 'foe-quantity').locator('.fd-qty-label', { hasText: 'Pack' }).click();
		await next(page);

		await expectStep(page, 'Know your foe', '6 of 10');
		await next(page);

		await expectStep(page, 'Add it', '7 of 10');
		await target(page, 'foe-picker-confirm').click();

		await expectStep(page, 'Your foe', '8 of 10');
		await expect(target(page, 'foe-switcher')).toContainText(name);
		await expect(target(page, 'foe-pills')).toContainText('Pack');
		await next(page);

		await expectStep(page, 'Mark progress', '9 of 10');
		const tally = target(page, 'foe-progress').locator('.ptp-tally');
		const before = await tally.innerText();
		await target(page, 'foe-progress').locator('.ptp-btn').last().click();
		await expect(tally).not.toHaveText(before);
		await next(page);

		await expectStep(page, 'Vanquish it', '10 of 10');
		await next(page); // Done
		await expect(page.locator(POPOVER)).toBeHidden();
	});

	// While a tour runs only the highlighted control takes clicks, so a player
	// can't cancel the picker (Escape ends the tour too). Should it close
	// anyway, the tour goes back past every step whose target went with it,
	// to the switcher.
	test('if the picker closes under it, the tour goes back to the switcher', async ({ page }) => {
		await openHome(page, false);
		await startTutorial(page, 'Create your first foe');
		await expectStep(page, 'Open the foe list');
		await target(page, 'foe-switcher').click();
		await expectStep(page, 'Add a foe');
		await target(page, 'new-foe-action').click();
		await expectStep(page, 'Find your foe');
		await next(page);
		await expectStep(page, 'Choose a foe');
		await target(page, 'foe-picker-grid').locator('.fd-tile').first().click();
		await expectStep(page, 'How many?');
		await page.locator('.foe-dialog .btn', { hasText: 'Cancel' }).dispatchEvent('click');
		await expectStep(page, 'Open the foe list');
	});
});

test.describe('Tutorial — Create your first foe, on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('starts by showing the Foes tab', async ({ page }) => {
		await openHome(page, false);
		await page.locator('.mob-tab', { hasText: 'Characters' }).click();
		await startTutorial(page, 'Create your first foe');

		await expectStep(page, 'Your foes', '1 of 11');
		await target(page, 'tab-foes').click();
		await expectStep(page, 'Open the foe list', '2 of 11');
		await target(page, 'foe-switcher').click();
		await expectStep(page, 'Add a foe');
		await target(page, 'new-foe-action').click();
		await expectStep(page, 'Find your foe');
		await next(page);
		await expectStep(page, 'Choose a foe');
		await target(page, 'foe-picker-grid').locator('.fd-tile').first().click();
		await expectStep(page, 'How many?');
		await next(page);
		await expectStep(page, 'Know your foe');
		await next(page);
		await expectStep(page, 'Add it');
		await target(page, 'foe-picker-confirm').click();
		await expectStep(page, 'Your foe');
		await next(page);
		await expectStep(page, 'Mark progress');
		await next(page);
		await expectStep(page, 'Vanquish it', '11 of 11');
		await next(page);
		await expect(page.locator(POPOVER)).toBeHidden();
	});
});
