/**
 * supply-sync.spec.ts — Party supply is always in sync across all characters.
 *
 * Covers (v2 — no GlobalContextBar, no tabs):
 *   • New character inherits current party supply on creation
 *   • Imported character syncs all chars to max(existing, imported) supply
 *   • Increasing supply on one char syncs all others (+ button)
 *   • Decreasing supply on one char syncs all others (− button)
 *   • Supply resource-link click in the log echoes the change to all chars
 *
 * v2: only the active character's vitals are visible at a time. To verify
 * sync, we click each spine in turn and read its Supply tile value.
 */
import { test, expect, type Page } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { resetCharacters } from './helpers/reset';
import {
	settleHome,
	createCharacter,
	characterCount,
	selectCharacterByIndex,
} from './helpers/home';

const CHAR_AREA = '.home-area--characters';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForHome(page: Page) {
	await expect(page.locator(`${CHAR_AREA} .ca-loading`)).not.toBeVisible({ timeout: 12_000 });
	await page
		.locator(`${CHAR_AREA} .ca-empty, ${CHAR_AREA} .ca-body`)
		.first()
		.waitFor({ timeout: 12_000, state: 'attached' });
}

async function gotoHome(page: Page) {
	await page.goto('/home');
	await waitForHome(page);
	await settleHome(page);
}

async function switchCharTab(page: Page, label: string) {
	await page.locator(`${CHAR_AREA} .ca-tab`, { hasText: new RegExp(`^${label}$`, 'i') }).click();
}

/** Wait until at least N characters exist, creating new ones as needed. */
async function ensureCharCount(page: Page, n: number) {
	while ((await characterCount(page)) < n) {
		await createCharacter(page);
	}
}

/** Open the Core sub-tab so the supply tile is visible. */
async function showVitals(page: Page) {
	await switchCharTab(page, 'Core');
}

/** Read displayed supply value from the active character's Core tab. */
async function getSupplyOfActive(page: Page): Promise<number> {
	await showVitals(page);
	const tile = page.locator(`${CHAR_AREA} .res-tile`).filter({ hasText: 'Supply' });
	const text = await tile.locator('.res-value').textContent();
	return parseInt(text ?? '0', 10);
}

/** Set the active character's supply to `target` by clicking + / − buttons. */
async function setActiveSupply(page: Page, target: number) {
	await showVitals(page);
	const tile = page.locator(`${CHAR_AREA} .res-tile`).filter({ hasText: 'Supply' });
	for (let attempts = 0; attempts < 12; attempts++) {
		const cur = await getSupplyOfActive(page);
		if (cur === target) break;
		if (cur < target) await tile.locator('button[aria-label="Increase Supply"]').click();
		else await tile.locator('button[aria-label="Decrease Supply"]').click();
		await page.waitForTimeout(80);
	}
}

/** Select the Nth character via the header switcher. */
async function selectSpine(page: Page, idx: number) {
	await selectCharacterByIndex(page, idx);
	await expect(page.locator(`${CHAR_AREA} .ca-tab`).first()).toBeVisible({ timeout: 5_000 });
}

/** Verify every character's supply equals `expected` by walking the switcher. */
async function expectAllCharsSupply(page: Page, expected: number) {
	const total = await characterCount(page);
	for (let i = 0; i < total; i++) {
		await selectSpine(page, i);
		await showVitals(page);
		const tile = page.locator(`${CHAR_AREA} .res-tile`).filter({ hasText: 'Supply' });
		await expect(tile.locator('.res-value')).toHaveText(String(expected), { timeout: 4_000 });
	}
}

/**
 * An existing character's id, from the BFF. Supply is a party-wide sync, so
 * the specific character a resource-link targets doesn't change the outcome —
 * the first character's id is a valid target.
 */
async function getActiveCharId(page: Page): Promise<string> {
	return await page.evaluate(async () => {
		const res = await fetch('/api/characters', { credentials: 'include' });
		const list = (await res.json()) as Array<{ id: string }>;
		return Array.isArray(list) && list[0]?.id ? list[0].id : '';
	});
}

/** Build a minimal valid character manifest for import. */
function makeCharManifest(name: string, supply: number) {
	return {
		manifest: {
			app: 'Iron Ledger',
			version: '1.0.0',
			exportedAt: new Date().toISOString(),
			type: 'character',
			count: 1,
		},
		data: {
			name,
			data: {
				name,
				edge: 1,
				heart: 1,
				iron: 1,
				shadow: 1,
				wits: 1,
				momentum: 2,
				health: 5,
				spirit: 5,
				supply,
				xp: 0,
				bonds: 0,
				failures: 0,
				wounded: false,
				unprepared: false,
				shaken: false,
				encumbered: false,
				maimed: false,
				corrupted: false,
				cursed: false,
				tormented: false,
				vows: [],
				assets: [],
			},
		},
	};
}

/** Upload a character as the `.zip` bundle the importer now expects (manifest
 *  + body file), through the hidden file input. */
async function uploadImport(page: Page, payload: { manifest: object; data: unknown }) {
	const manifest = { ...payload.manifest, body: 'character.json' };
	const zip = zipSync({
		'manifest.json': strToU8(JSON.stringify(manifest)),
		'character.json': strToU8(JSON.stringify(payload.data)),
	});
	await page.locator('input[type="file"][accept=".zip,application/zip"]').setInputFiles({
		name: 'test-import.zip',
		mimeType: 'application/zip',
		buffer: Buffer.from(zip),
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Party supply sync (v2)', () => {
	test.beforeAll(async () => {
		await resetCharacters();
	});

	test.beforeEach(async ({ page }) => {
		await gotoHome(page);
	});

	// ── New character creation inherits party supply ──────────────────────────

	test('new character inherits party supply on creation', async ({ page }) => {
		await ensureCharCount(page, 1);

		await selectSpine(page, 0);
		await setActiveSupply(page, 4);

		// Create a second character.
		await createCharacter(page);

		// New character is appended; it should auto-pick up the existing party supply.
		const newIdx = (await characterCount(page)) - 1;
		await selectSpine(page, newIdx);
		await showVitals(page);
		const tile = page.locator(`${CHAR_AREA} .res-tile`).filter({ hasText: 'Supply' });
		await expect(tile.locator('.res-value')).toHaveText('4', { timeout: 4_000 });
	});

	// ── Increment syncs all ───────────────────────────────────────────────────

	test('increasing supply on one char syncs to all others', async ({ page }) => {
		await ensureCharCount(page, 2);

		// Normalise both to supply 2.
		await selectSpine(page, 0);
		await setActiveSupply(page, 2);
		await selectSpine(page, 1);
		await setActiveSupply(page, 2);

		// Increment on first char.
		await selectSpine(page, 0);
		await showVitals(page);
		const tile = page.locator(`${CHAR_AREA} .res-tile`).filter({ hasText: 'Supply' });
		await tile.locator('button[aria-label="Increase Supply"]').click();
		await page.waitForTimeout(200);

		await expectAllCharsSupply(page, 3);
	});

	// ── Decrement syncs all ───────────────────────────────────────────────────

	test('decreasing supply on one char syncs to all others', async ({ page }) => {
		await ensureCharCount(page, 2);

		await selectSpine(page, 0);
		await setActiveSupply(page, 3);
		await selectSpine(page, 1);
		await setActiveSupply(page, 3);

		// Decrement on second char.
		await selectSpine(page, 1);
		await showVitals(page);
		const tile = page.locator(`${CHAR_AREA} .res-tile`).filter({ hasText: 'Supply' });
		await tile.locator('button[aria-label="Decrease Supply"]').click();
		await page.waitForTimeout(200);

		await expectAllCharsSupply(page, 2);
	});

	// ── Log resource-link click syncs all ─────────────────────────────────────

	test('supply resource-link click in log syncs all chars', async ({ page }) => {
		await ensureCharCount(page, 2);

		await selectSpine(page, 0);
		await setActiveSupply(page, 3);
		await selectSpine(page, 1);
		await setActiveSupply(page, 3);

		// Get the active char's id via the API (active stage name -> lookup).
		await selectSpine(page, 0);
		const charId = await getActiveCharId(page);
		expect(charId).toBeTruthy();

		// Inject a fake log entry with a supply resource link for that char.
		const entryId = 'test-supply-link-entry';
		await page.evaluate(
			({ cId, eId }) => {
				const html = `<div>Resupply: <a class="resource-link" data-resource="supply" data-value="-1" data-entry-id="${eId}" data-char-id="${cId}">−1 supply</a></div>`;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(window as any).__testLog?.appendLog('Test — Supply', html, eId);
			},
			{ cId: charId, eId: entryId },
		);

		// Log is always visible in v2 (right column). Click the link.
		const supplyLink = page.locator(`.resource-link[data-entry-id="${entryId}"]`).first();
		await supplyLink.waitFor({ timeout: 5_000 });
		await supplyLink.click();
		await page.waitForTimeout(300);

		await expectAllCharsSupply(page, 2);
	});

	// ── Import syncs to max ───────────────────────────────────────────────────

	test('importing a character syncs all chars to max supply', async ({ page }) => {
		await ensureCharCount(page, 1);

		await selectSpine(page, 0);
		await setActiveSupply(page, 2);

		const beforeCount = await characterCount(page);
		await uploadImport(page, makeCharManifest('Supply Test Import', 5));
		await expect.poll(() => characterCount(page), { timeout: 8_000 }).toBeGreaterThan(beforeCount);
		await page.waitForTimeout(300);

		await expectAllCharsSupply(page, 5);
	});

	test('importing a character with lower supply does not reduce party supply', async ({ page }) => {
		await ensureCharCount(page, 1);

		await selectSpine(page, 0);
		await setActiveSupply(page, 4);

		const beforeCount = await characterCount(page);
		await uploadImport(page, makeCharManifest('Low Supply Import', 1));
		await expect.poll(() => characterCount(page), { timeout: 8_000 }).toBeGreaterThan(beforeCount);
		await page.waitForTimeout(300);

		await expectAllCharsSupply(page, 4);
	});
});
