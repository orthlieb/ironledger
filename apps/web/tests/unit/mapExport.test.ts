/**
 * mapExport.test.ts
 *
 * Locks in the on-disk shape of the per-map zip export. `buildMapZipEntries`
 * is the pure helper both the per-map exporter and the "Everything"
 * bundle rely on; a change to what it puts in the zip is either an
 * intentional wire-format bump (bump the manifest version) or a bug
 * this test catches.
 *
 * `importMapZip` itself calls into the map store + the network, so it
 * lives outside this suite; the pure zip layer here already covers the
 * bytes side of the round-trip, and the store-integrated call is best
 * exercised end-to-end.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';

// mapStore.svelte.ts uses $state at module top; vitest doesn't run the
// Svelte 5 compiler, so a live import blows up with "$state is not
// defined". Mock the store's runtime with stubs — mapExport only calls
// these on the import path, not from buildMapZipEntries itself.
vi.mock('../../src/lib/mapStore.svelte.js', () => ({
	createMap: vi.fn(),
	mapState: { settings: {}, activeId: '', markers: [] },
	persistSettings: vi.fn(),
	replaceMarkers: vi.fn(),
	setBackground: vi.fn(),
	switchMap: vi.fn(),
}));

import { buildMapZipEntries } from '../../src/lib/mapExport.js';
import type { MapMarker, MapServerSettings } from '../../src/lib/mapStore.svelte.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MARKER: MapMarker = {
	id: 'm-1',
	x: 3.5,
	y: 2.25,
	label: 'Driftwood',
	icon: 'settlement/village',
	color: '#22c55e',
	entityId: 'place:abc123',
};

const SETTINGS: MapServerSettings = {
	aspect: 16 / 9,
	scale: { enabled: true, unit: 'miles', perHex: 5, segments: 4 },
	view: { zoom: 1 },
};

const FAKE_BG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG SOI + APP0

// ---------------------------------------------------------------------------
// Fetch stub — buildMapZipEntries fetches the background URL. Stubbing
// lets us assert both the "bytes present" and "bytes absent" paths
// without hitting the network.
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
			const url = typeof input === 'string' ? input : input.toString();
			if (url === 'good-url') {
				return new Response(FAKE_BG_BYTES, { status: 200 });
			}
			if (url === 'not-found') {
				return new Response('', { status: 404 });
			}
			if (url === 'boom') {
				throw new Error('network error');
			}
			return new Response('', { status: 404 });
		}),
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Envelope shape
// ---------------------------------------------------------------------------

describe('buildMapZipEntries — envelope', () => {
	it('always writes manifest.json + map.json', async () => {
		const files = await buildMapZipEntries({
			name: 'Test',
			markers: [],
			settings: {},
			backgroundUrl: '',
		});
		expect(files['manifest.json']).toBeDefined();
		expect(files['map.json']).toBeDefined();
	});

	it('manifest carries app / version / type / exportedAt', async () => {
		const files = await buildMapZipEntries({
			name: 'Test',
			markers: [],
			settings: {},
			backgroundUrl: '',
		});
		const manifest = JSON.parse(strFromU8(files['manifest.json']));
		expect(manifest.app).toBe('Iron Ledger');
		expect(manifest.version).toBe('1.0.0');
		expect(manifest.type).toBe('map');
		expect(typeof manifest.exportedAt).toBe('string');
		expect(() => new Date(manifest.exportedAt).toISOString()).not.toThrow();
	});

	it('map.json carries name, markers, settings verbatim', async () => {
		const files = await buildMapZipEntries({
			name: 'Regional',
			markers: [MARKER],
			settings: SETTINGS,
			backgroundUrl: '',
		});
		const body = JSON.parse(strFromU8(files['map.json']));
		expect(body.name).toBe('Regional');
		expect(body.markers).toEqual([MARKER]);
		expect(body.settings).toEqual(SETTINGS);
	});
});

// ---------------------------------------------------------------------------
// Background handling
// ---------------------------------------------------------------------------

describe('buildMapZipEntries — background', () => {
	it('omits background.jpg when no url is supplied', async () => {
		const files = await buildMapZipEntries({
			name: 'x',
			markers: [],
			settings: {},
			backgroundUrl: '',
		});
		expect(files['background.jpg']).toBeUndefined();
	});

	it('includes raw background bytes when fetch succeeds', async () => {
		const files = await buildMapZipEntries({
			name: 'x',
			markers: [],
			settings: {},
			backgroundUrl: 'good-url',
		});
		expect(files['background.jpg']).toEqual(FAKE_BG_BYTES);
	});

	it('omits background.jpg when the fetch 404s', async () => {
		const files = await buildMapZipEntries({
			name: 'x',
			markers: [],
			settings: {},
			backgroundUrl: 'not-found',
		});
		expect(files['background.jpg']).toBeUndefined();
	});

	it('omits background.jpg when the fetch throws', async () => {
		const files = await buildMapZipEntries({
			name: 'x',
			markers: [],
			settings: {},
			backgroundUrl: 'boom',
		});
		expect(files['background.jpg']).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Round-trip via fflate — assert an actual zip roundtrips to the same bytes
// ---------------------------------------------------------------------------

describe('buildMapZipEntries — fflate round-trip', () => {
	it('output can be zipSync/unzipSync-round-tripped losslessly', async () => {
		const { zipSync } = await import('fflate');
		const files = await buildMapZipEntries({
			name: 'Regional',
			markers: [MARKER],
			settings: SETTINGS,
			backgroundUrl: 'good-url',
		});
		const zipped = zipSync(files, { level: 6 });
		const back = unzipSync(zipped);
		expect(Object.keys(back).sort()).toEqual(
			['background.jpg', 'manifest.json', 'map.json'].sort(),
		);
		expect(back['background.jpg']).toEqual(FAKE_BG_BYTES);
		const body = JSON.parse(strFromU8(back['map.json']));
		expect(body.markers).toEqual([MARKER]);
		expect(body.settings).toEqual(SETTINGS);
	});
});
