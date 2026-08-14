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
  "order": 99, // display + catalogue-merge order
  "dev": true, // optional — dev/test only, stripped from production (see below)
  "suppressesOracles": ["location"], // optional — oracle keys this extension
  // hides while enabled (supersession; see below)
}
```

### Content files

| Folder                 | File(s)                                 | Becomes                   | Schema                                                            |
| ---------------------- | --------------------------------------- | ------------------------- | ----------------------------------------------------------------- |
| `moves/`               | `*.json` (`{category, moves:[…]}`)      | `/catalogue/moves`        | [data-schema.md § Moves](data-schema.md#moves)                    |
| `oracles/`             | `*.json` (one table each)               | `/catalogue/oracles`      | [data-schema.md § Oracles](data-schema.md#oracles)                |
| `foes/foes.json`       | `{foes:[…]}`                            | `/catalogue/foes`         | [data-schema.md § Foes](data-schema.md#foes)                      |
| `foes/overrides.json`  | `{source, overrides:{…}}`               | patches base foes         | [data-schema.md § Foe overrides](data-schema.md#foe-overrides)    |
| `moves/overrides.json` | `{source, overrides:{…}}`               | hides/replaces base moves | mirror of foe overrides (`{ "<move id>": { "present": false } }`) |
| `assets/assets.json`   | `{assets:[…], rarities?:[…]}`           | `/catalogue/assets`       | [data-schema.md § Assets](data-schema.md#assets)                  |
| `roll-tables/*.json`   | `{id, name, kind, source, entries:[…]}` | `/catalogue/roll-tables`  | "resolver oracle" — see below                                     |

### Roll-tables (resolver oracles)

A `roll-tables/*.json` file is a d100 table whose ranges resolve to a **catalogue
entity** rather than text — a foe (`kind: "foe"`) or an asset (`kind: "asset"`).
Rolling opens that entity's existing detail + add-to-character UI.

```jsonc
{
  "id": "lodestarEncounterIndex", // stable camelCase key
  "name": "Encounter Index",
  "kind": "foe", // "foe" | "asset"
  "source": "lodestar",
  "entries": [
    { "low": 1, "high": 40, "ref": "ironsworn/bear" }, // ref = foe/asset id
    { "low": 41, "high": 100, "ref": "ironsworn/wolf" },
  ],
}
```

`ref` is a catalogue **id** (stable, unlike names). Asset entries may add
`"category"` (Path / Combat Talent / Companion / Ritual) and `"text"` (a prelude
narrative). Ranges must cover 1–100 with no gaps or overlaps, and every `ref`
must resolve — both are enforced by `extensionsManifest.test.ts`. (UI surfaces
for these land in later phases; see `docs/lodestar-roll-tables.md`.)

Every content item carries a `"source"` tag equal to the extension id (the
build stamps it if absent). The web filters by that tag through the extension
toggle — an item whose source is disabled is hidden from pickers, but existing
saved records that reference it still render (`find*` lookups are never
filtered).

### Oracle supersession (`suppressesOracles`)

An extension can **hide** oracles owned by other (lower-order) extensions while
it is enabled, so a richer table can stand in for a base one without two
near-identical entries cluttering the picker. List the target oracle **keys**
in `suppressesOracles` on `extension.json`:

```jsonc
// extensions/lodestar/extension.json
"suppressesOracles": ["location", "coastalWatersLocation", "featureAspect", "featureFocus"]
// extensions/yrt/extension.json
"suppressesOracles": ["region", "settlementCondition"]
```

The manifest carries the (sorted) list through to the web, where
`expansionStore.suppressedOracleKeys()` unions the keys from every **enabled**
extension. `getVisibleOracles()` filters those out, so the pattern is: ship a
same-shaped replacement (e.g. Lodestar's Overland Landmark superseding base
`location`, YRT's 50-row Settlement: Condition superseding Lodestar's) and add
the superseded key here. Suppression only removes the oracle from the **picker**
— a saved roll or a direct `rollOracle(key)` call still resolves it.

> **Note — creation-flow suppression is separate.** A few _dialogs_ skip rolling
> certain oracles based on which expansion is on (e.g. the New Settlement dialog
> drops Location + Location Descriptor when Lodestar is enabled, via
> `isSourceEnabled('lodestar')` in `CommunitiesArea.svelte`). That is per-dialog
> UI logic, **not** the manifest `suppressesOracles` field — the oracles stay
> visible in the Ask picker; they're just not auto-rolled on create.

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
ids (`ironsworn/bear`), and move/oracle HTML links to ids across the catalogue.
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
