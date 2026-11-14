/**
 * character-fields.spec.ts — fields an extension adds to a character
 * (docs/character-fields.md), with YRT on: Region of origin, Religion,
 * Touched and Animal.
 *
 * New Character shows each with a d6 and rolls the empty ones on Create,
 * keeping them out of the background. On the sheet (Details tab) Animal hides
 * for a Pure character, a change is logged, lowering Touched unmarks a
 * Touched asset's extra abilities, and the Touched assets need Prime or
 * higher. Older characters get their values from the Touched asset and the
 * background New Character wrote.
 */
import { test, expect, type Page } from '@playwright/test';
import {
	resetCharacters,
	resetExpansions,
	resetLog,
	seedCharacter,
	setExpansions,
} from './helpers/reset';
import { settleHome, selectCharacterByName } from './helpers/home';

const CHAR_AREA = '.home-area--characters';
const field = (page: Page, id: string) => page.locator(`[data-tour="char-field-${id}"]`);

/** Pick `label` in the field's dropdown on the sheet. */
async function pick(page: Page, id: string, label: string) {
	await field(page, id).locator('.bui-select-trigger').click();
	await page.getByRole('option', { name: label, exact: true }).click();
}

async function openSheet(page: Page, name: string) {
	await page.goto('/home');
	await settleHome(page);
	await selectCharacterByName(page, name);
	await page.locator(`${CHAR_AREA} [data-tour="char-tab-details"]`).click();
	await expect(page.locator('[data-tour="char-fields"]')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	await setExpansions({ yrt: true });
	await resetCharacters();
	await resetLog();
});

test.afterAll(async () => {
	await resetExpansions();
});

test('The asset field types: a dropdown, a radio, a counter, a switch, text and notes (the sample extension)', async ({
	page,
}) => {
	await setExpansions({ yrt: true, sample: true });
	await seedCharacter('Sampla', undefined, { fields: { touched: 'prime' } });
	await openSheet(page, 'Sampla');
	await expect(page.locator('.cf-side', { hasText: 'Sample' })).toBeVisible();
	// A dropdown whose options are an oracle's rows.
	await pick(page, 'sampleTrinket', 'A glowing sprocket');
	await expect(page.locator('.log-entry').first()).toContainText('Trinket: — → A glowing sprocket');

	await expect(field(page, 'sampleRank').getByRole('radio', { name: 'Novice' })).toHaveAttribute(
		'aria-checked',
		'true',
	);
	await field(page, 'sampleRank').getByRole('radio', { name: 'Master' }).click();
	await expect(page.locator('.log-entry').first()).toContainText('Rank: Novice → Master');

	await expect(field(page, 'sampleResolve').locator('.cf-count')).toHaveText('2/5');
	await field(page, 'sampleResolve').getByRole('button', { name: 'Resolve 4' }).click();
	await expect(field(page, 'sampleResolve').locator('.cf-count')).toHaveText('4/5');
	await expect(page.locator('.log-entry').first()).toContainText('Resolve: 2 → 4');

	// Notes waits for Sworn.
	await expect(field(page, 'sampleNotes')).toHaveCount(0);
	await field(page, 'sampleSworn').getByRole('checkbox').click();
	await expect(page.locator('.log-entry').first()).toContainText('Sworn: off → on');
	await expect(field(page, 'sampleNotes')).toBeVisible();

	await field(page, 'sampleEpithet').locator('input').fill('Iron');
	await field(page, 'sampleEpithet').locator('input').blur();
	await expect(page.locator('.log-entry').first()).toContainText('Epithet: — → Iron');

	// Notes: typed in place, and not logged.
	await field(page, 'sampleNotes').locator('.md-notes-display').click();
	await field(page, 'sampleNotes').locator('textarea').fill('Owes the ferryman.');
	await field(page, 'sampleNotes').locator('textarea').blur();
	await expect(field(page, 'sampleNotes')).toContainText('Owes the ferryman.');
	await expect(page.locator('.log-entry').first()).toContainText('Epithet: — → Iron');
	await setExpansions({ yrt: true, sample: null });
});

test('The sample in New Character: Trinket and Epithet roll, and Notes waits for Sworn', async ({
	page,
}) => {
	await setExpansions({ yrt: true, sample: true });
	await page.goto('/home');
	await settleHome(page);
	await page.locator('[data-tour="char-switcher"]').first().click();
	await page.locator('[data-tour="new-char-action"]').first().click();
	await expect(page.locator('[data-tour="new-char-fields"]')).toBeVisible();
	const create = (id: string) => page.locator(`[data-tour="randomize-${id}"]`);

	// Only the fields with an oracle get a die.
	await expect(page.locator('[data-tour="roll-sampleRank"]')).toHaveCount(0);
	await page.locator('[data-tour="roll-sampleTrinket"]').click();
	await expect(create('sampleTrinket').locator('.bui-select-trigger')).toHaveText(
		/A humming widget|A glowing sprocket|A suspicious cog/,
	);
	await page.locator('[data-tour="roll-sampleEpithet"]').click();
	await expect(create('sampleEpithet').locator('input')).toHaveValue(/^(Bright|Iron|Storm|Rusk)$/);

	await expect(create('sampleNotes')).toHaveCount(0);
	await create('sampleSworn').getByRole('checkbox').click();
	await expect(create('sampleNotes')).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(page.locator('[data-tour="new-char-dialog"]')).toHaveCount(0);
	await setExpansions({ yrt: true, sample: null });
});

test('New Character: each field has a die, and Create rolls the ones left empty', async ({
	page,
}) => {
	await page.goto('/home');
	await settleHome(page);
	await page.locator('[data-tour="char-switcher"]').first().click();
	await page.locator('[data-tour="new-char-action"]').first().click();
	const block = page.locator('[data-tour="new-char-fields"]');
	await expect(block).toBeVisible();
	await expect(block.locator('.cf-label')).toHaveText(['Region of origin', 'Religion', 'Touched']);
	// Religion waits for an origin; Animal waits for a touched level.
	await expect(page.locator('[data-tour="roll-religion"]')).toBeDisabled();
	await page.locator('[data-tour="roll-origin"]').click();
	await expect(page.locator('[data-tour="roll-religion"]')).toBeEnabled();
	await expect(page.locator('[data-tour="randomize-origin"] .bui-select-trigger')).not.toHaveText(
		'—',
	);

	await page.locator('[data-tour="new-char-name"] input').fill('Fieldia');
	await page.locator('[data-tour="roll-stats"]').click();
	await page.locator('[data-tour="new-char-dialog-confirm"]').click();
	// Create saves, then selects the new character on its Background tab:
	// wait for that, or the Details click lands on the previous character.
	await expect(page.locator(`${CHAR_AREA} .ca-hdr-combobox .cb-value`)).toHaveText('Fieldia');

	await page.locator(`${CHAR_AREA} [data-tour="char-tab-details"]`).click();
	for (const id of ['origin', 'religion', 'touched'])
		await expect(field(page, id).locator('.bui-select-trigger')).not.toHaveText('—');
	await page.locator(`${CHAR_AREA} [data-tour="char-tab-background"]`).click();
	const bio = page.locator('[data-tour="char-bio"]');
	await expect(bio).toBeVisible();
	await expect(bio).not.toContainText('Region of origin');
	await expect(bio).not.toContainText('Religion');
	await expect(
		page.locator('.log-entry').filter({ hasText: 'New Character — Fieldia' }),
	).toContainText('Region of origin:');
});

test('Sheet: Animal hides for a Pure character, and a change is logged', async ({ page }) => {
	await seedCharacter('Pura', undefined, { fields: { touched: 'pure' } });
	await openSheet(page, 'Pura');
	await expect(field(page, 'touched').locator('.bui-select-trigger')).toHaveText('Pure');
	await expect(field(page, 'touchedAnimal')).toHaveCount(0);

	await pick(page, 'touched', 'Prime');
	await expect(field(page, 'touchedAnimal')).toBeVisible();
	await expect(page.locator('.log-entry').first()).toContainText('Touched: Pure → Prime');
	await field(page, 'touchedAnimal').locator('input').fill('Lynx');
	await field(page, 'touchedAnimal').locator('input').blur();
	await expect(page.locator('.log-entry').first()).toContainText('Animal: — → Lynx');

	// Back to Pure: Animal hides, and comes back with its value.
	await pick(page, 'touched', 'Pure');
	await expect(field(page, 'touchedAnimal')).toHaveCount(0);
	await pick(page, 'touched', 'Second');
	await expect(field(page, 'touchedAnimal').locator('input')).toHaveValue('Lynx');
});

test('Touched assets need Touched: Prime or higher', async ({ page }) => {
	await seedCharacter('Purist', undefined, { fields: { touched: 'pure' } });
	await openSheet(page, 'Purist');
	await page.locator(`${CHAR_AREA} [data-tour="char-add-asset"]`).click();
	const tile = page.locator('.pick-tile', { hasText: 'Touched, Feline' });
	await expect(tile).toHaveClass(/pick-tile-blocked/);
	await page.keyboard.press('Escape');

	// The picker opened the Assets tab; the level is set on Details.
	await page.locator(`${CHAR_AREA} [data-tour="char-tab-details"]`).click();
	await pick(page, 'touched', 'Prime');
	await page.locator(`${CHAR_AREA} [data-tour="char-add-asset"]`).click();
	await expect(page.locator('.pick-tile', { hasText: 'Touched, Feline' })).not.toHaveClass(
		/pick-tile-blocked/,
	);
});

test('Lowering Touched unmarks the abilities above the new limit', async ({ page }) => {
	await seedCharacter('Thirda', undefined, {
		fields: { touched: 'third', touchedAnimal: 'Lynx' },
		assets: [{ assetId: 'path/yrt-touched-feline', abilities: [true, true, true] }],
	});
	await openSheet(page, 'Thirda');
	// The chit is named for the animal.
	await page.locator(`${CHAR_AREA} [data-tour="char-tab-assets"]`).click();
	await expect(page.locator('.ca-asset-card').first()).toContainText('Lynx');
	await page.locator(`${CHAR_AREA} [data-tour="char-tab-details"]`).click();

	await pick(page, 'touched', 'Prime');
	await expect(page.locator('.log-entry').first()).toContainText(
		'Touched: Third → Prime; unmarked 2 abilities on Touched, Feline',
	);
});

test('A Pure character keeps a Touched asset faded, and can still delete it', async ({ page }) => {
	await seedCharacter('Purged', undefined, {
		fields: { touched: 'pure' },
		assets: [{ assetId: 'path/yrt-touched-feline', abilities: [false, false, false] }],
	});
	await openSheet(page, 'Purged');
	await page.locator(`${CHAR_AREA} [data-tour="char-tab-assets"]`).click();
	const chit = page.locator('.ca-asset-card', { hasText: 'Touched, Feline' });
	await expect(chit).toHaveClass(/ca-asset-card--blocked/);
	await chit.locator('.ca-asset-card-main').click();
	await expect(page.locator('.asset-blocked')).toContainText(
		"Can't be used: Requires Touched: Prime or higher",
	);
	await page.getByRole('button', { name: 'Delete Touched, Feline' }).click();
	await page.locator('.confirm-modal').getByRole('button', { name: 'DELETE' }).click();
	await expect(page.locator('.ca-asset-card', { hasText: 'Touched, Feline' })).toHaveCount(0);
});

test("An older character's level, animal and origin move into its fields", async ({ page }) => {
	await seedCharacter('Oldie', undefined, {
		background: '**Region of origin:** Oray Hills\n\nGrew up near the hills.',
		assets: [
			{
				assetId: 'path/yrt-touched-lupine',
				abilities: [true, false, false],
				customValues: { touchedLevel: 'second', animalName: 'Wolf' },
			},
		],
	});
	await openSheet(page, 'Oldie');
	await expect(field(page, 'origin').locator('.bui-select-trigger')).toHaveText('Oray Hills');
	await expect(field(page, 'touched').locator('.bui-select-trigger')).toHaveText('Second');
	await expect(field(page, 'touchedAnimal').locator('input')).toHaveValue('Wolf');
	await expect(field(page, 'religion').locator('.bui-select-trigger')).toHaveText('—');
	// The region moved into the field, so the background no longer repeats it.
	await page.locator(`${CHAR_AREA} [data-tour="char-tab-background"]`).click();
	await expect(page.locator('[data-tour="char-bio"]')).toContainText('Grew up near the hills.');
	await expect(page.locator('[data-tour="char-bio"]')).not.toContainText('Region of origin');
});
