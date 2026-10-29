# Liveries — drop-in theme packs

A **livery** pairs a display (heading) font with an optional chrome palette. It
is the "skin" the user picks in **Settings → Appearance → Livery**. The
built-in looks — all named after mythic or literary figures whose visual
world matches the theme — **Beowulf** (Skranji over the base forge-amber
chrome, default), **Merlin** (Simonetta/sea-green), **Yorick**
(Cinzel/lichen-on-granite), **Deckard** (Orbitron/void-navy and cyan),
**Vlad** (Nosifer/oxblood), **Jack** (Berkshire Swash/pumpkin), and
**Elspeth** (Griffy/aubergine and poison green) — are all defined as data.
Each also ships a brand mark, and all but Beowulf ship a full set of area
and entity icons. Adding a new one is a drop-in: create a folder, run one
command.

Liveries are orthogonal to the light/dark **theme** (`data-theme`) and to
gameplay colours (stats, resources, danger/success). A livery only restyles the
_chrome_ — page/card/control backgrounds, borders, body text, and the accent —
and the heading font. Every livery works in both light and dark theme.

## Anatomy

```
liveries/
  beowulf/                ← Beowulf (default) — brand.svg, no icons/ (the app's own)
  deckard/                ← Deckard, the sample — copy this as your template
    livery.json
    brand.svg             ← optional nav mark + favicon (below)
    icons/<name>.svg      ← optional area / log / entity icons (below)
    preview.html          ← generated swatch page (below)
  elspeth/  jack/  merlin/  vlad/  yorick/   ← same shape as deckard/
```

One folder per livery; the folder name is the livery **id** and must match the
`id` field. That id becomes the `data-font='<id>'` attribute the CSS keys on.

## The `livery.json` schema

```jsonc
{
  "id": "deckard", // must equal the folder name; a safe CSS ident [a-z][a-z0-9-]*
  "label": "Deckard", // shown in the Settings dropdown
  "default": false, // exactly one livery across the whole set is true
  "description": "…", // one sentence; shown in docs / tooling
  "preview": null, // optional sample string shown in the dropdown, e.g. an emoji

  "font": {
    "stack": "'Orbitron', Eurostile, system-ui, sans-serif", // full CSS font-family
    "googleFamily": "Orbitron:wght@400;500;700;900", // "Family:axis@vals" if a web font is needed (see below), else null
    "weight": 500, // --font-display-weight
    "variant": "normal", // --font-display-variant
    "transform": "uppercase", // --font-display-transform: none|uppercase|lowercase|capitalize
    "scale": 0.96, // --font-display-scale (heading size multiplier)
  },

  "dice": {
    // optional; null/omitted → factory blue/red d6+d10, black/white d100, no texture
    "action": "#1f9ed6", // d6 (action die) background
    "challenge": "#7b2ff7", // d10 (challenge dice) background
    "tens": "#0e1420", // d100 tens die background
    "ones": "#9fd8f5", // d100 ones die background
    "texture": "astral", // shared texture — one of the dice-box keys (see below)
  },

  "palette": null, // null → inherit the base forge-amber chrome, OR { dark, light } below
}
```

### The palette

`palette` is either `null` (inherit the base theme's chrome — what **Beowulf**
does) or an object with a `dark` and a `light` half. Each half must define
**exactly** these 14 tokens (any hex colour, `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa`):

| Group    | Tokens                                                 |
| -------- | ------------------------------------------------------ |
| Surfaces | `bg-page` `bg-card` `bg-inset` `bg-control` `bg-hover` |
| Lines    | `border` `border-mid`                                  |
| Text     | `text` `text-muted` `text-dimmer`                      |
| Accent   | `text-accent` `focus-ring` `accent-glow` `accent-dim`  |

Keep `accent-glow`/`accent-dim` as your accent colour with a low-alpha suffix
(e.g. accent `#cf8a44` → `#cf8a4420` / `#cf8a4412`), matching the base theme.

The token keys are the same custom properties the base theme sets in
`apps/web/src/app.css`; a livery palette just overrides them under a
higher-specificity `html[data-font='<id>'][data-theme]` selector, so **only the
chrome changes** — stats, resources, and semantic colours pass through
untouched.

### Dice

`dice` (optional) skins the 3D dice to match the livery: the four die
backgrounds — `action` (d6), `challenge` (d10), and the d100 `tens` + `ones` —
plus one shared `texture`. Numeral colour is chosen automatically per die by
luminance, so light backgrounds stay legible; you only pick the backgrounds.

`texture` is one of the dice-box library's keys: `none`, `cloudy`, `marble`,
`fire`, `ice`, `water`, `paper`, `speckles`, `glitter`, `stars`, `stainedglass`,
`wood`, `metal`, `skulls`, `astral`, `dragon`, `lizard`, `leopard`, `tiger`,
`cheetah` (kept in sync with `DICE_TEXTURE_OPTIONS` in `apps/web/src/lib/dice.ts`).

Dice appearance resolves **user override → active livery → factory default**:
each die follows the selected livery until the user picks their own colour or
texture in **Settings → Dice**, at which point that explicit choice sticks
across livery switches. A livery with no `dice` block falls straight through to
the factory blue/red d6+d10 and black/white d100. Omitting `dice` is fine.

### Brand icon (optional) — `brand.svg`

A livery may ship a single `brand.svg` next to its `livery.json`. When present,
the nav-bar mark (the axe next to "Iron Ledger") **and** the browser tab
favicon both switch to it while this livery is active. Absent → the default
sharp-axe stays for both.

```
liveries/<id>/brand.svg
```

The SVG follows the same normalisation as `$lib/icons/` art (see the
"Icon SVGs" section in `CLAUDE.md`):

- Root is `<svg xmlns viewBox>` — no width/height, no `style`, no
  `enable-background`, no `xml:space`.
- Every `<path fill>` uses `fill="currentColor"` (or no `fill` attr so CSS
  wins) — never a hard-coded colour. The nav mark picks up `text-accent`
  from the palette; the favicon picks up whatever colour the currentColor
  cascade resolves to (usually `text-accent` too since the browser reads
  the SVG's own root).
- No full-canvas background rect, no wrapping `<g>`, no embedded
  `<style>` block.

The build inlines each livery's `brand.svg` verbatim into
`liveries.manifest.json` as `brandSvg: string`, so there is no runtime
fetch. Switching liveries flips the nav mark reactively; the favicon is
swapped by rebuilding the `<link rel="icon" type="image/svg+xml">` with a
data URL. `apple-touch-icon.png` is untouched — the home-screen icon is
captured when a user adds the site and can't be swapped at runtime.

### Area, log and entity icons (optional) — `icons/<name>.svg`

A livery may also replace any of the app's area, log and entity-kind icons with
its own, one SVG each in an `icons/` folder next to its `livery.json`:

```
liveries/<id>/icons/<name>.svg
```

| `<name>`      | Replaces                                                                     |
| ------------- | ---------------------------------------------------------------------------- |
| `characters`  | the Characters area's icon (header, empty state, home tab, export, About)    |
| `expeditions` | the Expeditions area's icon                                                  |
| `foes`        | the Foes area's icon                                                         |
| `connections` | the Connections area's icon                                                  |
| `log`         | the session Log's icon (panel header, empty log, export)                     |
| `journey`     | the Journey kind's icon, wherever a journey shows its kind (pickers, chips…) |
| `scene`       | the Scene kind's                                                             |
| `site`        | the Site kind's                                                              |
| `settlements` | the Settlement kind's                                                        |
| `npcs`        | the NPC kind's                                                               |
| `landmarks`   | the Landmark kind's                                                          |

Ship as many or as few as you like: any the livery doesn't ship stay the
app's own, and a livery with no `icons/` folder looks exactly as before.
The SVGs follow the same normalisation as `brand.svg` above (`currentColor`
fills, no width/height, no background rect); unlike `brand.svg`, their
viewBox is kept as drawn, as the app's own icons are, so draw them on the
same kind of canvas as the icon they replace. `npm run lint:liveries` fails
on a file in `icons/` that isn't one of the names above, or isn't an SVG.

The build inlines them into `liveries.manifest.json` as `icons: { <name>:
svg }`, and the livery's `preview.html` shows them in a row under the dice.
In the app, `appIcon(name)` (`apps/web/src/lib/liveryIcons.ts`) returns
the active livery's icon or the app's own, and the entity kinds'
`ENTITY_KIND_META[kind].icon` reads through it — both reactive, so a
livery switch swaps them in place. (The name list lives in both
`liveryIcons.ts` and `scripts/lint-liveries.mjs`; a unit test keeps them in
step.)

The foe dropdown's per-foe glyphs are **not** livery icons: they come from
each foe's nature (`foe-ironlander` barbute, `foe-firstborn` elf-helmet,
`foe-animal` stag-head, `foe-beast` dragon-head, `foe-horror` spectre,
`foe-anomaly` vortex, `foe-construct` rock-golem — `iconRegistry.ts`) and
stay the same under every livery. Avoid them for a livery's own slots, or
an NPC and an Ironlander foe end up wearing the same helmet.

#### The built-in sets

Every icon is from [game-icons.net](https://game-icons.net) unless noted;
each file's comment carries its exact credit.

| `<name>`      | Merlin         | Yorick                | Deckard           | Vlad                        | Jack            | Elspeth           |
| ------------- | -------------- | --------------------- | ----------------- | --------------------------- | --------------- | ----------------- |
| `characters`  | wizard-face    | plague-doctor-profile | astronaut-helmet  | stake-hammer                | scarecrow       | witch-face        |
| `expeditions` | wizard-staff   | old-lantern           | lunar-module      | cloaked-figure-on-horseback | old-wagon       | magic-broom       |
| `foes`        | wyvern         | ghost                 | alien-skull       | werewolf                    | goblin-head     | imp               |
| `connections` | Roundtable ¹   | graveyard             | radar-dish        | family-tree                 | triple-corn     | triquetra         |
| `log`         | scroll-quill   | black-book            | processor         | wax-seal                    | wood-pile       | spell-book        |
| `journey`     | horse-head     | raven                 | orbit             | night-sky                   | direction-signs | forest-entrance   |
| `scene`       | orbital-rays   | sundial               | digital-trace     | lit-candelabra              | moon            | spider-web        |
| `site`        | Stonehenge ²   | crypt-entrance        | defense-satellite | castle-ruins                | maze            | cave-entrance     |
| `settlements` | castle         | medieval-village-01   | habitat-dome      | village                     | granary         | spooky-house      |
| `npcs`        | jester-hat     | barbute               | android-mask      | torch                       | pilgrim-hat     | frog              |
| `landmarks`   | sword-in-stone | gothic-cross          | ringed-planet     | gargoyle                    | holy-oak        | mushrooms-cluster |

¹ Original art by Carl Orthlieb (CC BY 4.0). ² The Noun Project, Delwar Hossain
(CC BY 3.0). Yorick's `npcs` barbute is the same glyph as the Ironlander foe
icon (see above).

#### Sourcing and crediting icons

Every icon carries its credit as a comment straight after the opening
`<svg …>` tag, so provenance survives the build (the manifest inlines the
file verbatim):

| Source                  | Comment                                                      |
| ----------------------- | ------------------------------------------------------------ |
| game-icons.net          | `<!--game-icons.net "<name>" by <Author> — CC BY 3.0-->`     |
| The Noun Project (free) | `<!--The Noun Project "<name>" by <Creator> — CC BY 3.0-->`  |
| Your own art            | `<!--"<name>" by <Your Name> — <licence, e.g. CC BY 4.0>-->` |

- **game-icons.net.** An icon's page is `game-icons.net/1x1/<author>/<name>.html`;
  the original SVG is the same path in the project's GitHub repo,
  `raw.githubusercontent.com/game-icons/icons/master/<author>/<name>.svg`.
  Spell `<Author>` the way game-icons' own `license.txt` credits them
  (`Lorc`, `Delapouite`, `Skoll`, `SpencerDub`, `Caro Asercion`,
  `DarkZaitzev`, …). The download is a white glyph on a full-canvas black
  `<path d="M0 0h512v512H0z"/>`: drop that background path and set the glyph
  to `fill="currentColor"`. The same name can exist under two authors
  (`castle`, `stopwatch`, `tombstone`, `fist`…), so credit the one you used.
- **The Noun Project.** A free download must be credited "_name_ by
  _creator_ from Noun Project" (CC BY 3.0); a NounPro licence waives that,
  but keep the comment anyway. Its SVGs reserve room under the glyph for that
  credit line — a `viewBox="0 0 100 125"` or `"-5.0 -10.0 110.0 135.0"` frame
  — so tighten the viewBox to a square around the glyph, as Merlin's
  `site.svg` does.
- **Pick against the brand mark and the defaults.** Don't repeat the
  livery's own `brand.svg` in a slot (Vlad has no bats — its brand is one;
  Yorick's characters aren't skulls), and don't pick the app's default icon
  for a slot (`log` is already an axe in a log), or the swap is invisible.

## How the build wires it up

Two committed, generator-owned artifacts are produced from the JSON:

```
npm run gen:liveries        # scripts/gen-liveries-manifest.mjs
```

- **`apps/web/src/lib/liveries.manifest.json`** — runtime metadata (id, label,
  default, description, preview, googleFamily, dice, previewColors, optional
  brandSvg and icons). Read by `fontStore.svelte.ts` (active-livery state +
  `activeLiveryDice()` + `activeLiveryBrand()` + `activeLiveryIcons()`),
  `SettingsDialog.svelte` (the dropdown), and `dice.ts` (per-livery dice
  colours/texture).
- **`liveries/<id>/preview.html`** — a standalone swatch page per livery
  (title, chrome, dice, and its icon row in dark and light), for eyeballing
  a livery without running the app.
- **`apps/web/src/lib/liveries.generated.css`** — the per-livery
  `[data-font='<id>']` typography block (including `--font-display`, so the
  render-blocking stylesheet owns the font stack — no FOUC, no JS to set it)
  plus the optional dark/light palette blocks. Imported by `+layout.svelte`.

Switching liveries at runtime is just flipping the `data-font` attribute
(`setFontDisplay()` in `fontStore`); the generated CSS supplies everything the
attribute maps to. The pre-paint inline script in `app.html` sets `data-font`
from `localStorage` before first paint, and `+layout` re-applies the validated
id on mount (so a corrupted saved id falls back to the default cleanly).

Both artifacts are **Prettier-ignored** — the generator owns their exact bytes.
They regenerate automatically on `npm run build`/`check` for `apps/web`
(via its `prebuild`/`precheck`), and CI guards them:

```
npm run lint:liveries       # validate every livery.json (shape, palette, single default)
npm run gen:liveries:check   # fail if the committed artifacts are stale
```

## Add a livery in four steps

1. **Copy the sample:** `cp -r liveries/deckard liveries/<your-id>`. That
   brings Deckard's `brand.svg` and `icons/` too: replace them with your own
   (credited — see "Sourcing and crediting icons"), or delete them to keep
   the default sharp-axe and the app's own icons.
2. **Edit `liveries/<your-id>/livery.json`** — set `id` to the folder name,
   pick a font `stack`, and either set `palette: null` or fill both `dark` and
   `light` halves.
3. **Regenerate:** `npm run gen:liveries` (or just build/check `apps/web`).
4. **Verify:** open `liveries/<your-id>/preview.html` for the swatches and
   icon row, then check it in Settings → Appearance → Livery. Toggle
   light/dark to check both palettes.

That's it — no edit to `fontStore`, `SettingsDialog`, `app.css`, or the
manifest by hand.

## Web fonts (only if you need one)

The built-in liveries load their web fonts (Skranji, Simonetta, Cinzel,
Orbitron, Nosifer, Berkshire Swash, Griffy) from the Google Fonts `<link>` in
`apps/web/src/app.html`. **Deckard** demonstrates the path — its Orbitron face
is declared via `googleFamily` and added to that `<link>`.

If your livery introduces a **new** web font, two things are needed:

1. Set `font.googleFamily` (e.g. `"Cormorant:wght@400;600"`) in the JSON — this
   documents the requirement and lets the generator warn if it's missing.
2. Add that family to the `family=…` list in the `app.html` Google Fonts
   `<link>`. `gen:liveries` prints a `⚠` warning naming any `googleFamily` it
   can't find there; the app still runs (titles fall back through the stack),
   but the intended font won't load until you add it.

Only the Google Fonts host is allowed by the app's CSP; a self-hosted font
would need a `@font-face` (add it to `app.css`) and no `googleFamily`.
