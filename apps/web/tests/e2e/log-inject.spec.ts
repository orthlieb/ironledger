/**
 * log-inject.spec.ts — Log links via injected mock entries.
 *
 * A link in a log entry is a command (docs/command-language.md → Log links):
 * `<a class="cmd-link" data-cmd="/health--">`, bound to its entry and to the
 * character, foe and expedition it was made for. Each test injects an entry
 * holding command links, bound as the app binds them, then verifies the
 * click affects the right data and the link is struck through. No dice rolls
 * are required.
 *
 * Clicking a resource link may prepend cascade notification entries; we always
 * locate the mock entry by data-entry-id (via :has()), never by position.
 *
 * Also `/health=n` and the like, typed in the command bar: held to the same
 * ranges as the resource links (docs/command-language.md).
 *
 * Prerequisites (provided by hooks.client.ts):
 *   window.__testLog.appendLog(title, html, id?, source?, roll?)
 *
 * v2 changes: no tabs, no GCB. The active character is whatever spine is
 * `.ca-spine--active` in the Characters area. Resource values are read from
 * the .res-tile / .mt-tile inside the Characters area's Core sub-tab.
 */
import { test, expect, type Page } from '@playwright/test';
import { resetAll, resetFoes, resetExpansions, setExpansions } from './helpers/reset';
import { settleHome, ensureCharacter } from './helpers/home';

const CHAR_AREA = '.home-area--characters';
const FOE_AREA = '.home-area--foes';
const EXP_AREA = '.home-area--expeditions';

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
	await settleHome(page);
	await ensureCharacter(page);
	return await getActiveCharId(page);
}

/** The active character's id. In v2 the header combobox no longer carries a
 *  `data-char-id`, so read it from the BFF — these tests keep a single
 *  character, so the first row is the active one. */
async function getActiveCharId(page: Page): Promise<string> {
	return await page.evaluate(async () => {
		const res = await fetch('/api/characters', { credentials: 'include' });
		const list = (await res.json()) as Array<{ id: string }>;
		return Array.isArray(list) && list[0]?.id ? list[0].id : '';
	});
}

/** Live foe count (data-foe-count on the inner .fa-area). */
async function foeCount(page: Page): Promise<number> {
	return Number((await page.locator(`${FOE_AREA} .fa-area`).getAttribute('data-foe-count')) ?? '0');
}

/** Live expedition count (data-exp-count on the header actions). */
async function expCount(page: Page): Promise<number> {
	return Number(
		(await page.locator(`${EXP_AREA} .ea-header-actions`).getAttribute('data-exp-count')) ?? '0',
	);
}

/** Ensure a foe exists; in v2 the foes area always auto-selects the first foe. */
async function ensureFoeExists(page: Page) {
	if ((await foeCount(page)) === 0) {
		await page.locator(`${FOE_AREA} .fa-hdr-combobox`).click();
		await page.locator('.cb-item--action', { hasText: /New foe/i }).click();
		await expect(page.locator('.foe-dialog')).toBeVisible({ timeout: 5_000 });
		const foeTile = page.locator('.foe-dialog .fd-tile').first();
		await expect(foeTile).toBeVisible({ timeout: 8_000 });
		await foeTile.click();
		await expect(page.locator('.foe-dialog button:has-text("Add to Foes")')).toBeVisible({
			timeout: 3_000,
		});
		await page.locator('.foe-dialog button:has-text("Add to Foes")').click();
		await expect(page.locator('.foe-dialog')).not.toBeVisible({ timeout: 5_000 });
	}
}

/** Add one foe (always creates a new encounter — the newest becomes active). */
async function addFoe(page: Page) {
	const before = await foeCount(page);
	await page.locator(`${FOE_AREA} .fa-hdr-combobox`).click();
	await page.locator('.cb-item--action', { hasText: /New foe/i }).click();
	await expect(page.locator('.foe-dialog')).toBeVisible({ timeout: 5_000 });
	const foeTile = page.locator('.foe-dialog .fd-tile').first();
	await expect(foeTile).toBeVisible({ timeout: 8_000 });
	await foeTile.click();
	await page.locator('.foe-dialog button:has-text("Add to Foes")').click();
	await expect(page.locator('.foe-dialog')).not.toBeVisible({ timeout: 5_000 });
	await expect(page.locator(`${FOE_AREA} .fa-area`)).toHaveAttribute(
		'data-foe-count',
		String(before + 1),
		{ timeout: 5_000 },
	);
}

/** Read the persisted foe encounters (id / ticks / vanquished) from the session. */
async function getEncounters(
	page: Page,
): Promise<Array<{ id: string; ticks: number; vanquished?: boolean }>> {
	return await page.evaluate(async () => {
		const res = await fetch('/api/session', { credentials: 'include' });
		const json = (await res.json()) as { encounters?: unknown };
		return Array.isArray(json.encounters)
			? (json.encounters as Array<{ id: string; ticks: number; vanquished?: boolean }>)
			: [];
	});
}

/** Poll the session until at least `count` foes have persisted (creating a foe
 *  is client-side + a 1.5 s debounced save, so the API lags the UI). */
async function encountersWhenAtLeast(page: Page, count: number) {
	let encs = await getEncounters(page);
	for (let i = 0; i < 30 && encs.length < count; i++) {
		await page.waitForTimeout(300);
		encs = await getEncounters(page);
	}
	return encs;
}

/** Ensure an expedition (journey) exists. */
async function ensureExpeditionExists(page: Page) {
	if ((await expCount(page)) === 0) {
		await page.locator(`${EXP_AREA} .ea-hdr-combobox`).click();
		await page.locator('.cb-item--action', { hasText: /New Journey/i }).click();
		await expect(page.locator('.confirm-modal')).toBeVisible({ timeout: 5_000 });
		await page.locator('.confirm-modal .co-input').first().fill('E2E Journey');
		await page.locator('.confirm-modal button:has-text("Create")').click();
		await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
	}
}

/** Inject a log entry into the session log via window.__testLog, as is. */
async function inject(page: Page, title: string, html: string, id: string) {
	await page.evaluate(
		({ id, title, html }) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(window as any).__testLog.appendLog(title, html, id);
		},
		{ id, title, html },
	);
}

/** A command link as content renders one (#lib/commands/links.ts). */
const cmdLink = (label: string, cmd: string) =>
	`<a class="cmd-link" data-cmd="${cmd}">${label}</a>`;

/** Inject an entry whose command links are bound to it and to `bind` (the
 *  character, foe, expedition…), as the app writes a move's outcome. */
async function injectBound(
	page: Page,
	title: string,
	html: string,
	id: string,
	bind: Record<string, string | number | undefined>,
) {
	await page.evaluate(
		({ id, title, html, bind }) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const log = (window as any).__testLog;
			log.appendLog(title, log.bindCommandLinks(html, id, bind), id);
		},
		{ id, title, html, bind },
	);
}

/** An entry's link by its command. */
function linkIn(page: Page, id: string, cmd: string) {
	return entryById(page, id).locator(`a.cmd-link[data-cmd="${cmd}"]`);
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

/** A vitals tile's value, on the active character's Core tab. */
function vitalValue(page: Page, label: 'Health' | 'Spirit' | 'Supply' | 'Experience') {
	return page.locator(`${CHAR_AREA} .res-tile`).filter({ hasText: label }).locator('.res-value');
}

/** Step a vitals tile to `target` with its − / + buttons. */
async function setVital(page: Page, label: 'Health' | 'Spirit' | 'Supply', target: number) {
	await switchCharTab(page, 'Core');
	const tile = page.locator(`${CHAR_AREA} .res-tile`).filter({ hasText: label });
	const value = vitalValue(page, label);
	for (let i = 0; i < 10; i++) {
		const cur = parseInt((await value.textContent()) ?? '0', 10);
		if (cur === target) break;
		const dir = cur < target ? 'Increase' : 'Decrease';
		await tile.locator(`button[aria-label="${dir} ${label}"]`).click();
		await expect(value).not.toHaveText(String(cur));
	}
	await expect(value).toHaveText(String(target));
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

	// ── Value links ─────────────────────────────────────────────────────────

	test('value links update vitals: health, spirit, supply, momentum, xp', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		expect(charId).toBeTruthy();
		const id = crypto.randomUUID();

		const hPre = await readVital(page, 'Health');
		const sPre = await readVital(page, 'Spirit');
		const supPre = await readVital(page, 'Supply');
		const momPre = await readMomentum(page);
		const xpPre = await readVital(page, 'Experience');

		await injectBound(
			page,
			'Mock Outcome',
			`<p>${cmdLink('-1 health', '/health--')}</p>` +
				`<p>${cmdLink('-1 spirit', '/spirit--')}</p>` +
				`<p>${cmdLink('-1 supply', '/supply--')}</p>` +
				`<p>${cmdLink('+1 momentum', '/momentum++')}</p>` +
				`<p>${cmdLink('+1 xp', '/xp++')}</p>`,
			id,
			{ charId },
		);
		await expect(entryById(page, id)).toBeVisible({ timeout: 3_000 });

		await linkIn(page, id, '/health--').click();
		expect(await waitVitalChange(page, 'Health', hPre)).toBe(hPre - 1);
		await linkIn(page, id, '/spirit--').click();
		expect(await waitVitalChange(page, 'Spirit', sPre)).toBe(sPre - 1);
		await linkIn(page, id, '/supply--').click();
		expect(await waitVitalChange(page, 'Supply', supPre)).toBe(supPre - 1);
		await linkIn(page, id, '/momentum++').click();
		expect(await waitMomentumChange(page, momPre)).toBe(momPre + 1);
		await linkIn(page, id, '/xp++').click();
		expect(await waitVitalChange(page, 'Experience', xpPre)).toBe(xpPre + 1);

		// Each is struck through once spent, and says what it did.
		await expect(entryById(page, id).locator('s.resource-spent')).toHaveCount(5);
		await expect(page.locator('.cb-status')).toHaveText(`Experience ${xpPre} → ${xpPre + 1}`);
	});

	test('value links stop at the top of the range, and the log line says so', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		for (const label of ['Health', 'Spirit', 'Supply'] as const) await setVital(page, label, 4);

		const id = crypto.randomUUID();
		await injectBound(
			page,
			'Mock Outcome',
			`<p>${cmdLink('+2 health', '/health+=2')}</p>` +
				`<p>${cmdLink('+2 spirit', '/spirit+=2')}</p>` +
				`<p>${cmdLink('+2 supply', '/supply+=2')}</p>` +
				`<p>${cmdLink('+1 health', '/health++')}</p>` +
				`<p>${cmdLink('+40 xp', '/xp+=40')}</p>`,
			id,
			{ charId },
		);
		await expect(entryById(page, id)).toBeVisible({ timeout: 3_000 });
		const logLine = (text: string | RegExp) =>
			page.locator('.log-entry', { hasText: text }).first();

		// 4 and +2 is 5, not 6: health, spirit and supply top out at 5.
		for (const label of ['Health', 'Spirit', 'Supply'] as const) {
			await linkIn(page, id, `/${label.toLowerCase()}+=2`).click();
			await expect(vitalValue(page, label)).toHaveText('5');
			await expect(logLine(`${label}: 4 → 5 (+2, max 5)`)).toBeVisible();
		}

		// Already at the top, the link changes nothing, and the log says why.
		await linkIn(page, id, '/health++').click();
		await expect(logLine('Health: 5 → 5 (+1, max 5)')).toBeVisible();
		await expect(vitalValue(page, 'Health')).toHaveText('5');

		// Experience tops out at 30, as its tile does.
		await linkIn(page, id, '/xp+=40').click();
		await expect(vitalValue(page, 'Experience')).toHaveText('30');
		await expect(logLine(/Experience: \d+ → 30 \(\+40, max 30\)/)).toBeVisible();
	});

	// `/health=n` in the command bar sets a value, held to its range as the
	// sheet's controls are (docs/command-language.md → Operators).
	test('= holds the value to the range, and the log line says so', async ({ page }) => {
		await goToHomeWithCharacter(page);
		await setVital(page, 'Health', 4);
		const bar = page.locator('.cb-input');
		const run = async (cmd: string) => {
			await bar.fill(cmd);
			await bar.press('Enter');
		};
		const logLine = (text: string | RegExp) =>
			page.locator('.log-entry', { hasText: text }).first();

		await run('/health=9');
		await expect(page.locator('.cb-status')).toHaveText('Health 4 → 5 (max 5)');
		await expect(vitalValue(page, 'Health')).toHaveText('5');
		await expect(logLine('Health: 4 → 5 (= 9, max 5)')).toBeVisible();

		// Already at the top: nothing moves, and the log says why.
		await run('/health=7');
		await expect(logLine('Health: 5 → 5 (= 7, max 5)')).toBeVisible();
		await expect(vitalValue(page, 'Health')).toHaveText('5');

		await run('/xp=50');
		await expect(vitalValue(page, 'Experience')).toHaveText('30');
		await expect(logLine(/Experience: \d+ → 30 \(= 50, max 30\)/)).toBeVisible();

		await run('/momentum=-20');
		await expect(page.locator('.cb-status')).toHaveText(/^Momentum −?\d+ → −6 \(min −6\)$/);
		await expect.poll(() => readMomentum(page)).toBe(-6);
		await expect(logLine(/Momentum: -?\d+ → -6 \(= −20, min −6\)/)).toBeVisible();

		// A value inside the range is set as asked, with no note.
		await run('/health=2');
		await expect(vitalValue(page, 'Health')).toHaveText('2');
		await expect(logLine('Health: 5 → 2')).toBeVisible();
		await expect(page.locator('.log-entry', { hasText: '(= 2,' })).toHaveCount(0);

		// Back to a new character's momentum and health: the tests after this
		// one share the character, and burning momentum needs it above 0.
		await run('/momentum=2');
		await expect.poll(() => readMomentum(page)).toBe(2);
		await run('/health=5');
		await expect(vitalValue(page, 'Health')).toHaveText('5');
	});

	test('a content pack’s global field (mana): its link changes it and is spent', async ({
		page,
	}) => {
		await setExpansions({ yrt: true });
		try {
			const charId = await goToHomeWithCharacter(page);
			const id = crypto.randomUUID();
			await injectBound(page, 'Mock Outcome', `<p>${cmdLink('+2 mana', '/mana+=2')}</p>`, id, {
				charId,
			});
			await linkIn(page, id, '/mana+=2').click();
			await expect(entryById(page, id).locator('s.resource-spent')).toHaveText('+2 mana');
			await expect(page.locator('.log-entry', { hasText: 'Mana: 0 → 2 (+2)' })).toBeVisible();
		} finally {
			await resetExpansions();
		}
	});

	// ── Tracks ──────────────────────────────────────────────────────────────

	test('a failure link advances the failure track', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		const id = crypto.randomUUID();

		// Core hosts the failures track (.track-box / data-ticks, in ProgressTrackPanel).
		await switchCharTab(page, 'Core');
		const failGroup = page.locator(`${CHAR_AREA} .ptp-group`).filter({ hasText: /Failures/i });
		const ticks = () =>
			failGroup
				.locator('.track-box')
				.evaluateAll((boxes: HTMLElement[]) =>
					boxes.reduce((s, b) => s + parseInt(b.dataset['ticks'] ?? '0', 10), 0),
				);
		const before = await ticks();

		await injectBound(page, 'Mock Miss', `<p>${cmdLink('+1 failure', '/failures++')}</p>`, id, {
			charId,
		});
		await linkIn(page, id, '/failures++').click();
		await expect(entryById(page, id).locator('s.resource-spent')).toBeVisible({ timeout: 3_000 });

		await switchCharTab(page, 'Core');
		await expect(async () => expect(await ticks()).toBeGreaterThan(before)).toPass({
			timeout: 5_000,
		});
	});

	// ── Debilities and initiative ───────────────────────────────────────────

	test('a debility link marks the debility on the character sheet', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		const id = crypto.randomUUID();

		// Ensure Shaken is unmarked before the test. Debilities live on Core.
		await switchCharTab(page, 'Core');
		const shakenBtn = page.locator(`${CHAR_AREA} .debility-btn`).filter({ hasText: 'Shaken' });
		await expect(shakenBtn).toBeVisible({ timeout: 3_000 });
		if (await shakenBtn.evaluate((el) => el.classList.contains('active'))) {
			await shakenBtn.click();
			await expect(shakenBtn).not.toHaveClass(/active/, { timeout: 2_000 });
		}

		await injectBound(page, 'Mock Outcome', `<p>${cmdLink('Mark Shaken', '/shaken++')}</p>`, id, {
			charId,
		});
		await linkIn(page, id, '/shaken++').click();
		await expect(entryById(page, id).locator('s.resource-spent')).toBeVisible({ timeout: 3_000 });

		await switchCharTab(page, 'Core');
		await expect(shakenBtn).toHaveClass(/active/, { timeout: 8_000 });
	});

	test('initiative links set who has initiative', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		await ensureFoeExists(page);
		const id = crypto.randomUUID();

		await injectBound(
			page,
			'Mock Outcome',
			`<p>${cmdLink('You have initiative', '/initiative=me')}</p>` +
				`<p>${cmdLink('Foe has initiative', '/initiative=foe')}</p>`,
			id,
			{ charId },
		);
		const radio = (label: string) =>
			page.locator(
				`${CHAR_AREA} .sr[aria-label="Initiative"] .sr-btn[aria-label="${label}"][aria-checked="true"]`,
			);

		await linkIn(page, id, '/initiative=me').click();
		await switchCharTab(page, 'Core');
		await expect(radio('You have initiative')).toBeVisible({ timeout: 5_000 });

		await linkIn(page, id, '/initiative=foe').click();
		await expect(radio('Foe has initiative')).toBeVisible({ timeout: 5_000 });
	});

	test('a link whose value is already so is spent, with no log line', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		await ensureFoeExists(page);
		const bar = page.locator('.cb-input');
		const run = async (cmd: string) => {
			await bar.fill(cmd);
			await bar.press('Enter');
		};
		// You have initiative, and you're shaken.
		await run('/initiative=me');
		await expect(page.locator('.cb-status')).toHaveText(/^Initiative: (\w+ → Me|already Me)$/);
		await run('/shaken++');
		await expect(page.locator('.cb-status')).toHaveText(
			/^Shaken: (Cleared → Marked|already Marked)$/,
		);

		const id = crypto.randomUUID();
		await injectBound(
			page,
			'Strike',
			`<p>${cmdLink('You retain initiative', '/initiative=me')}</p>` +
				`<p>${cmdLink('Mark Shaken', '/shaken++')}</p>`,
			id,
			{ charId },
		);
		const entries = await page.locator('.log-entry').count();

		await linkIn(page, id, '/initiative=me').click();
		await expect(page.locator('.cb-status')).toHaveText('Initiative: already Me');
		await linkIn(page, id, '/shaken++').click();
		await expect(page.locator('.cb-status')).toHaveText('Shaken: already Marked');
		await expect(entryById(page, id).locator('s.resource-spent')).toHaveText([
			'You retain initiative',
			'Mark Shaken',
		]);
		// Nothing changed, so nothing was logged.
		await expect(page.locator('.log-entry')).toHaveCount(entries);

		// Shaken lowers momentum's top: clear it for the tests after this one.
		await run('/shaken--');
		await expect(page.locator('.cb-status')).toHaveText('Shaken: Marked → Cleared');
	});

	// ── Foes and expeditions ────────────────────────────────────────────────

	test('a vanquish link vanquishes the foe and is spent', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		await ensureFoeExists(page);
		const foeId = (await encountersWhenAtLeast(page, 1))[0].id;
		const id = crypto.randomUUID();

		await injectBound(
			page,
			'Mock Outcome',
			`<p>${cmdLink('Vanquish Foe', '/foe.vanquished++')}</p>`,
			id,
			{ charId, foeId },
		);
		await linkIn(page, id, '/foe.vanquished++').click();
		await expect(entryById(page, id).locator('s.resource-spent')).toBeVisible({ timeout: 3_000 });
		await expect
			.poll(async () => (await getEncounters(page)).find((e) => e.id === foeId)?.vanquished, {
				timeout: 5_000,
			})
			.toBe(true);
	});

	test('a progress link marks journey progress and is spent', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		await ensureExpeditionExists(page);
		const id = crypto.randomUUID();

		await injectBound(
			page,
			'Mock Outcome',
			`<p>${cmdLink('Mark progress', '/journey.progress++')}</p>`,
			id,
			{ charId },
		);
		await linkIn(page, id, '/journey.progress++').click();
		await expect(entryById(page, id).locator('s.resource-spent')).toBeVisible({ timeout: 3_000 });
	});

	test('a foe progress link acts on its bound foe, not the active one', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		await resetFoes();
		await page.reload();
		await waitForCharactersArea(page);
		await settleHome(page);

		// Foe A (first), then Foe B (becomes active). The injected link is bound
		// to A, so the click must advance A — not the active B.
		await ensureFoeExists(page);
		const foeAId = (await encountersWhenAtLeast(page, 1))[0].id;
		await addFoe(page);
		const encs = await encountersWhenAtLeast(page, 2);
		expect(encs.length).toBe(2);
		const foeBId = encs.find((e) => e.id !== foeAId)!.id;

		const id = crypto.randomUUID();
		await injectBound(
			page,
			'Mock Outcome',
			`<p>${cmdLink('Inflict double harm', '/foe.progress+=2')}</p>`,
			id,
			{ charId, foeId: foeAId },
		);
		await linkIn(page, id, '/foe.progress+=2').click();
		await expect(entryById(page, id).locator('s.resource-spent')).toBeVisible({ timeout: 3_000 });

		// Let the debounce persist, then confirm A advanced and B did not.
		await expect
			.poll(async () => (await getEncounters(page)).find((e) => e.id === foeAId)?.ticks, {
				timeout: 6_000,
			})
			.toBeGreaterThan(0);
		expect((await getEncounters(page)).find((e) => e.id === foeBId)?.ticks).toBe(0);
	});

	test('a link bound to a foe that is gone says why and stays unspent', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		const id = crypto.randomUUID();
		await injectBound(
			page,
			'Mock Outcome',
			`<p>${cmdLink('Inflict harm', '/foe.progress++')}</p>`,
			id,
			{ charId, foeId: crypto.randomUUID() },
		);
		await linkIn(page, id, '/foe.progress++').click();
		await expect(page.locator('.cb-status')).toHaveText(
			'The foe this entry was made against is gone.',
		);
		await expect(entryById(page, id).locator('s.resource-spent')).toHaveCount(0);
		await expect(linkIn(page, id, '/foe.progress++')).toBeVisible();
	});

	// ── Burn momentum ───────────────────────────────────────────────────────

	/**
	 * Raise momentum well above its reset, log a missed action roll (action 1
	 * against 1 and 9) with its roll data and the offer to burn on it, then
	 * click the offer: momentum (above 1) cancels the 1, making a weak hit.
	 * The roll's entry id.
	 */
	async function burnAMiss(
		page: Page,
		charId: string,
		title: string,
		roll: { moveId: string; stat?: string },
	): Promise<string> {
		const boostId = crypto.randomUUID();
		const momBefore = await readMomentum(page);
		await injectBound(page, 'Boost', `<p>${cmdLink('+3 momentum', '/momentum+=3')}</p>`, boostId, {
			charId,
		});
		await linkIn(page, boostId, '/momentum+=3').click();
		const momBoosted = await waitMomentumChange(page, momBefore);

		const rollId = crypto.randomUUID();
		await page.evaluate(
			({ rollId, charId, title, roll }) => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(window as any).__testLog.appendLog(
					title,
					'<div class="roll-outcome roll-outcome-miss"><p>Miss — pay the price.</p></div>',
					rollId,
					null,
					{ ...roll, actionScore: 1, c1: 1, c2: 9, charId },
				);
			},
			{ rollId, charId, title, roll },
		);
		const burnId = crypto.randomUUID();
		await injectBound(
			page,
			'Burn Momentum',
			`<p>${cmdLink('burn momentum', '/burn')}</p>`,
			burnId,
			{ charId, rollId },
		);

		await linkIn(page, burnId, '/burn').click();
		await waitMomentumChange(page, momBoosted);
		expect(await readMomentum(page)).toBeLessThan(momBoosted);
		await expect(entryById(page, burnId).locator('s.resource-spent')).toBeVisible();
		await expect(entryById(page, rollId).locator('.roll-burn')).toBeVisible();
		await expect(entryById(page, rollId).locator('.roll-outcome-weak')).toHaveText('Weak Hit');
		return rollId;
	}

	test('a burn link resets momentum and shows the burn in the roll', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		const rollId = await burnAMiss(page, charId, 'Strike', { moveId: 'move/strike' });
		// The burn turns the miss into Strike's weak hit, whose links are live.
		const roll = entryById(page, rollId);
		await expect(roll.locator('a.cmd-link[data-cmd="/foe.progress++"]')).toHaveText(
			'Inflict your harm',
		);
		await expect(roll.locator('a.cmd-link[data-cmd="/initiative=foe"]')).toHaveText(
			'lose initiative',
		);
		await expect(roll).not.toContainText('](');
	});

	test('a burned Delve the Depths opens its weak-hit oracle on the stat’s column', async ({
		page,
	}) => {
		const charId = await goToHomeWithCharacter(page);
		const rollId = await burnAMiss(page, charId, 'Delve the Depths', {
			moveId: 'move/delve-the-depths',
			stat: 'shadow',
		});
		// As a roll to a weak hit would: the oracle link opens on Shadow.
		await expect(
			entryById(page, rollId).locator('a.cmd-link[data-cmd="/oracle delveDepths"]'),
		).toHaveAttribute('data-stat', 'shadow');
		await expect(
			entryById(page, rollId).locator('a.cmd-link[data-cmd="/oracle delveDepths"]'),
		).toHaveText('Delve the Depths Weak Hit Oracle (Shadow column)');
	});

	// ── Moves and oracles ───────────────────────────────────────────────────

	test('a move link opens Pay the Price in the moves dialog', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		const id = crypto.randomUUID();
		await injectBound(
			page,
			'Mock Outcome',
			`<p>On a miss: ${cmdLink('Pay the Price', '/move pay-the-price')}</p>`,
			id,
			{ charId },
		);
		await linkIn(page, id, '/move pay-the-price').click();
		await expect(page.locator('.moves-dialog')).toBeVisible({ timeout: 5_000 });
		await expect(page.locator('.moves-dialog')).toContainText('Pay the Price');
		await page.keyboard.press('Escape');
		// Opening a move spends nothing.
		await expect(linkIn(page, id, '/move pay-the-price')).toBeVisible();
	});

	test('an oracle link opens the oracles dialog', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		const id = crypto.randomUUID();
		await injectBound(
			page,
			'Mock Outcome',
			`<p>Ask: ${cmdLink('Region', '/oracle region')}</p>`,
			id,
			{
				charId,
			},
		);
		await linkIn(page, id, '/oracle region').click();
		await expect(page.locator('.oracles-dialog')).toBeVisible({ timeout: 5_000 });
		await page.keyboard.press('Escape');
	});

	// ── Old links ───────────────────────────────────────────────────────────

	test('a link saved in an old form does nothing; its text stays', async ({ page }) => {
		const charId = await goToHomeWithCharacter(page);
		const momBefore = await readMomentum(page);
		const id = crypto.randomUUID();
		await inject(
			page,
			'Old Outcome',
			`<p><a class="resource-link" data-resource="momentum" data-value="+1" data-entry-id="${id}" data-char-id="${charId}">+1 momentum</a></p>`,
			id,
		);
		const old = entryById(page, id).getByText('+1 momentum');
		await expect(old).toBeVisible();
		await old.click({ force: true });
		await page.waitForTimeout(500);
		expect(await readMomentum(page)).toBe(momBefore);
		await expect(entryById(page, id).locator('s.resource-spent')).toHaveCount(0);
	});

	// ── Cleanup ───────────────────────────────────────────────────────────────

	test('cleanup: delete all foes, expeditions, and characters', async ({ page }) => {
		await page.goto('/home');
		await waitForCharactersArea(page);
		await settleHome(page);

		// Foes — delete the active foe via the gear → options → confirm.
		for (let g = 0; g < 30 && (await foeCount(page)) > 0; g++) {
			await page.locator(`${FOE_AREA} .fa-hdr-settings-btn`).click();
			await page.locator('.co-dialog button.btn-danger').click();
			await page.locator('.confirm-modal button.btn-danger').click();
			await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
		}

		// Expeditions — gear → options → delete.
		for (let g = 0; g < 30 && (await expCount(page)) > 0; g++) {
			await page.locator(`${EXP_AREA} .ea-hdr-settings-btn`).click();
			await page.locator('.co-dialog button.btn-danger').click();
			await page.locator('.confirm-modal button.btn-danger').click();
			await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
		}

		// Characters — gear → options → delete.
		for (let g = 0; g < 30; g++) {
			if (
				!(await page
					.locator(`${CHAR_AREA} .ca-tab`)
					.first()
					.isVisible()
					.catch(() => false))
			)
				break;
			await page.locator(`${CHAR_AREA} .ca-hdr-settings-btn`).click();
			await page.locator('.co-dialog button.btn-danger').click();
			await page.locator('.confirm-modal button.btn-danger').click();
			await expect(page.locator('.confirm-modal')).not.toBeVisible({ timeout: 5_000 });
		}
		await expect(page.locator(`${CHAR_AREA} .ca-empty`)).toBeVisible({ timeout: 5_000 });
	});
});
