// =============================================================================
// Draws the settlement playground's app icons (the installed web app's, on
// GitHub Pages) with the settlement kit itself:
//
//   npm run build:playground-icons -w apps/web
//
// A round tower with a crenellated top and lancet windows, and rising from
// inside its parapet a turret with a lancet (ogival) cap flying a pennant,
// on parchment, cropped below the tower's window so the top fills the
// icon. Writes, into scripts/settlement-kit/playground-icons/ (committed;
// build-playground.mjs --pwa copies them next to the page):
//
//   icon.svg                 rounded parchment tile: favicon, "any" icon
//   icon-192.png, -512.png   the same tile, rasterized
//   icon-maskable-512.png    full bleed, the tower inside the 80% safe zone
//   apple-touch-icon.png     full bleed, 180×180 (iOS rounds the corners)
//
// It's a local script, not a build step: the PNGs need a browser
// (Playwright's Chromium; set CHROMIUM_PATH to use another binary). Re-run it
// when you want the icon to pick up a change to the kit's drawing, and
// commit what it writes.
// =============================================================================

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PARCHMENT, toLayeredSvg } from '../../src/lib/settlement-kit/generate.js';
import { DEFAULT_DESIGN, roundTower } from '../../src/lib/settlement-kit/pieces3d.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'playground-icons');
const BG = PARCHMENT.halo; // the playground's own background
const EDGE = '#E2D7C2';

/** The tower: crenellated, with a lancet-capped turret inside its parapet. */
function towerSvg() {
	const base = { ...DEFAULT_DESIGN, window: 'lancet', flagShape: 'pennant', flags: true };
	const r = 10,
		h = 22;
	const outer = roundTower(
		{ ...base, towerRoof: 'none', towerCrenel: true },
		{ r, h, flags: false },
	);
	const turret = roundTower(
		{ ...base, towerRoof: 'lancet', towerCrenel: false },
		{ r: 6.5, h: 21 },
	);
	// The turret stands on the parapet's floor (the top of the 45° corbel
	// under the merlons; see roundTower), behind the tower, so the merlons
	// overlap its foot and it shows through the crenels.
	const floor = h + Math.max(0.8, r * 0.2);
	return toLayeredSvg(
		'Settlement playground',
		[{ piece: turret, y: floor }, { piece: outer }],
		PARCHMENT,
		{ texture: false },
	);
}

/**
 * The tower placed in a 512 box: its axis on the centre line, its top
 * (the pennant) at `top`, scaled so the share `show` of its height, from
 * the top down, spans `span` px; the rest runs off the bottom.
 * @param {string} svg @param {{top: number, span: number, show: number}} at
 */
function placed(svg, { top, span, show }) {
	const vb = /** @type {RegExpMatchArray} */ (svg.match(/viewBox="([^"]+)"/))[1];
	const [vx, , vw, vh] = vb.split(' ').map(Number);
	const s = span / (vh * show);
	const inner = svg
		.replace(/^<svg[^>]*>/, '')
		.replace(/<\/svg>\s*$/, '')
		.replace(/<!--[^>]*-->/, '');
	const x = 256 + vx * s; // the tower's axis (x = 0) on the centre line
	const f = (/** @type {number} */ n) => Number(n.toFixed(2));
	return `<svg x="${f(x)}" y="${top}" width="${f(vw * s)}" height="${f(vh * s)}" viewBox="${vb}">${inner}</svg>`;
}

const tower = towerSvg();
const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--Settlement playground — Iron Ledger settlement kit-->`;
const tile =
	`${head}\n<defs><clipPath id="tile"><rect x="16" y="16" width="480" height="480" rx="104"/></clipPath></defs>\n` +
	`<rect x="16" y="16" width="480" height="480" rx="104" fill="${BG}"/>\n` +
	`<g clip-path="url(#tile)">${placed(tower, { top: 52, span: 444, show: 0.92 })}</g>\n` +
	`<rect x="18" y="18" width="476" height="476" rx="102" fill="none" stroke="${EDGE}" stroke-width="4"/>\n</svg>\n`;
// Full bleed: maskable icons are cut to any shape down to the circle of 40%
// radius, so the pennant, cap and battlements stay inside it.
const bleed =
	`${head}\n<rect width="512" height="512" fill="${BG}"/>\n` +
	`${placed(tower, { top: 84, span: 428, show: 0.92 })}\n</svg>\n`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'icon.svg'), tile);

const browser = await chromium.launch(
	process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage();
/** @param {string} svg @param {number} px @param {string} file */
async function png(svg, px, file) {
	await page.setViewportSize({ width: px, height: px });
	await page.setContent(
		`<html><body style="margin:0;background:transparent"><img width="${px}" height="${px}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`,
	);
	await page.locator('img').evaluate((img) => /** @type {HTMLImageElement} */ (img).decode());
	await page.screenshot({ path: join(OUT, file), omitBackground: true });
}
await png(tile, 192, 'icon-192.png');
await png(tile, 512, 'icon-512.png');
await png(bleed, 512, 'icon-maskable-512.png');
await png(bleed, 180, 'apple-touch-icon.png');
await browser.close();
console.log('wrote', OUT);
