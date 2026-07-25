# Campaign Maps

A map-annotation surface — upload your own map image, drop labelled icons
on a square grid overlay. Users can have many maps and switch between
them via the dialog's map picker. Lives one click behind the **Map**
button in the Expeditions tab header. **Server-backed** — everything
syncs across devices via the same infra the entity portraits already use.

## Grid model

Fractional `(x, y)` world coordinates on a square grid. Each map stores
its own aspect ratio in `settings.aspect` (measured from the background
image at upload), and `gridDimsForAspect()` derives cols × rows to hit
`~TARGET_CELL_COUNT` (200) total cells at whatever shape:

- Landscape 16:9 → 20 × 11 = 220 cells
- Portrait 2:3 → 12 × 18 = 216 cells
- Square 1:1 → 14 × 14 = 196 cells

Each cell is 1 × 1 world unit; marker positions are floats in
`[0, cols] × [0, rows]`. Zoom introduces power-of-two sub-grid octaves:
at 100% only the base grid shows; at 200% each cell splits 2×2 (0.5
spacing); at 400% it's 4×4 (0.25 spacing); etc. Placement snaps to the
deepest visible intersection at the current zoom, so users get device-
independent sub-cell precision just by zooming in.

The canvas body sets its `aspect-ratio` inline from `{cols} / {rows}`,
so cells render exactly square regardless of the source image's exact
proportions (a very slight uniform stretch on the image is invisible).

## Files

### Web (`apps/web`)

| File                                                    | Responsibility                                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `lib/mapConstants.ts`                                   | Grid dims from aspect, zoom-octave helpers, marker defaults, color presets, `resolveMapIcon`.      |
| `lib/mapGeometry.ts`                                    | Pure geometry: snap-to-grid, sub-grid step, grid-line offsets, major-line test. No Svelte.         |
| `lib/mapImage.ts`                                       | `downscaleImage(file)` — canvas-based resize + JPEG re-encode.                                     |
| `lib/mapStore.svelte.ts`                                | `$state` list + active-map cache backed by `/api/session/maps*`; switch/create/rename/delete/CRUD. |
| `lib/mapExport.ts`                                      | `exportMapPng` + `exportMapJson` — snapshot download flows.                                        |
| `lib/mapEntityLinks.ts`                                 | Enumerate + resolve linkable entities (community / place / journey / site); parse `"kind:id"`.     |
| `lib/generated/mapIconManifest.ts`                      | **Auto-generated** icon manifest — do not hand-edit. Rebuilt by the Vite plugin.                   |
| `scripts/build-map-icons.mjs`                           | Scans `static/map/**/*.svg` → `mapIconManifest.ts` (kebab→Title Case, fill-stripping).             |
| `static/map/<category>/<slug>.svg`                      | Icon source files. First subfolder = category; kebab-case filename = slug + display label.         |
| `lib/components/MapDialog.svelte`                       | Map picker + file toolbar + selection toolbar + icon-picker dialog + SVG canvas.                   |
| `lib/components/MapOptionsDialog.svelte`                | Name / display prefs / scale bar / danger-zone (clear + delete).                                   |
| `lib/components/v2/ExpeditionsArea.svelte`              | Header "Map" button that opens the dialog.                                                         |
| `routes/api/session/maps/+server.ts`                    | BFF: GET (list) / POST (create).                                                                   |
| `routes/api/session/maps/entity-markers/+server.ts`     | BFF: GET cross-map `{entityId → refs}` index for entity-card back-references.                      |
| `routes/api/session/maps/for-owner/+server.ts`          | BFF: GET get-or-create the map owned by a first-class entity.                                      |
| `routes/api/session/maps/[mapId]/+server.ts`            | BFF: GET (detail) / PATCH (rename+reorder) / DELETE.                                               |
| `routes/api/session/maps/[mapId]/markers/+server.ts`    | BFF: PUT markers.                                                                                  |
| `routes/api/session/maps/[mapId]/settings/+server.ts`   | BFF: PUT settings.                                                                                 |
| `routes/api/session/maps/[mapId]/background/+server.ts` | BFF: GET bytes (ETag) / PUT / DELETE.                                                              |
| `tests/unit/mapGeometry.test.ts`                        | Unit tests for the geometry helpers.                                                               |

### API (`apps/api`)

| File                                    | Responsibility                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `db/migrations/0019_user_maps.sql`      | Original single-map table (superseded by 0021).                                                     |
| `db/migrations/0020_user_map_settings…` | Added `settings` JSONB to `user_maps` (superseded by 0021).                                         |
| `db/migrations/0021_maps.sql`           | `maps` table (many per user); migrates existing single map → "Regional Map"; drops `user_maps`.     |
| `services/portraitService.ts`           | Extends `PortraitKind` to include `'map'`; entity_id is now the map's uuid (was a fixed `'MAP'`).   |
| `services/userMapService.ts`            | `listMaps` / `createMap` / `getMap` / `updateMap` / `deleteMap` + markers / bg / settings mutators. |
| `services/userDataService.ts`           | `SessionState.activeMapId` — server-persisted pointer so the same map opens on every device.        |
| `routes/userData.ts`                    | `/session/maps` + `/session/maps/:mapId/*` routes replacing the old `/session/map*`.                |

## Data model

Server table `maps` (see migration 0021):

```
id                UUID        PK          DEFAULT gen_random_uuid()
user_id           UUID        NOT NULL    REFERENCES users(id) ON DELETE CASCADE
name              TEXT        NOT NULL    DEFAULT 'Untitled Map'
sort_order        INT         NOT NULL    DEFAULT 0
owner_kind        TEXT        NULL        -- Phase 3: 'community' | 'place' | 'journey' | 'site'
owner_id          TEXT        NULL        -- Phase 3: entity id this map is attached to
markers           JSONB       NOT NULL    DEFAULT '[]'
background_hash   TEXT        NULL                    -- md5 of the background bytes (portrait_blobs.hash)
settings          JSONB       NOT NULL    DEFAULT '{}'
updated_at        TIMESTAMPTZ NOT NULL    DEFAULT now()

UNIQUE (user_id, owner_kind, owner_id)   -- one map per entity per user
INDEX ON (user_id, sort_order)
```

The image bytes live in `portrait_blobs` (dedupe by md5 within a user);
the pointer + client-side reference lives on `maps.background_hash` and
the row `(user_id, 'map', <mapId>)` in `user_entity_portraits`. Each map
gets its own portrait row keyed by the map's uuid — multiple maps per
user coexist without collisions.

**Active map.** `user_data.session_state.activeMapId` holds the map the
user last opened. Server-owned so the same map opens on every device.
When it's null / missing / points at a deleted map, the client falls
back to the first map in the list, creating a fresh "Regional Map" if
the user has none.

**Cap.** `MAX_MAPS_PER_USER = 50` — pragmatic guardrail against a
runaway loop or accidental spam. Well above any real GM's needs.

Client shape (fetched from `GET /api/session/maps/:mapId`):

```json
{
  "markers": [
    {
      "id": "e2f7…",
      "x": 3.5,
      "y": 2,
      "label": "Driftwood",
      "icon": "settlement/village",
      "color": "#22c55e"
    },
    {
      "id": "b115…",
      "x": 6.25,
      "y": 4.75,
      "label": "Blood Thorn",
      "icon": "danger/skull-crossbones",
      "color": "#ef4444",
      "entityId": "place:abc123"
    }
  ],
  "backgroundHash": "9c1a…",
  "settings": {
    "aspect": 1.778,
    "scale": { "enabled": true, "unit": "miles", "perHex": 5, "segments": 4 }
  },
  "updatedAt": "2026-01-15T12:00:00.000Z"
}
```

- **`markers`** — flat array. Multiple markers per `(x, y)` intersection
  are permitted at the store level. UI edits the first hit; a marker
  picker is Tier 2.
- **`icon`** — canonical form is `"<category>/<slug>"` matching a manifest
  entry (see below). Legacy bare-slug values (`"settlement"`) still
  resolve via `resolveMapIcon` — first exact match, then any category
  containing that slug.
- **`color`** — optional CSS color for the icon fill. Absent = fall back
  to `DEFAULT_MARKER_COLOR`.
- **`backgroundHash`** — content hash for cache-busting. Empty string
  when no background is set. Client's `<image href>` becomes
  `/api/session/maps/{mapId}/background?v={hash}`.
- **Fractional coordinates** (`x`, `y`) — world units on the square grid.
  Floats in `[0, cols] × [0, rows]`. Zoom in for sub-cell precision.
- **`settings.aspect`** — canvas aspect ratio (width/height). Set from
  the background image's aspect on upload; drives `gridDimsForAspect`
  and the canvas body's inline `aspect-ratio`. Absent = 16:9 default.
- **`settings.scale.perHex`** — legacy key name; represents distance per
  base cell at 100% zoom. Kept for backwards compat with pre-square-grid
  data.

The old `localStorage['ironledger:map']` payloads (Tier 1 painted terrain
and Tier 1a browser-only annotation) are unconditionally removed on
first `initMap()` call. Both pre-shipped inside this branch — nobody
has real data to migrate.

**Legacy marker sweep.** On the switch from axial `(q, r)` to fractional
`(x, y)`, any existing marker rows without valid `x`/`y` numbers are
dropped at load time by `loadMapInto()` and the pruned list is persisted
back. Pre-1.0 with no external users; a lossy geometric conversion
would place them at (0, 0) and cluster in the top-left, worse than a
clean reset.

## HTTP surface

Fastify routes under `/api/v1/session/maps*`, mirrored 1:1 by SvelteKit
BFF proxies at `/api/session/maps*`:

| Method | Path                                      | Behaviour                                                              |
| ------ | ----------------------------------------- | ---------------------------------------------------------------------- |
| GET    | `/session/maps`                           | List summaries: `{ maps: MapSummary[] }`.                              |
| GET    | `/session/maps/entity-markers`            | `{ index: { entityId → EntityMarkerRef[] } }` — cross-map back-refs.   |
| GET    | `/session/maps/for-owner?kind=&id=&name=` | Get-or-create the map owned by an entity. Returns full UserMap.        |
| POST   | `/session/maps`                           | Create a map: body `{ name?, ownerKind?, ownerId? }`. Returns UserMap. |
| GET    | `/session/maps/:mapId`                    | Full detail: `{ id, name, markers, backgroundHash, settings, … }`.     |
| PATCH  | `/session/maps/:mapId`                    | Rename / reorder: body `{ name?, sortOrder? }`. Returns UserMap.       |
| DELETE | `/session/maps/:mapId`                    | Delete the map + its portrait pointer.                                 |
| PUT    | `/session/maps/:mapId/markers`            | Replace markers: body `{ markers: MapMarker[] }`.                      |
| PUT    | `/session/maps/:mapId/settings`           | Replace settings: body `{ settings: {…} }`.                            |
| GET    | `/session/maps/:mapId/background`         | Raw image bytes with ETag; 304 revalidation supported.                 |
| PUT    | `/session/maps/:mapId/background`         | Upload a fresh image: body `{ dataUrl }`. Returns `{ hash }`.          |
| DELETE | `/session/maps/:mapId/background`         | Clear the background image + null the pointer.                         |

All routes require authentication (`authenticate` preHandler) and run
inside `withUserContext` so RLS confines each user to their own rows.

The active-map pointer is stored in `SessionState` and updated via the
existing `PATCH /session/state` route — no dedicated endpoint.

## Marker icons

Icons are file-driven. Drop SVGs into
`apps/web/static/map/<category>/<slug>.svg` and they show up in the
picker automatically:

- **Category** — the first subfolder segment. Files at the top level
  fall into an implicit `misc` bucket.
- **Slug** — the filename without extension. Kebab-case is expected
  (`hanging-spider`).
- **Display label** — auto-generated Title Case from the slug
  (`hanging-spider` → `Hanging Spider`).
- **Category label** — Title Case of the folder name.
- **Colorability** — during manifest generation the SVG's inner content
  is stripped of hardcoded `fill="…"` / `style="fill:…"` so the wrapper
  `<g fill={color}>` at render time controls the color. `fill="none"`
  is preserved so outline-only paths stay uncoloured.

### Build pipeline

`scripts/build-map-icons.mjs`:

1. Walks `static/map/` recursively.
2. For each SVG, extracts `viewBox` + inner markup, strips fills.
3. Writes `src/lib/generated/mapIconManifest.ts` — the app's source of
   truth for `MAP_ICONS` (keyed by `"<category>/<slug>"`),
   `MAP_ICON_LIST`, and `MAP_ICON_CATEGORIES`.

The Vite plugin in `apps/web/vite.config.ts` regenerates on every
`vite dev`/`vite build` **and** on any `.svg` change under
`static/map/` while dev is running. The generator is a no-op when the
manifest would be byte-for-byte identical, so it's cheap to re-run.
The generated file is committed so svelte-check and tests can run
without executing Vite.

### Data compatibility

Marker `icon` values are strings — no compile-time enum. `resolveMapIcon`
handles both the canonical `"<category>/<slug>"` form and legacy bare
slugs. Removing an icon file only affects markers that still reference
that slug; those render a fallback dot in the marker's color instead of
crashing.

### Color

Every marker also carries an optional `color` (any CSS color).
`mapConstants.MARKER_COLOR_PRESETS` seeds the toolbar's swatch strip
(12 hues that read on both light and dark backgrounds); users can pick
any color via the native `<input type="color">` sitting next to the
strip.

## Image ingest

`mapImage.downscaleImage(file: File) → Promise<DownscaledImage>`:

1. Reject uploads > `MAP_IMAGE_MAX_UPLOAD_BYTES` (20 MB) up front.
2. Decode via `Image` + `URL.createObjectURL`.
3. Draw onto a `<canvas>` at max longest side `MAP_IMAGE_MAX_DIMENSION`
   (2000 px), aspect ratio preserved.
4. Re-encode via `canvas.toDataURL('image/jpeg', MAP_IMAGE_QUALITY)`
   at quality 0.85.
5. Reject the result if it exceeds `MAP_IMAGE_MAX_STORED_BYTES` (2 MB).

Result: `{ dataUrl, width, height, aspect }`. Typically 200-500 KB
JPEG bytes for a scanned paper map or generated fantasy map.
`setBackground(dataUrl, aspect)` PUTs the bytes to the server, which
computes the content hash + stores them in `portrait_blobs`, and
patches `settings.aspect` so the next render fits the canvas to the
new image shape.

## Rendering

The image is the star: it fills the whole viewBox and the grid scales
to match. Canvas body aspect-ratio matches `gridDims.cols / gridDims.rows`
so cells render exactly square with no letterbox at zoom 1.

- **viewBox = `0 0 cols rows`** (world-unit space). One SVG user unit =
  one cell wide/tall. `preserveAspectRatio="none"` — the canvas body
  already matches the viewBox aspect, so there's no letterbox to fear.
- **SVG rendered size** = `canvasPxW × zoom` × `canvasPxH × zoom`. At
  zoom 1 the SVG fills the canvas 1:1; at zoom 2 it renders internally
  at 2× and the canvas div's `overflow: auto` handles the pan.
- **Layers**, drawn in order inside the single `<svg>`:
  1. **Background `<image>`** — spans the full viewBox
     (`x=0 y=0 width=cols height=rows`) with `preserveAspectRatio="none"`
     so the image tracks the grid exactly. Any residual stretch vs the
     source image is invisible because the canvas aspect matches the
     grid.
  2. **Grid lines** — one `<line>` per major (integer) offset + one per
     minor offset revealed by the current sub-grid octave (`0` at zoom
     1, `1` at zoom 2, `2` at zoom 4, …). Every line has
     `vector-effect="non-scaling-stroke"` so strokes stay a fixed
     screen weight regardless of zoom.
  3. **Click-capture `<rect>`** — one invisible rect covering the whole
     viewBox. Its `onclick` unprojects the pointer via
     `svgEl.getScreenCTM().inverse()`, snaps to the current sub-grid
     step, and routes to `activateExisting` / `placeAt`. Markers are
     `pointer-events: none` — hits are resolved via `markersAt()` on
     the snapped point so marker-adjacent clicks still select them.
  4. **Marker icons** — `<g transform="translate({m.x}, {m.y})">`
     wraps a colored fill with `paint-order="stroke" stroke="#fff"`
     for the halo. `ICON_SIZE = 0.75` world units (three-quarters of a
     cell) — scales with zoom because icons are part of the annotation.

## Interaction

The dialog stacks two toolbars above the map canvas: a file/export
toolbar and a persistent **selection toolbar** that switches state
depending on whether a marker is selected.

- **Upload image** — file picker opens for `image/*`; downscale + PUT
  in one step. Errors show in a red banner just under the toolbar.
- **Names toggle** — global show/hide of marker labels (icons always
  render).
- **Click the map** — with placing mode armed (`+ Add`), snaps to the
  deepest visible sub-grid intersection at the current zoom and drops
  a marker there. The selection toolbar switches to its editable state:
  label input, icon button (opens picker), color input + preset strip,
  entity-link dropdown, Duplicate, Delete, Done. Every change auto-saves
  through `updateMarker()` — no Save/Cancel.
- **Drag a marker** — pointerdown on a marker + move past ~6px engages
  drag; the icon snaps live between visible sub-grid intersections so
  the drop lands exactly where the preview is. Pointerup saves via
  `updateMarker()`. Static tap still routes as click; long-press (touch)
  still forces the editor open — drag threshold and long-press timer
  race, first to fire wins.
- **Duplicate** — clones the selected marker at `+0.5, +0.5` world units
  (clamped to the map bounds) and selects the copy. Toolbar button or
  Cmd/Ctrl+D.
- **Pile-up popover** — when a click resolves to a snap point with more
  than one marker (common at low zoom, where sub-cell placements
  collapse), a small floating menu lists each marker (icon + label + a
  glyph if it's linked to an entity). Click one to select or jump.
  Outside click or Escape closes.
- **Cut / Copy / Paste** — Cmd/Ctrl+X, C, V (plus toolbar buttons).
  Clipboard is a single in-memory slot, so paste works across maps —
  copy on one map, switch, paste on another. Paste target is the last
  mouse-hover position on the map, falling back to the visual center.
  Cut = copy + delete; the marker's label / icon / color / entity link
  ride along.

## Entity ↔ map integration (Phase 2)

Two coupled directions:

**Marker → entity (Tier 2a, already shipped).** A marker's `entityId`
can point at a Community / Place / Journey / Site. Bare-click jumps to
that entity in its area; shift-click (or long-press on touch) opens
the marker editor instead.

**Entity → marker (Phase 2, new).** Each entity card renders a
"📍 On map: {Map name} ({x}, {y})" chip strip below its header for
every marker across every map that references it. Click a chip →
`MapDialog.open({ mapId, markerId })` switches to that map and selects
the marker in one step.

The chip strip is powered by a cross-map index — `GET
/session/maps/entity-markers` returns `{ entityId → [refs] }` in a
single scan of the user's maps. The client caches it in
`entityMarkerIndexState`, loads lazily on first entity-card render, and
refreshes automatically after any local marker mutation (add / remove
/ link change) via `refreshEntityMarkerIndex()`.

**Entity-owned maps (Phase 3, new).** Each Community, Place, Journey,
and Site can own its own map — `maps.owner_kind` + `maps.owner_id`
were reserved on the schema back in migration 0021 and are wired now.
Each entity card grows a **Map** button in the header that calls
`openMapForOwner(kind, id, name)`. That helper hits `GET
/session/maps/for-owner?kind=&id=&name=`, which is a **get-or-create**:
first hit creates a fresh map named `${entityName} — Map` and pins its
`(owner_kind, owner_id)`; subsequent hits return the same map. The
UNIQUE `(user_id, owner_kind, owner_id)` constraint keeps this
1:1-per-user.

- **Click "Change icon…"** — opens a nested picker dialog listing
  every manifest icon grouped by category with a search filter.
  Previews render at the marker's current color so the swatch matches
  what you'll see on the map.
- **Color** — the native picker button + a strip of preset swatches.
  Changing a swatch or picker value applies immediately.
- **Done** — clears the selection so the toolbar shows the hint
  again; the marker persists.
- **Delete** — removes the marker (server-side) and clears the selection.
- **Export PNG** — rasterises the current SVG (image + grid + markers +
  labels) to a 2× viewBox PNG (typically ~1600×1000) and downloads it.
  Honors the current Names toggle.
- **Export JSON** — writes a `{ manifest, data: { markers,
backgroundHash, backgroundUrl } }` envelope for backup or transfer.
  Full round-trip import is a Tier 2c concern.
- **Clear map** — wipes background + markers server-side via a
  ConfirmDialog. Disabled when the map is already empty.

Mutations are **optimistic** — the local `$state` updates immediately,
then a PUT fires. On failure the error surfaces in `mapState.error`;
the local state stays until the next successful sync. Tier 1a keeps
error UX minimal (banner only); a proper retry queue is a Tier 2
concern if the failure mode ever matters in practice.

## Exports

### Zip round-trip (`.zip`)

`exportMapZip({ name, markers, settings, backgroundUrl })` and
`importMapZip(file)` — a single map's data as a `fflate`-built zip.
Layout:

```
map-<slugified-name>-<stamp>.zip
├── manifest.json     { app: 'Iron Ledger', version, exportedAt, type: 'map' }
├── map.json          { name, markers, settings }
└── background.jpg    raw image bytes (only when a background is set)
```

Zip over inlined JSON because the background image is typically
200-500 kB and base64 inflates that by ~33 %; raw bytes in a zip
stay compact and match the `.zip` pattern the "Everything" export
already uses. The importer is available via the map picker chip's
**⬇ Import map…** row and via the hamburger-menu Export dialog's
**Zip** format (which is now the successor to the old JSON format).

The importer creates a fresh map (never overwrites), regenerates
marker ids to avoid collisions on re-import, and uploads the bytes
via the existing `PUT /session/maps/:id/background` endpoint.

`exportMapZip()` and `importMapZip()` throw `MapImportError` with a
user-readable message on any validation failure — bad envelope,
wrong type, malformed JSON, etc. The Import affordance surfaces
these in the same red banner as background-upload errors.

### PNG snapshot

`exportMapPng(svgEl, showLabels)`:

1. Clone the live SVG so DOM mutations don't leak.
2. Fetch the background `href` and inline it as a data URL — a remote
   href doesn't survive the `<img> → canvas.drawImage` boundary.
3. Optionally strip `<text>` label elements to match the Names toggle.
4. Serialise, wrap in a data URL, load into an `Image`, `drawImage`
   onto a canvas at 2× viewBox scale, `toBlob('image/png')`, download.

### Everything zip

The app-wide "Everything" export (`routes/home/+page.svelte`) now
folds every map in as a subdirectory:

```
ironledger-export-<stamp>.zip
├── characters.md
├── connections.md
├── expeditions.md
├── foes.md
├── session-log.md
├── maps.md                       ← summary table of all maps
├── maps/<mapId>/manifest.json
├── maps/<mapId>/map.json
├── maps/<mapId>/background.jpg   ← only if a background is set
└── images/<prefix>-<slug>.jpg    ← existing portrait files
```

Each map's `maps/<mapId>/*` payload is produced by the same
`buildMapZipEntries()` helper the per-map exporter uses, so both
paths ship the same bytes for the same map.

## Mobile

The dialog is `width: min(960px, calc(100vw - 2rem))` and `max-height:
88vh` per the CLAUDE.md iOS-safe dialog rules (`vh` not `dvh`, centred
via `top: 50% + transform`, no `display: flex` on the dialog element).
The SVG scales down to fit; the click-capture rect covers the whole
canvas so the tap target is the entire grid, not per-cell. The selection
toolbar wraps at narrow widths — the label input takes the full row and
the icon/color/entity controls sit on the next row so nothing gets
clipped. The icon-picker dialog uses the CLAUDE.md content-sized
pattern (`max-height` + inner scroll) so the grid scrolls independently
of the parent dialog.

## Entity-linked markers (Tier 2a)

A marker's `entityId` can point at a first-class entity from the rest
of the app. Format: `"kind:id"` where `kind` is one of `community` /
`place` / `journey` / `site` (NPCs and Foes are deliberately out —
NPCs live at communities/places, Foes are transient).

### Editor

The selection toolbar's **entity dropdown** lists every community +
place + journey + site, sorted kind-first then alphabetical, with a
small glyph prefix (`◈` community / `●` place / `↗` journey / `▲`
site). Selecting `— No link —` clears the link.

**Auto-fill label**: on selecting a link when the label is empty, the
marker adopts the linked entity's name. Explicit label edits are never
overwritten.

**Icon + color stay independent** — the annotator's choice, not the
entity's kind. A settlement can be flagged as a red `danger/skull` if
it's a hostile town.

### Click semantics

- **Bare click** on a linked marker → close the map + focus the linked
  entity in its natural area. On mobile the tab switches to
  Expeditions or Connections as appropriate; on desktop both areas
  are visible in the deck so only the entity focus fires.
- **Shift+click** on a linked marker → open the editor. Always
  available so linked markers can still be edited.
- **Click** on an unlinked marker → open the editor (matches Tier 1a).
- **Click** on empty grid outside placing mode → nothing. The `+ Add`
  button arms placing mode explicitly so a stray tap can't leave a
  marker behind.

### Broken links

When the linked entity is deleted, `resolveEntity(entityId)` returns
null. The marker stays on the map (label + icon + color intact) and
the selection toolbar shows a red **"Linked entity was deleted"**
banner prompting the user to pick a replacement or clear the link.
Bare-clicking a broken-link marker just selects it (no target to
jump to).

### Cross-component wiring

MapDialog dispatches `ironledger:focus-entity` with `{ kind, id }`.
Three listeners handle it:

- `/home/+page.svelte` — switches `mobileTab` (only when on mobile).
- `CommunitiesArea` — matches `community` / `place` / `npc`, sets
  `activeEntryId`, clears the type filter if it would hide the target.
- `ExpeditionsArea` — matches `journey` / `site`, sets `activeExpId`.

Each area owns its own focus response, so adding a new linkable
entity kind later is a two-file change: extend `mapEntityLinks.ts`
enum + add a listener in the target area.

## Growth path

Tier 2 nice-to-haves:

- **Multiple markers per intersection** in the UI — a picker when the
  user clicks a snap point that already has one.
- **Region tint layer** — translucent colour overlay for faction /
  kingdom / danger-zone grouping (a `regions: Region[]` array of
  cell-set + tint per map, rendered as `mix-blend-mode: multiply` so
  the map still reads through).

Tier 3:

- **Alignment controls** — offset (x/y) + scale + rotation so the grid
  can be nudged to fit an existing image's landmarks.
- **Fill / Path tools** — flood-fill regions with tint, draw roads and
  rivers as overlays.
- **Fog of war** — paint over explored/unexplored regions.
- **Map-per-entity** — Phase 3 wires `maps.owner_kind` + `owner_id`
  (already reserved on the schema) so a Site / Community / Journey /
  Place can own its own map, opened directly from the entity card.

## Tests

`apps/web/tests/unit/mapGeometry.test.ts` covers the pure geometry —
`snapToStep` rounding, `subGridStep` octave behaviour, `snapCoord`
zoom-aware snapping, `gridLineOffsets` sweep bounds, and `isMajorLine`.

Store + dialog + upload flow aren't unit-tested — jsdom doesn't
provide `<canvas>` and the server round-trip is best exercised in E2E.
Adding E2E coverage should land with Tier 2's entity-link and
import-full-map flows when the feature starts touching other entities.
