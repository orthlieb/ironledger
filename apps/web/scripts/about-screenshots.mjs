#!/usr/bin/env node
// =============================================================================
// about-screenshots.mjs — regenerate the About page's app screenshots
//
// Drives a running Iron Ledger (API + web) with Playwright: signs in, wipes the
// account, imports the Starter Ironlands, seeds a small demo campaign
// (about-screenshots/demo-campaign.mjs), plays a few turns through the log's
// command bar so the log has real rolls in it, then captures each feature into
// apps/web/static/about/<key>.webp (1200×800, the About carousel's 3:2 slot)
// plus the home hero (static/ironledger-home.webp, 1600×919, also copied to
// docs/images/ for the README).
//
// The artwork images (the Expeditions and Mobile composites, the AI
// Storyteller and login illustrations) are hand-made and left alone.
//
//   npm run screenshots:about -w apps/web
//
// Needs the stack up (see docs/about-screenshots.md) and an account it may
// wipe: by default the seeded dev user. ⚠ Everything on that account is
// deleted and replaced with the demo campaign. Override with env:
//   SCREENSHOT_WEB_URL   (default http://localhost:5173)
//   SCREENSHOT_API_URL   (default http://localhost:3000)
//   SCREENSHOT_EMAIL / SCREENSHOT_PASSWORD (default the seed dev user)
//   SCREENSHOT_ONLY      comma-separated shot keys (default: all) — e.g. log,moves
//
// Dice and oracle results are random, so every run gives a slightly different
// log; re-run until you like it.
// =============================================================================

import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	CHARACTER,
	ENCOUNTERS,
	EXPEDITIONS,
	PLAY,
	connections,
} from './about-screenshots/demo-campaign.mjs';

const WEB = process.env.SCREENSHOT_WEB_URL ?? 'http://localhost:5173';
const API = `${process.env.SCREENSHOT_API_URL ?? 'http://localhost:3000'}/api/v1`;
const CREDS = {
	email: process.env.SCREENSHOT_EMAIL ?? 'test@ironledger.local',
	password: process.env.SCREENSHOT_PASSWORD ?? 'IronLedgerTest2024!',
	captchaToken: 'dev-bypass',
};
const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATIC = path.resolve(HERE, '../static');
/** The README shows the same home hero. */
const README_HERO = path.resolve(HERE, '../../../docs/images/ironledger-home.webp');
const ONLY = process.env.SCREENSHOT_ONLY?.split(',')
	.map((s) => s.trim())
	.filter(Boolean);

/** Desktop viewport every shot is taken at (the home hero's size), at 3× for
 *  crisp downscaling — a single panel is ~600 CSS px wide. */
const VIEWPORT = { width: 1600, height: 919 };
const SCALE = 3;
/** Where the Maps shot looks: zoom ×fit, scroll position as fractions. */
const MAP_VIEW = { zoom: 3, pan: { fx: 0.66, fy: 0.62 } };
/** The starter import lands this many places; seeding waits for all of them. */
const STARTER_PLACES = 9;

// ── API ──────────────────────────────────────────────────────────────────────

async function login() {
	const res = await fetch(`${API}/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(CREDS),
	});
	if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
	return (await res.json()).accessToken;
}

function api(token) {
	const call = async (method, p, body) => {
		const res = await fetch(`${API}${p}`, {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				...(body ? { 'Content-Type': 'application/json' } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		if (!res.ok) throw new Error(`${method} ${p} failed: ${res.status} ${await res.text()}`);
		return res.status === 204 ? null : res.json().catch(() => null);
	};
	return {
		get: (p) => call('GET', p),
		post: (p, b) => call('POST', p, b),
		patch: (p, b) => call('PATCH', p, b),
		put: (p, b) => call('PUT', p, b),
		del: (p) => call('DELETE', p),
	};
}

/** Wipe everything the demo campaign touches. */
async function resetAccount(a) {
	for (const c of await a.get('/characters')) await a.del(`/characters/${c.id}`);
	for (const kind of ['encounters', 'expeditions', 'communities', 'npcs', 'places']) {
		await a.patch(`/session/${kind}`, { [kind]: [] });
	}
	await a.del('/session/log');
	const { maps = [] } = (await a.get('/session/maps')) ?? {};
	for (const m of maps) await a.del(`/session/maps/${m.id}`);
}

async function until(what, fn, timeout = 30_000) {
	const end = Date.now() + timeout;
	for (;;) {
		const v = await fn();
		if (v) return v;
		if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
		await new Promise((r) => setTimeout(r, 500));
	}
}

// ── Page helpers ─────────────────────────────────────────────────────────────

const AREA = {
	characters: '.home-area--characters',
	foes: '.home-area--foes',
	expeditions: '.home-area--expeditions',
	connections: '.home-area--communities',
	log: '.home-log',
};

/** Load /home with every panel populated. `prefs` are localStorage entries
 *  to set first (null removes one). */
async function openHome(page, prefs = {}) {
	if (Object.keys(prefs).length) {
		await page.evaluate((prefs) => {
			for (const [k, v] of Object.entries(prefs)) {
				if (v === null) localStorage.removeItem(k);
				else localStorage.setItem(k, v);
			}
		}, prefs);
	}
	await page.goto(`${WEB}/home`);
	await page.locator(`${AREA.connections} .cm-header-actions`).waitFor();
	await page.locator(`${AREA.characters} .ca-loading`).waitFor({ state: 'hidden' });
	await page.waitForLoadState('networkidle');
	await settle(page);
}

/** Let fonts, images and transitions finish. */
async function settle(page, ms = 400) {
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(ms);
}

/** Choose `name` in a panel's header combobox. */
async function pick(page, area, name) {
	await page.locator(`${area} .cb-trigger`).first().click();
	await page.locator('.cb-popover .cb-search').fill(name);
	await page.locator('.cb-popover .cb-item', { hasText: name }).first().click();
	await settle(page);
}

async function tab(page, area, name) {
	await page.locator(area).getByRole('tab', { name, exact: true }).click();
	await settle(page, 250);
}

/** Type into the log's command bar and submit. */
async function command(page, text) {
	const input = page.locator(`${AREA.log} input.cb-input`);
	await input.fill(text);
	await input.press('Enter');
	await settle(page, 300);
}

/** Close whatever dialog is open. */
async function dismiss(page) {
	await page.keyboard.press('Escape');
	await page.locator('[role="dialog"]').first().waitFor({ state: 'hidden' });
	await settle(page, 200);
}

// ── Capture ──────────────────────────────────────────────────────────────────

/**
 * A 3:2 crop of `box`. `fit: 'top'` keeps the box's width and takes the top
 * of it; `'cover'` grows the short side to 3:2 around the box's centre (a
 * dialog with some of the page behind it). Clamped to the viewport.
 */
function crop(box, { fit = 'top', pad = 0, aspect = 3 / 2 } = {}) {
	const b = {
		x: box.x - pad,
		y: box.y - pad,
		width: box.width + pad * 2,
		height: box.height + pad * 2,
	};
	let { x, y, width: w, height: h } = b;
	if (fit === 'top') {
		h = w / aspect;
	} else if (w / h > aspect) {
		h = w / aspect;
		y = b.y + b.height / 2 - h / 2;
	} else {
		w = h * aspect;
		x = b.x + b.width / 2 - w / 2;
	}
	x = Math.max(0, Math.min(x, VIEWPORT.width - w));
	y = Math.max(0, Math.min(y, VIEWPORT.height - h));
	return { x, y, width: w, height: h };
}

async function boxOf(locator) {
	const b = await locator.boundingBox();
	if (!b) throw new Error(`not visible: ${locator}`);
	return b;
}

/**
 * Screenshot `clip` and write it as a WebP of exactly width × height. The
 * browser does the encoding: the PNG is drawn onto a canvas at the target size
 * and read back with toDataURL, so nothing outside Playwright is needed.
 */
async function saveWebp(page, clip, rel, [width, height] = [1200, 800], copies = []) {
	// Park the pointer in the bottom-left gutter so no tooltip or hover shows.
	await page.mouse.move(2, VIEWPORT.height - 2);
	const png = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
	const dataUrl = await page.evaluate(
		async ({ src, width, height }) => {
			const img = new Image();
			img.src = src;
			await img.decode();
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(img, 0, 0, width, height);
			return canvas.toDataURL('image/webp', 0.86);
		},
		{ src: `data:image/png;base64,${png.toString('base64')}`, width, height },
	);
	if (!dataUrl.startsWith('data:image/webp')) throw new Error('this browser cannot encode WebP');
	const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
	for (const file of [path.join(STATIC, rel), ...copies]) writeFileSync(file, buf);
	console.log(`  ${rel}  ${width}×${height}  ${Math.round(buf.length / 1024)} KB`);
}

// ── Play ─────────────────────────────────────────────────────────────────────

/** Play the demo turns (PLAY) through the command bar: notes, moves, oracles. */
async function play(page) {
	for (const step of PLAY) {
		if (step.note) {
			await command(page, step.note);
		} else if (step.move) {
			await command(page, `/move ${step.move}`);
			const dialog = page.locator('.moves-dialog');
			if (step.option) await dialog.getByText(step.option, { exact: true }).click();
			await dialog.getByRole('button', { name: 'Roll Move' }).click();
			await dialog.waitFor({ state: 'hidden' });
			await settle(page, 300);
		} else if (step.oracle) {
			await command(page, `/oracle ${step.oracle}`);
			const dialog = page.locator('.oracles-dialog');
			await dialog.getByRole('button', { name: 'Roll', exact: true }).click();
			await settle(page, 300);
			if (await dialog.isVisible()) await dismiss(page);
		} else if (step.command) {
			await command(page, step.command);
		}
	}
}

// ── Shots ────────────────────────────────────────────────────────────────────
// Each takes a page on /home and writes one image.

const SHOTS = {
	/** The whole app — the About and login hero. */
	async home(page) {
		await openHome(page);
		await pick(page, AREA.expeditions, 'The Drowned Barrow');
		await pick(page, AREA.connections, 'Asha Vell');
		await saveWebp(
			page,
			{ x: 0, y: 0, ...VIEWPORT },
			'ironledger-home.webp',
			[1600, 919],
			[README_HERO],
		);
	},

	async characters(page) {
		await openHome(page);
		await tab(page, AREA.characters, 'Core');
		await saveWebp(page, crop(await boxOf(page.locator(AREA.characters))), 'about/characters.webp');
	},

	async foes(page) {
		await openHome(page);
		await page.locator(`${AREA.foes} .cb-trigger`).first().click();
		await page.locator('.cb-popover .cb-item', { hasText: 'New foe' }).click();
		const dialog = page.locator('.foe-dialog');
		await dialog.waitFor();
		await page.waitForLoadState('networkidle');
		await settle(page, 800);
		await saveWebp(page, crop(await boxOf(dialog)), 'about/foes.webp');
		await dismiss(page);
	},

	async maps(page) {
		await openHome(page);
		// The starter map is portrait; fullscreen at MAP_VIEW's zoom gives a
		// landscape slice of it with the demo pins.
		await openHome(page, { 'ironledger:map:fullscreen': '1' });
		await page.locator('.act-btn', { hasText: 'Map' }).click();
		const dialog = page.locator('.mp-dialog');
		await dialog.waitFor();
		await page.waitForLoadState('networkidle');
		await settle(page, 1200);
		// Opening focuses a toolbar button, whose tooltip would show.
		await page.evaluate(() => document.activeElement?.blur());
		await saveWebp(page, crop(await boxOf(dialog), { fit: 'cover' }), 'about/maps.webp');
		await dismiss(page);
		await openHome(page, { 'ironledger:map:fullscreen': null });
	},

	async oracles(page) {
		await openHome(page);
		await page.locator('.act-btn', { hasText: 'Ask' }).click();
		const dialog = page.locator('.oracles-dialog');
		await dialog.waitFor();
		await settle(page, 600);
		await saveWebp(page, crop(await boxOf(dialog)), 'about/oracles.webp');
		await dismiss(page);
	},

	async log(page) {
		// Widen the log so a 3:2 slice of it holds a few entries.
		await openHome(page, { 'il:home:logWidth:grid': '640' });
		await saveWebp(page, crop(await boxOf(page.locator(AREA.log))), 'about/log.webp');
		await openHome(page, { 'il:home:logWidth:grid': null });
	},

	async connections(page) {
		await openHome(page);
		await pick(page, AREA.connections, 'Barrow’s Edge');
		await saveWebp(
			page,
			crop(await boxOf(page.locator(AREA.connections))),
			'about/connections.webp',
		);
	},

	/** A move open and ready to roll. (The dialog closes as the 3D dice
	 *  start, so dice and dialog are never on screen together.) */
	async moves(page) {
		await openHome(page);
		await command(page, '/move Face Danger');
		const dialog = page.locator('.moves-dialog');
		await dialog.waitFor();
		await dialog.getByText('With speed, agility, or precision', { exact: true }).click();
		await settle(page, 600);
		await saveWebp(page, crop(await boxOf(dialog), { fit: 'cover', pad: 16 }), 'about/moves.webp');
		await dismiss(page);
	},
};

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	const unknown = (ONLY ?? []).filter((k) => !(k in SHOTS));
	if (unknown.length) throw new Error(`unknown SCREENSHOT_ONLY keys: ${unknown.join(', ')}`);

	console.log(`Signing in as ${CREDS.email} at ${API}`);
	const token = await login();
	const a = api(token);

	console.log('Wiping the account');
	await resetAccount(a);

	const browser = await chromium.launch();
	try {
		const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
		await context.addCookies([
			{ name: 'access_token', value: token, url: WEB, httpOnly: true, sameSite: 'Strict' },
			// Asks /home to import the Starter Ironlands (as after sign-up).
			{ name: 'il_seed_starter', value: '1', url: WEB, sameSite: 'Strict' },
		]);
		// Light theme, default livery and fonts; no 3D dice (rolls land in the
		// log at once) and no dice sound.
		await context.addInitScript(() => {
			localStorage.setItem('theme', 'light');
			localStorage.setItem('ironledger:dice3d', 'off');
			localStorage.setItem('ironledger:dice:sound', 'off');
		});
		const page = await context.newPage();

		console.log('Importing the Starter Ironlands');
		await page.goto(`${WEB}/home`);
		const places = await until('the starter import', async () => {
			const { places = [] } = await a.get('/session');
			return places.length >= STARTER_PLACES && places;
		});

		console.log('Seeding the demo campaign');
		await a.post('/characters', CHARACTER);
		await a.patch('/session/encounters', { encounters: ENCOUNTERS });
		await a.patch('/session/expeditions', { expeditions: EXPEDITIONS });
		const { communities, npcs, markers } = connections(places);
		await a.patch('/session/communities', { communities });
		await a.patch('/session/npcs', { npcs });
		// Pin them on the starter's map, and open it zoomed in on the pins.
		const [{ id: mapId }] = (await a.get('/session/maps')).maps;
		const map = await a.get(`/session/maps/${mapId}`);
		await a.put(`/session/maps/${mapId}/markers`, { markers: [...map.markers, ...markers] });
		await a.put(`/session/maps/${mapId}/settings`, {
			settings: { ...map.settings, view: MAP_VIEW },
		});

		console.log('Playing a few turns');
		await openHome(page);
		await pick(page, AREA.foes, 'Broken Tooth Raiders');
		await play(page);

		console.log(`Capturing → ${path.relative(process.cwd(), STATIC) || '.'}/`);
		for (const [key, shot] of Object.entries(SHOTS)) {
			if (ONLY && !ONLY.includes(key)) continue;
			await shot(page);
		}
	} finally {
		await browser.close();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
