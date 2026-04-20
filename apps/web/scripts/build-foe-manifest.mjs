#!/usr/bin/env node
/**
 * build-foe-manifest.mjs
 *
 * Globs apps/web/static/foes/ and writes manifest.json mapping each foe's
 * kebab-case slug to the list of portrait files that belong to it. Invoked
 * automatically as `prebuild` before `vite build`.
 *
 * File → foe matching rule:
 *   Given a foe with slug S, a file "X.webp" belongs to that foe when
 *   X equals S   (the primary)              e.g. bear.webp → bear
 *   X ends in "-S"  (a prefix variant)      e.g. azure-locus.webp → locus
 *
 * When multiple foe slugs would match, the longest wins. That makes multi-
 * word foes with suffix-overlapping names unambiguous — e.g. a future
 * "Cave Beast" (slug "cave-beast") file wouldn't be misattributed to "Beast".
 *
 * Ordering: the exact-match (primary) file is listed first if it exists;
 * the rest are sorted alphabetically.
 *
 * Files that don't match any foe (unknown-foe.webp, manifest.json itself,
 * any stragglers) are skipped with a warning — the build does not fail.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, '..', '..', '..');
const FOE_DATA   = resolve(REPO_ROOT, 'apps/api/data/foes');
const STATIC_DIR = resolve(REPO_ROOT, 'apps/web/static/foes');
const MANIFEST   = join(STATIC_DIR, 'manifest.json');

// Skip the overrides file + the manifest itself.
const FOE_JSON = ['foes_ironsworn.json', 'foes_delve.json', 'foes_yrt.json'];
const SKIP_FILES = new Set(['manifest.json', 'unknown-foe.webp']);

function slug(name) {
	return name.toLowerCase().replace(/\s+/g, '-');
}

// ---------------------------------------------------------------------------
// Collect foe names from the data JSON (source of truth for who exists).
// ---------------------------------------------------------------------------
const foes = [];
for (const f of FOE_JSON) {
	const p = join(FOE_DATA, f);
	let raw;
	try {
		raw = readFileSync(p, 'utf8');
	} catch (err) {
		console.warn(`[foe-manifest] skip ${f}: ${err.message}`);
		continue;
	}
	const data = JSON.parse(raw);
	for (const foe of data.foes ?? []) {
		if (!foe?.name) continue;
		foes.push({ name: foe.name, slug: slug(foe.name) });
	}
}

// Sort slugs longest-first so we can do a first-match wins loop.
const slugsByLength = [...new Set(foes.map((f) => f.slug))]
	.sort((a, b) => b.length - a.length);

// ---------------------------------------------------------------------------
// Scan the static dir and group files by foe slug.
// ---------------------------------------------------------------------------
const files = readdirSync(STATIC_DIR)
	.filter((f) => f.endsWith('.webp') && !SKIP_FILES.has(f));

/** slug → [filename, …] */
const groups = Object.create(null);
const orphans = [];

for (const file of files) {
	const base = file.slice(0, -'.webp'.length);   // strip extension

	let matched = null;
	for (const s of slugsByLength) {
		if (base === s || base.endsWith(`-${s}`)) {
			matched = s;
			break;
		}
	}

	if (matched === null) {
		orphans.push(file);
		continue;
	}

	(groups[matched] ??= []).push(file);
}

// ---------------------------------------------------------------------------
// Sort each group: primary (exact-slug match) first, rest alphabetical.
// ---------------------------------------------------------------------------
for (const s of Object.keys(groups)) {
	const primary = `${s}.webp`;
	const rest = groups[s].filter((f) => f !== primary).sort();
	groups[s] = groups[s].includes(primary) ? [primary, ...rest] : rest;
}

// Write manifest with stable key order (alphabetical).
const sorted = Object.fromEntries(Object.keys(groups).sort().map((k) => [k, groups[k]]));
writeFileSync(MANIFEST, JSON.stringify(sorted, null, '\t') + '\n');

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const foeCount   = Object.keys(sorted).length;
const imageCount = Object.values(sorted).reduce((n, arr) => n + arr.length, 0);
const multi      = Object.entries(sorted).filter(([, arr]) => arr.length > 1);

console.log(`[foe-manifest] ${foeCount} foes, ${imageCount} images`);
if (multi.length) {
	console.log(`[foe-manifest] multi-image foes:`);
	for (const [s, arr] of multi) {
		console.log(`  ${s.padEnd(24)} ${arr.length} — ${arr.join(', ')}`);
	}
}
if (orphans.length) {
	console.warn(`[foe-manifest] ${orphans.length} orphan file(s) not matched to any foe:`);
	for (const f of orphans) console.warn(`  ${f}`);
}
