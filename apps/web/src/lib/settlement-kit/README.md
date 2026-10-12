# Settlement kit

Procedural, layered-SVG map icons for settlements. The kit renders every
settlement in a single visual language — timber frames, stone walls, dome
caps, lagoons, stilt pilings — tuned so the generated icons sit next to
hand-drawn map markers without clashing.

A handful of self-contained files do the work; a renderer collapses them
into one layered SVG per piece or per settlement.

| File           | Responsibility                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `geom.js`      | Primitive shapes (`rect`, `arc`, `circle`, `archOpening`, `lancet`, `crenellated`) and the PRNG.                                                 |
| `pieces3d.js`  | Every drawable piece (house, tower, keep, well, …) and the `Design` typedef with the culture knobs.                                              |
| `layouts3d.js` | Templates (stead → freeport) that lay pieces out into a settlement, including the ring wall; `building()` draws one piece for the Buildings tab. |
| `ruins3d.js`   | Decay / overgrowth / scorch transformation applied over any `Placed[]` list.                                                                     |
| `render.js`    | Clipper-based renderer that collapses the final back-to-front list into one path per colour role.                                                |
| `patterns.js`  | Material-wall `<pattern>` tiles in fixed colours (stone, bramble hedge, brain coral, planks, dirt, bone).                                        |
| `generate.js`  | `recipeDesign()` + `generateSettlementSvg()` — the only entry points app code should call.                                                       |
| `fallback.js`  | Marker-chip fallback (plain core icon) for recipes a client can't yet render.                                                                    |

## Oblique projection

Pieces are drawn in a 3/4 oblique projection, hand-tuned to read as 3D at
marker size (32–48 px) without any shading beyond flat-tinted faces.

- **Up is `+y`** in piece-local coordinates; the renderer flips to SVG's
  y-down at output.
- **Depth runs up-and-right** along `depthVec(d)` = `(0.75 d, 0.5 d)`.
- **Light comes from the upper left**, so every right-facing face (side
  walls, right roof slopes, right flanks of cylinders and cones) is
  shaded: a darker role colour plus hatching — diagonal (55°) on
  cylinders and the ring wall's front flank, horizontal on cones and domes, thinner diagonal strokes on
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

**Gate towers** stand astride their wall: `gateSeat()` places the tower so
the wall's line crosses the middle of its receding right face, and the
wall is cut there, its stretch to the right drawn after the tower — so the
wall runs into the tower's side, not out from behind it.

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

**Ring walls** curve away from the viewer, so a flat tile can't follow
them: every ring material draws its texture as lines round the ring
instead, over plain body tiles (the `-ring` roles), so it bunches toward
the sides as the wall foreshortens — as `roundCourses()` does on round
towers. Stone draws courses (front-half ellipses) with staggered joints,
left out where they'd crowd closer than ~1.3 units; a palisade, a seam at
each stake notch. The others reuse their tiles' own art (`ringTextures.js`):
each tile's line-work is laid end to end round the ring by arc length, row
on row up the wall — the hedge's bramble canes (its leaves stay in the
body tile: irregular foliage needn't bend), the coral's grooves (two walls
from thickening the maze's centrelines and outlining the union, plus the
pale vein), bone's grain strokes and pores (at 1.5×), and earth's grit and
pebbles as round dots, from a wider 12-unit speckle field of its own so no
small tile repeats in rows. Those lines carry a `role`, so the renderer
paints them in the material's own colour (`wall-hedge-cane`,
`wall-reef-groove`, `wall-reef-vein`, `wall-earth-grit`,
`wall-earth-pebble`, `wall-bone-grain`) instead of ink. Stone courses,
palisade seams and bone seams — like masonry courses and barn planks on
buildings — stay ink but paint in a layer of their own, `ink-texture`.
Flat walls (square enclosures, a standalone wall) keep the full tiles.

All of that line-work is texture (`TEXTURE_ROLES` in `patterns.js`): a
culture with `texture` off draws none of it, its walls in flat material
colours (`renderLayered(…, {texture: false})`), and a map icon drawn
smaller than `PATTERN_MIN_PX` leaves it out too.

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
  instead, since a sub-pixel texture only muddies the wall, and the
  line-work texture layers (`TEXTURE_ROLES`) are left out. An icon whose
  culture has `texture` off carries `data-texture="off"` on its root and
  draws its walls flat at any size.
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

## Ground

A recipe's `ground` (the `ground` option to `settlement()` and
`building()`) is what a settlement or building stands on — the recipe's
alone, not a culture setting. `'none'` (the default) draws nothing; every
other type is a plane under the
whole of it — `groundPlane(kind, rx, ry)` in `pieces3d.js`, an ellipse of
`terrain` (never ruined) laid first, under everything:

| Type       | Role              | Look                                                                                                  |
| ---------- | ----------------- | ----------------------------------------------------------------------------------------------------- |
| `dirt`     | `ground-dirt`     | Bare light-brown earth, speckled.                                                                     |
| `grass`    | `ground-grass`    | Green sward with tufts of blades.                                                                     |
| `farmland` | `ground-farmland` | A patchwork of fields — wheat, a green crop in rows, ploughed soil — furrowed across, with hedgerows. |
| `sand`     | `ground-sand`     | Pale desert, stippled, with wind ripples.                                                             |
| `rock`     | `ground-rock`     | Grey stone ground, cracked, with pebbles.                                                             |
| `snow`     | `ground-snow`     | Near-white, with soft blue-grey drifts.                                                               |
| `ice`      | `ground-ice`      | A pale blue sheet with hairline cracks and streaks of sheen.                                          |
| `marsh`    | `ground-marsh`    | Olive bog with pools and reeds.                                                                       |
| `lava`     | `ground-lava`     | Dark basalt crust split by glowing fissures, with a molten pool.                                      |
| `water`    | `water`           | The lagoon: the palette's water colour with ink waves.                                                |

The land types are pattern tiles in `patterns.js` with fixed colours of
their own (`GROUND_COLOURS`), like the wall materials — flat in
`FLAT_WALLS` on a small icon or with Texture off. The plane is sized as the
lagoon is: under a settlement or a walled building, `enclosureGround()`
fits it to the enclosure (a ring's ellipse, or one round the whole of a
square enclosure's parallelogram); under a lone building, an ellipse round
its footprint.

## Cultures: one culture = one Design + palette

A culture plugin (`cultures/<key>.json` in an extension, or
`apps/api/data/cultures/` for the base game) is
`{key, name, note, design, palette}`. `design` is any subset of the
`Design` knobs below, laid over `DEFAULT_DESIGN`; `palette` gives the eight
colour roles. A culture is therefore up to **44 knobs** — 23 numbers, 14
choices and 7 on/off switches — **plus 8 colours**. The shipped cultures
set 15–26 knobs each (the Sample culture 36; Ironlanders is the default,
with none).

`recipeDesign()` runs every culture through `upgradeDesign()`, which
migrates retired spellings — today the legacy `towerRoof: "crenel"`
becomes `towerRoof: "none"` + `towerCrenel: true`. Defaults and ranges
below are `DEFAULT_DESIGN` and the playground's sliders.

**Build**

| Knob        | Values (default)                   | What it drives                                                                                                                                                                                                                                                                  |
| ----------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `houseForm` | **timber** / round / mound / stilt | Framed houses, round huts, turf mounds or huts on stilts.                                                                                                                                                                                                                       |
| `stature`   | 0.6–1.5 (**1**)                    | Building height (small folk < 1 < giants).                                                                                                                                                                                                                                      |
| `scale`     | 0.7–1.8 (**1**)                    | Building size; bigger means fewer per layout.                                                                                                                                                                                                                                   |
| `flourish`  | 0–1 (**0**)                        | Ornament: finials, eave knobs, ridge cresting, more flags.                                                                                                                                                                                                                      |
| `masonry`   | on / **off**                       | Stone-built: stone courses on house and tower walls, stone barns (not plank), no timber framing on a townhouse's ground floor.                                                                                                                                                  |
| `texture`   | **on** / off                       | Draw textures: wall patterns, the line-work round ring walls, masonry courses, barn planks. Off draws every wall in its flat material colour — what a small map icon draws anyway.                                                                                              |
| `variety`   | 0–1 (**0**)                        | A mixed culture (a freeport): the chance each house, free-standing tower and landmark rolls its own house type (gable-front, side-on, townhouse, longhouse, round hut or domed), storeys, tower cap, crenellated top, corbel, steeple, roof pitch and sweep, windows and doors. |

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

| Knob         | Values (default)           | What it drives                                                  |
| ------------ | -------------------------- | --------------------------------------------------------------- |
| `wallShape`  | **round** / square         | Ring or square enclosure.                                       |
| `wallH`      | 0.6–1.6 (**1**)            | Wall height factor.                                             |
| `merlons`    | **on** / off               | Crenellated parapet on stone walls.                             |
| `wallBow`    | −1–1 (**0**)               | Concave (> 0) dips the tops between towers; convex crests them. |
| `wallTowers` | 0–8 (**4**)                | Towers round a city ring (towns get half).                      |
| `gate`       | **tower** / twin / jawbone | Gate tower, an arch between two towers, or a whale-jaw arch.    |

**Drawing**

| Knob    | Values (default)         | What it drives                                                                 |
| ------- | ------------------------ | ------------------------------------------------------------------------------ |
| `join`  | sharp / round / **soft** | Line joins: mitred, rounded, or rounded + softened corners (flags stay crisp). |
| `hatch` | 0.9–2.6 (**1.4**)        | Hatch spacing — smaller is a darker shade.                                     |

**Palette** — `wall`, `roof`, `wood`, `earth`, `water`, `flag`, `ink`,
`halo` (`#rrggbb`). Roofs take the marker colour on the map (the default
black marker keeps the culture's own); walls use their material colours
above, not `wall`. Outlines are tinted, not ink: each part's outline is
its own colour mixed toward `ink` (`LINE_MIX` = 0.45 of the colour,
`lineColour()` in `patterns.js` — a roof's follows the marker colour, a
patterned wall's comes from its flat material colour). The line-work
inside — windows, doors, hatching, spars — stays `ink`.

**Random cultures.** `makeDesign(seed)` (the playground's Culture ⟳) rolls
every knob, then applies linked rules so a culture hangs together:
low-pitched builders leave towers roofless (crenellated); onion domes
bring swept roofs; steep roofs bring tall spires; towers and walls usually
bow alike; crenellated towers bring merlons on the walls. About a third of
capped cultures get crenellated tops, a quarter round steeples and one in
ten some `variety` — those are rolled after every other draw, so older
seeds keep their looks.

## Recipe overrides

Seven recipe-only fields let a marker override the culture:

| Recipe field | Effect                                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `walls`      | The ring-wall material (`'none'`, `'stone'`, `'palisade'`, …), or `'auto'`: usual for its size (`TEMPLATES` — an outpost's palisade, stone from a hold up). Never the culture's. |
| `wallShape`  | Force `'round'` or `'square'` regardless of what the culture rolls.                                                                                                              |
| `ground`     | What it stands on (`'none'`, a ground type, or `'water'`) — passed to `settlement()` / `building()`, never the culture's.                                                        |
| `stilts`     | Wrap every inside-the-walls piece with `onStilts(...)` so the whole settlement sits on pilings — or, for a `building`, the building (bar its terrain; never the Wall).           |
| `harbor`     | `true` adds a side harbour with pier + caravel.                                                                                                                                  |
| `ruin`       | `{ decay, burned? }` runs `ruinPlaced()` over the final list.                                                                                                                    |
| `building`   | A `BUILDINGS` key: `building()` draws that one piece instead of the settlement (the Buildings tab).                                                                              |

See CLAUDE.md ("Standing order — settlement-recipe override fields live
in five places") for the plumbing contract when adding a new one.

**Buildings.** `building(key, D, {walls, seed, ground, stilts, ruin})` draws one of the
`BUILDINGS` (the keyed entries of the `PIECES` table) on its own. `walls`
puts a small ring or square wall of its own round it, fitted to its
footprint the way a settlement's is (`enclosed()`), with up to two towers
where the wall type carries them — never round the `UNWALLED_BUILDINGS`:
the Wall, in its own stone. `stilts` sets it on a deck (`onStilts()`), its
terrain left on the ground — the Wall, again, never.
On water a lagoon goes under it. `seed` varies it as a settlement varies its
buildings — `jitterDesign()` (pitch, sweep,
ornament, now and then the windows or doors), a round tower's girth and
height, a house's details — and lets a mixed culture's builder roll its
own style (`mixDesign()`); the reference row (`pieces()`) passes no seed,
so it and the baked icons stay fixed. `ruin` ruins it at exactly the
slider's decay (`RuinOptions.single`; in a settlement each building takes
its own, up to 0.25 either side, so they don't come down in step). Every
building comes down by degrees (`ruinPiece()` in `ruins3d.js`), so the
Decay slider reads as a progression:

| Decay   | What's left                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| any     | No flags, banners, smoke (`smoke`) or lamp rays; a mill's sails (`aloft`) come off one by one by 0.3.                                             |
| 0.1–0.4 | Every roof (the `role: 'roof'` parts overlapping across, and what rides on it — a chimney through it, a cross) opens from a gap to a ragged hole. |
| 0.4     | Roofless, the walls at full height.                                                                                                               |
| 0.4–1   | The walls break off along a stepped line, at each point a share of the height there, down to foundations at 1.                                    |

Enclosure walls keep their height and are breached — none at the light end,
up to four, wider, as the decay rises. Roof-coloured paint on a wall (a
lighthouse's bands — a roof part inside a wall's box) stands with the wall. Burned, the roofs go sooner, the walls
are sooted and charred beams fall; rubble, ivy and bushes grow with the
decay, sized to the building. It's scaled by its intact size
(`normalScale()` before the ruin), and `generateSettlementSvg()` frames
any ruin — a building's or a settlement's — as it was whole (`placedBox()`
→ `toLayeredSvg()`'s `frame`), so what's left stands where it stood
instead of swelling to fill the marker. The baked ruin icons take decay
0.6 (a single building's set per icon, `single`).

## Pieces catalogue (abridged)

Exported from `pieces3d.js`; `layouts3d.js` → `pieces(D)` returns the full
list with human-readable names (the `PIECES` table; `BUILDINGS` is the
part the Buildings tab offers). Partial map, as a quick index:

- Dwellings: `gableHouse`, `sideHouse` (handles house / warehouse /
  workshop / church / longhouse / barn / tavern / barracks / mill via
  `kind`), `townhouse`, `roundHut`, `moundHut`, `stiltHut`.
- Towers: `roundTower`, `squareTower`, `belfry` (a landmark tower, square
  or round per `steeple`), `clocktower`, `lighthouse`, `windmill`.
- Religious + civic: `church`, `cathedral`, `keep`, `market`, `well`,
  `witchHut`, `mine`.
- Walls + gates: `ringWall`, `squareWall`, `wallSegment`, `jawGate`.
- Terrain: `groundPlane` (a ground type's plane, or the lagoon), `lagoon`.
- Encampment: `tent`, `pavilion`, `camp`.
- Harbour (a settlement's): `caravel`, `pier`.
- Wrappers: `onStilts(parts, D)` lifts any piece onto a timber-post
  deck sized to its own extent (used by `recipe.stilts`); `stiltHut` is
  a thin wrapper over `onStilts(roundHut(...))`.

## Rendering

`render.js` → `renderLayered(parts, opts)` collapses a back-to-front list
of `Part`s into one SVG path per colour role (`wall`, `wall-shade`, the
`wall-<material>` pattern roles, `wood`, `wood-shade`, …, `roof`,
`roof-shade`, `flag`), one outline layer per face role (`LINE_ROLES`:
`wall-line`, `roof-line`, `wall-stone-line`, …), then `ink-texture` and
`ink` on top. Each path is a filled polygon — no `<stroke>` on the
server-rendered output.

Nearly all the time goes into Clipper unions, so they're balanced: each
part's strokes, and each layer's pieces, are unioned pairwise in a tree
(`unionAll`) rather than folded one at a time. On a 2.8 GHz Xeon a village
draws in ~0.1 s, a city in ~1.2 s and a freeport in 2–8 s (ornate cultures
are the slow end); the icon baker runs all 71 core icons in ~25 s.

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
2. Export the function and add a `[key, name, make]` entry to `PIECES` in
   `layouts3d.js` so the playground can show it in the pieces row. To
   offer it on the map's Buildings tab too, give it a key (else `null`),
   add the same key and name to `SETTLEMENT_BUILDINGS` in
   `src/lib/settlementRecipe.ts` and its nearest baked icon to
   `BUILDING_ICONS` in `fallback.js` (tests hold all three in step); a
   wall piece (or anything else that never gets walls) also goes in both
   `UNWALLED_BUILDINGS` sets.
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
exactly as the app does. Its Building walls option draws the pieces as
the app's Buildings tab does (`building()` in `layouts3d.js`: one piece,
optionally in a ring or square wall of its own — the wall pieces never
are). The main app's Settlement builder and Buildings tab offer
only a recipe's essentials (tier or building, culture, walls and wall
shape, harbour, ruin, seed) — the
Design knobs come from the culture, so the playground is where a culture
is designed.
