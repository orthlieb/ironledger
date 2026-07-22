# Campaign Map

A map-annotation surface — upload your own map image, drop labelled icons
on hexes. Lives one click behind the **Map** button in the Expeditions
tab header. **Server-backed** — everything syncs across devices via the
same infra the entity portraits already use.

## Files

### Web (`apps/web`)

| File                                           | Responsibility                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `lib/mapConstants.ts`                          | Grid dimensions, hex radius, marker icon enum + labels, image size caps.                       |
| `lib/mapGeometry.ts`                           | Pure geometry: axial↔pixel, neighbours, polygon points, cell iteration, viewBox. No Svelte.    |
| `lib/mapImage.ts`                              | `downscaleImage(file)` — canvas-based resize + JPEG re-encode.                                 |
| `lib/mapStore.svelte.ts`                       | `$state` cache backed by `/api/session/map` — `initMap` fetches, mutations PUT optimistically. |
| `lib/mapExport.ts`                             | `exportMapPng` + `exportMapJson` — snapshot download flows.                                    |
| `lib/components/MapDialog.svelte`              | Three-layer SVG (image / grid / markers) + toolbar + inline marker editor + export buttons.    |
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
    { "id": "e2f7…", "q": 3, "r": 2, "label": "Driftwood", "icon": "settlement" },
    { "id": "b115…", "q": 6, "r": 4, "label": "Blood Thorn", "icon": "danger" }
  ],
  "backgroundHash": "9c1a…",
  "updatedAt": "2026-01-15T12:00:00.000Z"
}
```

- **`markers`** — flat array. Multiple markers per `(q, r)` are permitted
  at the store level. Tier 1a UI edits the first hit; a marker picker
  is Tier 2.
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

Eight slugs, drawn from the existing `$icons/` vocabulary:

| Slug         | Label             | Icon                              |
| ------------ | ----------------- | --------------------------------- |
| `settlement` | Settlement        | `village.svg`                     |
| `hamlet`     | Hamlet            | `hut.svg`                         |
| `ruin`       | Ruin              | `dungeon-gate.svg`                |
| `encounter`  | Encounter         | `sword.svg`                       |
| `danger`     | Danger            | `skull-crossbones-solid-full.svg` |
| `quest`      | Quest             | `treasure-map.svg`                |
| `poi`        | Point of Interest | `star-solid-full.svg`             |
| `marker`     | Marker (generic)  | `location-dot-solid-full.svg`     |

Growing the enum is a data-migration event — slugs are on-disk strings
in the `user_maps.markers` JSONB. **Adding** a new value is safe;
**renaming or removing** one breaks existing markers.

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

- **Upload image** — file picker opens for `image/*`; downscale + PUT
  in one step. Errors show in a red banner just under the toolbar.
- **Names toggle** — global show/hide of marker labels (icons always
  render).
- **Click a hex** — opens the inline marker editor at the bottom of
  the dialog. New markers default to `icon: 'marker'` and an empty
  label. Editor fields: label (text), icon (grid of 8). Enter saves,
  Esc cancels.
- **Delete** (editor, when editing an existing marker) — removes it.
- **Export PNG** — rasterises the current SVG (image + grid + markers +
  labels) to a 2× viewBox PNG (typically ~1600×1000) and downloads it.
  Honors the current Names toggle.
- **Export JSON** — writes a `{ manifest, data: { markers,
backgroundHash, backgroundUrl } }` envelope for backup or transfer.
  Full round-trip import (re-uploading the image on a different
  account) is a Tier 2 concern.
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
radius on phone. The inline marker editor collapses under the canvas,
so on portrait phones the flow becomes tap-hex → scroll to editor.

## Growth path

Tier 2 (planned):

- **JSON import** — pair the JSON export with an importer that
  re-uploads the image via `PUT /session/map/background` and swaps in
  the fresh hash. Bundle this into the top-level "Everything"
  export/import.
- **Entity link** on markers — dropdown resolving Places / Sites /
  Communities / NPCs from the connections deck. Click-through from a
  marker to the linked entity.
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
