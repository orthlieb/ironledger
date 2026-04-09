/**
 * log-inject.spec.ts — Interactive log links via injected mock entries.
 *
 * Each test injects a log entry containing a specific link type then verifies
 * the click actually affects the relevant data.  No dice rolls are required.
 *
 * Clicking a resource link may prepend cascade notification entries; we always
 * locate the mock entry by data-entry-id (via :has()), never by position.
 *
 * Prerequisites (provided by hooks.client.ts, DEV mode only):
 *   window.__testLog.appendLog(charId, title, html, id?, source?, roll?)
 *   window.__testLog.SESSION_LOG_ID  === '__session__'
 */
import { test, expect, type Page } from '@playwright/test';

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Navigate to the adventure tab with a character selected in the GCB.
 * Returns the active character's UUID (from data-char-id on the char-card).
 */
async function goToAdventure(page: Page): Promise<string> {
	await page.goto('/home');
	await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8000 });

	// Characters tab — ensure one exists and is selected
	await page.click('.tab-btn[data-tab="characters"]');
	await page.locator('.char-list--characters > .char-card, .empty-tab').first()
		.waitFor({ timeout: 8000, state: 'attached' });

	const cards = page.locator('.char-list--characters > .char-card');
	if (await cards.count() === 0) {
		await page.click('.char-toolbar button.btn-primary');
		await expect(page.locator('.char-card--active')).toBeVisible({ timeout: 5000 });
	} else {
		await cards.first().click();
	}
	const charId = await page.locator('.char-card--active').getAttribute('data-char-id') ?? '';

	// Adventure tab
	await page.click('.tab-btn[data-tab="adventure"]');
	await expect(page.locator('.adventure-gcb')).toBeVisible({ timeout: 5000 });

	// Select character in GCB tile if needed
	const charTileBtn = page.locator('.gc-tile').first().locator('.gc-tile-btn');
	await expect(charTileBtn).toBeVisible({ timeout: 3000 });
	const tileText = await charTileBtn.textContent().catch(() => '');
	if (!tileText?.trim() || tileText.includes('No character') || tileText === '') {
		await charTileBtn.click();
		await expect(page.locator('.gc-popover').first()).toBeVisible({ timeout: 2000 });
		const item = page.locator('.gc-popover .gc-popover-item:not([class*="None"])').first();
		if (await item.isVisible({ timeout: 1000 }).catch(() => false)) await item.click();
		else await page.keyboard.press('Escape');
	}

	return charId;
}

/** Ensure a foe exists and is selected in the GCB foe tile (nth(1)). */
async function ensureFoeInGCB(page: Page) {
	const foeTileBtn = page.locator('.gc-tile').nth(1).locator('.gc-tile-btn');
	const tileText = await foeTileBtn.textContent().catch(() => '');
	if (tileText?.trim() && !tileText.includes('No') && !tileText.includes('(None)') && !tileText.includes('Foe')) return;

	// Add a foe if none exist
	await page.click('.tab-btn[data-tab="foes"]');
	await expect(page.locator('.char-toolbar button:has-text("+ Foe")')).toBeVisible({ timeout: 5000 });
	if (await page.locator('.char-list--foes .char-card').count() === 0) {
		await page.click('.char-toolbar button.btn-primary');
		await expect(page.locator('dialog.foe-dialog[open]')).toBeVisible({ timeout: 5000 });
		const foeTile = page.locator('dialog.foe-dialog .fd-tile').first();
		await expect(foeTile).toBeVisible({ timeout: 8000 });
		await foeTile.click();
		await expect(page.locator('dialog.foe-dialog button:has-text("Add to Foes")')).toBeVisible({ timeout: 3000 });
		await page.locator('dialog.foe-dialog button:has-text("Add to Foes")').click();
	}

	await page.click('.tab-btn[data-tab="adventure"]');
	await expect(page.locator('.adventure-gcb')).toBeVisible({ timeout: 5000 });
	await foeTileBtn.click();
	await expect(page.locator('.gc-popover').first()).toBeVisible({ timeout: 2000 });
	const foeItem = page.locator('.gc-popover .gc-popover-item:not([class*="None"])').first();
	if (await foeItem.isVisible({ timeout: 1000 }).catch(() => false)) await foeItem.click();
	else await page.keyboard.press('Escape');
}

/** Ensure a journey exists and is selected in the GCB expedition tile (nth(2)). */
async function ensureExpeditionInGCB(page: Page) {
	const expTileBtn = page.locator('.gc-tile').nth(2).locator('.gc-tile-btn');
	const tileText = await expTileBtn.textContent().catch(() => '');
	if (tileText?.trim() && !tileText.includes('No') && !tileText.includes('(None)') && !tileText.includes('Expedition')) return;

	await page.click('.tab-btn[data-tab="expeditions"]');
	await expect(page.locator('.char-toolbar button:has-text("+ Journey")')).toBeVisible({ timeout: 5000 });
	if (await page.locator('.char-list--expeditions .char-card').count() === 0) {
		await page.click('.char-toolbar button:has-text("+ Journey")');
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5000 });
		await page.locator('dialog.confirm-modal[open] button:has-text("Start Journey")').click();
		await expect(page.locator('.char-list--expeditions .char-card')).not.toHaveCount(0, { timeout: 5000 });
	}

	await page.click('.tab-btn[data-tab="adventure"]');
	await expect(page.locator('.adventure-gcb')).toBeVisible({ timeout: 5000 });
	await expTileBtn.click();
	await expect(page.locator('.gc-popover').first()).toBeVisible({ timeout: 2000 });
	const expItem = page.locator('.gc-popover .gc-popover-item:not([class*="None"])').first();
	if (await expItem.isVisible({ timeout: 1000 }).catch(() => false)) await expItem.click();
	else await page.keyboard.press('Escape');
}

/** Inject a log entry into the session log via window.__testLog. */
async function inject(page: Page, title: string, html: string, id: string) {
	await page.evaluate(
		({ id, title, html }) => {
			(window as any).__testLog.appendLog('__session__', title, html, id);
		},
		{ id, title, html },
	);
}

/** Locate a log entry by its entry ID. */
function entryById(page: Page, id: string) {
	// Clicking a link may replace it with <s class="resource-spent">, dropping
	// the data-entry-id that previously lived on the link.  The .log-entry
	// wrapper carries data-entry-id so it stays locatable regardless of state.
	return page.locator(`.log-entry[data-entry-id="${id}"]`);
}

/** Read numeric value from a GCB resource chip. */
async function chip(page: Page, resource: string): Promise<number> {
	const text = await page
		.locator(`.gc-chip--resource[title="${resource}"] .gc-chip-value`)
		.textContent()
		.catch(() => '0');
	return parseInt(text?.trim() ?? '0', 10);
}

/** Wait until a GCB chip value differs from `was`, return new value. */
async function waitChipChange(page: Page, resource: string, was: number): Promise<number> {
	await expect(async () => expect(await chip(page, resource)).not.toBe(was)).toPass({ timeout: 5000 });
	return chip(page, resource);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Log interactive links (injected mock entries)', () => {

	// ── Resource links ───────────────────────────────────────────────────────

	test('resource links update GCB chips: health, spirit, supply, momentum, xp', async ({ page }) => {
		const charId = await goToAdventure(page);
		const id = crypto.randomUUID();

		const hPre   = await chip(page, 'health');
		const sPre   = await chip(page, 'spirit');
		const supPre = await chip(page, 'supply');
		const momPre = await chip(page, 'momentum');
		const xpPre  = await chip(page, 'xp');

		await inject(page, 'Mock Outcome', `
			<p><a class="resource-link" data-resource="health"   data-value="-1" data-entry-id="${id}" data-char-id="${charId}">-1 health</a></p>
			<p><a class="resource-link" data-resource="spirit"   data-value="-1" data-entry-id="${id}" data-char-id="${charId}">-1 spirit</a></p>
			<p><a class="resource-link" data-resource="supply"   data-value="-1" data-entry-id="${id}" data-char-id="${charId}">-1 supply</a></p>
			<p><a class="resource-link" data-resource="momentum" data-value="+1" data-entry-id="${id}" data-char-id="${charId}">+1 momentum</a></p>
			<p><a class="resource-link" data-resource="xp"       data-value="+1" data-entry-id="${id}" data-char-id="${charId}">+1 xp</a></p>
		`, id);

		const entry = entryById(page, id);
		await expect(entry).toBeVisible({ timeout: 3000 });

		// Click each link and wait for its chip to change before clicking next;
		// each click may prepend a cascade notification, but entryById stays anchored.
		await entry.locator('a.resource-link[data-resource="health"]').click();
		expect(await waitChipChange(page, 'health', hPre)).toBe(hPre - 1);

		await entry.locator('a.resource-link[data-resource="spirit"]').click();
		expect(await waitChipChange(page, 'spirit', sPre)).toBe(sPre - 1);

		await entry.locator('a.resource-link[data-resource="supply"]').click();
		expect(await waitChipChange(page, 'supply', supPre)).toBe(supPre - 1);

		await entry.locator('a.resource-link[data-resource="momentum"]').click();
		expect(await waitChipChange(page, 'momentum', momPre)).toBe(momPre + 1);

		await entry.locator('a.resource-link[data-resource="xp"]').click();
		expect(await waitChipChange(page, 'xp', xpPre)).toBe(xpPre + 1);
	});

	test('mana resource link is marked spent', async ({ page }) => {
		const charId = await goToAdventure(page);
		const id = crypto.randomUUID();

		await inject(page, 'Mock Outcome', `
			<p><a class="resource-link" data-resource="mana" data-value="-1" data-entry-id="${id}" data-char-id="${charId}">-1 mana</a></p>
		`, id);

		const entry = entryById(page, id);
		const link = entry.locator('a.resource-link[data-resource="mana"]');
		await expect(link).toBeVisible({ timeout: 3000 });
		await link.click();
		await expect(entry.locator('s.resource-spent')).toBeVisible({ timeout: 3000 });
	});

	// ── Failure link ─────────────────────────────────────────────────────────

	test('failure link advances the failure track', async ({ page }) => {
		const charId = await goToAdventure(page);
		const id = crypto.randomUUID();

		// Read current failures tally from character sheet
		await page.click('.tab-btn[data-tab="characters"]');
		const activeCard = page.locator('.char-card--active').first();
		const failGroup = activeCard.locator('.track-group').filter({ hasText: /Failures/i });
		// Count rendered tick <line>s across the failures ProgressTrack — each line = 1 tick.
		const tickCountBefore = await failGroup.locator('.track-box svg line').count();

		await page.click('.tab-btn[data-tab="adventure"]');
		await expect(page.locator('.adventure-gcb')).toBeVisible({ timeout: 5000 });

		await inject(page, 'Mock Miss', `
			<p><a class="failure-link" data-entry-id="${id}" data-char-id="${charId}">+1 failure</a></p>
		`, id);

		const entry = entryById(page, id);
		await expect(entry.locator('a.failure-link')).toBeVisible({ timeout: 3000 });
		await entry.locator('a.failure-link').click();
		await expect(entry.locator('s.resource-spent')).toBeVisible({ timeout: 3000 });

		// Verify failure tick count increased in character sheet
		await page.click('.tab-btn[data-tab="characters"]');
		await expect(activeCard).toBeVisible({ timeout: 3000 });
		await expect(failGroup.locator('.track-box svg line')).not.toHaveCount(tickCountBefore, { timeout: 5000 });
		const tickCountAfter = await failGroup.locator('.track-box svg line').count();
		expect(tickCountAfter).toBeGreaterThan(tickCountBefore);
	});

	// ── Debility link ─────────────────────────────────────────────────────────

	test('debility link marks the debility on the character sheet', async ({ page }) => {
		const charId = await goToAdventure(page);
		const id = crypto.randomUUID();

		// Ensure Shaken is unmarked before the test
		await page.click('.tab-btn[data-tab="characters"]');
		const activeCard = page.locator('.char-card--active').first();
		const shakenBtn = activeCard.locator('.debility-btn').filter({ hasText: 'Shaken' });
		await expect(shakenBtn).toBeVisible({ timeout: 3000 });
		if (await shakenBtn.evaluate(el => el.classList.contains('active'))) {
			await shakenBtn.click();
			await expect(shakenBtn).not.toHaveClass(/active/, { timeout: 2000 });
		}

		await page.click('.tab-btn[data-tab="adventure"]');
		await expect(page.locator('.adventure-gcb')).toBeVisible({ timeout: 5000 });

		await inject(page, 'Mock Outcome', `
			<p><a class="debility-link" data-debility="shaken" data-value="1" data-entry-id="${id}" data-char-id="${charId}">Mark Shaken</a></p>
		`, id);

		const entry = entryById(page, id);
		await expect(entry.locator('a.debility-link')).toBeVisible({ timeout: 3000 });
		await entry.locator('a.debility-link').click();
		await expect(entry.locator('s.resource-spent')).toBeVisible({ timeout: 3000 });

		// Verify Shaken is now marked
		await page.click('.tab-btn[data-tab="characters"]');
		await expect(activeCard).toBeVisible({ timeout: 3000 });
		await expect(shakenBtn).toHaveClass(/active/, { timeout: 5000 });
	});

	// ── Initiative links ──────────────────────────────────────────────────────

	test('initiative link: character has initiative shows GCB badge', async ({ page }) => {
		const charId = await goToAdventure(page);
		const id = crypto.randomUUID();

		await inject(page, 'Mock Outcome', `
			<p><a class="initiative-link" data-value="character" data-entry-id="${id}" data-char-id="${charId}">You have initiative</a></p>
		`, id);

		const entry = entryById(page, id);
		await expect(entry.locator('a.initiative-link[data-value="character"]')).toBeVisible({ timeout: 3000 });
		await entry.locator('a.initiative-link[data-value="character"]').click();
		await expect(page.locator('.gc-init-badge--you')).toBeVisible({ timeout: 5000 });
	});

	test('initiative link: foe has initiative shows GCB badge', async ({ page }) => {
		const charId = await goToAdventure(page);
		await ensureFoeInGCB(page);
		const id = crypto.randomUUID();

		await inject(page, 'Mock Outcome', `
			<p><a class="initiative-link" data-value="foe" data-entry-id="${id}" data-char-id="${charId}">Foe has initiative</a></p>
		`, id);

		const entry = entryById(page, id);
		await expect(entry.locator('a.initiative-link[data-value="foe"]')).toBeVisible({ timeout: 3000 });
		await entry.locator('a.initiative-link[data-value="foe"]').click();
		await expect(page.locator('.gc-init-badge--foe')).toBeVisible({ timeout: 5000 });
	});

	// ── Vanquish foe link ─────────────────────────────────────────────────────

	test('vanquish-foe link fires and link is marked spent', async ({ page }) => {
		const charId = await goToAdventure(page);
		await ensureFoeInGCB(page);
		const id = crypto.randomUUID();

		await inject(page, 'Mock Outcome', `
			<p><a class="vanquish-foe-link" data-entry-id="${id}" data-char-id="${charId}">Vanquish Foe</a></p>
		`, id);

		const entry = entryById(page, id);
		await expect(entry.locator('a.vanquish-foe-link')).toBeVisible({ timeout: 3000 });
		await entry.locator('a.vanquish-foe-link').click();
		await expect(entry.locator('s.resource-spent')).toBeVisible({ timeout: 3000 });
	});

	// ── Progress link ─────────────────────────────────────────────────────────

	test('progress link marks journey progress and link is spent', async ({ page }) => {
		const charId = await goToAdventure(page);
		await ensureExpeditionInGCB(page);
		const id = crypto.randomUUID();

		await inject(page, 'Mock Outcome', `
			<p><a class="progress-link" data-track="journey" data-value="1" data-entry-id="${id}" data-char-id="${charId}">Mark progress</a></p>
		`, id);

		const entry = entryById(page, id);
		await expect(entry.locator('a.progress-link')).toBeVisible({ timeout: 3000 });
		await entry.locator('a.progress-link').click();
		await expect(entry.locator('s.resource-spent')).toBeVisible({ timeout: 3000 });
	});

	// ── Burn momentum link ────────────────────────────────────────────────────

	test('burn-momentum link resets momentum and shows burn in log', async ({ page }) => {
		const charId = await goToAdventure(page);

		// Boost momentum to be well above reset (ensures burn is observable)
		const boostId = crypto.randomUUID();
		const momBefore = await chip(page, 'momentum');
		await inject(page, 'Boost', `
			<p><a class="resource-link" data-resource="momentum" data-value="+3" data-entry-id="${boostId}" data-char-id="${charId}">+3 momentum</a></p>
		`, boostId);
		await entryById(page, boostId).locator('a.resource-link[data-resource="momentum"]').click();
		const momBoosted = await waitChipChange(page, 'momentum', momBefore);

		// Inject a roll entry with RollMeta (miss: actionScore=1 vs c1=1, c2=9)
		const rollId = crypto.randomUUID();
		await page.evaluate(
			({ rollId, charId }) => {
				(window as any).__testLog.appendLog(
					'__session__',
					'Strike',
					'<div class="roll-outcome roll-outcome-miss"><p>Miss — pay the price.</p></div>',
					rollId,
					null,
					{ moveId: 'move/strike', actionScore: 1, c1: 1, c2: 9, charId },
				);
			},
			{ rollId, charId },
		);

		// Inject the burn-momentum entry referencing the roll entry
		const burnId = crypto.randomUUID();
		await inject(page, 'Burn Momentum', `
			<p><a class="burn-momentum-link" data-roll-entry-id="${rollId}" data-entry-id="${burnId}" data-char-id="${charId}">burn momentum</a></p>
		`, burnId);

		const burnEntry = entryById(page, burnId);
		await expect(burnEntry.locator('a.burn-momentum-link')).toBeVisible({ timeout: 3000 });
		await burnEntry.locator('a.burn-momentum-link').click();

		// Momentum should reset to below boosted value
		await waitChipChange(page, 'momentum', momBoosted);
		expect(await chip(page, 'momentum')).toBeLessThan(momBoosted);
	});

	// ── Move link (Pay the Price) ─────────────────────────────────────────────

	test('move-link opens Pay the Price in the moves dialog', async ({ page }) => {
		const charId = await goToAdventure(page);
		const id = crypto.randomUUID();

		await inject(page, 'Mock Outcome', `
			<p>On a miss: <a class="move-link" data-id="move/pay-the-price" data-entry-id="${id}" data-char-id="${charId}">Pay the Price</a></p>
		`, id);

		const entry = entryById(page, id);
		await expect(entry.locator('a.move-link')).toBeVisible({ timeout: 3000 });
		await entry.locator('a.move-link').click();
		await expect(page.locator('.moves-dialog[open]')).toBeVisible({ timeout: 5000 });
		await page.keyboard.press('Escape');
	});

	// ── Oracle link ───────────────────────────────────────────────────────────

	test('oracle-link opens the oracles dialog', async ({ page }) => {
		const charId = await goToAdventure(page);
		const id = crypto.randomUUID();

		await inject(page, 'Mock Outcome', `
			<p>Ask: <a class="oracle-link" data-oracle="action-theme" data-entry-id="${id}" data-char-id="${charId}">Action + Theme</a></p>
		`, id);

		const entry = entryById(page, id);
		await expect(entry.locator('a.oracle-link')).toBeVisible({ timeout: 3000 });
		await entry.locator('a.oracle-link').click();
		await expect(page.locator('.oracles-dialog[open]')).toBeVisible({ timeout: 5000 });
		await page.keyboard.press('Escape');
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: delete all foes, expeditions, and characters', async ({ page }) => {
		await page.goto('/home');
		await expect(page.locator('.loading-tab')).not.toBeVisible({ timeout: 8000 });

		// Foes
		await page.click('.tab-btn[data-tab="foes"]');
		await expect(page.locator('.char-toolbar button:has-text("+ Foe")')).toBeVisible({ timeout: 5000 });
		const foeCards = page.locator('.char-list--foes .char-card');
		let foeCount = await foeCards.count();
		while (foeCount > 0) {
			await foeCards.first().click();
			await expect(page.locator('.fc-del-btn').first()).toBeVisible({ timeout: 3000 });
			await page.locator('.fc-del-btn').first().click();
			await expect(page.locator('dialog.confirm-modal[open] button.btn-danger')).toBeVisible({ timeout: 3000 });
			await page.locator('dialog.confirm-modal[open] button.btn-danger').click();
			foeCount--;
			if (foeCount > 0) await expect(foeCards).toHaveCount(foeCount, { timeout: 5000 });
		}

		// Expeditions
		await page.click('.tab-btn[data-tab="expeditions"]');
		await expect(page.locator('.char-toolbar button:has-text("+ Journey")')).toBeVisible({ timeout: 5000 });
		const expCards = page.locator('.char-list--expeditions .char-card');
		let expCount = await expCards.count();
		while (expCount > 0) {
			await expCards.first().click();
			const delBtn = page.locator('.sc-del-btn, .jc-del-btn').first();
			await expect(delBtn).toBeVisible({ timeout: 3000 });
			await delBtn.click();
			await expect(page.locator('dialog.confirm-modal[open] button.btn-danger')).toBeVisible({ timeout: 3000 });
			await page.locator('dialog.confirm-modal[open] button.btn-danger').click();
			expCount--;
			if (expCount > 0) await expect(expCards).toHaveCount(expCount, { timeout: 5000 });
		}

		// Characters
		await page.click('.tab-btn[data-tab="characters"]');
		await expect(page.locator('.char-toolbar')).toBeVisible({ timeout: 5000 });
		const charCards = page.locator('.char-list--characters > .char-card');
		let charCount = await charCards.count();
		while (charCount > 0) {
			await charCards.first().click();
			await expect(page.locator('.char-card--active button[aria-label="Delete character"]')).toBeVisible({ timeout: 3000 });
			await page.locator('.char-card--active button[aria-label="Delete character"]').click();
			await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 3000 });
			await page.locator('dialog.confirm-modal[open] button.btn-danger').click();
			charCount--;
			if (charCount > 0) {
				await expect(charCards).toHaveCount(charCount, { timeout: 5000 });
			} else {
				await expect(page.locator('.empty-tab')).toBeVisible({ timeout: 5000 });
			}
		}
	});
});
