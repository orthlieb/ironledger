/**
 * yrtStarterZip.test.ts
 *
 * Verifies the shipped `apps/web/static/about/yrt-starter.zip` — the bundle
 * the About-page download link serves — parses cleanly through the same
 * import pipeline manual imports use, and that its bundled Atlas artwork
 * survives the `imageUrlFile` → `imageUrl` reassembly.
 *
 * The zip is generated outside this repo (yrt-vault's tooling/refresh-starter.py)
 * and committed as a binary, so nothing here would otherwise catch it drifting
 * past a limit. Both caps guarded below are real rejection points:
 *   • MAX_BYTES (importSanitizer) rejects the whole archive.
 *   • MAX_IMAGE_DATA_URL_LEN (api/src/lib/imageUrl.ts) rejects per portrait,
 *     which would import most of the world and silently drop some pictures.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { parseImportZip } from '../../src/lib/importSanitizer.js';

const STARTER_PATH = resolve(__dirname, '../../static/about/yrt-starter.zip');
const MAX_BYTES = 20 * 1024 * 1024; // importSanitizer
const MAX_IMAGE_DATA_URL_LEN = 1_200_000; // apps/api/src/lib/imageUrl.ts

const bytes = () => new Uint8Array(readFileSync(STARTER_PATH));
type Row = { name: string; imageUrl?: string; imageUrlFile?: string };
const body = () =>
	(parseImportZip(bytes()) as { data: { communities: Row[]; places: Row[] } }).data;

describe('YRT starter zip', () => {
	it('parses through parseImportZip without throwing', () => {
		expect(() => parseImportZip(bytes())).not.toThrow();
	});

	it('stays under the archive size cap', () => {
		expect(bytes().length).toBeLessThan(MAX_BYTES);
	});

	it('carries the advertised settlements and places', () => {
		const d = body();
		expect(d.communities).toHaveLength(15);
		expect(d.places).toHaveLength(22);
	});

	it('reassembles every bundled figure into an inline imageUrl', () => {
		const d = body();
		const rows = [...d.communities, ...d.places];
		const withArt = rows.filter((r) => typeof r.imageUrl === 'string');
		// 31 of the 37 entries have Atlas artwork; the six waters and the two
		// Falter Bay stations have none yet.
		expect(withArt).toHaveLength(31);
		for (const r of withArt) {
			expect(r.imageUrl, r.name).toMatch(/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/);
			// The `File` reference must not leak past the reassembler.
			expect(r.imageUrlFile, r.name).toBeUndefined();
		}
	});

	it('keeps every portrait under the API data-URL cap', () => {
		const rows = [...body().communities, ...body().places];
		for (const r of rows) {
			if (!r.imageUrl) continue;
			expect(r.imageUrl.length, `${r.name} portrait`).toBeLessThan(MAX_IMAGE_DATA_URL_LEN);
		}
	});

	it('leaves no orphaned image files in the archive', () => {
		const entries = Object.keys(unzipSync(bytes()));
		const rows = [...body().communities, ...body().places];
		// Reassembly strips imageUrlFile, so re-read the raw JSON for the refs.
		const raw = JSON.parse(
			new TextDecoder().decode(unzipSync(bytes())['everything.json']),
		) as Record<string, Row[]>;
		const refs = new Set(
			[...raw.communities, ...raw.places].map((r) => r.imageUrlFile).filter(Boolean),
		);
		expect(refs.size).toBe(rows.filter((r) => r.imageUrl).length);
		for (const ref of refs) expect(entries).toContain(ref);
		for (const e of entries.filter((n) => n.startsWith('images/'))) expect(refs).toContain(e);
	});

	it('bundles the regional map with its background', () => {
		const entries = Object.keys(unzipSync(bytes()));
		expect(entries.some((n) => /^maps\/[^/]+\/map\.json$/.test(n))).toBe(true);
		expect(entries.some((n) => /^maps\/[^/]+\/background\.jpg$/.test(n))).toBe(true);
	});
});
