# Campaign Map

A paint-a-hex-grid map lives one click behind the **Map** button in the
Expeditions tab header. Tier 1 scope: one map per user, painted terrain
only, no markers or fill/path tools yet. Everything is client-side (SVG +
localStorage) — the map never touches the server.

## Files

| File                                                    | Responsibility                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/mapConstants.ts`                      | Terrain enum, colour palette, grid dimensions (`MAP_COLS × MAP_ROWS`), hex radius.          |
| `apps/web/src/lib/mapGeometry.ts`                       | Pure geometry: axial↔pixel, neighbours, polygon points, cell iteration, viewBox. No Svelte. |
| `apps/web/src/lib/mapStore.svelte.ts`                   | Module-level `$state` with the sparse `cells: HexCell[]` array + localStorage persistence.  |
| `apps/web/src/lib/components/MapDialog.svelte`          | SVG canvas + terrain palette toolbar + Clear confirmation.                                  |
| `apps/web/src/lib/components/v2/ExpeditionsArea.svelte` | Header "Map" button that opens the dialog.                                                  |
| `apps/web/tests/unit/mapGeometry.test.ts`               | Unit tests for the geometry helpers.                                                        |

## Data model

Storage key: `localStorage['ironledger:map']`. Shape:

```json
{
  "cells": [
    { "q": 3, "r": 2, "terrain": "forest" },
    { "q": 4, "r": 2, "terrain": "hills" }
  ],
  "updatedAt": 1717000000000
}
```

**Sparse array** — unpainted cells simply aren't in the list. A fully-
painted 20×15 map is <5 KB serialised.

**Axial coordinates** (`q`, `r`). Pointy-top; conversion follows the [Red
Blob Games](https://www.redblobgames.com/grids/hexagons/) reference. `q`
grows east; `r` grows south-east.

## Terrain palette

Ten tiles, colour-only for Tier 1 (icons are a Tier 2 concern):

| Slug        | Colour    | Ironsworn region mapping   |
| ----------- | --------- | -------------------------- |
| `plains`    | `#a3c66a` | Havens, Hinterlands        |
| `forest`    | `#3f7d3f` | Barrier Woods, Deep Wilds  |
| `hills`     | `#8a9f5a` | Tempest Hills              |
| `mountains` | `#6b5d54` | Veiled Mountains           |
| `marsh`     | `#5a8878` | Flooded Lands              |
| `wastes`    | `#c0a878` | Shattered Wastes           |
| `snow`      | `#d5e1eb` | frozen north / seasonal    |
| `coast`     | `#e8d69a` | Ragged Coast (land side)   |
| `sea`       | `#4a8fbf` | Coastal Waters, open ocean |
| `unknown`   | `#8a8580` | deliberately-marked fog    |

Deliberately left out: **river**, **road**, **settlement**, **ruin**.
Those are overlays / markers, not fills — they go on the marker layer
in Tier 2.

Growing the enum is a data-migration event: every user's localStorage
carries terrain slugs as plain strings. **Adding** a new value is safe;
**renaming or removing** one breaks existing maps.

## Interaction

- **Palette** — click a swatch to select the terrain. Selected swatch is
  border-highlighted with the accent colour.
- **Paint** — click a hex to fill it with the current terrain. Click
  again to overpaint.
- **Erase** — toggle Erase in the toolbar; clicks then remove cells from
  the sparse array instead of painting. Status bar shows "erase mode".
- **Clear** — wipes the whole map via a ConfirmDialog. Disabled when
  the map is already empty.

Persistence is per-click: every `paintHex` writes to localStorage
immediately. No debounce yet — Tier 1 paint is a discrete click, not
a drag stream. When drag-paint arrives, the write path should debounce.

## Rendering

SVG. Each hex is one `<polygon>` with a stable `points` string from
`hexPolygonPoints(cx, cy)`. Grid cells enumerated by `allCells()` —
per-row `q` offset so the bounded rectangle has straight vertical sides
instead of zig-zagging. The `<svg>` uses `viewBox` from `mapViewBox()`
and `preserveAspectRatio="xMidYMid meet"` so the map scales cleanly to
the dialog width.

Signed-zero normalisation: `allCells` yields `q + 0` so row 0's initial
`-offset` (which is `-0`) never leaks into the sparse array or test
comparisons.

Perf on 300 cells is fine — every hex re-renders on paint (Svelte 5's
proxy is fine-grained per array element), and the linear `.find()` in
`terrainAt(q, r)` is <1 ms. If Tier 2 doubles the cell count, swap for
a `Map<"q,r", Terrain>` lookup.

## Mobile

The dialog is `width: min(920px, calc(100vw - 2rem))` and `max-height:
85vh` per the CLAUDE.md iOS-safe dialog rules (`vh` not `dvh`, centred
via `top: 50% + transform`, no `display: flex` on the dialog element).
The SVG scales down to fit; hex-tap targets stay comfortable at ~22px
radius on phone. No pan/zoom yet — the whole map fits at once.

## Growth path

Tier 2 (planned):

- Fill tool (flood-fill contiguous same-terrain).
- Path tool (click a sequence of hexes to lay road/river as an overlay).
- Named markers pinned to hexes, referencing existing Places / Sites /
  Communities / NPCs from the connections deck.
- Names toggle (global show/hide of marker labels).

Tier 3:

- Faction-influence overlay (per-hex tint by controlling faction).
- Fog of war (paint over explored regions).
- Multiple maps per campaign (dropdown selector).
- Import/export map data through the JSON envelope.

## Tests

`apps/web/tests/unit/mapGeometry.test.ts` covers the pure geometry —
axial↔pixel conversion, neighbour walk (with symmetry check), polygon
point generation, `allCells` bounds + row-offset behaviour, and the
`viewBox` bounds. 17 tests, all green.

Store + dialog behaviours are exercised only by hand at Tier 1 (paint,
erase, clear, persist). E2E coverage should arrive with Tier 2 markers,
when the map starts interacting with other entities.
