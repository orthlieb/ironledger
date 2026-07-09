/**
 * story.spec.ts — AI story generation flow (mocked Anthropic stream).
 *
 * The Anthropic Messages endpoint is intercepted with page.route() and
 * fulfilled with a canned SSE body, so no API key or network is needed. Story
 * log entries are injected directly via window.__testLog.appendLog (exposed by
 * hooks.client.ts) — appendLog(title, html, id?, source?, roll?) — to test the
 * regenerate affordance and the stories markdown export without generating.
 *
 * Covers: the regenerate-button gate (parseStorySource), record → name →
 * generate → save, regenerate replace-in-place, and the Stories md export.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resetAll, resetLog } from './helpers/reset';

const AI_KEY = 'sk-ant-e2e-test-key';
const PROSE_A = '**Beepalache** crept forward.\n\nThe *Blood Thorn* stirred and did not wake.';
const PROSE_B = 'A *quieter* telling: she simply walked away.';

/** Build an SSE body the aiStream reader understands (text_delta frames). */
function sseBody(text: string): string {
	const delta = `data: ${JSON.stringify({
		type: 'content_block_delta',
		delta: { type: 'text_delta', text },
	})}\n\n`;
	const stop = `data: ${JSON.stringify({ type: 'message_stop' })}\n\n`;
	return delta + stop;
}

/** Intercept the Anthropic endpoint and stream back `text`. */
async function mockAnthropic(page: Page, text: string) {
	await page.route('https://api.anthropic.com/v1/messages', (route) =>
		route.fulfill({
			status: 200,
			headers: { 'content-type': 'text/event-stream' },
			body: sseBody(text),
		}),
	);
}

/** A Story entry's `source` payload. */
function storySource(user: string, md: string): string {
	return JSON.stringify({ kind: 'story', system: 'sys', user, model: 'claude-haiku-4-5', md });
}

async function inject(
	page: Page,
	title: string,
	html: string,
	id: string,
	source?: string,
	roll?: unknown,
) {
	await page.evaluate(
		({ title, html, id, source, roll }) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(window as any).__testLog.appendLog(title, html, id, source, roll);
		},
		{ title, html, id, source, roll },
	);
}

const entryById = (page: Page, id: string) => page.locator(`.log-entry[data-entry-id="${id}"]`);
const storyBtn = (page: Page) => page.locator('.story-btn');

/** Load /home with the AI key pre-seeded (read at module init) and the log clean. */
async function goToHome(page: Page) {
	await page.addInitScript((key) => localStorage.setItem('ironledger:ai:apiKey', key), AI_KEY);
	await page.goto('/home');
	await expect(storyBtn(page)).toBeVisible({ timeout: 12_000 });
}

test.describe('AI story generation', () => {
	test.beforeAll(async () => {
		await resetAll();
	});

	test.beforeEach(async ({ page }) => {
		await resetLog();
		await goToHome(page);
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
		await mockAnthropic(page, PROSE_B);

		await entryById(page, 'story-2').locator('.entry-regen-btn').click();
		const dialog = page.locator('dialog.story-dialog');
		await expect(dialog).toBeVisible();
		await dialog.locator('button:has-text("Start")').click();
		await expect(dialog.locator('.sd-output em')).toHaveText('quieter', { timeout: 8_000 });
		await dialog.locator('button:has-text("Save to Log")').click();

		// Same entry id, new body — replace in place.
		const body = entryById(page, 'story-2').locator('.entry-body');
		await expect(body).toContainText('she simply walked away');
		await expect(body.locator('em')).toHaveText('quieter');
		await expect(page.locator('.log-entry')).toHaveCount(1); // no duplicate appended
	});

	test('record → name → generate → save writes a titled Story entry', async ({ page }) => {
		await mockAnthropic(page, PROSE_A);

		await storyBtn(page).click(); // opens setup
		const dialog = page.locator('dialog.story-dialog');
		await dialog.locator('button:has-text("Begin Recording")').click();
		await expect(storyBtn(page)).toContainText('Stop');

		await inject(page, 'A deed', '<p>She acted.</p>', 'rec-1'); // captured

		await storyBtn(page).click(); // Stop → generate
		await expect(dialog).toBeVisible();
		await dialog.locator('input[placeholder="Story title…"]').fill('The Fall of Blackroot');
		await dialog.locator('button:has-text("Start")').click();
		await expect(dialog.locator('.sd-output strong')).toHaveText('Beepalache', { timeout: 8_000 });
		await dialog.locator('button:has-text("Save to Log")').click();

		const named = page.locator('.log-entry', { hasText: 'The Fall of Blackroot' });
		await expect(named).toHaveCount(1);
		await expect(named.locator('.entry-body strong')).toHaveText('Beepalache');
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
		await page.locator('button.menu-item:has-text("Export...")').click();
		const dialog = page.locator('dialog.export-dialog');
		await expect(dialog).toBeVisible();
		await dialog.locator('.ed-select').selectOption('stories');

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
