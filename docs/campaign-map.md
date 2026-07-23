# Campaign Map

A map-annotation surface — upload your own map image, drop labelled icons
on hexes. Lives one click behind the **Map** button in the Expeditions
tab header. **Server-backed** — everything syncs across devices via the
same infra the entity portraits already use.

## Files

### Web (`apps/web`)

| File                                           | Responsibility                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `lib/mapConstants.ts`                          | Grid dimensions, hex radius, marker defaults, color presets, `resolveMapIcon` slug lookup.     |
| `lib/mapGeometry.ts`                           | Pure geometry: axial↔pixel, neighbours, polygon points, cell iteration, viewBox. No Svelte.    |
| `lib/mapImage.ts`                              | `downscaleImage(file)` — canvas-based resize + JPEG re-encode.                                 |
| `lib/mapStore.svelte.ts`                       | `$state` cache backed by `/api/session/map` — `initMap` fetches, mutations PUT optimistically. |
| `lib/mapExport.ts`                             | `exportMapPng` + `exportMapJson` — snapshot download flows.                                    |
| `lib/mapEntityLinks.ts`                        | Enumerate + resolve linkable entities (community / place / journey / site); parse `"kind:id"`. |
| `lib/generated/mapIconManifest.ts`             | **Auto-generated** icon manifest — do not hand-edit. Rebuilt by the Vite plugin.               |
| `scripts/build-map-icons.mjs`                  | Scans `static/map/**/*.svg` → `mapIconManifest.ts` (kebab→Title Case, fill-stripping).         |
| `static/map/<category>/<slug>.svg`             | Icon source files. First subfolder = category; kebab-case filename = slug + display label.     |
| `lib/components/MapDialog.svelte`              | Three-layer SVG + top-level file toolbar + persistent selection toolbar + icon-picker dialog.  |
| `lib/components/v2/ExpeditionsArea.svelte`     | Header "Map" button that opens the dialog.                                                     |
| `routes/api/session/map/+server.ts`            | BFF proxy for GET / DELETE map.                                                                |
| `routes/api/session/map/markers/+server.ts`    | BFF proxy for PUT markers.                                                                     |
| `routes/api/session/map/background/+server.ts` | BFF proxy for GET (bytes + ETag) / PUT / DELETE background.                                    |
| `tests/unit/mapGeometry.test.ts`               | Unit tests for the geometry helpers.                                                           |

### API (`apps/api`)

| File                               | Responsibility                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `db/migrations/0019_user_maps.sql` | New `user_maps` table + widens `user_entity_portraits.kind` CHECK to allow `'map'`.                     |
| `services/portraitService.ts`      | Extends `PortraitKind` to include `'map'`; exports `MAP_ENTITY_ID` (fixed synthetic id).                |
| `services/userMapService.ts`       | `getMap` / `putMarkers` / `setBackgroundHash` / `clearMap`. Wraps `user_maps` inside `withUserContext`. |
| `routes/userData.ts`               | Six new `/session/map*` routes.                                                                         |

## Data model

Server table `user_maps` (see migration 0019):

```
user_id           UUID       PRIMARY KEY  REFERENCES users(id)
markers           JSONB      DEFAULT '[]'
background_hash   TEXT       NULL         -- md5 of the background bytes (portrait_blobs.hash)
updated_at        TIMESTAMPTZ
```

The image bytes live in `portrait_blobs` (dedupe by md5 within a user);
the pointer + client-side reference lives on `user_maps.background_hash`
and the row `(user_id, 'map', 'MAP')` in `user_entity_portraits`.

Client shape (fetched from `GET /api/session/map`):

```json
{
  "markers": [
    {
      "id": "e2f7…",
      "q": 3,
      "r": 2,
      "label": "Driftwood",
      "icon": "settlement/village",
      "color": "#22c55e"
    },
    {
      "id": "b115…",
      "q": 6,
      "r": 4,
      "label": "Blood Thorn",
      "icon": "danger/skull-crossbones",
      "color": "#ef4444",
      "entityId": "place:abc123"
    }
  ],
  "backgroundHash": "9c1a…",
  "updatedAt": "2026-01-15T12:00:00.000Z"
}
```

- **`markers`** — flat array. Multiple markers per `(q, r)` are permitted
  at the store level. UI edits the first hit; a marker picker is Tier 2.
- **`icon`** — canonical form is `"<category>/<slug>"` matching a manifest
  entry (see below). Legacy bare-slug values (`"settlement"`) still
  resolve via `resolveMapIcon` — first exact match, then any category
  containing that slug.
- **`color`** — optional CSS color for the icon fill. Absent = fall back
  to `DEFAULT_MARKER_COLOR`.
- **`backgroundHash`** — content hash for cache-busting. Empty string
  when no background is set. Client's `<image href>` becomes
  `/api/session/map/background?v={hash}`.
- **Axial coordinates** (`q`, `r`) — pointy-top, per [Red Blob Games](https://www.redblobgames.com/grids/hexagons/).

The old `localStorage['ironledger:map']` payloads (Tier 1 painted terrain
and Tier 1a browser-only annotation) are unconditionally removed on
first `initMap()` call. Both pre-shipped inside this branch — nobody
has real data to migrate.

## HTTP surface

Fastify routes under `/api/v1/session/map`, mirrored 1:1 by SvelteKit
BFF proxies at `/api/session/map`:

| Method | Path                      | Behaviour                                                                                     |
| ------ | ------------------------- | --------------------------------------------------------------------------------------------- |
| GET    | `/session/map`            | Returns `{ markers, backgroundHash, updatedAt }`. Empty payload when the user has no row yet. |
| PUT    | `/session/map/markers`    | Replace markers wholesale. Body: `{ markers: MapMarker[] }`. Returns the new server state.    |
| GET    | `/session/map/background` | Raw image bytes with ETag; 304 revalidation supported.                                        |
| PUT    | `/session/map/background` | Upload a fresh image. Body: `{ dataUrl }` (base64 data URL). Returns `{ hash }`.              |
| DELETE | `/session/map/background` | Clear the background image + null the `background_hash` pointer.                              |
| DELETE | `/session/map`            | Full wipe — markers cleared + background removed.                                             |

All routes require authentication (`authenticate` preHandler) and run
inside `withUserContext` so RLS confines each user to their own rows.

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

`mapImage.downscaleImage(file: File) → Promise<string>`:

1. Reject uploads > `MAP_IMAGE_MAX_UPLOAD_BYTES` (20 MB) up front.
2. Decode via `Image` + `URL.createObjectURL`.
3. Draw onto a `<canvas>` at max longest side `MAP_IMAGE_MAX_DIMENSION`
   (2000 px), aspect ratio preserved.
4. Re-encode via `canvas.toDataURL('image/jpeg', MAP_IMAGE_QUALITY)`
   at quality 0.85.
5. Reject the result if it exceeds `MAP_IMAGE_MAX_STORED_BYTES` (2 MB).

Result: predictable JPEG bytes, typically 200-500 KB for a scanned
paper map or generated fantasy map. `setBackground(dataUrl)` PUTs the
result to the server, which computes the content hash and stores the
bytes in `portrait_blobs`.

## Rendering

Three SVG layers stacked in draw order inside a single `<svg>` (bound
to `svgEl` so the PNG exporter can serialise it):

1. **Background `<image href="/api/session/map/background?v={hash}">`**
   — served by the API, aspect-fit inside the same bounds as the hex
   grid via `preserveAspectRatio="xMidYMid meet"`. Browser caches
   forever thanks to the ETag; the `?v={hash}` cache-busts on upload.
2. **Hex grid overlay** — every cell is one `<polygon>` with transparent
   fill and a translucent stroke. Click handler opens the marker editor.
3. **Marker layer** — for each marker: raw icon SVG (fill overridden to
   `var(--text)` with a drop-shadow so it stays readable over busy
   backgrounds) plus an optional paint-order-stroked `<text>` label.

## Interaction

The dialog stacks two toolbars above the map canvas: a file/export
toolbar and a persistent **selection toolbar** that switches state
depending on whether a marker is selected.

- **Upload image** — file picker opens for `image/*`; downscale + PUT
  in one step. Errors show in a red banner just under the toolbar.
- **Names toggle** — global show/hide of marker labels (icons always
  render).
- **Click a hex** — creates a marker with the default icon + color
  (or selects an existing one). The selection toolbar switches to
  its editable state: label input, icon button (opens picker),
  color input + preset strip, entity-link dropdown, Delete, Done.
  Every change auto-saves through `updateMarker()` — no Save/Cancel.
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

### PNG snapshot

`exportMapPng(svgEl, showLabels)`:

1. Clone the live SVG so DOM mutations don't leak.
2. Fetch the background `href` and inline it as a data URL — a remote
   href doesn't survive the `<img> → canvas.drawImage` boundary.
3. Optionally strip `<text>` label elements to match the Names toggle.
4. Serialise, wrap in a data URL, load into an `Image`, `drawImage`
   onto a canvas at 2× viewBox scale, `toBlob('image/png')`, download.

### JSON envelope

`exportMapJson({ markers, backgroundHash, backgroundUrl })` writes a
manifest-wrapped payload matching the existing "Everything" export
shape. The `backgroundUrl` field is informational; a full round-trip
importer would need to re-upload the image bytes (Tier 2).

## Mobile

The dialog is `width: min(960px, calc(100vw - 2rem))` and `max-height:
88vh` per the CLAUDE.md iOS-safe dialog rules (`vh` not `dvh`, centred
via `top: 50% + transform`, no `display: flex` on the dialog element).
The SVG scales down to fit; hex-tap targets remain useable at ~22px
radius on phone. The selection toolbar wraps at narrow widths — the
label input takes the full row and the icon/color/entity controls
sit on the next row so nothing gets clipped. The icon-picker dialog
uses the CLAUDE.md content-sized pattern (`max-height` + inner scroll)
so the grid scrolls independently of the parent dialog.

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
- **Click** on an unlinked marker (or an empty hex) → open the
  editor (matches Tier 1a).

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

Tier 2b (planned):

- **Bidirectional** — Community / Place / Site / Journey cards show
  a `📍 On map at (q, r)` indicator with click-through back to the
  map. Client-side derived index from `mapState.markers` grouped by
  `entityId`.

Tier 2c (planned):

- **JSON import** — pair the JSON export with an importer that
  re-uploads the image via `PUT /session/map/background` and swaps in
  the fresh hash. Bundle this into the top-level "Everything"
  export/import.

Tier 2 nice-to-haves:

- **Multiple markers per hex** in the UI — a picker when clicking a
  hex that already has one.
- **Region tint layer** — translucent colour overlay for faction /
  kingdom / danger-zone grouping.

Tier 3:

- **Alignment controls** — offset (x/y) + scale + rotation so the grid
  can be nudged to fit an existing image's landmarks.
- **Fill / Path tools** — flood-fill regions with tint, draw roads and
  rivers as overlays.
- **Fog of war** — paint over explored/unexplored regions.
- **Multiple maps per campaign** — dropdown selector.

## Tests

`apps/web/tests/unit/mapGeometry.test.ts` covers the pure geometry —
axial↔pixel conversion, neighbour walk with symmetry check, polygon
point generation, `allCells` bounds + row-offset behaviour, and the
`viewBox` bounds. 17 tests, all green.

Store + dialog + upload flow aren't unit-tested — jsdom doesn't
provide `<canvas>` and the server round-trip is best exercised in E2E.
Adding E2E coverage should land with Tier 2's entity-link and
import-full-map flows when the feature starts touching other entities.
