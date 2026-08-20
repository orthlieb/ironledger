/**
 * starterZip.test.ts
 *
 * Verifies the shipped `apps/web/static/about/ironlands-starter.zip` — the
 * bundle the About-page download link serves AND the register-time seed
 * cookie auto-imports on first load of /home — parses cleanly through the
 * same import pipeline manual imports use. Guards against silent breakage
 * if the zip is regenerated with a schema drift, over-limit bytes, or a
 * missing manifest.
 *
 * Also asserts the current contents advertised on the About page: places
 * and a map, no characters or communities. If a future starter adds one
 * of those, update both the copy and this assertion.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { parseImportZip } from '../../src/lib/importSanitizer.js';

const STARTER_PATH = resolve(__dirname, '../../static/about/ironlands-starter.zip');

describe('Starter Ironlands zip', () => {
	it('parses through parseImportZip without throwing', () => {
		const bytes = new Uint8Array(readFileSync(STARTER_PATH));
		expect(() => parseImportZip(bytes)).not.toThrow();
	});

	it('returns a { manifest, data } envelope shaped like a real export', () => {
		const bytes = new Uint8Array(readFileSync(STARTER_PATH));
		const out = parseImportZip(bytes) as { manifest?: unknown; data?: unknown };
		expect(out).toBeTypeOf('object');
		expect(out.manifest).toBeDefined();
		expect(out.data).toBeDefined();
		expect(typeof out.data).toBe('object');
	});

	it('body carries places, no chars/communities/npcs', () => {
		const bytes = new Uint8Array(readFileSync(STARTER_PATH));
		const out = parseImportZip(bytes) as { data?: Record<string, unknown> };
		const data = out.data ?? {};
		// Places are the promised payload for the entity body.
		expect(Array.isArray(data.places)).toBe(true);
		expect((data.places as unknown[]).length).toBeGreaterThan(0);
		// Characters / communities / npcs — the About page copy says these are
		// left to the player. If a future starter bundles them, tighten the copy
		// or bump this expectation on purpose.
		const chars = (data.characters as unknown[] | undefined) ?? [];
		const communities = (data.communities as unknown[] | undefined) ?? [];
		const npcs = (data.npcs as unknown[] | undefined) ?? [];
		expect(chars.length).toBe(0);
		expect(communities.length).toBe(0);
		expect(npcs.length).toBe(0);
	});

	it('bundles at least one map — nested maps/<id>/{manifest,map,background} files', () => {
		// Maps ride along in the Everything export as `maps/<id>/…` dirs (see
		// restoreBundledMaps in /home). They're NOT surfaced through
		// parseImportZip's data body — the map importer unzips separately. So
		// peek the raw entries here and assert the bundle carries at least one.
		const bytes = new Uint8Array(readFileSync(STARTER_PATH));
		const entries = unzipSync(bytes);
		const mapNames = Object.keys(entries).filter((p) => p.startsWith('maps/'));
		expect(mapNames.length).toBeGreaterThan(0);
		// Each map dir should have both a manifest.json and a map.json; a
		// background image is optional but the starter ships one.
		const mapIds = new Set<string>();
		for (const p of mapNames) {
			const m = /^maps\/([^/]+)\//.exec(p);
			if (m) mapIds.add(m[1]);
		}
		for (const id of mapIds) {
			expect(entries[`maps/${id}/manifest.json`]).toBeDefined();
			expect(entries[`maps/${id}/map.json`]).toBeDefined();
		}
	});
});
