// =============================================================================
// Iron Ledger — Campaign map state (Svelte 5 module-level $state)
//
// Tier 1a pivot: annotate an uploaded map image on a hex grid overlay.
// Storage shape:
//   { backgroundDataUrl, markers: MapMarker[], updatedAt }
//
// The old Tier 1 shape stored a `cells: HexCell[]` array of painted
// terrains — a completely different data model. That data is *reset on
// first load* under the new shape: any existing 'ironledger:map' payload
// missing the marker key is treated as an empty map. Migration is
// intentional (Tier 1 shipped moments before the pivot; near-zero users
// are affected) but readMap() is explicit about it so the behaviour is
// grep-findable.
//
// Persistence is per-mutation to localStorage. The background image is
// base64 in the same JSON — kept under MAP_IMAGE_MAX_STORED_BYTES by the
// downscaling step in MapDialog before it ever reaches the store.
// =============================================================================

import type { MarkerIcon } from './mapConstants.js';

const STORAGE_KEY = 'ironledger:map';

export interface MapMarker {
	/** Stable id — crypto.randomUUID() when the marker is created. Used as
	 *  the key in {#each} blocks and by the marker editor to look up the
	 *  row it's editing. */
	id: string;
	q: number;
	r: number;
	label: string;
	icon: MarkerIcon;
	/** Optional link to a first-class entity from the connections deck.
	 *  Format: "kind:id" (e.g. "place:abc123"). Rendered as a click-through
	 *  in later tiers; stored for future use here. */
	entityId?: string;
}

interface MapPayload {
	/** Base64 image data URL for the background layer; '' when no image is
	 *  set. Whole-string blob so the whole map round-trips through a single
	 *  localStorage read/write. */
	backgroundDataUrl: string;
	markers: MapMarker[];
	updatedAt: number;
}

function readMap(): MapPayload {
	if (typeof window === 'undefined') {
		return { backgroundDataUrl: '', markers: [], updatedAt: 0 };
	}
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { backgroundDataUrl: '', markers: [], updatedAt: 0 };
		const p = JSON.parse(raw) as Partial<MapPayload>;
		// Explicitly reject Tier 1 payloads (which had `cells` and no
		// `markers`). Discarding them is fine — Tier 1 shipped moments
		// before this pivot, so the migration path is documented and
		// deliberate.
		if (!('markers' in p)) return { backgroundDataUrl: '', markers: [], updatedAt: 0 };
		return {
			backgroundDataUrl: typeof p.backgroundDataUrl === 'string' ? p.backgroundDataUrl : '',
			markers: Array.isArray(p.markers) ? (p.markers as MapMarker[]) : [],
			updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
		};
	} catch {
		return { backgroundDataUrl: '', markers: [], updatedAt: 0 };
	}
}

function persist(): void {
	if (typeof window === 'undefined') return;
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify({
			backgroundDataUrl: mapState.backgroundDataUrl,
			markers: mapState.markers,
			updatedAt: Date.now(),
		}),
	);
}

const _initial = readMap();
export const mapState = $state<MapPayload>({
	backgroundDataUrl: _initial.backgroundDataUrl,
	markers: _initial.markers,
	updatedAt: _initial.updatedAt,
});

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

/** Every marker pinned to (q, r). Multiple markers per hex are permitted
 *  — game-mechanically a hex can hold a settlement AND an encounter — but
 *  the icon picker will only spawn one at a time; overloading is a Tier 2
 *  concern. Linear scan is fine at Tier-1a scale. */
export function markersAt(q: number, r: number): MapMarker[] {
	return mapState.markers.filter((m) => m.q === q && m.r === r);
}

/** True when any marker or background has been set — used to gate the
 *  "Clear map" button. */
export function hasAnyContent(): boolean {
	return mapState.markers.length > 0 || mapState.backgroundDataUrl !== '';
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Replace the background image with a fresh data URL. Pass '' to clear.
 *  Caller (MapDialog) is responsible for downscaling + quality checks
 *  before hand-off — the store just persists whatever it's given. */
export function setBackground(dataUrl: string): void {
	mapState.backgroundDataUrl = dataUrl;
	persist();
}

/** Add a new marker. Returns the assigned id so the caller can select it
 *  for immediate editing. */
export function addMarker(input: {
	q: number;
	r: number;
	label: string;
	icon: MarkerIcon;
	entityId?: string;
}): string {
	const id = crypto.randomUUID();
	mapState.markers.push({ id, ...input });
	persist();
	return id;
}

/** Update an existing marker in place — mutates the array element by
 *  reference so Svelte's proxy triggers a targeted re-render. */
export function updateMarker(id: string, patch: Partial<Omit<MapMarker, 'id'>>): void {
	const idx = mapState.markers.findIndex((m) => m.id === id);
	if (idx < 0) return;
	mapState.markers[idx] = { ...mapState.markers[idx], ...patch };
	persist();
}

/** Remove a marker by id. No-op if the id doesn't exist. */
export function removeMarker(id: string): void {
	const idx = mapState.markers.findIndex((m) => m.id === id);
	if (idx < 0) return;
	mapState.markers.splice(idx, 1);
	persist();
}

/** Wipe everything — background image + all markers. Callers should
 *  confirm with the user first. */
export function clearMap(): void {
	mapState.backgroundDataUrl = '';
	mapState.markers = [];
	persist();
}
