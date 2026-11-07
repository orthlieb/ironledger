/**
 * tutorials.spec.ts — point-and-click tutorials (#lib/tutorials, on
 * driver.js), followed the way a player would: started from ☰ → Tutorials,
 * each step's control used for real.
 *
 * Create a character: open the switcher, "+ New character…", roll a name,
 * stats and (YRT) a region, leave the rest to be randomized, Create; then
 * on the Background tab, write a bio and add a portrait; initiative; swear
 * a vow; buy a first asset with the starting experience, spending it from
 * the log; and the Status tab.
 *
 * Create your first foe: open the switcher, "+ New foe…", search, choose a
 * foe, set how many, Add to Foes; then its pills, marking progress and
 * vanquishing it.
 *
 * Fight your foe: Move → Enter the Fray → roll, and its outcome's links in
 * the log; Strike, and its harm on the foe's progress track; Endure Harm,
 * and it off your health. The dice are loaded, so each roll comes out as
 * the test says.
 *
 * The steps find their controls by `data-tour` ids, so these tests also
 * catch a UI change that strands a tutorial (a renamed control, a moved
 * dialog).
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import {
	resetCharacters,
	resetFoes,
	resetLog,
	seedCharacter,
	seedFoeEncounter,
} from './helpers/reset';
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

/**
 * The character tutorial from its Core tab on: initiative, a first vow, a
 * first asset bought with the starting experience and spent from the log,
 * then the Status tab, to Done. `first` is the number of its first step,
 * `total` the tour's length; `tap` taps instead of clicking, as on a phone
 * (the log acts on a tap's touchend and cancels its click).
 */
async function walkSheet(page: Page, first: number, total: number, tap = false) {
	const n = (i: number) => `${first + i} of ${total}`;
	const press = (l: Locator) => (tap ? l.tap() : l.click());

	await expectStep(page, 'Your character sheet', n(0));
	await press(target(page, 'char-tab-core'));
	await expectStep(page, 'Initiative', n(1));
	await next(page);

	await expectStep(page, 'Swear your first vow', n(2));
	await press(target(page, 'char-add-vow'));
	await expectStep(page, 'Name it and rank it', n(3));
	await target(page, 'new-vow-dialog').locator('.co-input').fill('Avenge my sister');
	await press(target(page, 'new-vow-dialog-confirm'));
	await expectStep(page, 'Your vow', n(4));
	await expect(target(page, 'char-vows')).toContainText('Avenge my sister');
	await next(page);

	await expectStep(page, 'Choose three assets', n(5));
	await press(target(page, 'char-add-asset'));
	await expectStep(page, 'Find one', n(6));
	await target(page, 'asset-picker-search').locator('input').first().fill('Hawk');
	await next(page);
	await expectStep(page, 'Pick one', n(7));
	await press(
		target(page, 'asset-picker-grid').locator('[role="button"]', { hasText: 'Hawk' }).first(),
	);
	// A companion comes with nothing marked; its first pick is in its price.
	await expectStep(page, 'Its first ability', n(8));
	await press(target(page, 'asset-abilities').locator('.ability-check').first());
	await next(page);
	await expectStep(page, 'Take it', n(9));
	await press(target(page, 'asset-card-add'));
	await expectStep(page, 'Spend the experience', n(10));
	await press(page.locator('.xp-cost-link').first());
	await expectStep(page, 'Two more to go', n(11));
	await expect(target(page, 'char-assets')).toContainText('Hawk');
	await next(page);

	await expectStep(page, 'Your status', n(12));
	await press(target(page, 'char-tab-status'));
	await expectStep(page, 'Debilities', n(13));
	await next(page);
	await expectStep(page, 'Bonds', n(14));
	await next(page); // Done
	await expect(page.locator(POPOVER)).toBeHidden();

	// The Hawk, with its pick, cost 3 of the 9 a new character starts with.
	await press(target(page, 'char-tab-core'));
	await expect(
		page.locator('.res-tile', { hasText: 'Experience' }).locator('.res-value'),
	).toHaveText('6');
}

/** A 1×1 PNG, for the portrait upload. */
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==',
	'base64',
);

test.describe('Tutorial — Create a character', () => {
	test.beforeAll(async () => {
		await resetCharacters();
	});

	test('walks through rolling a character, its background and its sheet', async ({ page }) => {
		await openHome(page, false);
		const before = await characterCount(page);
		await startTutorial(page);

		await expectStep(page, 'Open the character list', '1 of 24');
		await target(page, 'char-switcher').click();
		await expectStep(page, 'Start a new character', '2 of 24');
		await target(page, 'new-char-action').click();

		await expectStep(page, 'Roll a name', '3 of 24');
		await target(page, 'roll-name').click();
		const name = await target(page, 'new-char-name').locator('input').inputValue();
		expect(name.trim(), 'a rolled name').not.toBe('');
		await next(page);

		await expectStep(page, 'Roll your stats', '4 of 24');
		await target(page, 'roll-stats').click();
		await next(page);

		await expectStep(page, 'Randomize the rest', '5 of 24');
		await next(page);

		await expectStep(page, 'Create your character', '6 of 24');
		await target(page, 'new-char-dialog-confirm').click();

		await expectStep(page, 'Meet your character', '7 of 24');
		await expect.poll(() => activeCharacterName(page)).toBe(name);
		expect(await characterCount(page)).toBe(before + 1);
		await next(page);

		// The rolled details, rewritten as a bio. Next closes the editor.
		await expectStep(page, 'Turn the rolls into a bio', '8 of 24');
		const bio = target(page, 'char-bio');
		await bio.locator('.md-notes-display').click();
		await bio.locator('textarea').fill('Born in the Havens; left to keep a promise.');
		await next(page);

		await expectStep(page, 'Add a portrait', '9 of 24');
		await expect(bio).toContainText('left to keep a promise');
		await target(page, 'char-portrait')
			.locator('input[type="file"]')
			.setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: PNG });
		await expect(target(page, 'char-portrait').locator('img')).toBeVisible({ timeout: 5_000 });
		await next(page);
		await walkSheet(page, 10, 24);
	});

	test('rolls whatever is skipped, and with YRT covers the region', async ({ page }) => {
		await openHome(page, true);
		await startTutorial(page);

		await expectStep(page, 'Open the character list', '1 of 25');
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
		await expectStep(page, 'Roll a region of origin', '5 of 25');
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
		await expectStep(page, 'Meet your character', '8 of 25');
		await next(page);
		await expectStep(page, 'Turn the rolls into a bio');
		await next(page);
		await expectStep(page, 'Add a portrait', '10 of 25');
		// ✕ ends it anywhere.
		await page.locator(`${POPOVER} .driver-popover-close-btn`).click();
		await expect(page.locator(POPOVER)).toBeHidden();
	});
});

test.describe('Tutorial — Create a character, on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('shows the Characters tab, brings up Background, and taps through the sheet', async ({
		page,
	}) => {
		await openHome(page, false);
		await page.locator('.mob-tab', { hasText: 'Foes' }).click();
		await startTutorial(page);

		await expectStep(page, 'Your characters', '1 of 25');
		await target(page, 'tab-characters').click();
		await expectStep(page, 'Open the character list', '2 of 25');
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
		await expectStep(page, 'Add a portrait', '10 of 25');
		await next(page);
		await walkSheet(page, 11, 25, true);
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

/**
 * Load the dice: `rollDie` draws one Uint32 from crypto.getRandomValues per
 * die, so queued values come up in order (`roll()` queues them).
 */
async function loadDice(page: Page) {
	await page.addInitScript(() => {
		const queue: number[] = [];
		(window as unknown as { __dice: number[] }).__dice = queue;
		const real = crypto.getRandomValues.bind(crypto);
		crypto.getRandomValues = ((arr: Uint32Array) => {
			if (queue.length && arr instanceof Uint32Array && arr.length === 1) {
				arr[0] = queue.shift() ?? 0;
				return arr;
			}
			return real(arr);
		}) as typeof crypto.getRandomValues;
	});
}

/** An action roll's dice: the action die, then the two challenge dice. */
const STRONG = [6, 1, 1];
const MISS = [1, 10, 10];

/** Queue `dice` (faces) and press Roll Move. */
async function roll(page: Page, dice: number[], tap = false) {
	await page.evaluate(
		(faces) => (window as unknown as { __dice: number[] }).__dice.push(...faces.map((f) => f - 1)),
		dice,
	);
	await (tap ? target(page, 'move-roll').tap() : target(page, 'move-roll').click());
}

/** What the tour is pointing at. */
const highlighted = (page: Page) => page.locator('.driver-active-element').first();

/**
 * Fight your foe, from its Move button on: Enter the Fray (a strong hit;
 * take its momentum, leave initiative to Next), Strike (a strong hit; its
 * harm on the foe), Endure Harm (applied, then a miss). `phone` taps, and
 * takes the steps that bring up the Foes and Characters tabs.
 */
async function fight(page: Page, total: number, phone = false) {
	const press = (l: Locator) => (phone ? l.tap() : l.click());
	const health = page.locator('.res-tile', { hasText: 'Health' }).locator('.res-value');
	const tally = target(page, 'foe-progress').locator('.ptp-tally');
	await expect(health).toHaveText('5');
	const progress = await tally.innerText();

	await expectStep(page, 'Make a move');
	await press(target(page, 'tb-move'));
	await expectStep(page, 'Find a move');
	await target(page, 'moves-search').locator('input').fill('fray');
	await next(page);
	await expectStep(page, 'Enter the Fray');
	await press(target(page, 'move-enter-the-fray'));
	await expectStep(page, 'How you go in');
	await next(page);
	await expectStep(page, 'Roll');
	await roll(page, STRONG, phone);

	// The roll just made; its momentum taken, its initiative left to Next.
	await expectStep(page, 'What happened');
	await expect(highlighted(page)).toContainText('Strong Hit');
	await press(highlighted(page).locator('a.resource-link'));
	await expect(highlighted(page).locator('a.resource-link')).toHaveCount(0);
	await next(page);
	await expect(page.getByRole('radio', { name: 'You have initiative' })).toHaveAttribute(
		'aria-checked',
		'true',
	);

	// With initiative, the tour points at Strike.
	await expectStep(page, 'Attack');
	await press(target(page, 'tb-move'));
	await expectStep(page, 'Strike or Clash');
	await expect(highlighted(page)).toHaveAttribute('data-tour', 'move-strike');
	await press(highlighted(page));
	await expectStep(page, 'Close in, or at range');
	await next(page);
	await expectStep(page, 'Roll');
	await roll(page, STRONG, phone);
	await expectStep(page, 'Harm your foe');
	await expect(highlighted(page)).toContainText('Inflict double harm');
	await press(highlighted(page).locator('a.progress-link'));
	await expect(tally).not.toHaveText(progress);
	await next(page);
	if (phone) {
		await expectStep(page, 'Your foe');
		await press(target(page, 'tab-foes'));
	}
	await expectStep(page, 'Wearing your foe down');
	await next(page);

	// Endure Harm: applied, it comes off health; then a miss.
	await expectStep(page, 'When you’re hurt');
	await press(target(page, 'tb-move'));
	await expectStep(page, 'Endure Harm');
	await press(target(page, 'move-endure-harm'));
	await expectStep(page, 'Take the harm');
	await press(target(page, 'move-harm').locator('.md-harm-apply'));
	await expectStep(page, 'Health or iron');
	await expect(health).not.toHaveText('5');
	await next(page);
	await expectStep(page, 'Shake it off?');
	await roll(page, MISS, phone);
	await expectStep(page, 'What it cost');
	await expect(highlighted(page)).toContainText('Miss');
	await next(page);
	if (phone) {
		await expectStep(page, 'Back to you');
		await press(target(page, 'tab-characters'));
	}
	await expectStep(page, 'Your health', `${total} of ${total}`);
	await next(page); // Done
	await expect(page.locator(POPOVER)).toBeHidden();
}

test.describe('Tutorial — Fight your foe', () => {
	test.beforeAll(async () => {
		await resetCharacters();
		await resetFoes();
		await resetLog();
		await seedCharacter('Brand');
	});

	test('without a foe, says to make one first', async ({ page }) => {
		await openHome(page, false);
		await startTutorial(page, 'Fight your foe');
		await expectStep(page, 'First, a foe');
		await next(page); // Done
		await expect(page.locator(POPOVER)).toBeHidden();
	});

	test('walks through Enter the Fray, a Strike and Endure Harm', async ({ page }) => {
		await seedFoeEncounter({ name: 'Boar', foeId: 'ironsworn/boar' });
		await loadDice(page);
		await openHome(page, false);
		await startTutorial(page, 'Fight your foe');
		await expectStep(page, 'Your vitals', '1 of 21');
		await next(page);
		await expectStep(page, 'Initiative', '2 of 21');
		await next(page);
		await fight(page, 21);
	});
});

test.describe('Tutorial — Fight your foe, on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test.beforeAll(async () => {
		await resetCharacters();
		await resetFoes();
		await resetLog();
		await seedCharacter('Brand');
		await seedFoeEncounter({ name: 'Boar', foeId: 'ironsworn/boar' });
	});

	test('shows the Characters tab, then the Foes tab and back, tapping', async ({ page }) => {
		await loadDice(page);
		await openHome(page, false);
		await page.locator('.mob-tab', { hasText: 'Foes' }).click();
		await startTutorial(page, 'Fight your foe');
		await expectStep(page, 'Your character', '1 of 25');
		await target(page, 'tab-characters').tap();
		// The sheet is on Core already: that step moves itself on.
		await expectStep(page, 'Your vitals', '3 of 25');
		await next(page);
		await expectStep(page, 'Initiative');
		await next(page);
		await fight(page, 25, true);
	});
});
