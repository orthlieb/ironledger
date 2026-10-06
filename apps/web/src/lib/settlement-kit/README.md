# Settlement kit

Procedural, layered-SVG map icons for settlements. The kit renders every
settlement in a single visual language — timber frames, stone walls, dome
caps, lagoons, stilt pilings — tuned so the generated icons sit next to
hand-drawn map markers without clashing.

Three self-contained files do the work; a renderer collapses them into
one layered SVG per piece or per settlement.

| File           | Responsibility                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `geom.js`      | Primitive shapes (`rect`, `arc`, `circle`, `archOpening`, `lancet`, `crenellated`) and the PRNG.  |
| `pieces3d.js`  | Every drawable piece (house, tower, keep, well, …) and the `Design` typedef with culture knobs.   |
| `layouts3d.js` | Templates (stead → freeport) that lay pieces out into a settlement, including the ring wall.      |
| `ruins3d.js`   | Decay / overgrowth / scorch transformation applied over any `Placed[]` list.                      |
| `render.js`    | Clipper-based renderer that collapses the final back-to-front list into one path per colour role. |
| `patterns.js`  | SVG `<pattern>` tiles for material-wall roles (stone brick, hedge foliage, reef coral).           |
| `generate.js`  | `recipeDesign()` + `generateSettlementSvg()` — the only entry points app code should call.        |
| `fallback.js`  | Marker-chip fallback (plain core icon) for recipes a client can't yet render.                     |

## Oblique projection

Pieces are drawn in a 3/4 oblique projection, hand-tuned to read as 3D at
marker size (32–48 px) without any shading beyond flat-tinted faces.

- **Up is `+y`** in piece-local coordinates; the renderer flips to SVG's
  y-down at output.
- **Depth runs up-and-right** along `depthVec(d)` = `(0.75 d, 0.5 d)`.
- **Light comes from the upper left**, so every right-facing face (side
  walls, right roof slopes, right flanks of cylinders and cones) is
  shaded (darker role colour + diagonal hatching lines).
- Line widths are in world units and **do not scale** with a placed
  piece, so every icon shares one stroke weight no matter how big its
  pieces are. Scaling a piece makes it bigger; its outlines stay the
  same thickness.

### The side-face skew — easy to get wrong

A **front** face (gable end facing the viewer, standalone-wall front)
sits parallel to the screen: upright rectangles, archOpenings, lancets
and openings all draw correctly as-is.

A **side** face (gable end of a side-house, keep's right flank, cathedral
nave, square-tower cheek) runs **into** depth. Upright shapes drawn on
these faces look like they're pasted on with no perspective. Route them
through `sideFace(poly, anchor)` so their horizontal edges slant with the
depth-vec. The anchor is the shape's bottom-centre on the face in
drawing coords and must include the depth-induced y shift
(`anchor[1] = baseY + v[1] * depthFrac`), not just `baseY`.

See `sideHouse`, `keep`, `cathedral` for working examples; the
`settlementKit.test.ts` suite smoke-tests the rendered output.

## Material-wall patterns

Three wall materials (`stone`, `hedge`, `reef`) take an SVG `<pattern>`
tile fill instead of a flat colour. The pattern definitions live in
`patterns.js`; the generator and the main app's `mapLayered.ts` both
inline `<pattern>` elements into their output's `<defs>` and reference
them from the wall path with `fill="url(#pat-<role>-<scope>)"`.

Why patterns:

- **Perf.** Stone's running-bond courses used to be ~50 Clipper lines
  per wall segment that had to be unioned with the shade area; moving
  the pattern to a repeating SVG tile cut the icon baker from 128 s to
  ~50 s and skips Clipper for the texture entirely.
- **Legibility.** Hedge used to render as a flat silhouette with a
  scalloped top; a leafy stipple pattern now reads as a hedge. Reef
  likewise picked up a coral stipple instead of a flat earth-coloured
  shape.

Pattern bodies use CSS `var(--wall, #hex)` + `var(--ink, #hex)` with
hex fallbacks: a baked SVG opened standalone keeps its hex colours;
the playground (which sets `--wall` / `--ink` on `:root`) picks up live
colour-picker changes without re-rendering.

To add a new material pattern:

1. Define a `PatternDef` (tile size + body function) in `patterns.js`.
2. Add the role (e.g. `wall-coral`) to `PATTERNS` and to the `LAYERS`
   list in `render.js` (both base and `-shade` variants).
3. Return the new role from `material()` in `pieces3d.js` for the
   matching wall type.
4. Mirror the role in the main app's `mapLayered.ts`
   (`PATTERN_WALL_ROLES`, `roleColours`, `patternSvg` body).
5. Add a smoke-test row to `settlementKit.test.ts` so a future
   regression that drops the pattern def is caught.

## Design knobs (one Culture = one Design)

The `Design` typedef in `pieces3d.js` holds every per-culture dial. Each
culture plugin (`extensions/*/cultures/*.json`) sets a partial Design on
top of `DEFAULT_DESIGN`. Highlights:

| Knob        | Values                                              | What it drives                                          |
| ----------- | --------------------------------------------------- | ------------------------------------------------------- |
| `houseForm` | `'timber'` / `'round'` / `'mound'` / `'stilt'`      | Which `*House` / `*Hut` the dwelling picker uses.       |
| `towerRoof` | `'cone'` / `'onion'` / `'crenel'` / `'dome'`        | Cap on round towers, square towers, lighthouses, wells. |
| `wall`      | `'none'` / `'stone'` / `'palisade'` / `'earth'` / … | The culture's own ring-wall material.                   |
| `wallShape` | `'round'` / `'square'`                              | Shape of the ring wall.                                 |
| `wallBow`   | `-1 … 1`                                            | Concave (elven) walls dip, convex ones bulge.           |
| `towerBow`  | `-1 … 1`                                            | Tower-wall curvature (elven flare, giant bulge).        |
| `flagShape` | `'banner'` / `'pennant'` / `'swallowtail'`          | Flag cloth silhouette. Default `'banner'`.              |
| `masonry`   | `boolean`                                           | Stone-course lines on house walls (stone walls always). |
| `ground`    | `'land'` / `'water'`                                | Base plane. `'water'` adds the lagoon.                  |
| `stature`   | `0.6 … 1.5`                                         | Building height factor (giants > 1, small folk < 1).    |
| `scale`     | `0.7 … 1.3`                                         | Building size factor (bigger means fewer per layout).   |

## Recipe overrides

Three recipe-only fields let a marker override the culture:

| Recipe field | Effect                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `walls`      | Override the culture's own ring-wall material (`'none'`, `'stone'`, `'palisade'`, …).           |
| `wallShape`  | Force `'round'` or `'square'` regardless of what the culture rolls.                             |
| `ground`     | Override `D.ground` ('land' / 'water') — the easy knob for "put this settlement on a lagoon."   |
| `stilts`     | Wrap every inside-the-walls piece with `onStilts(...)` so the whole settlement sits on pilings. |
| `harbor`     | `true` adds a side harbour with pier + caravel.                                                 |
| `ruin`       | `{ decay, burned? }` runs `ruinPlaced()` over the final list.                                   |

See CLAUDE.md ("Standing order — settlement-recipe override fields live
in four places") for the plumbing contract when adding a new one.

## Pieces catalogue (abridged)

Exported from `pieces3d.js`; `layouts3d.js` → `pieces(D)` returns the full
list with human-readable names. Partial map, as a quick index:

- Dwellings: `gableHouse`, `sideHouse` (handles house / warehouse /
  workshop / church / longhouse / barn / tavern / barracks / mill via
  `kind`), `townhouse`, `roundHut`, `moundHut`, `stiltHut`.
- Towers: `roundTower`, `squareTower`, `clocktower`, `lighthouse`,
  `windmill`.
- Religious + civic: `church`, `cathedral`, `keep`, `market`, `well`,
  `witchHut`, `mine`.
- Walls + gates: `ringWall`, `squareWall`, `wallSegment`, `gatehouse`,
  `jawGate`.
- Terrain: `lagoon`.
- Encampment: `tent`, `pavilion`, `caravel`, `pier`, `dock`, `camp`.
- Wrappers: `onStilts(parts, D)` lifts any piece onto a timber-post
  deck sized to its own extent (used by `recipe.stilts`); `stiltHut` is
  a thin wrapper over `onStilts(roundHut(...))`.

## Rendering

`render.js` → `renderLayered(parts, opts)` collapses a back-to-front list
of `Part`s into one SVG path per colour role (`wall`, `wall-shade`,
`wood`, `wood-shade`, …, `roof`, `roof-shade`, `flag`, `ink`). Each path
is a filled polygon — no `<stroke>` on the server-rendered output.

The caller (the main app's `mapLayered.ts`, the `build-settlement-icons.mjs`
script, or `generateSettlementSvg()`) assigns colours per role, puts the
marker colour on the `roof` layer, and inlines the SVG.

## How to add a piece

1. Draw it in `pieces3d.js` as a `Part[]`: `solid` polygons for the body,
   `fills` for cut-out ink shapes (doors, windows, slits), `lines` for
   detail strokes (hatching, stone courses, meridian ribs), `shadeArea`
   for the right-flank darker region on cylinders and cones. Put openings
   on side faces through `sideFace()`.
2. Export the function and add an entry to `rawPieces()` in `layouts3d.js`
   so the playground can show it in the pieces row.
3. If it's a dwelling, route it through the `house()` picker there. If
   it's an inside-the-walls extra, add it to `EXTRAS` so templates can
   call for it.
4. Add a smoke-test row to `apps/web/tests/unit/settlementKit.test.ts`
   if the piece is non-trivial — the `pieces(D)` loop already covers it
   generically, but a kind-specific case helps when the piece has a
   mode selector (`sideHouse`'s `kind` family).
5. Rebuild `npm run build:settlement-icons -w apps/web` to regenerate
   the baked PNG/SVG set under `apps/web/static/map/settlement/`. Commit
   the regenerated files in the same branch as the kit change.

## Settlement playground

`tools/settlement-playground.html` (generated by
`npm run build:settlement-playground -w apps/web`) is a standalone
single-file tool: every Design knob + drawing option + colour role gets
a live control, every piece and every tier re-renders in-page on each
change. Each icon exports as SVG or PNG, and the current knobs + colours
export as a `cultures/*.json` plugin ready to drop into an extension.

The playground is the fastest way to iterate on a new piece or try a
culture design before committing it. It is the only consumer of the
`flagShape` knob (not yet exposed in the main-app Settlement Builder).
