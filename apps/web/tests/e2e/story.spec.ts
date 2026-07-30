/**
 * story.spec.ts — AI story generation flow (mocked server stream).
 *
 * Generation now runs through our own /api/ai/generate BFF proxy (the browser
 * never talks to a provider). Both /api/ai/config (so a companion looks
 * configured) and /api/ai/generate (the canned prose stream) are intercepted
 * with page.route(), so no key or network is needed. Story log entries are
 * injected directly via window.__testLog.appendLog (exposed by
 * hooks.client.ts) — appendLog(title, html, id?, source?, roll?) — to test the
 * regenerate affordance and the stories markdown export without generating.
 *
 * Covers: the regenerate-button gate (parseStorySource), section-marker →
 * name → generate → save, regenerate replace-in-place, and the Stories md
 * export. The ▲ / ▼ per-entry marker buttons are hover-revealed; tests reach
 * around that by calling window.__testSection.setStart / setEnd (exposed by
 * hooks.client.ts).
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resetAll, resetLog } from './helpers/reset';

const PROSE_A = '**Beepalache** crept forward.\n\nThe *Blood Thorn* stirred and did not wake.';
const PROSE_B = 'A *quieter* telling: she simply walked away.';

/** Build the unified SSE body streamStory reads: a text frame then a done frame. */
function sseBody(text: string): string {
	return `data: ${JSON.stringify({ text })}\n\n` + `data: ${JSON.stringify({ done: true })}\n\n`;
}

/** Make a companion look configured so the client-side generation gate passes. */
async function mockAiConfig(page: Page) {
	await page.route('**/api/ai/config', (route) =>
		route.fulfill({
			status: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				activeProvider: 'claude',
				providers: {
					claude: { model: 'claude-haiku-4-5', setup: 'sys', hasKey: true },
					chatgpt: { model: null, setup: null, hasKey: false },
				},
			}),
		}),
	);
}

/** Intercept the server generate proxy and stream back `text`. */
async function mockGenerate(page: Page, text: string) {
	await page.route('**/api/ai/generate', (route) =>
		route.fulfill({
			status: 200,
			headers: { 'content-type': 'text/event-stream' },
			body: sseBody(text),
		}),
	);
}

/** A Story entry's `source` payload. */
function storySource(user: string, md: string): string {
	return JSON.stringify({ kind: 'story', user, md });
}

async function inject(
	page: Page,
	title: string,
	html: string,
	id: string,
	source?: string,
	roll?: unknown,
) {
	// __testLog is published during client hydration (hooks.client.ts); wait for
	// it so an inject fired right after navigation can't race a cold mount.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	await page.waitForFunction(() => !!(window as any).__testLog, undefined, { timeout: 8_000 });
	await page.evaluate(
		({ title, html, id, source, roll }) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(window as any).__testLog.appendLog(title, html, id, source, roll);
		},
		{ title, html, id, source, roll },
	);
}

async function setStart(page: Page, entryId: string) {
	await page.evaluate((id) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(window as any).__testSection.setStart(id);
	}, entryId);
}

async function clearSection(page: Page) {
	await page.evaluate(() => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(window as any).__testSection.clearSection();
	});
}

const entryById = (page: Page, id: string) => page.locator(`.log-entry[data-entry-id="${id}"]`);
const storyBtn = (page: Page) => page.locator('.story-btn');

/** Load /home with a companion mocked as configured and the log clean. */
async function goToHome(page: Page) {
	await mockAiConfig(page);
	// LogPanel calls initLog() on mount, which fetches the stored log in the
	// background and *overwrites* sessionLog.entries when it resolves. If a test
	// injects an entry before that GET lands, the late response silently clobbers
	// the injection (the section empties to "Generate (0)", Start goes disabled,
	// the regen button vanishes, the export drops the entries). Wait for that GET
	// to resolve — register the waiter before navigating so it can't be missed —
	// then settle to be sure its store write has flushed. Now every inject() that
	// follows lands on a stable store.
	const logLoaded = page
		.waitForResponse(
			(r) => r.url().includes('/api/session/log') && r.request().method() === 'GET',
			{ timeout: 12_000 },
		)
		.catch(() => null);
	await page.goto('/home');
	await expect(storyBtn(page)).toBeVisible({ timeout: 12_000 });
	await logLoaded;
	await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
}

test.describe('AI story generation', () => {
	test.beforeAll(async () => {
		await resetAll();
	});

	test.beforeEach(async ({ page }) => {
		await resetLog();
		await goToHome(page);
		// Section markers persist to localStorage; each test starts clean.
		await clearSection(page);
	});

	test('regenerate button appears only on entries with a story payload', async ({ page }) => {
		await inject(page, 'Story', '<p>An old note.</p>', 'plain-1'); // no payload
		await inject(
			page,
			'The Quiet Barrow',
			'<p>Prose.</p>',
			'story-1',
			storySource('the log', '**Prose.**'),
		);

		await expect(entryById(page, 'story-1').locator('.entry-regen-btn')).toHaveCount(1);
		await expect(entryById(page, 'plain-1').locator('.entry-regen-btn')).toHaveCount(0);
	});

	test('regenerate replaces the entry body in place from the stored prompt', async ({ page }) => {
		await inject(
			page,
			'The Quiet Barrow',
			'<p>The first telling.</p>',
			'story-2',
			storySource('# What happened\n\nShe crept in.', '**The first telling.**'),
		);
		await mockGenerate(page, PROSE_B);

		await entryById(page, 'story-2').locator('.entry-regen-btn').click();
		const dialog = page.locator('.story-dialog');
		await expect(dialog).toBeVisible();
		await dialog.locator('button:has-text("Start")').click();
		await expect(dialog.locator('.stry-output em')).toHaveText('quieter', { timeout: 8_000 });
		// Regenerate mode's save button reads just "Save" (fresh-generate mode
		// still says "Save to Log"). Use an exact role selector so a future
		// button whose label contains "Save" doesn't accidentally match.
		await dialog.getByRole('button', { name: 'Save', exact: true }).click();

		// Same entry id, new body — replace in place.
		const body = entryById(page, 'story-2').locator('.entry-body');
		await expect(body).toContainText('she simply walked away');
		await expect(body.locator('em')).toHaveText('quieter');
		await expect(page.locator('.log-entry')).toHaveCount(1); // no duplicate appended
	});

	test('mark section → name → generate → save writes a titled Story entry', async ({ page }) => {
		await mockGenerate(page, PROSE_A);

		// The Generate button is disabled without a section pinned.
		await expect(storyBtn(page)).toBeDisabled();

		// Inject an entry and pin ▲ start on it — the section is open, growing.
		await inject(page, 'A deed', '<p>She acted.</p>', 'rec-1');
		await setStart(page, 'rec-1');
		await expect(entryById(page, 'rec-1')).toHaveClass(/log-entry-in-section/);
		await expect(storyBtn(page)).toBeEnabled();
		await expect(storyBtn(page)).toContainText('Generate');

		await storyBtn(page).click(); // opens generate on the section
		const dialog = page.locator('.story-dialog');
		await expect(dialog).toBeVisible();
		await dialog.locator('input[placeholder="Story title…"]').fill('The Fall of Blackroot');
		await dialog.locator('button:has-text("Start")').click();
		await expect(dialog.locator('.stry-output strong')).toHaveText('Beepalache', {
			timeout: 8_000,
		});

		// Editable output box: tweak the generated prose before saving.
		await dialog.locator('.stry-edit-toggle').click();
		const edit = dialog.locator('textarea.stry-output-edit');
		await expect(edit).toBeVisible();
		await edit.fill('**Beepalache** crept forward, then *turned back*.');
		await dialog.locator('button:has-text("Save to Log")').click();

		const named = page.locator('.log-entry', { hasText: 'The Fall of Blackroot' });
		await expect(named).toHaveCount(1);
		await expect(named.locator('.entry-body strong')).toHaveText('Beepalache');
		await expect(named.locator('.entry-body em')).toHaveText('turned back'); // the edit persisted
		await expect(named.locator('.entry-regen-btn')).toHaveCount(1); // has a payload
	});

	test('Stories export writes markdown of story entries only', async ({ page }) => {
		await inject(page, 'A mundane note', '<p>Nothing special.</p>', 'plain-2');
		await inject(
			page,
			'First Tale',
			'<p>one</p>',
			'story-a',
			storySource('log a', 'The **first** tale.'),
		);
		await inject(
			page,
			'Second Tale',
			'<p>two</p>',
			'story-b',
			storySource('log b', 'The *second* tale.'),
		);

		await page.locator('button[aria-label="Menu"]').click();
		await page.locator('.hm-item', { hasText: /Export/ }).click();
		const dialog = page.locator('.export-dialog');
		await expect(dialog).toBeVisible();
		// .ed-select is a bits-ui <Select> (button trigger + portalled popup),
		// not a native <select>: open it and pick the "Stories" option.
		await dialog.locator('.ed-select').click();
		await page.locator('.bui-select-content .bui-select-item', { hasText: 'Stories' }).click();

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			dialog.locator('.ed-footer button.btn-primary').click(),
		]);
		expect(download.suggestedFilename()).toMatch(/^stories-.*\.md$/);
		const md = readFileSync(await download.path(), 'utf8');

		expect(md).toContain('## First Tale');
		expect(md).toContain('The **first** tale.');
		expect(md).toContain('## Second Tale');
		expect(md).toContain('The *second* tale.');
		expect(md).not.toContain('A mundane note'); // non-story entries excluded
	});
});
