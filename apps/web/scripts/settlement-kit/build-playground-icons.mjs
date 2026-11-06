// =============================================================================
// Makes the settlement playground's app icons (the installed web app's, on
// GitHub Pages) from playground-icon-tower.svg:
//
//   npm run build:playground-icons -w apps/web
//
// The tower is a round tower exported from the playground itself (default
// culture: corbelled, crenellated, a cone cap flying a pennant). It's set on
// parchment, cropped below its window so the top fills the icon. Writes,
// into scripts/settlement-kit/playground-icons/ (committed;
// build-playground.mjs --pwa copies them next to the page):
//
//   icon.svg                 rounded parchment tile: favicon, "any" icon
//   icon-192.png, -512.png   the same tile, rasterized
//   icon-maskable-512.png    full bleed, the tower inside the 80% safe zone
//   apple-touch-icon.png     full bleed, 180×180 (iOS rounds the corners)
//
// To change the icon, export another piece from the playground (its SVG
// button), save it over playground-icon-tower.svg and re-run this. The
// framing below assumes the playground's export: the tower's axis at x = 0.
// It's a local script, not a build step: the PNGs need a browser
// (Playwright's Chromium; set CHROMIUM_PATH to use another binary). Commit
// what it writes.
// =============================================================================

import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'playground-icons');
const BG = '#F4EFE4'; // the playground's own background, and the tower's halo
const EDGE = '#E2D7C2';

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

const tower = readFileSync(join(HERE, 'playground-icon-tower.svg'), 'utf-8').trim();
const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><!--Settlement playground — Iron Ledger settlement kit-->`;
const tile =
	`${head}\n<defs><clipPath id="tile"><rect x="16" y="16" width="480" height="480" rx="104"/></clipPath></defs>\n` +
	`<rect x="16" y="16" width="480" height="480" rx="104" fill="${BG}"/>\n` +
	`<g clip-path="url(#tile)">${placed(tower, { top: 52, span: 444, show: 0.74 })}</g>\n` +
	`<rect x="18" y="18" width="476" height="476" rx="102" fill="none" stroke="${EDGE}" stroke-width="4"/>\n</svg>\n`;
// Full bleed: maskable icons are cut to any shape down to the circle of 40%
// radius, so the pennant, cap and battlements stay inside it.
const bleed =
	`${head}\n<rect width="512" height="512" fill="${BG}"/>\n` +
	`${placed(tower, { top: 84, span: 428, show: 0.74 })}\n</svg>\n`;

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
