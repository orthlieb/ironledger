# Extensions

Iron Ledger's game content — moves, oracles, foes, assets — is organised into
**extensions**: self-contained content packs discovered at build time. Adding an
expansion is dropping a folder under `extensions/`; **no code changes are
needed**. Its content merges into the catalogue, a toggle appears in Settings →
Expansions, its icons register, and its foe portraits are served.

> Curated only. Extensions ship with the app (they're in the repo) — there is no
> runtime user upload. See [extensions-migration.md](extensions-migration.md) for
> the design history.

---

## Anatomy of an extension

Everything an extension owns lives in one folder. `extensions/sample/` is a
reference extension that exercises every surface:

```
extensions/sample/
  extension.json          # metadata → registry + Settings toggle
  moves/moves.json        # a move ("Sample Gambit")
  oracles/gizmo.json      # an oracle ("Sample – Gizmo")
  foes/
    foes.json             # a foe ("Test Golem")
    overrides.json        # patches a BASE foe (adds an addendum)
    images/test-golem.webp# the foe's portrait
  assets/assets.json      # an asset ("Sample Widget")
  icons/sample-widget.svg # an icon the asset references by slug
```

Enable **Sample** in Settings → Expansions to see all of it appear; disable it
and everything filters out — nothing else changes.

### `extension.json` — metadata

```jsonc
{
  "id": "sample", // must equal the folder name; also the source tag
  "name": "Sample", // label shown on the Settings toggle
  "description": "…", // shown in the registry
  "defaultEnabled": false, // on/off until the user toggles it
  "order": 99, // display + catalogue-merge order (also wins supersession ties)
  "dev": true, // optional — dev/test only, stripped from production (see below)

  // Optional — hide these oracle keys from the picker while enabled. Pure hides
  // (no keyed replacement). See "Oracle supersession" below.
  "suppressesOracles": ["location"],

  // Optional — base-key → replacement-key rewrites this extension applies while
  // enabled. Auto-hides the base key from the picker. See "Oracle supersession".
  "supersedesOracles": { "region": "sampleRegion" },

  // Optional — move / oracle categories introduced by this extension (picker
  // order + icon + tint). Merged client-side across enabled extensions. See
  // "Category records" below.
  "moveCategories": [
    { "key": "Widget", "icon": "sample-widget", "color": "#8a2be2", "order": 200 },
  ],
  "oracleCategories": [
    { "key": "Sample", "icon": "dice-d100-solid", "color": "var(--text-muted)" },
  ],
}
```

### Content files

| Folder                 | File(s)                            | Becomes                   | Schema                                                            |
| ---------------------- | ---------------------------------- | ------------------------- | ----------------------------------------------------------------- |
| `moves/`               | `*.json` (`{category, moves:[…]}`) | `/catalogue/moves`        | [data-schema.md § Moves](data-schema.md#moves)                    |
| `oracles/`             | `*.json` (one table each)          | `/catalogue/oracles`      | [data-schema.md § Oracles](data-schema.md#oracles)                |
| `foes/foes.json`       | `{foes:[…]}`                       | `/catalogue/foes`         | [data-schema.md § Foes](data-schema.md#foes)                      |
| `foes/overrides.json`  | `{source, overrides:{…}}`          | patches base foes         | [data-schema.md § Foe overrides](data-schema.md#foe-overrides)    |
| `moves/overrides.json` | `{source, overrides:{…}}`          | hides/replaces base moves | mirror of foe overrides (`{ "<move id>": { "present": false } }`) |
| `assets/assets.json`   | `{assets:[…], rarities?:[…]}`      | `/catalogue/assets`       | [data-schema.md § Assets](data-schema.md#assets)                  |

Every content item carries a `"source"` tag equal to the extension id (the
build stamps it if absent). The web filters by that tag through the extension
toggle — an item whose source is disabled is hidden from pickers, but existing
saved records that reference it still render (`find*` lookups are never
filtered).

### Authoring prose — markdown + link DSL

All authored game text — move outcomes/triggers/notes, asset preambles and
ability text, oracle values — is written in **markdown + an interactive-link
DSL**, not raw HTML:

- **Formatting** is mini-markdown: `**bold**`, `*italic*`, `-` / `*` bullets,
  `1.` ordered lists, blank-line paragraphs.
- **Cross-references** are markdown links with a known scheme —
  `[Pay the Price](move:pay-the-price)`, `[+1 momentum](resource:momentum?value=+1)`,
  `[Mana Backlash](oracle:manaBacklash)`. Query args parse leniently (`+` stays
  literal). The full scheme table is in
  [data-schema.md → Data-Driven Links](data-schema.md#data-driven-links).
- **Context spans** `[…]{.log-only}` / `[…]{.dialog-only}` show text in only the
  log or only the dialog.
- **Oracle substitution blanks** use the `roll:` scheme —
  `[Site Name](roll:siteName)`, `[roll again](roll:self?times=2)`. See
  [oracles.md → Template blanks](oracles.md#template-blanks--the-roll-dsl).

Raw HTML is not allowed in DSL content — the build-time lint
(`scripts/lint-dsl.mjs`) rejects it and validates every link's scheme, target,
and args. A single item that genuinely needs raw HTML can set `"html": true` to
opt out of `renderRich` (and the lint); avoid it unless a construct truly can't
be expressed in the DSL.

### Oracle supersession

Two related mechanisms — pick the one that matches what the extension does.

#### `suppressesOracles: string[]` — hide from the picker

For oracles the extension **replaces at a different layer** (e.g. Lodestar's
Core: Descriptor / Focus supersede Delve's `featureAspect` / `featureFocus`
through the character-concept resolver in `characterConcept.ts`, not through
a keyed rewrite). Just list the base keys to hide:

```jsonc
// extensions/lodestar/extension.json
"suppressesOracles": ["featureAspect", "featureFocus", "charDisposition"]
```

`expansionStore.suppressedOracleKeys()` unions these keys from every enabled
extension; `getVisibleOracles()` filters them out. Suppression only removes the
oracle from the **picker** — a saved roll or a direct `rollOracle(key)` call
still resolves it.

#### `supersedesOracles: Record<string, string>` — hide + rewrite

For oracles the extension **replaces with a same-shape table under a different
key**. The extension declares the base-key → replacement-key map; when the
extension is enabled, `resolveOracleKey(baseKey)` returns the replacement key,
and the base key is auto-hidden from the picker (union'd into
`suppressedOracleKeys()`).

```jsonc
// extensions/yrt/extension.json
"supersedesOracles": {
  "region":              "yrtRegion",
  "storyRegion":         "yrtStoryRegion",
  "settlementType":      "yrtSettlementType",
  "settlementCondition": "yrtSettlementCondition",
  "location":            "yrtCityTownLocation"
}
// extensions/lodestar/extension.json
"supersedesOracles": {
  "location":             "overlandLandmark",
  "coastalWatersLocation": "coastalWatersLandmark"
}
```

Client code that used to write `isSourceEnabled('yrt') ? 'yrtRegion' : 'region'`
now writes `resolveOracleKey('region')`.

**Priority when two enabled extensions supersede the same key**: the lower
manifest `order` wins. Example: both YRT (order 20) and Lodestar (order 30)
supersede `location`; with both on, YRT's `yrtCityTownLocation` wins.

### Category records — `moveCategories` / `oracleCategories`

Each extension owns the picker order + icon + tint colour for the move / oracle
categories it introduces. There's no app-side hardcoded MOVE_CAT_ICON /
CATEGORY_COLORS map; each entry is a `CategoryDef`:

```ts
interface CategoryDef {
  key: string; // exact string on move.category / oracle.category
  icon?: string; // slug in $lib/icons/ or extensions/<id>/icons/
  color?: string; // CSS colour token or literal
  order?: number; // move-picker sort slot; missing → sorts last
}
```

Extensions declare only the categories they **introduce** — an extension that
adds moves to an existing category (e.g. Lodestar adding Face Danger to base's
Adventure) doesn't redeclare it. Duplicate `key` across extensions: first-
declared wins.

```jsonc
// extensions/lodestar/extension.json
"moveCategories":   [{ "key": "Scene",    "icon": "hourglass-clock-solid-full", "color": "#7E57C2", "order": 25 }],
"oracleCategories": [{ "key": "Encounter", "icon": "dice-d100-solid",            "color": "#2A9D8F"             }]
```

`extensionCategories.svelte.ts` merges them across enabled extensions on
demand (reactive on the enabled-map), so pickers re-render the moment an
expansion is toggled. Moves consume `moveCategoryOrder()`; both pickers +
detail headers read `moveCategoryMeta(key)?.icon` / `oracleCategoryMeta(key)?.color`.

### Icons

Icons an extension bundles go in `extensions/<id>/icons/*.svg` and are
referenced from assets/foes by **slug** (the filename without `.svg`, e.g.
`sample-widget`). `iconRegistry` merges a second build-time glob over
`extensions/*/icons/`, so bundled icons resolve exactly like the app's own.
Missing slugs degrade gracefully (empty render + category fallback).

### Foe images

Foe portraits go in `extensions/<id>/foes/images/*.webp` and are referenced from
a foe's `images: ["name.webp"]`, served at `/foes/name.webp`. Because those are
static files (nginx/adapter serve them directly), the build **copies** every
extension foe image into `apps/web/static/foes/` and writes
`apps/web/static/foes/.gitignore` recording the copies. The copies are build
artifacts (gitignored); the source of truth is the extension folder.

---

## IDs — authored, never derived

Filenames drop the extension id (the folder namespaces them), but **ids and
oracle keys keep an extension prefix** and are authored by hand, never derived
from the folder:

- Foes: `sample/test-golem` — a namespace slot alongside base `ironsworn/bear`.
- Assets: `combat-talent/sample-widget` — base category kept, extension name in
  the leaf.
- Oracle keys: `sampleGizmo` — camelCase.

Two reasons ids are authored: (1) ids are **persisted in the DB** (a character's
asset references, saved encounters), so they must be stable; (2) an extension
legitimately **references other ids** — `overrides.json` is keyed by _base_ foe
ids (`ironsworn/bear`), and move/oracle DSL links reference ids across the catalogue.
A "prefix everything in this folder" rule would corrupt those references. The
prefix _is_ the cross-extension collision namespace — keep it, and match it to
the extension id.

---

## How it's wired

A build step turns the folders into a manifest the API loads:

```
extensions/<id>/            scripts/gen-extensions-manifest.mjs      apps/api/src/routes/catalogue.ts
   extension.json  ───────▶   scans folders, assigns content,   ───▶   reads the manifest, merges the
   moves/ oracles/            emits apps/api/data/                     listed files per type, serves
   foes/ assets/ icons/       extensions.manifest.json +               /catalogue/{moves,oracles,foes,
   foes/images/               copies foe images into static/           assets,delve,extensions}
```

- **Generator** (`scripts/gen-extensions-manifest.mjs`) runs on `predev` /
  `prebuild`. It scans each `extensions/<id>/`, records a repo-relative `root`
  and the content files it provides, copies foe images into the served static
  dir, and emits the deterministic `apps/api/data/extensions.manifest.json`.
  `node scripts/gen-extensions-manifest.mjs --check` fails if the manifest or
  the foe-image `.gitignore` is out of date (wire it into CI).
- **Loader** (`catalogue.ts`) reads the manifest and merges the listed files. It
  serves `GET /catalogue/extensions` (the metadata registry) alongside the
  content endpoints. Content resolves relative to each extension's `root`
  (`extensions/<id>` for self-contained extensions, `apps/api/data` for the
  legacy base/delve content that hasn't been relocated yet).
- **Registry** (`apps/web/src/lib/expansionStore.svelte.ts`) hydrates from
  `/catalogue/extensions` on load. `isSourceEnabled(id)` gates content; the
  Settings Expansions tab renders one toggle per registered extension; the
  per-browser choice persists to `localStorage['ironledger:expansion:<id>']`.

---

## Add an extension (checklist)

1. `mkdir extensions/<id>` and write `extension.json` (`id` == folder name).
2. Drop content into `moves/`, `oracles/`, `foes/`, `assets/` as needed. Prefix
   the ids with `<id>` (see above).
3. Bundle any `icons/*.svg` (reference by slug) and `foes/images/*.webp`
   (reference by filename).
4. `npm run gen:manifest` (or just `npm run dev` — `predev` runs it).
5. That's it. The toggle appears in Settings → Expansions; enable it to see the
   content. Verify with `npm run gen:manifest -- --check` in CI.

No TypeScript, route, store, or type edits — the whole surface is data.

---

## Dev-only extensions

An extension with `"dev": true` in its `extension.json` ships in **dev and
test** but is **stripped from production builds** — it never appears as a toggle
or contributes content in prod. The mechanism lives entirely in the generator:
the committed manifest is the full form (all extensions, so dev + CI `--check`
agree), and a `NODE_ENV=production` build regenerates the manifest with dev-only
extensions filtered out. Their bundled icons/foe images may still ship as
harmless unused artifacts. Use it for reference/fixture extensions (like
`sample`) you don't want in front of real users.

---

## Current extensions

| id       | Layout                                | Notes                                                                         |
| -------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| `base`   | legacy (`apps/api/data`)              | Core Ironsworn. Always on, not toggleable.                                    |
| `delve`  | legacy (`apps/api/data`)              | Ironsworn: Delve. Drives some bespoke UI, so it stays type-organised for now. |
| `yrt`    | self-contained (`extensions/yrt/`)    | Yrt homebrew — the first fully-relocated extension.                           |
| `sample` | self-contained (`extensions/sample/`) | **Dev-only** reference extension exercising every surface; not in production. |

`base` and `delve` still live under `apps/api/data/` (the loader reads them via
their `apps/api/data` root); relocating them is future work.
