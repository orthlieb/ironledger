// =============================================================================
// Iron Ledger — Campaign maps state (Svelte 5 module-level $state)
//
// Multi-map foundation (Phase 1): users can have many maps and switch
// between them via the dialog's map picker. Each map is server-persisted
// (markers + background_hash pointer + settings + name); the active map
// id lives in `SessionState.activeMapId` so the same map opens on every
// device.
//
// Data shape:
//   /api/session/maps                  → { maps: MapSummary[] }
//   /api/session/maps/:mapId           → UserMap (markers + bg + settings)
//   /api/session/maps/:mapId/markers   → PUT { markers }
//   /api/session/maps/:mapId/settings  → PUT { settings }
//   /api/session/maps/:mapId/background → GET bytes / PUT { dataUrl } / DELETE
//
// This module keeps three pieces of reactive state:
//   • `mapListState.maps` — summary rows (id + name + sort_order + owner)
//   • `activeMapId` — the currently-open map's id
//   • `mapState` — the full detail (markers, bg, settings) for the active map
//
// Mutations are optimistic: local proxy updates first, PUT fires, on
// failure the error surfaces via `mapState.error`.
//
// Old localStorage payloads at 'ironledger:map' are removed on first
// init so they don't confuse anyone digging through devtools.
// =============================================================================

const LEGACY_STORAGE_KEY = 'ironledger:map';

export interface MapMarker {
	/** Stable id — crypto.randomUUID() when the marker is created. Used as
	 *  the key in {#each} blocks and by the marker editor to look up the
	 *  row it's editing. */
	id: string;
	/** Fractional world-unit coordinates. `x ∈ [0, cols]`, `y ∈ [0, rows]`.
	 *  Zoom in on the map to place markers at sub-cell precision — the
	 *  placement flow snaps to the deepest visible sub-grid intersection
	 *  at the current zoom. */
	x: number;
	y: number;
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

/** Server-persisted per-map settings — things that describe the MAP
 *  itself (not the current viewer's device preferences). Scale in
 *  particular is intrinsic to the map: 5 miles per hex on the GM's
 *  laptop is 5 miles per hex on their phone. Free-form JSONB blob. */
export interface MapServerSettings {
	scale?: {
		enabled?: boolean;
		unit?: 'miles' | 'km';
		perHex?: number;
		segments?: number;
	};
	view?: {
		/** Zoom multiplier applied to the SVG's intrinsic size. 1.0 =
		 *  fit-to-canvas; 2.0 = 2× render, panning enabled via canvas
		 *  overflow. */
		zoom?: number;
	};
	/** Canvas aspect ratio (width / height) for this map. Set to the
	 *  background image's aspect when a background is uploaded so the
	 *  map view fits the image without letterbox. Defaults to
	 *  DEFAULT_MAP_ASPECT (16:9) for fresh maps. */
	aspect?: number;
}

/** Ownership metadata — Phase 3 attaches maps to first-class entities
 *  via (ownerKind, ownerId). Null = standalone/regional map. */
export type MapOwnerKind = 'community' | 'place' | 'journey' | 'site';

/** One entity → marker back-reference, mirrored from the server's
 *  `EntityMarkerRef`. */
export interface EntityMarkerRef {
	entityId: string;
	markerId: string;
	mapId: string;
	mapName: string;
	x: number;
	y: number;
	label: string;
	icon: string;
	color?: string;
}

export interface MapSummary {
	id: string;
	name: string;
	sortOrder: number;
	ownerKind: MapOwnerKind | null;
	ownerId: string | null;
	updatedAt: string;
}

interface MapListState {
	loaded: boolean;
	loading: boolean;
	error: string;
	maps: MapSummary[];
}

interface MapState {
	loaded: boolean;
	loading: boolean;
	error: string;
	/** The active map's id — mirrors `SessionState.activeMapId` on the
	 *  server. `''` before init or when the user has no maps yet. */
	activeId: string;
	name: string;
	markers: MapMarker[];
	/** md5 hash of the background image, or '' when no image is set.
	 *  Doubles as the cache-buster in the <image href="…?v={hash}"> URL. */
	backgroundHash: string;
	/** Per-map settings persisted server-side (see MapServerSettings). */
	settings: MapServerSettings;
}

export const mapListState = $state<MapListState>({
	loaded: false,
	loading: false,
	error: '',
	maps: [],
});

interface EntityMarkerIndexState {
	loaded: boolean;
	loading: boolean;
	/** `entityId → [refs]`. Cross-map, so every entity card can render
	 *  its "📍 On map at (x, y)" chip without loading each map's
	 *  markers. */
	index: Record<string, EntityMarkerRef[]>;
}

export const entityMarkerIndexState = $state<EntityMarkerIndexState>({
	loaded: false,
	loading: false,
	index: {},
});

export const mapState = $state<MapState>({
	loaded: false,
	loading: false,
	error: '',
	activeId: '',
	name: '',
	markers: [],
	backgroundHash: '',
	settings: {},
});

/** URL for the active map's background image or '' when there's no
 *  image or no active map. Includes the hash as a cache-buster so
 *  `<img>` reloads when the background changes. */
export function backgroundUrl(): string {
	if (!mapState.activeId || !mapState.backgroundHash) return '';
	return `/api/session/maps/${mapState.activeId}/background?v=${encodeURIComponent(mapState.backgroundHash)}`;
}

// ---------------------------------------------------------------------------
// Session-state bridge — the active map id lives on the server so the
// same map opens on every device. We fetch it via /api/session/state,
// which the home page also uses for charId/foeId/expeditionId. Keeping
// this bridge local avoids threading yet another shared store through
// the map subsystem.
// ---------------------------------------------------------------------------

interface SessionStatePartial {
	charId: string;
	foeId: string;
	expeditionId: string;
	activeTab?: string;
	activeMapId?: string | null;
}

async function fetchActiveMapIdFromSession(): Promise<string | null> {
	try {
		const res = await fetch('/api/session/state');
		if (!res.ok) return null;
		const body = (await res.json()) as { sessionState?: SessionStatePartial };
		return body.sessionState?.activeMapId ?? null;
	} catch {
		return null;
	}
}

async function persistActiveMapIdToSession(activeMapId: string): Promise<void> {
	// Fetch current session state so we don't clobber unrelated fields
	// (charId, foeId, expeditionId, activeTab).
	try {
		const cur = await fetch('/api/session/state').then((r) => (r.ok ? r.json() : null));
		const s: SessionStatePartial = cur?.sessionState ?? {
			charId: '',
			foeId: '',
			expeditionId: '',
		};
		s.activeMapId = activeMapId;
		await fetch('/api/session/state', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sessionState: s }),
		});
	} catch {
		// Best-effort; a failed active-map save just means the next load
		// falls back to "first map in the list".
	}
}

// ---------------------------------------------------------------------------
// Init — fetch the map list + the active map on first dialog open. Idempotent.
// ---------------------------------------------------------------------------

let _initPromise: Promise<void> | null = null;

export function initMap(): Promise<void> {
	if (mapListState.loaded && mapState.loaded) return Promise.resolve();
	if (_initPromise) return _initPromise;
	_initPromise = (async () => {
		mapListState.loading = true;
		mapListState.error = '';
		mapState.loading = true;
		mapState.error = '';
		try {
			const [listRes, activeId] = await Promise.all([
				fetch('/api/session/maps'),
				fetchActiveMapIdFromSession(),
			]);
			if (!listRes.ok) throw new Error(`Server returned ${listRes.status}`);
			const listBody = (await listRes.json()) as { maps?: MapSummary[] };
			mapListState.maps = Array.isArray(listBody.maps) ? listBody.maps : [];
			mapListState.loaded = true;

			// Pick the map to open: server's active-map preference if it still
			// exists, otherwise the first entry, otherwise create a brand new
			// "Regional Map" so a fresh user has something to click into.
			let target = mapListState.maps.find((m) => m.id === activeId) ?? mapListState.maps[0];
			if (!target) {
				const created = await createMap({ name: 'Regional Map' });
				target = created;
			}
			await loadMapInto(target.id);
			// Sweep the legacy localStorage payload.
			if (typeof window !== 'undefined') localStorage.removeItem(LEGACY_STORAGE_KEY);
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to load maps';
			mapListState.error = msg;
			mapState.error = msg;
		} finally {
			mapListState.loading = false;
			mapState.loading = false;
			_initPromise = null;
		}
	})();
	return _initPromise;
}

/** Drop legacy hex-coord markers on load. When we cut over from axial
 *  (q, r) to fractional (x, y), any existing marker rows without valid
 *  `x`/`y` numbers would render at (0, 0) and pile up in the top-left.
 *  We're pre-1.0 with no external users, so it's cleaner to wipe them
 *  than to run a lossy geometric conversion. */
function isValidMarker(m: unknown): m is MapMarker {
	if (!m || typeof m !== 'object') return false;
	const r = m as Record<string, unknown>;
	return (
		typeof r.id === 'string' &&
		typeof r.x === 'number' &&
		Number.isFinite(r.x) &&
		typeof r.y === 'number' &&
		Number.isFinite(r.y) &&
		typeof r.label === 'string' &&
		typeof r.icon === 'string'
	);
}

async function loadMapInto(mapId: string): Promise<void> {
	const res = await fetch(`/api/session/maps/${mapId}`);
	if (!res.ok) throw new Error(`Server returned ${res.status}`);
	const body = (await res.json()) as {
		id?: string;
		name?: string;
		markers?: unknown[];
		backgroundHash?: string | null;
		settings?: MapServerSettings | null;
	};
	mapState.activeId = body.id ?? mapId;
	mapState.name = body.name ?? 'Untitled Map';
	const raw = Array.isArray(body.markers) ? body.markers : [];
	const kept = raw.filter(isValidMarker);
	mapState.markers = kept;
	mapState.backgroundHash = body.backgroundHash ?? '';
	mapState.settings = body.settings && typeof body.settings === 'object' ? body.settings : {};
	mapState.loaded = true;
	// If we dropped legacy (q, r)-only markers, persist the pruned list
	// so the server catches up and we don't re-drop them on every load.
	if (kept.length !== raw.length) void persistMarkers();
}

/** Switch to a different map. Fetches its full detail, updates the
 *  active-map preference server-side, and refreshes `mapState`. */
export async function switchMap(mapId: string): Promise<void> {
	if (mapId === mapState.activeId) return;
	mapState.loading = true;
	mapState.error = '';
	try {
		await loadMapInto(mapId);
		void persistActiveMapIdToSession(mapId);
	} catch (err) {
		mapState.error = err instanceof Error ? err.message : 'Failed to load map';
	} finally {
		mapState.loading = false;
	}
}

/** Create a new map + switch to it. Returns the summary of the new map
 *  so the picker can highlight it. */
export async function createMap(input: {
	name?: string;
	ownerKind?: MapOwnerKind | null;
	ownerId?: string | null;
}): Promise<MapSummary> {
	const res = await fetch('/api/session/maps', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	});
	if (!res.ok) throw new Error(`Server returned ${res.status}`);
	const created = (await res.json()) as MapSummary & {
		markers?: MapMarker[];
		backgroundHash?: string | null;
		settings?: MapServerSettings | null;
	};
	// Prepend to the list so it shows up right away in the picker; the
	// sort_order server-side is `max + 1`, so it lands at the end on next
	// reload — that's fine.
	mapListState.maps = [
		...mapListState.maps,
		{
			id: created.id,
			name: created.name,
			sortOrder: created.sortOrder,
			ownerKind: created.ownerKind,
			ownerId: created.ownerId,
			updatedAt: created.updatedAt,
		},
	];
	// The POST response includes the full detail — populate mapState
	// directly instead of a second GET.
	mapState.activeId = created.id;
	mapState.name = created.name;
	mapState.markers = Array.isArray(created.markers) ? created.markers : [];
	mapState.backgroundHash = created.backgroundHash ?? '';
	mapState.settings = created.settings ?? {};
	mapState.loaded = true;
	void persistActiveMapIdToSession(created.id);
	return {
		id: created.id,
		name: created.name,
		sortOrder: created.sortOrder,
		ownerKind: created.ownerKind,
		ownerId: created.ownerId,
		updatedAt: created.updatedAt,
	};
}

/** Rename an existing map. Updates the list + mapState.name if it's the
 *  active map. */
export async function renameMap(mapId: string, name: string): Promise<void> {
	try {
		const res = await fetch(`/api/session/maps/${mapId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name }),
		});
		if (!res.ok) throw new Error(`Server returned ${res.status}`);
		const idx = mapListState.maps.findIndex((m) => m.id === mapId);
		if (idx >= 0) mapListState.maps[idx] = { ...mapListState.maps[idx], name };
		if (mapId === mapState.activeId) mapState.name = name;
	} catch (err) {
		mapState.error = err instanceof Error ? err.message : 'Failed to rename map';
	}
}

/** Delete a map. If it was the active map, switches to the first
 *  remaining map (or creates a new Regional Map if the list is empty). */
export async function deleteMap(mapId: string): Promise<void> {
	try {
		const res = await fetch(`/api/session/maps/${mapId}`, { method: 'DELETE' });
		if (!res.ok) throw new Error(`Server returned ${res.status}`);
		mapListState.maps = mapListState.maps.filter((m) => m.id !== mapId);
		if (mapId === mapState.activeId) {
			const next = mapListState.maps[0];
			if (next) {
				await switchMap(next.id);
			} else {
				await createMap({ name: 'Regional Map' });
			}
		}
	} catch (err) {
		mapState.error = err instanceof Error ? err.message : 'Failed to delete map';
	}
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

/** Markers that snap to the same sub-cell as `(x, y)` at the given zoom.
 *  Grid subdivision at zoom 2 means half-cells, zoom 4 means quarter-
 *  cells; two markers are "at the same cell" when they land on the same
 *  intersection under the current snap resolution. */
export function markersAt(x: number, y: number, zoom = 1): MapMarker[] {
	const step = 1 / Math.pow(2, Math.max(0, Math.floor(Math.log2(Math.max(1, zoom)))));
	const sx = Math.round(x / step) * step;
	const sy = Math.round(y / step) * step;
	const eps = step / 2;
	return mapState.markers.filter((m) => Math.abs(m.x - sx) < eps && Math.abs(m.y - sy) < eps);
}

export function hasAnyContent(): boolean {
	return mapState.markers.length > 0 || mapState.backgroundHash !== '';
}

// ---------------------------------------------------------------------------
// Mutations for the active map — optimistic local update, PUT to server.
// ---------------------------------------------------------------------------

async function persistMarkers(): Promise<void> {
	if (!mapState.activeId) return;
	try {
		const res = await fetch(`/api/session/maps/${mapState.activeId}/markers`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ markers: mapState.markers }),
		});
		if (!res.ok) throw new Error(`Server returned ${res.status}`);
		mapState.error = '';
		// Any marker mutation may have changed entity → marker
		// back-references (add/remove/link change); refresh the index
		// so entity cards' "📍 On map at (x, y)" chips stay live. Only
		// fires if the index has been loaded once — no eager fetch.
		if (entityMarkerIndexState.loaded) refreshEntityMarkerIndex();
	} catch (err) {
		mapState.error = err instanceof Error ? err.message : 'Failed to save markers';
	}
}

/** Add a new marker. Returns the assigned id so callers can select it for
 *  immediate editing. Optimistic — id is minted client-side and the array
 *  is updated before the PUT fires. */
export function addMarker(input: {
	x: number;
	y: number;
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

/** Upload a fresh background image for the active map. Accepts the
 *  optional aspect ratio (width / height) so the map's canvas can adapt
 *  to whatever shape the user just uploaded — portrait, square,
 *  ultrawide — without letterbox. `dataUrl` is produced by
 *  `mapImage.downscaleImage`, which also returns the aspect. */
export async function setBackground(dataUrl: string, aspect?: number): Promise<void> {
	if (!mapState.activeId) return;
	try {
		const res = await fetch(`/api/session/maps/${mapState.activeId}/background`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ dataUrl }),
		});
		if (!res.ok) throw new Error(`Server returned ${res.status}`);
		const body = (await res.json()) as { hash?: string };
		if (body.hash) mapState.backgroundHash = body.hash;
		mapState.error = '';
		// If a fresh aspect was measured, persist it alongside the hash so
		// the canvas fits the image on the next render — and on every
		// subsequent load from any device.
		if (typeof aspect === 'number' && Number.isFinite(aspect) && aspect > 0) {
			if (mapState.settings.aspect !== aspect) {
				mapState.settings.aspect = aspect;
				void persistSettings();
			}
		}
	} catch (err) {
		mapState.error = err instanceof Error ? err.message : 'Failed to upload image';
	}
}

/** Wipe the active map's contents — background + markers. The map row
 *  itself stays; use deleteMap to remove the whole map. */
export async function clearMap(): Promise<void> {
	if (!mapState.activeId) return;
	// Optimistic — clear locally first.
	mapState.markers = [];
	mapState.backgroundHash = '';
	try {
		await Promise.all([
			fetch(`/api/session/maps/${mapState.activeId}/background`, { method: 'DELETE' }),
			fetch(`/api/session/maps/${mapState.activeId}/markers`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ markers: [] }),
			}),
		]);
		mapState.error = '';
	} catch (err) {
		mapState.error = err instanceof Error ? err.message : 'Failed to clear map';
	}
}

/** Wipe every marker but keep the background image. Useful for resetting
 *  legacy marker data (bare-slug `icon` values that predate the manifest)
 *  without losing the uploaded map. */
export async function clearMarkers(): Promise<void> {
	mapState.markers = [];
	await persistMarkers();
}

/** Replace the active map's markers wholesale — used by the zip
 *  importer to avoid firing one PUT per marker. Ids get regenerated so
 *  a re-import against the same account doesn't collide with markers
 *  from an earlier import. */
export async function replaceMarkers(markers: Array<Omit<MapMarker, 'id'>>): Promise<void> {
	mapState.markers = markers.map((m) => ({ id: crypto.randomUUID(), ...m }));
	await persistMarkers();
}

/** Persist the active map's settings blob. Optimistic — the local copy
 *  is authoritative, PUT fires in the background. */
export async function persistSettings(): Promise<void> {
	if (!mapState.activeId) return;
	try {
		const res = await fetch(`/api/session/maps/${mapState.activeId}/settings`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ settings: mapState.settings }),
		});
		if (!res.ok) throw new Error(`Server returned ${res.status}`);
		mapState.error = '';
	} catch (err) {
		mapState.error = err instanceof Error ? err.message : 'Failed to save map settings';
	}
}

// ---------------------------------------------------------------------------
// Cross-map entity marker index — powers "📍 On map at (x, y)" chips on
// entity cards. Loaded lazily on first access + refreshed after any local
// marker mutation.
// ---------------------------------------------------------------------------

let _indexLoadPromise: Promise<void> | null = null;

/** Fetch (or refetch) the cross-map entity marker index. Idempotent —
 *  concurrent callers get the same in-flight promise. Fails silently:
 *  a stale index is better than crashing an entity card. */
export function loadEntityMarkerIndex(force = false): Promise<void> {
	if (entityMarkerIndexState.loaded && !force) return Promise.resolve();
	if (_indexLoadPromise) return _indexLoadPromise;
	entityMarkerIndexState.loading = true;
	_indexLoadPromise = (async () => {
		try {
			const res = await fetch('/api/session/maps/entity-markers');
			if (!res.ok) throw new Error(`Server returned ${res.status}`);
			const body = (await res.json()) as { index?: Record<string, EntityMarkerRef[]> };
			entityMarkerIndexState.index = body.index && typeof body.index === 'object' ? body.index : {};
			entityMarkerIndexState.loaded = true;
		} catch {
			// swallow — leave last-known-good index in place
		} finally {
			entityMarkerIndexState.loading = false;
			_indexLoadPromise = null;
		}
	})();
	return _indexLoadPromise;
}

/** Rebuild the index in the background — call after any local marker
 *  mutation so cards don't display stale positions. Debounced via the
 *  in-flight promise guard in `loadEntityMarkerIndex`. */
export function refreshEntityMarkerIndex(): void {
	void loadEntityMarkerIndex(true);
}

/** Read a subset of the index for one entity. Returns [] when the index
 *  isn't loaded yet — the caller can trigger a load and re-render. */
export function markersForEntity(entityId: string): EntityMarkerRef[] {
	return entityMarkerIndexState.index[entityId] ?? [];
}

// ---------------------------------------------------------------------------
// Map-per-entity — open (or create) the map owned by a first-class entity.
// ---------------------------------------------------------------------------

/** Get-or-create the map for `(ownerKind, ownerId)` and switch to it.
 *  Called by the "Open Map" button on entity cards. Returns the map's
 *  id, or null on failure. */
export async function openMapForOwner(
	ownerKind: MapOwnerKind,
	ownerId: string,
	entityName: string,
): Promise<string | null> {
	try {
		const qs = new URLSearchParams({
			kind: ownerKind,
			id: ownerId,
			name: `${entityName} — Map`,
		});
		const res = await fetch(`/api/session/maps/for-owner?${qs.toString()}`);
		if (!res.ok) throw new Error(`Server returned ${res.status}`);
		const detail = (await res.json()) as {
			id: string;
			name: string;
			markers?: MapMarker[];
			backgroundHash?: string | null;
			settings?: MapServerSettings | null;
			sortOrder: number;
			ownerKind: MapOwnerKind | null;
			ownerId: string | null;
			updatedAt: string;
		};
		// Hydrate mapState directly and register in the list if new so the
		// picker chip shows it immediately.
		mapState.activeId = detail.id;
		mapState.name = detail.name;
		mapState.markers = Array.isArray(detail.markers) ? detail.markers : [];
		mapState.backgroundHash = detail.backgroundHash ?? '';
		mapState.settings =
			detail.settings && typeof detail.settings === 'object' ? detail.settings : {};
		mapState.loaded = true;
		if (!mapListState.maps.some((m) => m.id === detail.id)) {
			mapListState.maps = [
				...mapListState.maps,
				{
					id: detail.id,
					name: detail.name,
					sortOrder: detail.sortOrder,
					ownerKind: detail.ownerKind,
					ownerId: detail.ownerId,
					updatedAt: detail.updatedAt,
				},
			];
		}
		void persistActiveMapIdToSession(detail.id);
		return detail.id;
	} catch (err) {
		mapState.error = err instanceof Error ? err.message : 'Failed to open entity map';
		return null;
	}
}
