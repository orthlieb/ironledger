/**
 * importSanitizerZip.test.ts
 *
 * Coverage for the `.zip` import path added when the exporter switched
 * from single-file JSON to a zip bundle. Locks in the round-trip shape
 * that `parseImportZip` produces and every user-facing error branch —
 * so the sanitiser doesn't quietly regress into accepting a malformed
 * or oversized archive.
 *
 * Portrait bytes are reassembled from `images/*` entries onto the
 * originating entity via the `imageUrlFile` → `imageUrl` /
 * `portraitFile` → `portrait` field maps. The `sanitize()` pass still
 * runs after reassembly, so poison keys and oversized values are
 * caught in either format.
 */

import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parseImportZip } from '../../src/lib/importSanitizer.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Tiny 3-byte payload standing in for image bytes — we don't need a real
 *  JPEG; the reassembler only cares that the entry resolves to bytes. */
const FAKE_JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff]);
const FAKE_JPEG_DATA_URL = `data:image/jpeg;base64,${btoa('\xff\xd8\xff')}`;

const FAKE_PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e]);
const FAKE_PNG_DATA_URL = `data:image/png;base64,${btoa('\x89PN')}`;

function buildZip(files: Record<string, Uint8Array>): Uint8Array {
	return zipSync(files, { level: 0 });
}

function manifest(overrides: Record<string, unknown> = {}): Uint8Array {
	return strToU8(
		JSON.stringify({
			app: 'Iron Ledger',
			version: '1.0.0',
			exportedAt: '2026-07-24T00:00:00.000Z',
			type: 'everything',
			count: 1,
			...overrides,
		}),
	);
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('parseImportZip — happy path', () => {
	it('returns a { manifest, data } envelope', () => {
		const zip = buildZip({
			'manifest.json': manifest(),
			'everything.json': strToU8(JSON.stringify({ characters: [] })),
		});
		const result = parseImportZip(zip) as { manifest: unknown; data: unknown };
		expect(result).toHaveProperty('manifest');
		expect(result).toHaveProperty('data');
		expect(result.data).toEqual({ characters: [] });
	});

	it('reassembles imageUrlFile → inline imageUrl (JPEG)', () => {
		const zip = buildZip({
			'manifest.json': manifest({ type: 'communities' }),
			'communities.json': strToU8(
				JSON.stringify({
					communities: [{ id: 'c1', name: 'Driftwood', imageUrlFile: 'images/portrait-1.jpg' }],
				}),
			),
			'images/portrait-1.jpg': FAKE_JPEG_BYTES,
		});
		const result = parseImportZip(zip) as { data: { communities: [{ imageUrl: string }] } };
		expect(result.data.communities[0].imageUrl).toBe(FAKE_JPEG_DATA_URL);
		expect((result.data.communities[0] as Record<string, unknown>).imageUrlFile).toBeUndefined();
	});

	it('reassembles portraitFile → data.portrait (character shape)', () => {
		const zip = buildZip({
			'manifest.json': manifest({ type: 'character' }),
			'character.json': strToU8(
				JSON.stringify({
					name: 'Hero',
					data: { portraitFile: 'images/portrait-1.jpg', background: 'wanderer' },
				}),
			),
			'images/portrait-1.jpg': FAKE_JPEG_BYTES,
		});
		const result = parseImportZip(zip) as {
			data: { name: string; data: { portrait: string; background: string; portraitFile?: string } };
		};
		expect(result.data.data.portrait).toBe(FAKE_JPEG_DATA_URL);
		expect(result.data.data.background).toBe('wanderer');
		expect(result.data.data.portraitFile).toBeUndefined();
	});

	it('preserves PNG mime by file extension', () => {
		const zip = buildZip({
			'manifest.json': manifest({ type: 'communities' }),
			'communities.json': strToU8(
				JSON.stringify({
					communities: [{ id: 'c1', name: 'X', imageUrlFile: 'images/portrait-1.png' }],
				}),
			),
			'images/portrait-1.png': FAKE_PNG_BYTES,
		});
		const result = parseImportZip(zip) as { data: { communities: [{ imageUrl: string }] } };
		expect(result.data.communities[0].imageUrl).toBe(FAKE_PNG_DATA_URL);
	});

	it('walks arrays and nested objects', () => {
		const zip = buildZip({
			'manifest.json': manifest({ type: 'expeditions' }),
			'expeditions.json': strToU8(
				JSON.stringify([
					{ id: 'e1', name: 'One', imageUrlFile: 'images/portrait-1.jpg' },
					{ id: 'e2', name: 'Two', imageUrlFile: 'images/portrait-2.jpg', nested: { deep: 1 } },
				]),
			),
			'images/portrait-1.jpg': FAKE_JPEG_BYTES,
			'images/portrait-2.jpg': FAKE_JPEG_BYTES,
		});
		const result = parseImportZip(zip) as {
			data: [{ imageUrl: string }, { imageUrl: string; nested: { deep: number } }];
		};
		expect(result.data[0].imageUrl).toBe(FAKE_JPEG_DATA_URL);
		expect(result.data[1].imageUrl).toBe(FAKE_JPEG_DATA_URL);
		expect(result.data[1].nested).toEqual({ deep: 1 });
	});

	it('silently drops a portraitFile pointing at a missing entry', () => {
		// Matches the legacy behaviour where a portrait fetch that
		// returned empty left the entity with no imageUrl — better to
		// import the entity anyway than to reject the whole zip.
		const zip = buildZip({
			'manifest.json': manifest({ type: 'communities' }),
			'communities.json': strToU8(
				JSON.stringify({
					communities: [{ id: 'c1', name: 'X', imageUrlFile: 'images/does-not-exist.jpg' }],
				}),
			),
		});
		const result = parseImportZip(zip) as {
			data: { communities: [Record<string, unknown>] };
		};
		expect(result.data.communities[0]).not.toHaveProperty('imageUrl');
		expect(result.data.communities[0]).not.toHaveProperty('imageUrlFile');
	});

	it("honours manifest.body when it's set", () => {
		// Some future exporter might use a non-standard body filename;
		// the pointer in the manifest lets it be found without extending
		// the BODY_CANDIDATES list.
		const zip = buildZip({
			'manifest.json': manifest({ type: 'custom', body: 'my-body.json' }),
			'my-body.json': strToU8(JSON.stringify({ ok: true })),
		});
		const result = parseImportZip(zip) as { data: { ok: boolean } };
		expect(result.data.ok).toBe(true);
	});

	it('runs the sanitiser after reassembly (poison keys stripped)', () => {
		const zip = buildZip({
			'manifest.json': manifest({ type: 'everything' }),
			'everything.json': strToU8(
				'{ "characters": [ { "name": "X", "__proto__": { "polluted": true } } ] }',
			),
		});
		const result = parseImportZip(zip) as { data: { characters: [Record<string, unknown>] } };
		expect(result.data.characters[0]).not.toHaveProperty('__proto__');
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Error paths — each one is a specific ImportError with a user-facing message
// ---------------------------------------------------------------------------

describe('parseImportZip — error handling', () => {
	it('rejects garbage bytes as invalid archive', () => {
		expect(() => parseImportZip(new Uint8Array([1, 2, 3, 4, 5]))).toThrowError(
			/not a valid \.zip archive/i,
		);
	});

	it('rejects a zip missing manifest.json', () => {
		const zip = buildZip({
			'everything.json': strToU8(JSON.stringify({ characters: [] })),
		});
		expect(() => parseImportZip(zip)).toThrowError(/missing manifest\.json/i);
	});

	it('rejects a zip whose manifest.json is not valid JSON', () => {
		const zip = buildZip({
			'manifest.json': strToU8('not-json'),
			'everything.json': strToU8(JSON.stringify({ characters: [] })),
		});
		expect(() => parseImportZip(zip)).toThrowError(/manifest\.json is not valid JSON/i);
	});

	it('rejects a zip with no recognised body file', () => {
		const zip = buildZip({
			'manifest.json': manifest({ type: 'everything' }),
			'random.json': strToU8(JSON.stringify({ foo: 'bar' })),
		});
		expect(() => parseImportZip(zip)).toThrowError(/missing its data JSON file/i);
	});

	it('rejects a zip whose body file is not valid JSON', () => {
		const zip = buildZip({
			'manifest.json': manifest({ type: 'everything' }),
			'everything.json': strToU8('{ not: json'),
		});
		expect(() => parseImportZip(zip)).toThrowError(/is not valid JSON/i);
	});

	it('rejects an oversized zip', () => {
		const huge = new Uint8Array(6 * 1024 * 1024); // 6 MB > 5 MB cap
		expect(() => parseImportZip(huge)).toThrowError(/too large/i);
	});

	it('rejects a zip whose decompressed contents exceed the bomb cap', () => {
		// The bomb cap is 4 × MAX_BYTES (5 MB) = 20 MB total decompressed.
		// Build a zip small enough to slip past the outer 5 MB file-size
		// guard but that unpacks to ~27 MB. `zipSync` at level 9 crushes
		// all-zero bytes down to a few kB, giving us the classic zip-bomb
		// shape.
		const bigChunk = new Uint8Array(9 * 1024 * 1024); // 9 MB of zeros — very compressible
		const zip = zipSync(
			{
				'manifest.json': manifest({ type: 'everything' }),
				'everything.json': strToU8(JSON.stringify({ characters: [] })),
				'images/bomb-1.jpg': bigChunk,
				'images/bomb-2.jpg': bigChunk,
				'images/bomb-3.jpg': bigChunk,
			},
			{ level: 9 },
		);
		expect(zip.length).toBeLessThan(5 * 1024 * 1024); // sanity: outer cap wouldn't catch it
		expect(() => parseImportZip(zip)).toThrowError(/decompresses to more than/i);
	});
});
