# Lodestar Roll-Table Oracles — Design Spec

Status: **proposed / teed up** (2026-08-04). Not yet built. Captures two
Lodestar features and the extension-system work they share.

## 1. Overview

Two new Lodestar oracles that do **not** return text. Each rolls a d100 table,
resolves the result to an existing catalogue **entity**, shows that entity's
detail, and lets the player add it to the current character:

| Oracle              | Resolves to                        | Detail + add UI (reused)                    | Surfaced in                  |
| ------------------- | ---------------------------------- | ------------------------------------------- | ---------------------------- |
| **Encounter Index** | a **foe**                          | DenizenDialog result view → **Add to Foes** | Ask / Oracles list           |
| **Prelude Event**   | an **asset** (+ prelude narrative) | asset-picker card → **Add to Character**    | attached to the asset picker |

Both reference **existing** catalogue entities — verified coverage:
**58/58** encounter foes and **70/70** prelude assets are already in the
catalogue. No new foe/asset content is required; the tables only point at them.

## 2. The shared pattern — a "resolver oracle"

A d100 table where each range maps to an **entity reference** plus optional
flavor text. On roll: find the matching range, resolve the reference to a
catalogue foe/asset, and open that entity's **existing** detail + add UI.

This is distinct from a normal oracle (which yields text). The novelty is the
**resolver** step + reusing an entity's detail/add flow as the result view.

## 3. Extension-system extension (per the "extend the extension system" decision)

Add a new content type extensions can provide: **`rollTables`**.

- **Folder:** `extensions/<id>/roll-tables/*.json`.
- **File shape:**
  ```jsonc
  {
    "id": "lodestarEncounterIndex", // stable key, camelCase
    "name": "Encounter Index",
    "kind": "foe", // "foe" | "asset"
    "source": "lodestar",
    "entries": [
      { "low": 1, "high": 1, "ref": "atanya/first-born" }, // foe id
      { "low": 3, "high": 5, "ref": "ironsworn/bear" },
      // …
    ],
  }
  ```
  Asset tables add `category` (Path / Combat Talent / Companion / Ritual) to
  disambiguate names, and `text` for the prelude narrative:
  ```jsonc
  {
    "low": 1,
    "high": 2,
    "ref": "path/alchemist",
    "category": "Path",
    "text": "You found a journal full of crazed rantings…",
  }
  ```
- **Refs are ids, not names.** Names collide across sources/categories and
  aren't stable; ids are persisted anyway. The build should validate that every
  `ref` resolves to a catalogue entity (fail the manifest `--check` otherwise).

### Touch points (mirrors moves/foes)

1. `scripts/gen-extensions-manifest.mjs` — detect `roll-tables/*.json` →
   `rollTables` provides (mirror `moveOverrides`/`foeOverrides` routing).
2. `apps/api/src/routes/catalogue.ts` — add `rollTables` to `ProvidesType`;
   serve them (new `GET /catalogue/roll-tables`, returning `{tables}`).
3. `apps/web/src/lib/…` — a `rollTableStore` that loads + filters by enabled
   source (mirror `moveStore`/`foeStore`), plus a resolver that maps a d100
   roll → entry → `findFoe(ref)` / `findAsset(ref)`.
4. Types in `packages/shared` — `RollTable`, `RollTableEntry`, `kind`.
5. `apps/api/tests/unit/extensionsManifest.test.ts` — counts + a
   "every ref resolves" integrity check.

## 4. UI integration

### 4a. Encounter Index → Ask / Oracles list

- Appears as an entry in the **Ask (oracles)** dialog, only when Lodestar is
  enabled (gated by `isSourceEnabled('lodestar')`).
- **Refactor, not copy — extract a shared foe-roll dialog.** The denizen
  (`DenizenDialog.svelte`, opened from `ExpeditionsArea`'s "Roll Denizen") is
  structurally identical to the Encounter Index: a d100 foe-table → roll → foe
  detail (portrait/pills/description/quantity) → **Add to Foes** (`onSelect`).
  It's the only existing entity-resolving roll in the app (delve danger/theme
  tables resolve to _text_, not entities). So Phase 2 extracts a shared
  `FoeRollDialog` and makes **both** the denizen and the Encounter Index thin
  callers, rather than generalizing DenizenDialog for one consumer.
  - **Rows:** `{ low, high, label?, ref }[]`. Denizen zips `DENIZEN_CELLS`
    (which supply the frequency `label`s) with per-site `site.denizens`; a
    roll-table passes its `entries` (no labels).
  - **Ref-agnostic:** refs differ — the denizen references foes by **name**
    (per-site, human-authored), roll-tables by **id**. The shared dialog takes
    a `resolve: (ref) => FoeDef | undefined` (denizen → name lookup, roll-table
    → `findFoe`), so it never cares which.
  - The denizen's **data** stays per-site on the `Site` entity — it can't
    become a static extension roll-table. Only the UI/roll logic is shared.

### 4b. Prelude Event → asset picker

- A **"Roll Prelude"** affordance attached to the **asset picker**
  (`AssetPicker`), only when Lodestar is enabled.
- Roll → resolve the asset (`findAsset(ref)`) → show the **existing asset card
  detail** with the prelude `text` shown above/below it → **Add to Character**
  via the asset picker's existing add flow.
- Reuses the asset picker's card + add-to-character path; the only new bits are
  the roll button, the d100 animation, and rendering the prelude narrative.

## 5. Data — the two Lodestar tables

Author as `extensions/lodestar/roll-tables/encounter-index.json` (kind `foe`)
and `prelude-event.json` (kind `asset`). Full content supplied by the user
(58 foe rows; 100 asset rows across Path / Combat Talent / Companion / Ritual).
Each `ref` maps to a catalogue id — a build step (or a one-time script) converts
the authored names → ids and validates coverage.

## 6. Phased build

1. **Extension system**: `rollTables` content type end-to-end (manifest →
   catalogue → web store → types → tests). No UI yet.
2. **Encounter Index**: extract a shared `FoeRollDialog` (the denizen becomes a
   thin caller — a DRY refactor, not a copy); wire the roll-table into the
   Ask/Oracles list; ship `encounter-index.json`.
3. **Prelude Event**: asset-picker "Roll Prelude" + prelude-aware asset detail;
   ship `prelude-event.json`.

Each phase is independently shippable.

## 7. Open questions

- **Ref authoring**: author by name + a build-time name→id resolver, or author
  ids directly? (Recommend a resolver script so the tables stay human-readable.)
- **Encounter Index presentation**: show the full table (denizen-style) before
  rolling, or roll-only? (Denizen shows the table; likely match it.)
- **Prelude "roll" entry point**: a button in the asset-picker header, or a
  distinct "Prelude" mode? (Header button, gated to Lodestar.)
- **Quantity/rank** for encounter foes: reuse denizen's quantity picker as-is.
