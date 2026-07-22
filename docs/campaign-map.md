# Campaign Map

A map-annotation surface — upload your own map image, drop labelled icons
on hexes. Lives one click behind the **Map** button in the Expeditions
tab header. Tier 1a scope: background image + hex-pinned markers with a
label and an icon; no fill/path tools, no faction overlay, no
entity-linking dropdown yet. Everything is client-side (SVG +
localStorage) — the map never touches the server.

Tier 1 shipped painted-terrain hexes without a background image. This
tier pivots to annotation: users bring their own map (Watabou / hand-
drawn / commissioned art / photo of a paper map) and the app overlays a
grid + markers on top. That matched the "annotate the map I already
have" workflow players wanted better than the paint-from-scratch model.
The old `cells` array is reset on first load under the new shape.

## Files

| File                                                    | Responsibility                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/mapConstants.ts`                      | Grid dimensions, hex radius, marker icon enum + labels, image size caps.                      |
| `apps/web/src/lib/mapGeometry.ts`                       | Pure geometry: axial↔pixel, neighbours, polygon points, cell iteration, viewBox. No Svelte.   |
| `apps/web/src/lib/mapImage.ts`                          | `downscaleImage(file)` — canvas-based resize + JPEG re-encode. Pure-browser, uses `<canvas>`. |
| `apps/web/src/lib/mapStore.svelte.ts`                   | Module-level `$state`: `{ backgroundDataUrl, markers, updatedAt }`. localStorage persistence. |
| `apps/web/src/lib/components/MapDialog.svelte`          | Three-layer SVG (image / grid / markers) + toolbar + inline marker editor.                    |
| `apps/web/src/lib/components/v2/ExpeditionsArea.svelte` | Header "Map" button that opens the dialog.                                                    |
| `apps/web/tests/unit/mapGeometry.test.ts`               | Unit tests for the geometry helpers (unchanged by this pivot).                                |

## Data model

Storage key: `localStorage['ironledger:map']`. Shape:

```json
{
  "backgroundDataUrl": "data:image/jpeg;base64,…",
  "markers": [
    { "id": "e2f7…", "q": 3, "r": 2, "label": "Driftwood", "icon": "settlement" },
    { "id": "b115…", "q": 6, "r": 4, "label": "Blood Thorn", "icon": "danger" }
  ],
  "updatedAt": 1717000000000
}
```

- **`backgroundDataUrl`** — base64 image, `''` when no background is set.
  Downscaled and re-encoded to JPEG before it ever lands here (see
  Image ingest below).
- **`markers`** — flat array. Multiple markers per `(q, r)` are permitted
  at the store level — game-mechanically a hex can hold a settlement
  AND an encounter — but Tier 1a's UI edits the first hit; a marker
  picker is Tier 2.
- **Axial coordinates** (`q`, `r`). Pointy-top; conversion follows the
  [Red Blob Games](https://www.redblobgames.com/grids/hexagons/)
  reference.

**Migration from Tier 1**: on load, if the persisted payload doesn't
have a `markers` key it's discarded and treated as an empty map. Tier 1
shipped minutes before this pivot — near-zero users are affected and
the migration is explicit and grep-findable in `readMap()`.

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
inside every user's localStorage. **Adding** a new value is safe;
**renaming or removing** one breaks existing markers.

## Image ingest

`mapImage.ts` exposes `downscaleImage(file: File) → Promise<string>`.
Pipeline:

1. Reject uploads > `MAP_IMAGE_MAX_UPLOAD_BYTES` (20 MB) up front.
2. Decode via `Image` + `URL.createObjectURL`.
3. Draw onto a `<canvas>` at max longest side `MAP_IMAGE_MAX_DIMENSION`
   (2000 px), aspect ratio preserved.
4. Re-encode via `canvas.toDataURL('image/jpeg', MAP_IMAGE_QUALITY)`
   at quality 0.85.
5. Reject the result if it still exceeds `MAP_IMAGE_MAX_STORED_BYTES`
   (2 MB) — this only happens with pathological inputs.

Result: predictable JPEG bytes, typically 200-500 KB for a scanned
paper map or generated fantasy map. Comfortable inside Chrome's ~5 MB
localStorage budget with room for the rest of Iron Ledger's state.

## Rendering

Three SVG layers stacked in draw order inside a single `<svg>`:

1. **Background `<image>`** — anchored to the same bounds as the hex
   grid, `preserveAspectRatio="xMidYMid meet"` (aspect-fit
   letterboxing).
2. **Hex grid overlay** — every cell is one `<polygon>` with transparent
   fill and a translucent stroke (`color-mix` against `--text` at 30%).
   Click handler opens the marker editor.
3. **Marker layer** — for each marker: an `<image>`-free `<g>`
   containing the raw icon SVG (fill overridden to `var(--text)` with
   a drop-shadow so it stays readable over busy backgrounds) plus an
   optional label rendered as a paint-order-stroked `<text>` element
   for legibility over any colour.

The `<svg>` uses `viewBox` from `mapViewBox()` and
`preserveAspectRatio="xMidYMid meet"` so the whole canvas scales cleanly
to the dialog width.

## Interaction

- **Upload image** — file picker opens for `image/*`; downscale + save
  in one step. Any error surfaces in a red banner just under the
  toolbar.
- **Names toggle** — global show/hide of marker labels. Icons always
  render.
- **Click a hex** — opens the inline marker editor at the bottom of
  the dialog. New markers default to `icon: 'marker'` and an empty
  label. Clicking a hex that already has a marker opens the editor on
  that marker. Editor fields: label (text), icon (grid of 8). Enter
  saves, Esc cancels.
- **Delete** (editor only, when editing an existing marker) — removes
  the marker.
- **Clear map** — wipes the background image and every marker via a
  ConfirmDialog. Disabled when the map is already empty.

Persistence is per-mutation: `setBackground` / `addMarker` /
`updateMarker` / `removeMarker` / `clearMap` all write to localStorage
immediately.

## Mobile

The dialog is `width: min(960px, calc(100vw - 2rem))` and `max-height:
88vh` per the CLAUDE.md iOS-safe dialog rules (`vh` not `dvh`, centred
via `top: 50% + transform`, no `display: flex` on the dialog element).
The SVG scales down to fit; hex-tap targets remain useable at ~22px
radius on phone. The inline marker editor collapses under the canvas,
so on portrait phones the flow becomes tap-hex → scroll to editor.

## Growth path

Tier 2 (planned):

- **Entity link** on markers — dropdown resolving Places / Sites /
  Communities / NPCs from the connections deck. Click-through from a
  marker to the linked entity.
- **Multiple markers per hex** in the UI — a picker when clicking a
  hex that already has one.
- **Region tint layer** — translucent colour overlay for faction /
  kingdom / danger-zone grouping. Uses the terrain palette from Tier 1
  as a starting set.
- **Names always-on tooltip** — hover a marker with names off, see its
  label.

Tier 3:

- **Alignment controls** — offset (x/y) + scale + rotation so the grid
  can be nudged to fit an existing image's landmarks.
- **Fill / Path tools** — flood-fill regions with tint, draw roads and
  rivers as overlays.
- **Fog of war** — paint over explored/unexplored regions.
- **Multiple maps per campaign** — dropdown selector.
- **Import/export** the map (image + markers) through the JSON envelope
  or a portrait-blob-store integration for cross-device sync.

## Tests

`apps/web/tests/unit/mapGeometry.test.ts` covers the pure geometry —
axial↔pixel conversion, neighbour walk with symmetry check, polygon
point generation, `allCells` bounds + row-offset behaviour, and the
`viewBox` bounds. 17 tests, all green.

`downscaleImage` and marker editor flows aren't unit-tested — jsdom
doesn't provide `<canvas>` and the editor's exercised by hand at Tier
1a. E2E coverage should arrive with Tier 2's entity-link + multi-marker
UI when the map starts interacting with other entities and warrants
regression tests.
