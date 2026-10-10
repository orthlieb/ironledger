# Settlement kit

Procedural, layered-SVG map icons for settlements. The kit renders every
settlement in a single visual language — timber frames, stone walls, dome
caps, lagoons, stilt pilings — tuned so the generated icons sit next to
hand-drawn map markers without clashing.

A handful of self-contained files do the work; a renderer collapses them
into one layered SVG per piece or per settlement.

| File           | Responsibility                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| `geom.js`      | Primitive shapes (`rect`, `arc`, `circle`, `archOpening`, `lancet`, `crenellated`) and the PRNG.          |
| `pieces3d.js`  | Every drawable piece (house, tower, keep, well, …) and the `Design` typedef with the culture knobs.       |
| `layouts3d.js` | Templates (stead → freeport) that lay pieces out into a settlement, including the ring wall.              |
| `ruins3d.js`   | Decay / overgrowth / scorch transformation applied over any `Placed[]` list.                              |
| `render.js`    | Clipper-based renderer that collapses the final back-to-front list into one path per colour role.         |
| `patterns.js`  | Material-wall `<pattern>` tiles in fixed colours (stone, bramble hedge, brain coral, planks, dirt, bone). |
| `generate.js`  | `recipeDesign()` + `generateSettlementSvg()` — the only entry points app code should call.                |
| `fallback.js`  | Marker-chip fallback (plain core icon) for recipes a client can't yet render.                             |

## Oblique projection

Pieces are drawn in a 3/4 oblique projection, hand-tuned to read as 3D at
marker size (32–48 px) without any shading beyond flat-tinted faces.

- **Up is `+y`** in piece-local coordinates; the renderer flips to SVG's
  y-down at output.
- **Depth runs up-and-right** along `depthVec(d)` = `(0.75 d, 0.5 d)`.
- **Light comes from the upper left**, so every right-facing face (side
  walls, right roof slopes, right flanks of cylinders and cones) is
  shaded: a darker role colour plus hatching — diagonal (55°) on
  cylinders, horizontal on cones and domes, thinner diagonal strokes on
  house and tower walls.
- Line widths are in world units and **do not scale** with a placed
  piece, so every icon shares one stroke weight no matter how big its
  pieces are. Scaling a piece makes it bigger; its outlines stay the
  same thickness (which is why a detail that reads at 1× can vanish under
  the outlines of a small, scaled-down piece).

### Perspective

Box-like pieces — houses, townhouses, square towers, the keep, cathedral,
gates, market stalls, ridge tents — build their receding faces through
`boxProjector(d, k, h, ridge)`. A point at depth fraction `t` lands at
`p·s(t) + depthVec(t·d)` with `s(t) = 1 / (1 + k·t·d / 20)`, so receding
faces converge: back edges come out shorter and eaves climb less than the
ground. `k` is the culture's `perspective` (0.5 by default; 0 is plain
parallel oblique).

- **Tall pieces cap the strength**, or a flat top tips over and reads as
  seen from below: a top face at height `h` still climbs at least half as
  steeply as in parallel, and a ridge running back at height `ridge` at
  least a quarter as steeply.
- **Every point at the same depth must go through the same projector**, or
  faces that share an edge won't meet.
- **Draw upright shapes on a receding face** (windows, slits, merlons, the
  cathedral's lancets) with `P.face(poly, fx, y, t)`: the shape's bottom
  and top edges follow the face's slope so it reads as painted on the
  wall, not floating over it.
- Round pieces, walls and the pier stay parallel.

## Towers

Round and square towers share one model — **body + crenellated top +
cap** — read from the culture with `towerTop(D, o)`:

- **Body**, optionally corbelled: `towerCorbel` (0–1) is the share of its
  height, measured down from the top, that widens out on a 45° slope.
  Windows and other openings stay wholly above or below the bend.
- **Crenellated top** (`towerCrenel`): a short parapet band corbelled out
  on its own 45° slope. With a cap, its crenels show as dark slots under
  the eave; bare, its merlons stand free (square towers add a platform and
  back parapet).
- **Cap** (`towerRoof`): `cone` (a pyramid spire on square towers),
  `onion`, `dome`, `lancet`, or `none` — a bare crenellated top. A tower
  with no cap always gets the crenellated top, so it never ends flat.
- The **flag** flies from whichever is uppermost; landmark towers carry the
  culture's holy-symbol finial instead. Flag cloth is a `sharp` part, so
  its corners and points stay crisp whatever the culture's `join`.

**Landmark towers** — church and cathedral towers, the clock tower, a
village bell tower — go through `belfry(D, o)`, which builds them square
(`squareTower`) or round (`roundTower` with a door, bell chamber or clock
face, and finial) per the culture's `steeple`. Towns and holds raise 1d2
free-standing round towers and cities and up 1d3, walled or not.

## Material walls

Every wall material fills with an SVG `<pattern>` tile from `patterns.js`
in **fixed colours of its own** (`MATERIALS`), whatever the culture's
palette; only the shaded tile mixes toward the palette ink.

| `wall`     | Role         | Look                                                                       | Tile scale |
| ---------- | ------------ | -------------------------------------------------------------------------- | ---------- |
| `stone`    | `wall-stone` | Grey running-bond masonry.                                                 | 2×         |
| `hedge`    | `wall-hedge` | Green brambles: arching brown canes with prickles, three/five-leaf sprays. | 2×         |
| `reef`     | `wall-reef`  | White-and-grey brain coral: a maze carved on a wrap-around grid.           | 2.5×       |
| `palisade` | `wall-wood`  | Brown plank stripes; the wall top carries a stake tip every 1.6 units.     | 1×         |
| `earth`    | `wall-earth` | Brown speckled dirt, heaped into mounds.                                   | 1×         |
| `bone`     | `wall-bone`  | White with faint grey grain; rib crests.                                   | 1×         |

The hedge and coral tiles are drawn procedurally, once at load; anything
crossing a tile edge is repeated a tile over, so every tile is seamless.
Wall merlons and wooden gates take their wall's role.

Why patterns: a texture as a repeating tile costs Clipper nothing, where
the same detail as stroked lines had to be unioned into every wall segment
(stone courses drawn that way once more than doubled the icon baker's run).

**API.** A `PatternDef` is `{w, h, scale?, body(paint)}`: `scale` becomes
a `patternTransform` (strokes scale too); `body` returns the tile's inner
XML for a `Paint` — `{ink, tone}`, where `tone(colour)` maps a material
colour to the tile's lighting (as-is when lit, mixed toward ink when
shaded). `patternDefs(roles, paintFor, scope)` emits the `<defs>` and
`url(#pat-<role>-<scope>)` references. Its three consumers:

- `generate.js` bakes hex colours (`paletteTone(role, ink, mix)`).
- The main app's map (`mapLayered.ts`) draws through the same
  `patternDefs`, scoping ids per rendered icon (a shared id resolves to
  the first copy in the document, and a copy inside a `display:none`
  subtree never paints). Below `PATTERN_MIN_PX` screen pixels per icon
  unit — every ordinary map marker — walls draw flat in `FLAT_WALLS`
  instead, since a sub-pixel texture only muddies the wall.
- The playground passes `var(--ink)` / `color-mix()` so shading follows
  its ink picker; its marker-size strip draws walls flat to match the map.

To add a material:

1. Define a `PatternDef` in `patterns.js`, its colours in `MATERIALS` and
   its flat colour in `FLAT_WALLS`; add the role (base and `-shade`) to
   `PATTERNS`.
2. Add both roles to `LAYERS` (and the `Role` typedef) in `render.js`.
3. Return the role from `material()` in `pieces3d.js` for the wall type.
4. Add a row to the `wall patterns` table in `settlementKit.test.ts`.

The app needs no change: it draws whatever `patterns.js` defines.

## Cultures: one culture = one Design + palette

A culture plugin (`cultures/<key>.json` in an extension, or
`apps/api/data/cultures/` for the base game) is
`{key, name, note, design, palette}`. `design` is any subset of the
`Design` knobs below, laid over `DEFAULT_DESIGN`; `palette` gives the eight
colour roles. A culture is therefore up to **42 knobs** — 22 numbers, 14
choices and 6 on/off switches — **plus 8 colours**. The shipped cultures
set 15–26 knobs each (the Sample culture 36; Ironlanders is the default,
with none).

`recipeDesign()` runs every culture through `upgradeDesign()`, which
migrates retired spellings — today the legacy `towerRoof: "crenel"`
becomes `towerRoof: "none"` + `towerCrenel: true`. Defaults and ranges
below are `DEFAULT_DESIGN` and the playground's sliders.

**Build**

| Knob        | Values (default)                   | What it drives                                             |
| ----------- | ---------------------------------- | ---------------------------------------------------------- |
| `houseForm` | **timber** / round / mound / stilt | Framed houses, round huts, turf mounds or huts on stilts.  |
| `ground`    | **land** / water                   | Water lays a lagoon with waves under the settlement.       |
| `stature`   | 0.6–1.5 (**1**)                    | Building height (small folk < 1 < giants).                 |
| `scale`     | 0.7–1.8 (**1**)                    | Building size; bigger means fewer per layout.              |
| `flourish`  | 0–1 (**0**)                        | Ornament: finials, eave knobs, ridge cresting, more flags. |
| `masonry`   | on / **off**                       | Stone courses on house walls.                              |

**Houses**

| Knob          | Values (default)                            | What it drives                                                 |
| ------------- | ------------------------------------------- | -------------------------------------------------------------- |
| `pitch`       | 0.3–1.4 (**0.75**)                          | Roof height ÷ house width.                                     |
| `concave`     | 0–0.3 (**0**)                               | Roof sweep: how far roof edges sag inward.                     |
| `depth`       | 0.4–1.2 (**0.8**)                           | House depth ÷ width.                                           |
| `gable`       | 0–1 (**0.5**)                               | Share of houses with the gable to the front.                   |
| `storeys`     | 0–1 (**0.3**)                               | Chance a house has a second storey.                            |
| `window`      | **square** / arched / slit / round / lancet | Window shape.                                                  |
| `door`        | **arched** / square / lancet                | House door shape (keep, cathedral, pavilion keep their own).   |
| `manyDoors`   | on / **off**                                | A door in every other ground-floor slot.                       |
| `perspective` | 0–1 (**0.5**)                               | How strongly receding faces converge (see Perspective).        |
| `industry`    | 0–1 (**0.2**)                               | Share of town/city buildings that are warehouses or workshops. |
| `longhouse`   | 0–1 (**0**)                                 | Share of timber dwellings that are longhouses.                 |
| `huts`        | 0–1 (**0**)                                 | Share of timber dwellings that are round huts.                 |

**Towers**

| Knob          | Values (default)                        | What it drives                                                                    |
| ------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| `towerRoof`   | none / **cone** / onion / dome / lancet | The cap (see Towers). `dome` also swaps every pitched house roof for a half-dome. |
| `towerCrenel` | on / **off**                            | A crenellated top with its own corbel.                                            |
| `towerCorbel` | 0–1 (**0**)                             | Share of the tower's height corbelled out at 45°.                                 |
| `spire`       | 1–4 (**2.2**)                           | Spire / cone height ÷ tower width.                                                |
| `taper`       | 0–0.2 (**0.04**)                        | Tower walls lean in by this share of the radius.                                  |
| `towerBow`    | −1–1 (**0**)                            | Concave (> 0) flares at the foot and narrows; convex bulges.                      |

**Landmarks**

| Knob      | Values (default)                                                      | What it drives                                          |
| --------- | --------------------------------------------------------------------- | ------------------------------------------------------- |
| `church`  | **on** / off                                                          | A full church (nave + bell tower) or a lone bell tower. |
| `steeple` | **square** / round                                                    | Shape of church, cathedral, clock and bell towers.      |
| `symbol`  | none / **orb** / sun / spike / cross / horns / wheel / claw / trident | Holy-symbol finial on temple towers.                    |
| `keep`    | none / **city** / town / all                                          | Smallest settlement with a castle keep.                 |
| `market`  | none / **town** / all                                                 | Smallest settlement with a market square.               |

**Flags**

| Knob        | Values (default)                   | What it drives                        |
| ----------- | ---------------------------------- | ------------------------------------- |
| `flags`     | **on** / off                       | Flags on towers and the harbour ship. |
| `flagLen`   | 5–20 (**11**)                      | Cloth length.                         |
| `flagFolds` | 1–5 (**3**)                        | Waves in the cloth.                   |
| `flagShape` | banner / **pennant** / swallowtail | Cloth silhouette.                     |

**Walls**

| Knob         | Values (default)                                          | What it drives                                                  |
| ------------ | --------------------------------------------------------- | --------------------------------------------------------------- |
| `wall`       | none / **stone** / palisade / hedge / bone / earth / reef | The culture's own ring wall (see Material walls).               |
| `wallShape`  | **round** / square                                        | Ring or square enclosure.                                       |
| `wallH`      | 0.6–1.6 (**1**)                                           | Wall height factor.                                             |
| `merlons`    | **on** / off                                              | Crenellated parapet on stone walls.                             |
| `wallBow`    | −1–1 (**0**)                                              | Concave (> 0) dips the tops between towers; convex crests them. |
| `wallTowers` | 0–8 (**4**)                                               | Towers round a city ring (towns get half).                      |
| `gate`       | **tower** / twin / jawbone                                | Gate tower, an arch between two towers, or a whale-jaw arch.    |

**Drawing**

| Knob    | Values (default)         | What it drives                                                                 |
| ------- | ------------------------ | ------------------------------------------------------------------------------ |
| `join`  | sharp / round / **soft** | Line joins: mitred, rounded, or rounded + softened corners (flags stay crisp). |
| `hatch` | 0.9–2.6 (**1.4**)        | Hatch spacing — smaller is a darker shade.                                     |

**Palette** — `wall`, `roof`, `wood`, `earth`, `water`, `flag`, `ink`,
`halo` (`#rrggbb`). Roofs take the marker colour on the map (the default
black marker keeps the culture's own); walls use their material colours
above, not `wall`.

**Random cultures.** `makeDesign(seed)` (the playground's Culture ⟳) rolls
every knob, then applies linked rules so a culture hangs together:
low-pitched builders leave towers roofless (crenellated); onion domes
bring swept roofs; steep roofs bring tall spires; towers and walls usually
bow alike; crenellated towers bring merlons on the walls. About a third of
capped cultures get crenellated tops and a quarter round steeples — those
two are rolled after every other draw, so older seeds keep their looks.

## Recipe overrides

Six recipe-only fields let a marker override the culture:

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
- Towers: `roundTower`, `squareTower`, `belfry` (a landmark tower, square
  or round per `steeple`), `clocktower`, `lighthouse`, `windmill`.
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
of `Part`s into one SVG path per colour role (`wall`, `wall-shade`, the
`wall-<material>` pattern roles, `wood`, `wood-shade`, …, `roof`,
`roof-shade`, `flag`, `ink`). Each path is a filled polygon — no
`<stroke>` on the server-rendered output.

Nearly all the time goes into Clipper unions, so they're balanced: each
part's strokes, and each layer's pieces, are unioned pairwise in a tree
(`unionAll`) rather than folded one at a time. On a 2.8 GHz Xeon a village
draws in ~0.1 s, a city in ~1.2 s and a freeport in 2–8 s (ornate cultures
are the slow end); the icon baker runs all 77 core icons in ~16 s.

The caller (the main app's `mapLayered.ts`, the `build-settlement-icons.mjs`
script, or `generateSettlementSvg()`) assigns colours per role, puts the
marker colour on the `roof` layer, and inlines the SVG.

## How to add a piece

1. Draw it in `pieces3d.js` as a `Part[]`: `solid` polygons for the body,
   `fills` for cut-out ink shapes (doors, windows, slits), `lines` for
   detail strokes (stone courses, meridian ribs), `shadeLines` for
   hatching kept to the shaded part, `shadeArea` (or `shaded: true`) for
   the darker right flank. Build receding faces with `boxProjector` and
   put openings on them through `P.face()`.
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
   the baked SVG set under `apps/web/static/map/settlement/`, and
   `npm run build:settlement-playground -w apps/web` for the playground.
   Commit the regenerated files in the same branch as the kit change.

## Settlement playground

`tools/settlement-playground.html` (generated by
`npm run build:settlement-playground -w apps/web`) is a standalone
single-file tool: every Design knob + drawing option + colour role gets
a live control, every piece and every tier re-renders in-page on each
change. Each icon exports as SVG or PNG, and the current knobs + colours
export as a `cultures/*.json` plugin ready to drop into an extension.

It runs the same kit code as the app, bundled at build time, so rebuild it
after every kit change. Its Outline and Soft radius sliders are drawing
options the app doesn't expose; at their defaults (1.4, 0.9) it draws
exactly as the app does. The main app's Settlement builder offers only a
recipe's essentials (tier, culture, walls and wall shape, harbour, ruin,
seed) — the
Design knobs come from the culture, so the playground is where a culture
is designed.
