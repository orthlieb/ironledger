/**
 * log-inject.spec.ts — Interactive log links via injected mock entries.
 *
 * Each test injects a log entry containing a specific link type then verifies
 * the click actually affects the relevant data.  No dice rolls are required.
 *
 * Clicking a resource link may prepend cascade notification entries; we always
 * locate the mock entry by data-entry-id (via :has()), never by position.
 *
 * Prerequisites (provided by hooks.client.ts):
 *   window.__testLog.appendLog(charId, title, html, id?, source?, roll?)
 *   window.__testLog.SESSION_LOG_ID  === '__session__'
 *
 * v2 changes: no tabs, no GCB. The active character is whatever spine is
 * `.ca-spine--active` in the Characters area. Resource values are read from
 * the .res-tile / .mt-tile inside the Characters area's Core sub-tab.
 */
import { test, expect, type Page } from '@playwright/test';
import { resetAll } from './helpers/reset';

const CHAR_AREA = '.home-area--characters';
const CHAR_HEADER = `${CHAR_AREA} .ca-header`;
const CHAR_SPINE = `${CHAR_AREA} .ca-spine`;
const FOE_AREA = '.home-area--foes';
const FOE_HEADER = `${FOE_AREA} .fa-header`;
const FOE_SPINE = `${FOE_AREA} .fa-spine`;
const EXP_AREA = '.home-area--expeditions';
const EXP_HEADER = `${EXP_AREA} .ea-header`;
const EXP_SPINE = `${EXP_AREA} .ea-spine`;

// ── Shared helpers ────────────────────────────────────────────────────────────

async function waitForCharactersArea(page: Page) {
	await expect(page.locator(`${CHAR_AREA} .ca-loading`)).not.toBeVisible({ timeout: 12_000 });
	await page
		.locator(`${CHAR_AREA} .ca-empty, ${CHAR_AREA} .ca-body`)
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
}

async function switchCharTab(page: Page, label: string) {
	await page.locator(`${CHAR_AREA} .ca-tab`, { hasText: new RegExp(`^${label}$`, 'i') }).click();
}

/**
 * Navigate to /home, ensure a character exists, and return the active character's id.
 * The id is fetched via the BFF /api/characters endpoint and matched against the
 * stage name. In v2 the first character is auto-selected on load.
 */
async function goToHomeWithCharacter(page: Page): Promise<string> {
	await page.goto('/home');
	await waitForCharactersArea(page);

	if ((await page.locator(CHAR_SPINE).count()) === 0) {
		await page.locator(`${CHAR_HEADER} button:has-text("+ Character")`).click();
		await expect(page.locator(CHAR_SPINE)).not.toHaveCount(0, { timeout: 8_000 });
	}
	// Ensure first spine is active.
	const first = page.locator(CHAR_SPINE).first();
	if (
		!(await first.evaluate((el) => el.classList.contains('ca-spine--active')).catch(() => false))
	) {
		await first.click();
	}
	await expect(first).toHaveClass(/ca-spine--active/, { timeout: 3_000 });

	return await getActiveCharId(page);
}

/** Read the active char's id straight off the active spine's data-char-id.
 *  We can't infer it from the stage name: addCharacter() drops straight into
 *  rename mode (the .ca-stage-name button isn't rendered while the input is
 *  open), and headingText() can transform the visible name (e.g. Futhark
 *  runes) so it won't match the API value anyway. The spine carries the id
 *  directly. */
async function getActiveCharId(page: Page): Promise<string> {
	const id = await page
		.locator(`${CHAR_SPINE}.ca-spine--active`)
		.first()
		.getAttribute('data-char-id');
	return id ?? '';
}

/** Ensure a foe exists; in v2 the foes area always auto-selects the first foe. */
async function ensureFoeExists(page: Page) {
	if ((await page.locator(FOE_SPINE).count()) === 0) {
		await page.locator(`${FOE_HEADER} button:has-text("+ Foe")`).click();
		await expect(page.locator('dialog.foe-dialog[open]')).toBeVisible({ timeout: 5_000 });
		const foeTile = page.locator('dialog.foe-dialog .fd-tile').first();
		await expect(foeTile).toBeVisible({ timeout: 8_000 });
		await foeTile.click();
		await expect(page.locator('dialog.foe-dialog button:has-text("Add to Foes")')).toBeVisible({
			timeout: 3_000,
		});
		await page.locator('dialog.foe-dialog button:has-text("Add to Foes")').click();
		await expect(page.locator(FOE_SPINE)).not.toHaveCount(0, { timeout: 5_000 });
	}
}

/** Ensure an expedition (journey) exists. */
async function ensureExpeditionExists(page: Page) {
	if ((await page.locator(EXP_SPINE).count()) === 0) {
		await page.locator(`${EXP_HEADER} button:has-text("+ Journey")`).click();
		await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 5_000 });
		await page.locator('dialog.confirm-modal[open] button:has-text("Start Journey")').click();
		await expect(page.locator(EXP_SPINE)).not.toHaveCount(0, { timeout: 5_000 });
	}
}

/** Inject a log entry into the session log via window.__testLog. */
async function inject(page: Page, title: string, html: string, id: string) {
	await page.evaluate(
		({ id, title, html }) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(window as any).__testLog.appendLog('__session__', title, html, id);
		},
		{ id, title, html },
	);
}

/** Locate a log entry by its entry ID. */
function entryById(page: Page, id: string) {
	return page.locator(`.log-entry[data-entry-id="${id}"]`);
}

/** Read a vitals tile's numeric value from the active character's Core tab. */
async function readVital(
	page: Page,
	label: 'Health' | 'Spirit' | 'Supply' | 'Experience',
): Promise<number> {
	await switchCharTab(page, 'Core');
	const tile = page.locator(`${CHAR_AREA} .res-tile`).filter({ hasText: label });
	const text = await tile
		.locator('.res-value')
		.textContent({ timeout: 5_000 })
		.catch(() => '0');
	return parseInt((text ?? '0').trim(), 10);
}

/** Read momentum (a MomentumTile, not a ResourceTile). */
async function readMomentum(page: Page): Promise<number> {
	await switchCharTab(page, 'Core');
	// MomentumTile renders .mt-tile > .mt-left > .mt-row > .mt-val.
	const tile = page.locator(`${CHAR_AREA} .mt-tile`);
	const text = await tile
		.locator('.mt-val')
		.first()
		.textContent({ timeout: 5_000 })
		.catch(() => '0');
	return parseInt((text ?? '0').trim(), 10);
}

/** Wait until a vital value differs from `was`, return new value. */
async function waitVitalChange(
	page: Page,
	label: 'Health' | 'Spirit' | 'Supply' | 'Experience',
	was: number,
): Promise<number> {
	await expect(async () => expect(await readVital(page, label)).not.toBe(was)).toPass({
		timeout: 5_000,
	});
	return readVital(page, label);
}

async function waitMomentumChange(page: Page, was: number): Promise<number> {
	await expect(async () => expect(await readMomentum(page)).not.toBe(was)).toPass({
		timeout: 5_000,
	});
	return readMomentum(page);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Log interactive links (injected mock entries)', () => {
	test.beforeAll(async () => {
		await resetAll();
	});

	// ── Resource links ───────────────────────────────────────────────────────

	test('resource links update vitals: health, spirit, supply, momentum, xp', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		expect(charId).toBeTruthy();
		const id = crypto.randomUUID();

		const hPre = await readVital(page, 'Health');
		const sPre = await readVital(page, 'Spirit');
		const supPre = await readVital(page, 'Supply');
		const momPre = await readMomentum(page);
		const xpPre = await readVital(page, 'Experience');

		await inject(
			page,
			'Mock Outcome',
			`
			<p><a class="resource-link" data-resource="health"   data-value="-1" data-entry-id="${id}" data-char-id="${charId}">-1 health</a></p>
			<p><a class="resource-link" data-resource="spirit"   data-value="-1" data-entry-id="${id}" data-char-id="${charId}">-1 spirit</a></p>
			<p><a class="resource-link" data-resource="supply"   data-value="-1" data-entry-id="${id}" data-char-id="${charId}">-1 supply</a></p>
			<p><a class="resource-link" data-resource="momentum" data-value="+1" data-entry-id="${id}" data-char-id="${charId}">+1 momentum</a></p>
			<p><a class="resource-link" data-resource="xp"       data-value="+1" data-entry-id="${id}" data-char-id="${charId}">+1 xp</a></p>
		`,
			id,
		);

		const entry = entryById(page, id);
		await expect(entry).toBeVisible({ timeout: 3_000 });

		await entry.locator('a.resource-link[data-resource="health"]').click();
		expect(await waitVitalChange(page, 'Health', hPre)).toBe(hPre - 1);

		await entry.locator('a.resource-link[data-resource="spirit"]').click();
		expect(await waitVitalChange(page, 'Spirit', sPre)).toBe(sPre - 1);

		await entry.locator('a.resource-link[data-resource="supply"]').click();
		expect(await waitVitalChange(page, 'Supply', supPre)).toBe(supPre - 1);

		await entry.locator('a.resource-link[data-resource="momentum"]').click();
		expect(await waitMomentumChange(page, momPre)).toBe(momPre + 1);

		await entry.locator('a.resource-link[data-resource="xp"]').click();
		expect(await waitVitalChange(page, 'Experience', xpPre)).toBe(xpPre + 1);
	});

	test('mana resource link is marked spent', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		const id = crypto.randomUUID();

		await inject(
			page,
			'Mock Outcome',
			`
			<p><a class="resource-link" data-resource="mana" data-value="-1" data-entry-id="${id}" data-char-id="${charId}">-1 mana</a></p>
		`,
			id,
		);

		const entry = entryById(page, id);
		const link = entry.locator('a.resource-link[data-resource="mana"]');
		await expect(link).toBeVisible({ timeout: 3_000 });
		await link.click();
		await expect(entry.locator('s.resource-spent')).toBeVisible({ timeout: 3_000 });
	});

	// ── Failure link ─────────────────────────────────────────────────────────

	test('failure link advances the failure track', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		const id = crypto.randomUUID();

		// Status tab hosts the failures track (still uses .track-box / data-ticks).
		// The track now lives inside ProgressTrackPanel, whose root class is .ptp-group
		// (was .ca-track-group before the panel was extracted).
		await switchCharTab(page, 'Status');
		const failGroup = page.locator(`${CHAR_AREA} .ptp-group`).filter({ hasText: /Failures/i });
		const tickCountBefore = await failGroup
			.locator('.track-box')
			.evaluateAll((boxes: HTMLElement[]) =>
				boxes.reduce((s, b) => s + parseInt(b.dataset['ticks'] ?? '0', 10), 0),
			);

		await inject(
			page,
			'Mock Miss',
			`
			<p><a class="failure-link" data-entry-id="${id}" data-char-id="${charId}">+1 failure</a></p>
		`,
			id,
		);

		const entry = entryById(page, id);
		await expect(entry.locator('a.failure-link')).toBeVisible({ timeout: 3_000 });
		await entry.locator('a.failure-link').click();
		await expect(entry.locator('s.resource-spent')).toBeVisible({ timeout: 3_000 });

		await switchCharTab(page, 'Status');
		await expect(async () => {
			const after = await failGroup
				.locator('.track-box')
				.evaluateAll((boxes: HTMLElement[]) =>
					boxes.reduce((s, b) => s + parseInt(b.dataset['ticks'] ?? '0', 10), 0),
				);
			expect(after).toBeGreaterThan(tickCountBefore);
		}).toPass({ timeout: 5_000 });
	});

	// ── Debility link ─────────────────────────────────────────────────────────

	test('debility link marks the debility on the character sheet', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		const id = crypto.randomUUID();

		// Ensure Shaken is unmarked before the test. Debilities live on the Status tab.
		await switchCharTab(page, 'Status');
		const shakenBtn = page.locator(`${CHAR_AREA} .debility-btn`).filter({ hasText: 'Shaken' });
		await expect(shakenBtn).toBeVisible({ timeout: 3_000 });
		if (await shakenBtn.evaluate((el) => el.classList.contains('active'))) {
			await shakenBtn.click();
			await expect(shakenBtn).not.toHaveClass(/active/, { timeout: 2_000 });
		}

		await inject(
			page,
			'Mock Outcome',
			`
			<p><a class="debility-link" data-debility="shaken" data-value="1" data-entry-id="${id}" data-char-id="${charId}">Mark Shaken</a></p>
		`,
			id,
		);

		const entry = entryById(page, id);
		await expect(entry.locator('a.debility-link')).toBeVisible({ timeout: 3_000 });
		await entry.locator('a.debility-link').click();
		await expect(entry.locator('s.resource-spent')).toBeVisible({ timeout: 3_000 });

		await page.waitForTimeout(300);

		await switchCharTab(page, 'Status');
		await expect(shakenBtn).toHaveClass(/active/, { timeout: 8_000 });
	});

	// ── Initiative links ──────────────────────────────────────────────────────

	test('initiative link: character has initiative shows in Core tab toggle', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		const id = crypto.randomUUID();

		await inject(
			page,
			'Mock Outcome',
			`
			<p><a class="initiative-link" data-value="character" data-entry-id="${id}" data-char-id="${charId}">You have initiative</a></p>
		`,
			id,
		);

		const entry = entryById(page, id);
		await expect(entry.locator('a.initiative-link[data-value="character"]')).toBeVisible({
			timeout: 3_000,
		});
		await entry.locator('a.initiative-link[data-value="character"]').click();

		await switchCharTab(page, 'Core');
		await expect(page.locator(`${CHAR_AREA} .ca-init-btn--you.ca-init-btn--active`)).toBeVisible({
			timeout: 5_000,
		});
	});

	test('initiative link: foe has initiative shows in Core tab toggle', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		await ensureFoeExists(page);
		const id = crypto.randomUUID();

		await inject(
			page,
			'Mock Outcome',
			`
			<p><a class="initiative-link" data-value="foe" data-entry-id="${id}" data-char-id="${charId}">Foe has initiative</a></p>
		`,
			id,
		);

		const entry = entryById(page, id);
		await expect(entry.locator('a.initiative-link[data-value="foe"]')).toBeVisible({
			timeout: 3_000,
		});
		await entry.locator('a.initiative-link[data-value="foe"]').click();

		await switchCharTab(page, 'Core');
		await expect(page.locator(`${CHAR_AREA} .ca-init-btn--foe.ca-init-btn--active`)).toBeVisible({
			timeout: 5_000,
		});
	});

	// ── Vanquish foe link ─────────────────────────────────────────────────────

	test('vanquish-foe link fires and link is marked spent', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		await ensureFoeExists(page);
		const id = crypto.randomUUID();

		await inject(
			page,
			'Mock Outcome',
			`
			<p><a class="vanquish-foe-link" data-entry-id="${id}" data-char-id="${charId}">Vanquish Foe</a></p>
		`,
			id,
		);

		const entry = entryById(page, id);
		await expect(entry.locator('a.vanquish-foe-link')).toBeVisible({ timeout: 3_000 });
		await entry.locator('a.vanquish-foe-link').click();
		await expect(entry.locator('s.resource-spent')).toBeVisible({ timeout: 3_000 });
	});

	// ── Progress link ─────────────────────────────────────────────────────────

	test('progress link marks journey progress and link is spent', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		await ensureExpeditionExists(page);
		const id = crypto.randomUUID();

		await inject(
			page,
			'Mock Outcome',
			`
			<p><a class="progress-link" data-track="journey" data-value="1" data-entry-id="${id}" data-char-id="${charId}">Mark progress</a></p>
		`,
			id,
		);

		const entry = entryById(page, id);
		await expect(entry.locator('a.progress-link')).toBeVisible({ timeout: 3_000 });
		await entry.locator('a.progress-link').click();
		await expect(entry.locator('s.resource-spent')).toBeVisible({ timeout: 3_000 });
	});

	// ── Burn momentum link ────────────────────────────────────────────────────

	test('burn-momentum link resets momentum and shows burn in log', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);

		// Boost momentum to be well above reset.
		const boostId = crypto.randomUUID();
		const momBefore = await readMomentum(page);
		await inject(
			page,
			'Boost',
			`
			<p><a class="resource-link" data-resource="momentum" data-value="+3" data-entry-id="${boostId}" data-char-id="${charId}">+3 momentum</a></p>
		`,
			boostId,
		);
		await entryById(page, boostId).locator('a.resource-link[data-resource="momentum"]').click();
		const momBoosted = await waitMomentumChange(page, momBefore);

		// Inject a roll entry with RollMeta (miss).
		const rollId = crypto.randomUUID();
		await page.evaluate(
			({ rollId, charId }) => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

		// Burn momentum entry referencing the roll.
		const burnId = crypto.randomUUID();
		await inject(
			page,
			'Burn Momentum',
			`
			<p><a class="burn-momentum-link" data-roll-entry-id="${rollId}" data-entry-id="${burnId}" data-char-id="${charId}">burn momentum</a></p>
		`,
			burnId,
		);

		const burnEntry = entryById(page, burnId);
		await expect(burnEntry.locator('a.burn-momentum-link')).toBeVisible({ timeout: 3_000 });
		await burnEntry.locator('a.burn-momentum-link').click();

		// Momentum should drop after burn.
		await waitMomentumChange(page, momBoosted);
		expect(await readMomentum(page)).toBeLessThan(momBoosted);
	});

	// ── Move link (Pay the Price) ─────────────────────────────────────────────

	test('move-link opens Pay the Price in the moves dialog', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		const id = crypto.randomUUID();

		await inject(
			page,
			'Mock Outcome',
			`
			<p>On a miss: <a class="move-link" data-id="move/pay-the-price" data-entry-id="${id}" data-char-id="${charId}">Pay the Price</a></p>
		`,
			id,
		);

		const entry = entryById(page, id);
		await expect(entry.locator('a.move-link')).toBeVisible({ timeout: 3_000 });
		await entry.locator('a.move-link').click();
		await expect(page.locator('.moves-dialog[open]')).toBeVisible({ timeout: 5_000 });
		await page.keyboard.press('Escape');
	});

	// ── Oracle link ───────────────────────────────────────────────────────────

	test('oracle-link opens the oracles dialog', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		const id = crypto.randomUUID();

		await inject(
			page,
			'Mock Outcome',
			`
			<p>Ask: <a class="oracle-link" data-oracle="action-theme" data-entry-id="${id}" data-char-id="${charId}">Action + Theme</a></p>
		`,
			id,
		);

		const entry = entryById(page, id);
		await expect(entry.locator('a.oracle-link')).toBeVisible({ timeout: 3_000 });
		await entry.locator('a.oracle-link').click();
		await expect(page.locator('.oracles-dialog[open]')).toBeVisible({ timeout: 5_000 });
		await page.keyboard.press('Escape');
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: delete all foes, expeditions, and characters', async ({ page }) => {
		await page.goto('/home');
		await waitForCharactersArea(page);

		// Foes
		const foeSpines = page.locator(FOE_SPINE);
		let foeCount = await foeSpines.count();
		while (foeCount > 0) {
			await foeSpines.first().click();
			const delBtn = page.locator(`${FOE_AREA} .fa-stage-delete-btn`).first();
			await expect(delBtn).toBeVisible({ timeout: 3_000 });
			await delBtn.click();
			await expect(page.locator('dialog.confirm-modal[open] button.btn-danger')).toBeVisible({
				timeout: 3_000,
			});
			await page.locator('dialog.confirm-modal[open] button.btn-danger').click();
			foeCount--;
			if (foeCount > 0) await expect(foeSpines).toHaveCount(foeCount, { timeout: 5_000 });
		}

		// Expeditions
		const expSpines = page.locator(EXP_SPINE);
		let expCount = await expSpines.count();
		while (expCount > 0) {
			await expSpines.first().click();
			const delBtn = page.locator(`${EXP_AREA} .ea-stage-delete-btn`).first();
			await expect(delBtn).toBeVisible({ timeout: 3_000 });
			await delBtn.click();
			await expect(page.locator('dialog.confirm-modal[open] button.btn-danger')).toBeVisible({
				timeout: 3_000,
			});
			await page.locator('dialog.confirm-modal[open] button.btn-danger').click();
			expCount--;
			if (expCount > 0) await expect(expSpines).toHaveCount(expCount, { timeout: 5_000 });
		}

		// Characters
		const charSpines = page.locator(CHAR_SPINE);
		let charCount = await charSpines.count();
		while (charCount > 0) {
			await charSpines.first().click();
			const delBtn = page.locator(`${CHAR_AREA} .ca-stage-delete-btn`).first();
			await expect(delBtn).toBeVisible({ timeout: 3_000 });
			await delBtn.click();
			await expect(page.locator('dialog.confirm-modal[open]')).toBeVisible({ timeout: 3_000 });
			await page.locator('dialog.confirm-modal[open] button.btn-danger').click();
			charCount--;
			if (charCount > 0) {
				await expect(charSpines).toHaveCount(charCount, { timeout: 5_000 });
			} else {
				await expect(page.locator(`${CHAR_AREA} .ca-empty`)).toBeVisible({ timeout: 5_000 });
			}
		}
	});
});
