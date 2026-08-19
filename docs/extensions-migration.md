# Extensions — Architecture & Migration Spec

Status: **shipped** · Scope: reorganised expansion content (starting with YRT)
into self-contained, curated **extensions** with a build-time manifest and a
dynamic Settings registry.

> **This is the original migration spec, kept as history.** The migration is
> done: each extension lives under `extensions/<id>/`, categories + icons +
> tint colours + supersession maps are all manifest-driven, and the app-side
> `isDelveEnabled` / `isYrtEnabled` / `SOURCE_ORDER` / `CATEGORY_ORDER` /
> `MOVE_CAT_ICON` / `CATEGORY_COLORS` hardcodings are gone. YRT-specific foe
> flags (`escalates`, `escalatesDefense`) moved from top-level `FoeDef`
> fields into the per-extension extras bag (`extras.yrt.*`), read through
> `foeExtras.ts`.
>
> For current API + schema, see `docs/extensions.md`, `docs/expansion-toggles.md`,
> `docs/data-schema.md`, and `docs/foes.md`. This spec's "will do" language is
> retained for the historical rationale — read it as past-tense.

---

## 1. Purpose

Today an expansion's content is **organised by type and sprinkled across the
tree**: to add "YRT" you touch a file in every `apps/api/data/<type>/` dir, a
pile of images in `apps/web/static/foes/`, icons in `apps/web/src/lib/icons/`,
hard-coded filename lists in the catalogue loader, a compile-time
`CatalogueSource` union, and hand-wired Settings toggles.

The goal: **one folder per extension** (`extensions/<id>/`) holding everything
that expansion owns — content, images, icons, and its own doc — discovered by a
**build-time manifest generator** and surfaced through a **dynamic registry** so
adding/removing an extension needs no code edits.

This spec covers the architecture and the concrete YRT migration. **Delve is
explicitly out of scope** (it drives bespoke UI with no clean insertion point);
YRT is clean and goes first.

---

## 2. Terminology

- **Extension** — a curated content pack in `extensions/<id>/` (e.g. `yrt`).
  Not user-uploadable; ships with the app.
- **Manifest** — a build-time-generated JSON listing every extension, its
  metadata, and the content files it provides. Feeds the catalogue loader and
  the Settings registry.
- **Source** — the per-item tag identifying which extension owns it. Currently
  the `CatalogueSource` union `'base' | 'delve' | 'yrt'`; becomes a `string`
  (extension id) plus a runtime registry.

---

## 3. Design decisions (settled)

| #   | Decision                                                                      | Rationale                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Curated only** — no runtime user upload                                     | No untrusted HTML/XSS surface, no sandboxing, no id-collision arbitration. Pure reorg + registry.                                                                                                                               |
| D2  | **Manifest generated at build time**, not discovered at runtime               | Deterministic, no per-request filesystem scan; the loader consumes a committed/generated manifest.                                                                                                                              |
| D3  | Directory is **`extensions/`**, per-item-type subfolders                      | `extensions/yrt/foes/`, `.../assets/`, etc. Self-contained; images/icons nest inside their type folder.                                                                                                                         |
| D4  | **Filenames drop the extension id**                                           | The folder namespaces files. `foes_yrt.json` → `foes/foes.json`.                                                                                                                                                                |
| D5  | **IDs stay authored in the files** (prefixes kept), never derived from folder | Ids are a _global_ namespace persisted in the DB and cross-referenced; and extension files legitimately reference **base** ids (see D6). Auto-prefixing would corrupt those. See §7.                                            |
| D6  | **Overrides are a first-class patch-base feature**                            | An extension can re-skin / remove / replace base content and therefore carries references to base ids. See §6.4.                                                                                                                |
| D7  | **Escalating defence/offence stays baked in**                                 | Documented in core docs; rides along on YRT foe data with no special extension handling.                                                                                                                                        |
| D8  | **`yrtTouched` compound-roll stays baked in**                                 | The one piece of YRT-specific _behaviour_ (a multi-table roll). Not extracted for now.                                                                                                                                          |
| D9  | **Docs split (option 2)**                                                     | Baked-in behaviour (escalating harm/defense) documented in core docs; genuine extension content documented inside the extension. See §12.                                                                                       |
| D10 | **Build-time lint (validate, never rewrite)**                                 | A first-class build check that catches common extension mistakes — missing extension-id prefix on _defined_ ids, unregistered icons, dangling references, bad overrides, schema errors. Exempts legitimate references. See §10. |

---

## 4. Target directory layout

```
extensions/
  yrt/
    extension.json                 # hand-authored metadata (see §5)
    README.md                      # the extension's own doc (see §12)
    moves/
      moves.json                   # was moves/yrt.json
    oracles/
      animal.json                  # was yrt-animal.json
      region.json                  # was yrt-region.json
      touched.json                 # was yrt-touched.json
      city-town-location.json      # was yrt-city-town-location.json
      touched-features.json        # unchanged name
      mana-backlash.json           # unchanged name
      freeport-denizen.json        # unchanged name
    foes/
      foes.json                    # was foes_yrt.json
      overrides.json               # was foes_overrides_yrt.json (patches base)
      images/
        mire-form.webp … (28)      # moved from apps/web/static/foes/
    assets/
      assets.json                  # was assets_yrt.json
    icons/                         # extension-root: shared by any content type
      asset-touched-salamandrine.svg … (12)   # moved from apps/web/src/lib/icons/
```

**Filenames** drop `yrt` (D4). **IDs inside** keep it (D5). **Icons sit at the
extension root**, not under `assets/`: they're referenced by slug from a shared
registry, so assets reference them today and foes/moves may tomorrow.

---

## 5. The manifest

Each extension carries a small **hand-authored** `extension.json` (metadata
only — no content lists):

```jsonc
// extensions/yrt/extension.json
{
  "id": "yrt",
  "name": "YRT",
  "description": "Yrt homebrew setting — mana, Touched, rituals, Yrt bestiary.",
  "defaultEnabled": false,
  "order": 20,
  "requires": { "app": ">=1.4.0" },
}
```

A **build step** (`scripts/gen-extensions-manifest.ts`, run as a prebuild) scans
`extensions/*/`, reads each `extension.json`, globs the content subfolders, and
emits a combined generated manifest consumed by the API:

```jsonc
// generated — apps/api/data/extensions.manifest.json  (build artifact)
{
  "extensions": [
    {
      "id": "yrt",
      "name": "YRT",
      "description": "…",
      "defaultEnabled": false,
      "order": 20,
      "provides": {
        "moves":        ["moves/moves.json"],
        "oracles":      ["oracles/animal.json", "oracles/region.json", …],
        "foes":         ["foes/foes.json"],
        "foeOverrides": ["foes/overrides.json"],
        "assets":       ["assets/assets.json"]
      },
      "root": "extensions/yrt"
    }
  ]
}
```

The generator, not `catalogue.ts`, owns the file list — replacing every
hard-coded filename array in the loader.

### 5.1 Dev-only extensions

An extension may set `"dev": true` in its `extension.json`. Such extensions ship
in **dev and test** but are **stripped from production builds**: they never
appear as a Settings toggle or contribute catalogue content in prod. This is how
a reference/fixture extension (e.g. `sample`, which exercises every pluggable
surface) can live in the repo without being shown to real users.

The gating is entirely in the generator:

- The **committed** manifest is the _full_ form — all extensions, including
  dev-only ones — so local dev and CI (`--check`) validate the same file. Entries
  carry `"dev": true` for the flagged ones.
- A `NODE_ENV=production` write regenerates the manifest with dev-only extensions
  filtered out (the `prebuild` step runs in prod). `--check` always validates
  against the full/canonical form, so it isn't sensitive to `NODE_ENV`.
- Their bundled icons (build-time glob) and foe images (build-copy) may still
  ship as harmless unused artifacts; the meaningful gate is the manifest, which
  removes the toggle + all served content.

---

## 6. Content bundling

### 6.1 JSON content (moves / oracles / foes / assets)

The loader stops hard-coding filenames and instead iterates the manifest's
`provides`, loading each file and merging into the same by-type structure it
already serves (`/catalogue/{assets,moves,oracles,foes,delve}` — **unchanged
contract**). Every loaded item is stamped `source = <extension id>` if it
doesn't already carry one (authors may still write `source` explicitly; the
stamp is a safety net).

Base + Delve content stays where it is for now (or moves to `extensions/base`,
`extensions/delve` in a later phase — see §13). The manifest simply also
describes them, so the loader is uniform.

### 6.2 Foe images → build-copy into the web serve dir

Foe images resolve at runtime via `/foes/<filename>` (see
`apps/web/src/lib/foePortrait.ts` — the `images: ["mire-form.webp"]` array is
the source of truth, prefixed with `/foes/`). So a build step **copies**
`extensions/*/foes/images/*` into the web foe-serve dir (`apps/web/static/foes/`
or the API's equivalent). Runtime resolution is unchanged; the copy is a
generated artifact.

> The 28 YRT foe images currently in `apps/web/static/foes/` move into
> `extensions/yrt/foes/images/`; the build copies them back out.

### 6.3 Icons → registry glob merge

Icons live at the **extension root** (`extensions/<id>/icons/`), not under
`assets/`: they're referenced by slug from a shared registry, so assets reference
them today and foes/moves may tomorrow. Keeping them content-type-agnostic avoids
a later move.

`apps/web/src/lib/iconRegistry.ts` builds its slug→SVG map from a **build-time
Vite glob** of `/src/lib/icons/*.svg`. Extension icons are made self-contained
by **extending the glob** to also scan `extensions/*/icons/*.svg` (add an
`$extensions` Vite alias → repo `extensions/`) and merging into the same
`REGISTRY` map. No copy needed.

Key properties this inherits for free:

- **Missing icons already degrade gracefully.** `getIcon(slug)` returns
  `undefined` → renderer emits empty string → category fallback. This is _not
  hypothetical_: today the YRT assets reference `mana` and
  `skull-and-crossbones`, **neither of which is in the registry**, and nothing
  breaks. So a genuinely-missing extension icon is safe.
- **`hasIcon(slug)` exists for lints** (per the registry's own docstring). The
  build lint (D10) walks every asset/foe `icon` across all extensions and warns
  on any slug not in the merged registry — catching typos _and_ surfacing the
  pre-existing `mana` / `skull-and-crossbones` gaps for a real fix.

> The 12 YRT asset icons (`asset-touched-*` ×6, `asset-cantrip`,
> `asset-bittercraft`, `asset-quillwise`, `asset-arcane-inspection`,
> `asset-compulsion`, `asset-illusion`) move into `extensions/yrt/icons/`.

### 6.4 Overrides (patch base content) — first-class

`foes/overrides.json` is how an extension reshapes the base catalogue **without
creating new foes**. It is keyed by **base** foe id and supports three verbs
(all present in YRT today):

- **Re-skin** — `addendum` appends lore while the extension is active.
  E.g. base `ironsworn/elf` gets _"In YRT, called the Verdani…"_.
- **Remove** — `present: false` hides a base foe.
  E.g. `delve/bog-rot` "does not exist as written".
- **Replace** — the removed foe returns as a _new_ extension foe.
  E.g. bog-rot → `yrt/mire-form`; the risen → `yrt/mask-risen` / `yrt/greatmask`.

Because overrides reference base ids, **an extension folder legitimately
contains ids it does not own** — the decisive reason ids must be authored, not
derived (§7).

---

## 7. IDs: authored, not derived

Filenames are namespaced by their folder; **ids are not**, and must not be
auto-prefixed from the folder, for three independent reasons:

1. **Extensions reference base/other ids.** `overrides.json` is entirely
   references to base ids (`ironsworn/elf`). A "prefix everything in the yrt
   folder" rule would rewrite these to `yrt/ironsworn/elf` and silently sever
   the override.
2. **The existing prefixes are inconsistent** — no uniform rule reproduces them:
   - Foes: `yrt/mire-form` (namespace slot, parallel to base `ironsworn/bear`)
   - Assets: `path/yrt-touched-salamandrine` (base category kept, `yrt-`
     _infixed_)
   - Oracle keys: `yrtAnimal` (camelCase) — **but** `touchedFeatures`,
     `manaBacklash`, `freeportDenizen` are YRT-sourced and carry **no** prefix.
3. **Ids are persisted in the DB.** Asset ids live in `character.data.assets[]`
   (migration `0012` already renamed two); foe ids live in saved encounters.
   Any change to a produced id needs a data migration.

**Rule:** ids are hand-authored and preserved verbatim. The id-prefix _is_ the
cross-extension collision namespace the merged catalogue needs, and it already
matches the extension id. A future prefix-free-id cleanup (adopt one convention

- one DB migration + reference rewrite) is a **separate, deferred** effort.

The **build lint (§10)** enforces this: it warns when an extension _defines_ a
new id (a foe in `foes.json`, an asset in `assets.json`) not prefixed with its
extension id, while _exempting references_ (override keys, `data-oracle=` links).
Grandfather today's inconsistencies or fix them in the deferred cleanup.

---

## 8. Dynamic registry (kill the compile-time enum)

This is the extensibility unlock.

- **`CatalogueSource`** (`'base' | 'delve' | 'yrt'`) — currently **duplicated**
  in `packages/shared/src/index.ts` and `apps/web/src/lib/types.ts` — becomes
  `string` (extension id). De-duplicate to a single shared definition.
- **New endpoint** `GET /catalogue/extensions` returns the manifest's metadata
  slice (`id, name, description, defaultEnabled, order`) for the UI.
- **`expansionStore.svelte.ts`** drops `YRT_KEY` / `isYrtEnabled` / the
  `switch(source)` in `isSourceEnabled` and `sourceLabel`. It becomes a map
  keyed by extension id, hydrated from `/catalogue/extensions`, with localStorage
  keys `ironledger:expansion:<id>` (unchanged scheme). `isSourceEnabled(id)` and
  `sourceLabel(id)` become map lookups.
- **`SettingsDialog.svelte`** renders **one toggle per registered extension**
  (from the store) in the Expansions section instead of hard-coded Delve/YRT
  rows. (Delve stays a registered expansion during the transition even though its
  content isn't reorganised — see §13.)

---

## 9. Code changes (bucket B) — file by file

| File                                                | Change                                                                                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shared/src/index.ts`                      | `CatalogueSource` → `string` (or `type ExtensionId = string`); keep the override types.                                                            |
| `apps/web/src/lib/types.ts`                         | Remove the duplicate `CatalogueSource`; import from shared.                                                                                        |
| `apps/api/src/routes/catalogue.ts`                  | Replace hard-coded `assets_*/moves list/foes_*` with manifest-driven load; add `GET /extensions`.                                                  |
| `apps/web/src/lib/expansionStore.svelte.ts`         | Dynamic registry map hydrated from `/catalogue/extensions`; per-id localStorage.                                                                   |
| `apps/web/src/lib/components/SettingsDialog.svelte` | Render Expansions toggles from the registry.                                                                                                       |
| `apps/web/src/lib/moveStore.svelte.ts`              | `'Yrt'` in the category-order array → derive/append extension categories.                                                                          |
| `apps/web/src/lib/foeStore.svelte.ts`               | `SOURCE_ORDER` and the `foe.id.startsWith('yrt/')` inference → manifest-declared source + id-namespace.                                            |
| `apps/web/src/lib/oracleStore.svelte.ts`            | The hard-coded yrt→source map → generic source from catalogue. **Leave the `yrtTouched` compound-roll logic (lines ~253, 461–480) baked in (D8).** |
| `apps/web/src/lib/iconRegistry.ts`                  | Extend `import.meta.glob` to include `$extensions/*/icons/*.svg`.                                                                                  |
| `apps/web/vite.config` / `svelte.config`            | Add `$extensions` alias → repo `extensions/`.                                                                                                      |
| **new** `scripts/gen-extensions-manifest.ts`        | Build-time manifest generator (§5) + foe-image copy (§6.2) + the lint (§10).                                                                       |
| **new** `scripts/lint-extensions.ts`                | Build-time extension validator (§10) — may live inside the generator or as a sibling sharing its parsed manifest.                                  |

---

## 10. Build lint

A first-class build-time validator (run alongside the manifest generator, on the
same parsed data) that catches the common ways an extension goes wrong before it
ships. **It validates and reports — it never rewrites** (per D5/D10). Default
**warn**; promotable to **error** in CI once the pre-existing gaps are cleaned
(§15).

### What it catches

**Namespace / ids**

- **Missing extension-id prefix on a _defined_ id** — a foe in `foes.json`, an
  asset in `assets.json`, or an oracle `key` whose id isn't namespaced to the
  extension (e.g. a new YRT foe id lacking the `yrt/` prefix). _Exempts
  references_: override keys and `data-oracle=` / `data-id=` links that point at
  base or other-extension ids (§7).
- **Duplicate ids** — the same content id defined by two extensions (or an
  extension redefining a base id), which would collide in the merged catalogue
  and in persisted user data.
- **Extension id ≠ folder name**, or `extension.json` `id` mismatching its
  directory.

**References (dangling links)**

- **Move/oracle cross-refs** — `data-oracle=`, `data-id=`, `data-move=`,
  `data-asset=` pointing at an id not present in the merged catalogue (base +
  enabled extensions).
- **Override targets** — an entry in `foes/overrides.json` keyed by a base foe id
  that doesn't exist (typo'd base id).

**Icons (§6.3)**

- **Unregistered icon slug** — any asset/foe `icon` not in the merged registry
  (`hasIcon()`), catching typos _and_ genuinely-missing icons. Surfaces the
  pre-existing `mana` / `skull-and-crossbones` gaps for a real fix.

**Images (§6.2)**

- **Missing foe image file** — a foe `images` entry with no matching file in the
  extension's `foes/images/` (or the base set).

**Manifest / schema hygiene**

- **Malformed or unparseable JSON**, or content failing the per-type **Zod
  schema** (moves/oracles/foes/assets) — a bad extension is rejected with a clear
  message rather than corrupting the catalogue.
- **Required `extension.json` fields** present (`id`, `name`); `defaultEnabled`
  boolean; `order` numeric.
- **Orphan files** — a content file in an extension subfolder not covered by any
  recognised type (likely a misplaced or misnamed file).

### How it runs

The generator already parses every extension + the merged base catalogue, so the
lint reuses that in-memory data (one pass, no extra I/O). It runs in the prebuild
step and in CI. `warn` mode prints findings and exits 0; `error` mode (post
cleanup) exits non-zero to fail the build.

---

## 11. YRT migration checklist (content)

**Move + rename (git mv):**

| From                                                               | To                                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `apps/api/data/moves/yrt.json`                                     | `extensions/yrt/moves/moves.json`                                |
| `apps/api/data/oracles/yrt-animal.json`                            | `extensions/yrt/oracles/animal.json`                             |
| `apps/api/data/oracles/yrt-region.json`                            | `extensions/yrt/oracles/region.json`                             |
| `apps/api/data/oracles/yrt-touched.json`                           | `extensions/yrt/oracles/touched.json`                            |
| `apps/api/data/oracles/yrt-city-town-location.json`                | `extensions/yrt/oracles/city-town-location.json`                 |
| `apps/api/data/oracles/touched-features.json`                      | `extensions/yrt/oracles/touched-features.json`                   |
| `apps/api/data/oracles/mana-backlash.json`                         | `extensions/yrt/oracles/mana-backlash.json`                      |
| `apps/api/data/oracles/freeport-denizen.json`                      | `extensions/yrt/oracles/freeport-denizen.json`                   |
| `apps/api/data/foes/foes_yrt.json`                                 | `extensions/yrt/foes/foes.json`                                  |
| `apps/api/data/foes/foes_overrides_yrt.json`                       | `extensions/yrt/foes/overrides.json`                             |
| `apps/api/data/assets/assets_yrt.json`                             | `extensions/yrt/assets/assets.json`                              |
| `apps/web/static/foes/<28 yrt>.webp`                               | `extensions/yrt/foes/images/` (build copies back)                |
| `apps/web/src/lib/icons/asset-touched-*.svg` + 6 ritual icons (12) | `extensions/yrt/icons/` (glob merges)                            |
| `docs/yrt/data-schema-yrt.md`                                      | `extensions/yrt/README.md` (minus the escalating sections — §12) |

**Note the 3 non-obvious oracles** (`touched-features`, `mana-backlash`,
`freeport-denizen`) — YRT-sourced with no `yrt` in the name. The generator keys
off the folder, not the name, so they migrate correctly.

**Do NOT change** any `id`, oracle `key`, or `data-oracle=`/`data-id=` reference
(D5). Do NOT extract escalating defence/offence or `yrtTouched` (D7, D8).

**Leaves in place:** `0012_yrt_asset_id_rename.sql` (historical), and all the
YRT concepts already expressed through generic systems — Touched (Touched
asset `customValues`), mana (`globalValues`), `spellRoll` moves — which ride
along on the migrated asset/move content with no code change.

---

## 12. Docs (split — option 2)

- **Baked-in behaviour → inline into core docs.** The escalating-harm and
  escalating-defense sections currently in `docs/yrt/data-schema-yrt.md` move
  into `docs/data-schema.md` (the `FoeDef.escalates` / `escalatesDefense` /
  `currentHarm` / `currentDefense` rows) and `docs/foes.md`, since the mechanic
  is baked-in core behaviour.
- **Genuine extension content → into the extension.** Touched assets, ritual
  cantrips, the mana resource, and Yrt oracles/foes move to
  `extensions/yrt/README.md`.

**Link updates required** (the doc is a hub):

- Inbound (retarget to the new location, or to the inlined core sections):
  `README.md:258`; `docs/data-schema.md` (~8 links); `docs/foes.md:130,142`;
  `apps/web/src/lib/preconditions.ts:5` (comment); `MEMORY.md` index.
- Outbound/in-body in the moved doc: rewrite `../data-schema.md` relative links
  for the new depth, and update the old `data/foes/foes_yrt.json` /
  `data/assets/assets_yrt.json` path references to `extensions/yrt/…` (keeping
  the id-prefix notes).

---

## 13. Phased rollout

Each phase is independently shippable and behaviour-preserving (same content,
same toggles) until phase 4.

1. **Manifest + loader.** Add `extension.json` + the generator + the
   manifest-driven `catalogue.ts`, with files **staying where they are** (the
   manifest points at current paths). Proves the loader, zero data movement.
2. **Dynamic registry.** `CatalogueSource → string`, `/catalogue/extensions`,
   dynamic `expansionStore` + Settings toggles. The extensibility win; still no
   data moved.
3. **Reorganise YRT.** Physically move YRT content/images/icons/doc into
   `extensions/yrt/` per §11, wire the foe-image copy + icon glob, split the
   docs. Base/Delve stay in `apps/api/data/` (Delve especially — out of scope).
4. **(Later, optional)** Base/Delve into `extensions/`, packaging/zip, id-cleanup
   migration, user-upload with sanitisation.

**Verification per phase:** `svelte-check` + `eslint`; the moves/oracles/foes
E2E specs (pickers still list YRT content when enabled, hide it when disabled);
a real roll/asset-add exercising YRT assets + icons; foe images resolve;
`/catalogue/*` etags stable across the refactor where content is unchanged.

---

## 14. Out of scope / deferred

- **Delve reorganisation** — drives bespoke UI (site themes/domains, delve
  moves surfaced structurally) with no clean insertion point. Stays in
  `apps/api/data/` and remains a registered expansion.
- **User-uploaded extensions** — needs HTML sanitisation, id-collision
  arbitration, validation gate. Curated only for now.
- **Prefix-free ids** — a separate DB migration + reference rewrite.
- **`yrtTouched` compound-roll** and **escalating defence/offence** — stay baked
  in.

## 15. Open items

- Confirm the exact foe-image serve dir the copy targets (`apps/web/static/foes`
  vs an API static route) against `foePortrait.ts` at implementation time.
- When to promote the build lint (§10) from **warn** to **error** in CI — warn
  first so the pre-existing `mana` / `skull-and-crossbones` gaps don't block the
  build, then flip to error once cleaned.
- `extension.json` `requires.app` semantics — enforce, or advisory-only for now.
