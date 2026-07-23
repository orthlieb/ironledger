// =============================================================================
// Iron Ledger — Campaign map state (Svelte 5 module-level $state)
//
// Server-backed. Replaces the earlier localStorage store. Rationale:
// storing the map on the server means it syncs across the user's devices
// and survives a browser wipe — the two loss modes the localStorage
// version routinely hit.
//
// Shape lives at /api/session/map (see docs/campaign-map.md). The
// background image lives in the portrait blob store, referenced by hash
// and served at /api/session/map/background — the client renders it via
// an <image href="/api/session/map/background?v={hash}"> so browser
// caching + ETag revalidation come for free.
//
// Mutations are optimistic: the local proxy updates immediately for a
// responsive UI, then a PUT fires. On PUT failure we surface a status
// and mark the store dirty (Tier 1a: minimal error UX; a proper retry
// queue is Tier 2 if the failure mode ever matters in practice).
//
// Old localStorage payloads at 'ironledger:map' are removed on init so
// they don't confuse anyone digging through devtools. No migration to
// the server: Tier 1/1a were both browser-only pre-releases.
// =============================================================================

const LEGACY_STORAGE_KEY = 'ironledger:map';

export interface MapMarker {
	/** Stable id — crypto.randomUUID() when the marker is created. Used as
	 *  the key in {#each} blocks and by the marker editor to look up the
	 *  row it's editing. */
	id: string;
	q: number;
	r: number;
	label: string;
	/** Manifest key of the icon: "<category>/<slug>", e.g. "places/settlement".
	 *  Legacy markers may hold a bare slug (e.g. "settlement"); the render
	 *  path falls back to a slug-only lookup for backwards compat. */
	icon: string;
	/** CSS color for the icon fill. Any valid CSS color. Optional so
	 *  existing pre-color markers still parse; the render path falls
	 *  back to a default. */
	color?: string;
	/** Optional link to a first-class entity from the connections deck.
	 *  Format: "kind:id" (e.g. "place:abc123"). Bare-click on a linked
	 *  marker jumps to the entity in the sheet. */
	entityId?: string;
}

interface MapState {
	loaded: boolean;
	loading: boolean;
	error: string;
	markers: MapMarker[];
	/** md5 hash of the background image, or '' when no image is set.
	 *  Doubles as the cache-buster in the <image href="…?v={hash}"> URL. */
	backgroundHash: string;
}

export const mapState = $state<MapState>({
	loaded: false,
	loading: false,
	error: '',
	markers: [],
	backgroundHash: '',
});

/** URL for the background image or '' when there's no image. Includes the
 *  hash as a cache-buster so <img> reloads when the background changes.
 *  Reactive on `mapState.backgroundHash`; MapDialog binds `href` to this. */
export function backgroundUrl(): string {
	if (!mapState.backgroundHash) return '';
	return `/api/session/map/background?v=${encodeURIComponent(mapState.backgroundHash)}`;
}

// ---------------------------------------------------------------------------
// Init — fetch the map on first dialog open. Idempotent.
// ---------------------------------------------------------------------------

let _initPromise: Promise<void> | null = null;

export function initMap(): Promise<void> {
	if (mapState.loaded) return Promise.resolve();
	if (_initPromise) return _initPromise;
	_initPromise = (async () => {
		mapState.loading = true;
		mapState.error = '';
		try {
			const res = await fetch('/api/session/map');
			if (!res.ok) throw new Error(`Server returned ${res.status}`);
			const body = (await res.json()) as {
				markers?: MapMarker[];
				backgroundHash?: string | null;
			};
			mapState.markers = Array.isArray(body.markers) ? body.markers : [];
			mapState.backgroundHash = body.backgroundHash ?? '';
			mapState.loaded = true;
			// Sweep the legacy localStorage payload — the old browser-only
			// map is fully superseded by the server round-trip.
			if (typeof window !== 'undefined') localStorage.removeItem(LEGACY_STORAGE_KEY);
		} catch (err) {
			mapState.error = err instanceof Error ? err.message : 'Failed to load map';
		} finally {
			mapState.loading = false;
			_initPromise = null;
		}
	})();
	return _initPromise;
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

export function markersAt(q: number, r: number): MapMarker[] {
	return mapState.markers.filter((m) => m.q === q && m.r === r);
}

export function hasAnyContent(): boolean {
	return mapState.markers.length > 0 || mapState.backgroundHash !== '';
}

// ---------------------------------------------------------------------------
// Mutations — optimistic local update, PUT to server, revert on error.
// ---------------------------------------------------------------------------

async function persistMarkers(): Promise<void> {
	try {
		const res = await fetch('/api/session/map/markers', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ markers: mapState.markers }),
		});
		if (!res.ok) throw new Error(`Server returned ${res.status}`);
		mapState.error = '';
	} catch (err) {
		mapState.error = err instanceof Error ? err.message : 'Failed to save markers';
	}
}

/** Add a new marker. Returns the assigned id so callers can select it for
 *  immediate editing. Optimistic — id is minted client-side and the array
 *  is updated before the PUT fires. */
export function addMarker(input: {
	q: number;
	r: number;
	label: string;
	icon: string;
	color?: string;
	entityId?: string;
}): string {
	const id = crypto.randomUUID();
	mapState.markers.push({ id, ...input });
	void persistMarkers();
	return id;
}

export function updateMarker(id: string, patch: Partial<Omit<MapMarker, 'id'>>): void {
	const idx = mapState.markers.findIndex((m) => m.id === id);
	if (idx < 0) return;
	mapState.markers[idx] = { ...mapState.markers[idx], ...patch };
	void persistMarkers();
}

export function removeMarker(id: string): void {
	const idx = mapState.markers.findIndex((m) => m.id === id);
	if (idx < 0) return;
	mapState.markers.splice(idx, 1);
	void persistMarkers();
}

/** Upload a fresh background image. `dataUrl` is a `data:image/…;base64,…`
 *  string (produced by mapImage.downscaleImage). Server responds with the
 *  content hash which we adopt as the new backgroundHash. */
export async function setBackground(dataUrl: string): Promise<void> {
	try {
		const res = await fetch('/api/session/map/background', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ dataUrl }),
		});
		if (!res.ok) throw new Error(`Server returned ${res.status}`);
		const body = (await res.json()) as { hash?: string };
		if (body.hash) mapState.backgroundHash = body.hash;
		mapState.error = '';
	} catch (err) {
		mapState.error = err instanceof Error ? err.message : 'Failed to upload image';
	}
}

/** Wipe the entire map — background + markers. Callers should confirm
 *  before invoking. */
export async function clearMap(): Promise<void> {
	// Optimistic — clear locally first, then hit the server.
	mapState.markers = [];
	mapState.backgroundHash = '';
	try {
		const res = await fetch('/api/session/map', { method: 'DELETE' });
		if (!res.ok) throw new Error(`Server returned ${res.status}`);
		mapState.error = '';
	} catch (err) {
		mapState.error = err instanceof Error ? err.message : 'Failed to clear map';
	}
}

/** Wipe every marker but keep the background image. Useful for resetting
 *  legacy marker data (bare-slug `icon` values that predate the manifest)
 *  without losing the uploaded map. Callers should confirm before invoking. */
export async function clearMarkers(): Promise<void> {
	mapState.markers = [];
	await persistMarkers();
}
