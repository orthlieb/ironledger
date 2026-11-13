/**
 * tutorials.spec.ts — point-and-click tutorials (#lib/tutorials, on
 * driver.js), followed the way a player would: started from ☰ → Tutorials,
 * each step's control used for real.
 *
 * Create a character: open the switcher, "+ New character…", roll a name,
 * stats and (YRT) its fields, leave the rest to be randomized, Create; then
 * on the Background tab, write a bio and add a portrait; initiative; and
 * the Status tab, with the 9 experience a new character starts with.
 *
 * Add your first vow: + ⛓, name and rank it, the vow on the Vows tab. Add
 * your assets: + ◆, find and pick one, Add, and spend its experience from
 * the log.
 *
 * Create your first foe: open the switcher, "+ New foe…", search, choose a
 * foe, set how many, Add to Foes; then its pills, marking progress and
 * vanquishing it.
 *
 * Fight your foe: Move → Enter the Fray → roll, and its outcome's links in
 * the log; a note saying what you do; Strike, and its harm on the foe's
 * progress track; Endure Harm, and it off your health.
 *
 * Start a journey: + New Journey…, its name and difficulty, a note on how
 * you set out, Undertake a Journey (a strong hit, its progress left to Next)
 * and the progress on the journey's track.
 *
 * Add a settlement and an NPC: + New Settlement… and + New NPC… (names
 * typed), their cards, the NPC's Within set to the settlement, and the
 * Forge a Bond pointer.
 *
 * Put your settlement on the map: Map, a picture for a new map, + marker
 * and a click on it, the marker linked to the settlement, the Choose Icon
 * dialog's Icons, Buildings and Settlement builder tabs (a settlement drawn
 * and used), OK, the marker's card and its Go To, and the map on the
 * settlement's card.
 *
 * Make camp and heal: Heal, and its +2 health; a note saying where you
 * camp; Make Camp, choosing Recuperate and Focus from its links. The dice are loaded, so each roll comes out as
 * the test says.
 *
 * The steps find their controls by `data-tour` ids, so these tests also
 * catch a UI change that strands a tutorial (a renamed control, a moved
 * dialog).
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import {
	clearAllMaps,
	fetchMaps,
	resetCharacters,
	resetCommunities,
	resetExpansions,
	resetExpeditions,
	resetFoes,
	resetLog,
	seedCharacter,
	seedCommunity,
	seedFoeEncounter,
	setExpansions,
} from './helpers/reset';
import { settleHome, characterCount, activeCharacterName } from './helpers/home';

const POPOVER = '.driver-popover';

/** A tutorial target, by `data-tour` id. */
const target = (page: Page, id: string) => page.locator(`[data-tour="${id}"]`).first();

/** Open /home with the YRT extension on or off (it adds the region step):
 *  set on the account, which the page reads as it loads. */
async function openHome(page: Page, yrt: boolean) {
	await setExpansions({ yrt });
	await page.goto('/home');
	await settleHome(page);
}

// The choice outlasts the spec: back to the default for the specs after.
test.afterAll(async () => {
	await resetExpansions();
});

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

	await expectStep(page, 'Your status', n(2));
	await press(target(page, 'char-tab-status'));
	await expectStep(page, 'Debilities', n(3));
	await next(page);
	await expectStep(page, 'Bonds', n(4));
	await expect(page.locator(`${POPOVER} .driver-popover-description`)).toContainText(
		'Add your first vow, then Add your assets',
	);
	await next(page); // Done
	await expect(page.locator(POPOVER)).toBeHidden();

	// A new character starts with 9 experience: its three assets' worth.
	await press(target(page, 'char-tab-core'));
	await expect(experience(page)).toHaveText('9');
}

/** The character's Experience tile's value. */
const experience = (page: Page) =>
	page.locator('.res-tile', { hasText: 'Experience' }).locator('.res-value');

/** Add your first vow, from its + ⛓ step (`first`, `total` and `tap` as
 *  for walkSheet), to Done. */
async function swearVow(page: Page, first: number, total: number, tap = false) {
	const n = (i: number) => `${first + i} of ${total}`;
	const press = (l: Locator) => (tap ? l.tap() : l.click());
	await expectStep(page, 'Swear your first vow', n(0));
	await press(target(page, 'char-add-vow'));
	await expectStep(page, 'Name it and rank it', n(1));
	await target(page, 'new-vow-dialog').locator('.co-input').fill('Avenge my sister');
	await press(target(page, 'new-vow-dialog-confirm'));
	await expectStep(page, 'Your vow', n(2));
	await expect(target(page, 'char-vows')).toContainText('Avenge my sister');
	await next(page); // Done
	await expect(page.locator(POPOVER)).toBeHidden();
}

/** Add your assets, from its + ◆ step, to Done: the Hawk (a companion: its
 *  first pick is in its 3 experience), spent from the log's link. */
async function takeAsset(page: Page, first: number, total: number, tap = false) {
	const n = (i: number) => `${first + i} of ${total}`;
	const press = (l: Locator) => (tap ? l.tap() : l.click());
	await expectStep(page, 'Choose three assets', n(0));
	await press(target(page, 'char-add-asset'));
	await expectStep(page, 'Find one', n(1));
	await target(page, 'asset-picker-search').locator('input').first().fill('Hawk');
	await next(page);
	await expectStep(page, 'Pick one', n(2));
	await press(
		target(page, 'asset-picker-grid').locator('[role="button"]', { hasText: 'Hawk' }).first(),
	);
	await expectStep(page, 'Its first ability', n(3));
	await press(target(page, 'asset-abilities').locator('.ability-check').first());
	await next(page);
	await expectStep(page, 'Take it', n(4));
	await press(target(page, 'asset-card-add'));
	await expectStep(page, 'Spend the experience', n(5));
	await press(page.locator('.xp-cost-link').first());
	await expectStep(page, 'Two more to go', n(6));
	await expect(target(page, 'char-assets')).toContainText('Hawk');
	await next(page); // Done
	await expect(page.locator(POPOVER)).toBeHidden();
	await press(target(page, 'char-tab-core'));
	await expect(experience(page)).toHaveText('6');
}

/** Give the active character `xp` experience (a seeded one has none). */
async function giveExperience(page: Page, xp: number, tap = false) {
	const more = page.getByRole('button', { name: 'Increase Experience' });
	for (let i = 0; i < xp; i++) await (tap ? more.tap() : more.click());
	await expect(experience(page)).toHaveText(String(xp));
}

/** A 1×1 PNG, for the portrait upload and the map's picture. */
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

		await expectStep(page, 'Open the character list', '1 of 14');
		await target(page, 'char-switcher').click();
		await expectStep(page, 'Start a new character', '2 of 14');
		await target(page, 'new-char-action').click();

		await expectStep(page, 'Roll a name', '3 of 14');
		await target(page, 'roll-name').click();
		const name = await target(page, 'new-char-name').locator('input').inputValue();
		expect(name.trim(), 'a rolled name').not.toBe('');
		await next(page);

		await expectStep(page, 'Roll your stats', '4 of 14');
		await target(page, 'roll-stats').click();
		await next(page);

		await expectStep(page, 'Randomize the rest', '5 of 14');
		await next(page);

		await expectStep(page, 'Create your character', '6 of 14');
		await target(page, 'new-char-dialog-confirm').click();

		await expectStep(page, 'Meet your character', '7 of 14');
		await expect.poll(() => activeCharacterName(page)).toBe(name);
		expect(await characterCount(page)).toBe(before + 1);
		await next(page);

		// The rolled details, rewritten as a bio. Next closes the editor.
		await expectStep(page, 'Turn the rolls into a bio', '8 of 14');
		const bio = target(page, 'char-bio');
		await bio.locator('.md-notes-display').click();
		await bio.locator('textarea').fill('Born in the Havens; left to keep a promise.');
		await next(page);

		await expectStep(page, 'Add a portrait', '9 of 14');
		await expect(bio).toContainText('left to keep a promise');
		await target(page, 'char-portrait')
			.locator('input[type="file"]')
			.setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: PNG });
		await expect(target(page, 'char-portrait').locator('img')).toBeVisible({ timeout: 5_000 });
		await next(page);
		await walkSheet(page, 10, 14);
	});

	test('rolls whatever is skipped, and with YRT covers its fields', async ({ page }) => {
		await openHome(page, true);
		await startTutorial(page);

		await expectStep(page, 'Open the character list', '1 of 15');
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
		await expectStep(page, 'Roll their details', '5 of 15');
		await expect(page.locator(`${POPOVER} .driver-popover-description`)).toContainText(
			'region of origin, religion and touched',
		);
		const stats = await target(page, 'new-char-stats')
			.locator('input')
			.evaluateAll((els) => els.map((e) => Number((e as HTMLInputElement).value)));
		expect(
			stats.some((v) => v > 0),
			'stats rolled',
		).toBe(true);
		await next(page);
		await expectStep(page, 'Randomize the rest');
		await next(page);

		await expectStep(page, 'Create your character');
		await target(page, 'new-char-dialog-confirm').click();
		await expectStep(page, 'Meet your character', '8 of 15');
		// The fields left empty were rolled on Create.
		await expect(page.locator('.log-entry', { hasText: 'New Character' }).first()).toContainText(
			'Region of origin:',
		);
		await next(page);
		await expectStep(page, 'Turn the rolls into a bio');
		await next(page);
		await expectStep(page, 'Add a portrait', '10 of 15');
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

		await expectStep(page, 'Your characters', '1 of 15');
		await target(page, 'tab-characters').click();
		await expectStep(page, 'Open the character list', '2 of 15');
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
		await expectStep(page, 'Add a portrait', '10 of 15');
		await next(page);
		await walkSheet(page, 11, 15, true);
	});
});

test.describe('Tutorial — Add your first vow, and your assets', () => {
	test.beforeAll(async () => {
		await resetCharacters();
		await resetLog();
		await seedCharacter('Brand');
	});

	test('swears a first vow', async ({ page }) => {
		await openHome(page, false);
		await startTutorial(page, 'Add your first vow');
		await swearVow(page, 1, 3);
	});

	test('takes an asset and spends its experience', async ({ page }) => {
		await openHome(page, false);
		await giveExperience(page, 9);
		await startTutorial(page, 'Add your assets');
		await takeAsset(page, 1, 7);
	});
});

test.describe('Tutorial — Add your first vow, and your assets, on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test.beforeAll(async () => {
		await resetCharacters();
		await resetLog();
		await seedCharacter('Brand');
	});

	test('brings up the Characters tab and swears a vow, tapping', async ({ page }) => {
		await openHome(page, false);
		await page.locator('.mob-tab', { hasText: 'Foes' }).click();
		await startTutorial(page, 'Add your first vow');
		await expectStep(page, 'Your character', '1 of 4');
		await target(page, 'tab-characters').tap();
		await swearVow(page, 2, 4, true);
	});

	test('brings up the Characters tab and takes an asset, tapping', async ({ page }) => {
		await openHome(page, false);
		await giveExperience(page, 9, true);
		await page.locator('.mob-tab', { hasText: 'Foes' }).click();
		await startTutorial(page, 'Add your assets');
		await expectStep(page, 'Your character', '1 of 8');
		await target(page, 'tab-characters').tap();
		await takeAsset(page, 2, 8, true);
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

	// Say what you do: a note in the log moves the tour on.
	await expectStep(page, 'Say what you do');
	const bar = target(page, 'log-note').locator('input');
	await press(bar);
	await bar.fill('I rush in, axe high.');
	await bar.press('Enter');
	await expect(page.locator('.log-entry', { hasText: 'I rush in, axe high.' })).toHaveCount(1);

	// With initiative, the tour points at Strike.
	await expectStep(page, 'Make the move');
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

	test('walks through Enter the Fray, a note, a Strike and Endure Harm', async ({ page }) => {
		await seedFoeEncounter({ name: 'Boar', foeId: 'ironsworn/boar' });
		await loadDice(page);
		await openHome(page, false);
		await startTutorial(page, 'Fight your foe');
		await expectStep(page, 'Your vitals', '1 of 22');
		await next(page);
		await expectStep(page, 'Initiative', '2 of 22');
		await next(page);
		await fight(page, 22);
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
		await expectStep(page, 'Your character', '1 of 26');
		await target(page, 'tab-characters').tap();
		// The sheet is on Core already: that step moves itself on.
		await expectStep(page, 'Your vitals', '3 of 26');
		await next(page);
		await expectStep(page, 'Initiative');
		await next(page);
		await fight(page, 26, true);
	});
});

/**
 * Make camp and heal, from its first step: the character hurt first
 * (health 5 → 2), so Heal (a strong hit; its +2 health taken) and Make
 * Camp (a strong hit; Recuperate and Focus taken) have something to mend.
 * `phone` taps, and starts with the Characters tab hidden.
 */
async function rest(page: Page, total: number, phone = false) {
	const press = (l: Locator) => (phone ? l.tap() : l.click());
	const vital = (name: string) =>
		page.locator('.res-tile', { hasText: name }).locator('.res-value');
	const n = (i: number) => `${i + (total - 13)} of ${total}`;

	await expectStep(page, 'After the fight', n(1));
	await expect(page.locator(`${POPOVER} .driver-popover-description`)).toContainText(
		'health 2 of 5',
	);
	await next(page);

	await expectStep(page, 'Tend your wounds', n(2));
	await press(target(page, 'tb-move'));
	await expectStep(page, 'Heal', n(3));
	await press(target(page, 'move-heal'));
	await expectStep(page, 'Whose wounds?', n(4));
	await next(page);
	await expectStep(page, 'Roll', n(5));
	await roll(page, STRONG, phone);
	await expectStep(page, 'Take the health', n(6));
	await expect(highlighted(page)).toContainText('Strong Hit');
	await press(highlighted(page).locator('a.resource-link', { hasText: '+2 health' }));
	await expect(vital('Health')).toHaveText('4');
	await next(page);

	await expectStep(page, 'Where do you camp?', n(7));
	const bar = target(page, 'log-note').locator('input');
	await press(bar);
	await bar.fill('Under a rock shelf, out of the wind.');
	await bar.press('Enter');
	await expectStep(page, 'Make camp', n(8));
	await expect(page.locator('.log-entry', { hasText: 'out of the wind' })).toHaveCount(1);
	await press(target(page, 'tb-move'));
	await expectStep(page, 'Make Camp', n(9));
	await press(target(page, 'move-make-camp'));
	await expectStep(page, 'How you rest', n(10));
	await expect(target(page, 'move-outcomes')).toContainText('Recuperate');
	await next(page);
	await expectStep(page, 'Roll +supply', n(11));
	await roll(page, STRONG, phone);

	// Recuperate and Focus: +1 health, +1 momentum.
	await expectStep(page, 'Choose', n(12));
	await press(highlighted(page).locator('a.resource-link', { hasText: '+1 health' }).first());
	await expect(vital('Health')).toHaveText('5');
	const focus = highlighted(page).locator('a.resource-link', { hasText: '+1 momentum' });
	await press(focus);
	await expect(focus).toHaveCount(0);
	await next(page);
	await expectStep(page, 'Rested', n(13));
	await next(page); // Done
	await expect(page.locator(POPOVER)).toBeHidden();
}

test.describe('Tutorial — Make camp and heal', () => {
	test.beforeAll(async () => {
		await resetCharacters();
		await resetLog();
		await seedCharacter('Brand');
	});

	test('heals, says where they camp, and makes camp', async ({ page }) => {
		await loadDice(page);
		await openHome(page, false);
		for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Decrease Health' }).click();
		await expect(page.locator('.res-tile', { hasText: 'Health' }).locator('.res-value')).toHaveText(
			'2',
		);
		await startTutorial(page, 'Make camp and heal');
		await rest(page, 13);
	});
});

test.describe('Tutorial — Make camp and heal, on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test.beforeAll(async () => {
		await resetCharacters();
		await resetLog();
		await seedCharacter('Brand');
	});

	test('brings up the Characters tab, then rests, tapping', async ({ page }) => {
		await loadDice(page);
		await openHome(page, false);
		for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Decrease Health' }).tap();
		await page.locator('.mob-tab', { hasText: 'Foes' }).click();
		await startTutorial(page, 'Make camp and heal');
		await expectStep(page, 'Your character', '1 of 15');
		await target(page, 'tab-characters').tap();
		// The sheet is on Core already: that step moves itself on.
		await rest(page, 15, true);
	});
});

/**
 * Start a journey, from its switcher step to Done: "To the Havens" at the
 * default difficulty (Dangerous: 2 boxes a waypoint), a note, then
 * Undertake a Journey for a strong hit whose progress Next marks.
 */
async function journey(page: Page, first: number, total: number, tap = false) {
	const n = (i: number) => `${first + i} of ${total}`;
	const press = (l: Locator) => (tap ? l.tap() : l.click());
	const tally = target(page, 'exp-progress').locator('.ptp-tally');

	await expectStep(page, 'Plan a journey', n(0));
	await press(target(page, 'exp-switcher'));
	await expectStep(page, 'A new journey', n(1));
	await press(target(page, 'new-journey-action'));
	await expectStep(page, 'Where are you going?', n(2));
	await target(page, 'new-journey-dialog').locator('.co-input').fill('To the Havens');
	await press(target(page, 'new-journey-dialog-confirm'));
	await expectStep(page, 'Your journey', n(3));
	await expect(target(page, 'exp-switcher')).toContainText('To the Havens');
	await expect(tally).toHaveText('');
	await next(page);

	await expectStep(page, 'Set out', n(4));
	const bar = target(page, 'log-note').locator('input');
	await press(bar);
	await bar.fill('We take the old river road at first light.');
	await bar.press('Enter');
	await expectStep(page, 'On the road', n(5));
	await press(target(page, 'tb-move'));
	await expectStep(page, 'Undertake a Journey', n(6));
	await press(target(page, 'move-undertake-a-journey'));
	await expectStep(page, 'Roll +wits', n(7));
	await next(page);
	await expectStep(page, 'Roll', n(8));
	await roll(page, STRONG, tap);

	// No link clicked: Next marks the waypoint's progress.
	await expectStep(page, 'Reach a waypoint', n(9));
	await expect(highlighted(page)).toContainText('Strong Hit');
	await next(page);
	await expectStep(page, 'On your way', n(10));
	await expect(tally).toHaveText('2/10 boxes');
	await next(page); // Done
	await expect(page.locator(POPOVER)).toBeHidden();
}

test.describe('Tutorial — Start a journey', () => {
	test.beforeAll(async () => {
		await resetCharacters();
		await resetExpeditions();
		await resetLog();
		await seedCharacter('Brand');
	});

	test('plans a journey and reaches its first waypoint', async ({ page }) => {
		await loadDice(page);
		await openHome(page, false);
		await startTutorial(page, 'Start a journey');
		await journey(page, 1, 11);
	});
});

test.describe('Tutorial — Start a journey, on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test.beforeAll(async () => {
		await resetCharacters();
		await resetExpeditions();
		await resetLog();
		await seedCharacter('Brand');
	});

	test('brings up the Expeditions tab, tapping', async ({ page }) => {
		await loadDice(page);
		await openHome(page, false);
		await startTutorial(page, 'Start a journey');
		await expectStep(page, 'Your expeditions', '1 of 12');
		await target(page, 'tab-expeditions').tap();
		await journey(page, 2, 12, true);
	});
});

/**
 * Add a settlement and an NPC, from its switcher step to Done: the
 * settlement `town` and the NPC `who`, named by hand, and the NPC's Within
 * set to the settlement.
 */
async function connect(
	page: Page,
	first: number,
	total: number,
	town: string,
	who: string,
	tap = false,
) {
	const n = (i: number) => `${first + i} of ${total}`;
	const press = (l: Locator) => (tap ? l.tap() : l.click());

	await expectStep(page, 'People and places', n(0));
	await press(target(page, 'cm-switcher'));
	await expectStep(page, 'A new settlement', n(1));
	await press(target(page, 'new-settlement-action'));
	await expectStep(page, 'Name it', n(2));
	await target(page, 'new-settlement-dialog').locator('.co-input').first().fill(town);
	await press(target(page, 'new-settlement-dialog-confirm'));
	await expectStep(page, 'Your settlement', n(3));
	await expect(target(page, 'cm-switcher')).toContainText(town);
	await next(page);

	await expectStep(page, 'Someone who lives there', n(4));
	await press(target(page, 'cm-switcher'));
	await expectStep(page, 'A new NPC', n(5));
	await press(target(page, 'new-npc-action'));
	await expectStep(page, 'Who are they?', n(6));
	await target(page, 'new-npc-dialog').locator('.co-input').first().fill(who);
	await press(target(page, 'new-npc-dialog-confirm'));
	await expectStep(page, 'Your NPC', n(7));
	await expect(target(page, 'cm-switcher')).toContainText(who);
	await next(page);

	// Within: the picker's list opens over the tour, and takes the pick.
	await expectStep(page, 'Where they live', n(8));
	await press(target(page, 'npc-within'));
	await press(page.locator('.cb-popover .cb-item', { hasText: town }).first());
	await expect(target(page, 'npc-within')).toContainText(town);
	await next(page);
	await expectStep(page, 'Forge a bond', n(9));
	await next(page); // Done
	await expect(page.locator(POPOVER)).toBeHidden();
}

test.describe('Tutorial — Add a settlement and an NPC', () => {
	test.beforeAll(async () => {
		await resetCommunities();
	});

	test('makes a settlement and someone who lives there', async ({ page }) => {
		await openHome(page, false);
		await startTutorial(page, 'Add a settlement and an NPC');
		await connect(page, 1, 10, 'Thornhold', 'Edda');
	});
});

test.describe('Tutorial — Add a settlement and an NPC, on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test.beforeAll(async () => {
		await resetCommunities();
	});

	test('brings up the Connections tab, tapping', async ({ page }) => {
		await openHome(page, false);
		await startTutorial(page, 'Add a settlement and an NPC');
		await expectStep(page, 'Your connections', '1 of 11');
		await target(page, 'tab-connections').tap();
		await connect(page, 2, 11, 'Ashfen', 'Rurik', true);
	});
});

/**
 * Put your settlement on the map, Map to Done, on a new map: its picture,
 * a marker placed and linked to `town`, the Choose Icon dialog's three tabs
 * with a settlement drawn and used on the last, OK, the marker's card and
 * its Go To, and the map on the settlement's card. `phone` taps, and reads
 * the builder's tab by its short name.
 */
async function mapIt(page: Page, town: string, phone = false) {
	const n = (i: number) => `${i} of 15`;
	const press = (l: Locator) => (phone ? l.tap() : l.click());

	await expectStep(page, 'Your campaign map', n(1));
	await press(target(page, 'tb-map'));
	await expectStep(page, 'A picture to draw on', n(2));
	await page
		.locator('#mp-file-input')
		.setInputFiles({ name: 'map.png', mimeType: 'image/png', buffer: PNG });

	// + marker, then a click on the map: the marker's editor.
	await expectStep(page, 'Mark your settlement', n(3));
	await press(target(page, 'map-add-marker'));
	await expectStep(page, 'Where is it?', n(4));
	const grid = page.locator('.mp-grid-capture');
	const box = await grid.boundingBox();
	if (!box) throw new Error('the map has no grid');
	await grid.click({ position: { x: box.width * 0.4, y: box.height * 0.35 } });
	await expectStep(page, 'Link it', n(5));
	await press(target(page, 'marker-link'));
	await press(page.locator('.cb-popover .cb-item', { hasText: town }).first());
	await expect(page.locator('#mp-props-name')).toHaveValue(town);

	// Choose Icon: Icons, then Buildings, then the settlement builder.
	await expectStep(page, 'How it looks', n(6));
	await press(target(page, 'marker-icon'));
	await expectStep(page, 'Icons', n(7));
	await next(page);
	await expectStep(page, 'Buildings', n(8));
	await press(target(page, 'icon-tab-buildings'));
	await expectStep(page, 'One building', n(9));
	await next(page);
	await expectStep(page, 'A whole settlement', n(10));
	await expect(page.locator(POPOVER)).toContainText(
		phone ? 'Click Settlements.' : 'Click Settlement builder.',
	);
	await press(target(page, 'icon-tab-builder'));
	await expectStep(page, 'Draw your settlement', n(11));
	await next(page);
	await expectStep(page, 'Use this', n(12));
	const preview = target(page, 'sb-preview');
	await expect(preview.locator('.sb-big svg')).toBeVisible({ timeout: 30_000 });
	await press(preview.getByRole('button', { name: 'Use this' }));
	await expectStep(page, 'Done', n(13));
	await press(target(page, 'marker-ok'));

	// The card, its Go To, and the settlement's card listing the map.
	await expectStep(page, 'On the map', n(14));
	await press(target(page, 'marker-card').getByRole('button', { name: /Go To Settlement/ }));
	await expectStep(page, 'Where it’s marked', n(15));
	await expect(target(page, 'cm-switcher')).toContainText(town);
	await expect(target(page, 'cm-map')).toContainText('My New Map');
	await next(page); // Done
	await expect(page.locator(POPOVER)).toBeHidden();

	// Saved: one marker, named for the settlement, linked to it, drawn as one.
	const markers = ((await fetchMaps())[0]?.markers ?? []) as Array<{
		label?: string;
		entityId?: string;
		settlement?: { tier?: string; building?: string };
	}>;
	expect(markers).toHaveLength(1);
	expect(markers[0].label).toBe(town);
	expect(markers[0].entityId).toMatch(/^community:/);
	expect(markers[0].settlement?.tier).toBeTruthy();
	expect(markers[0].settlement?.building).toBeUndefined();
}

test.describe('Tutorial — Put your settlement on the map', () => {
	test.beforeAll(async () => {
		await clearAllMaps();
		await resetCommunities();
	});

	test('asks for a settlement first', async ({ page }) => {
		await openHome(page, false);
		await startTutorial(page, 'Put your settlement on the map');
		await expectStep(page, 'First, a settlement');
		await next(page); // Done
		await expect(page.locator(POPOVER)).toBeHidden();
	});

	test('marks it, drawn, on a new map', async ({ page }) => {
		await seedCommunity('Thornhold');
		await openHome(page, false);
		await startTutorial(page, 'Put your settlement on the map');
		await mapIt(page, 'Thornhold');
	});
});

test.describe('Tutorial — Put your settlement on the map, on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test.beforeAll(async () => {
		await clearAllMaps();
		await resetCommunities();
		await seedCommunity('Ashfen');
	});

	test('marks it, tapping', async ({ page }) => {
		await openHome(page, false);
		await startTutorial(page, 'Put your settlement on the map');
		await mapIt(page, 'Ashfen', true);
	});
});
