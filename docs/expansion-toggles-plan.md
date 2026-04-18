# Delve / YRT Expansion Toggles — Implementation Plan

## Design contract

- Expansion flags gate what appears in **pickers and catalogues** going forward.
- User-created data (sites, foes in sessions, log entries, NPCs, owned assets, rarities) is **never deleted** when an expansion is turned off.
- At render time, references resolve against the **full** catalogue — a log entry, a Delve site, or a Touched asset keeps working when the toggle is off.
- Items resolved-by-id from a disabled expansion may optionally render a "Delve (disabled)" / "YRT (disabled)" badge.
- Default: both **ON**. Existing users should see no change until they opt out.

---

## 1. Data inventory

### 1.1 Moves — `apps/api/data/moves/`

| File | Category | Source |
|---|---|---|
| `adventure.json`, `combat.json`, `failure.json`, `fate.json`, `quest.json`, `relationship.json`, `suffer.json` | various | `base` |
| `delve.json` | Delve | `delve` |
| `rarity.json` | Rarity | `delve` (not obvious from category — must be explicit) |
| `yrt.json` | Yrt | `yrt` |

**Schema change:** add top-level `"source"` and per-move `"source"` (`"base" | "delve" | "yrt"`).

### 1.2 Oracles — `apps/api/data/oracles/`

Currently tagged with `"group"` (`"Core Ironsworn"` / `"Delve"` / `"Yrt"`).
**Rename `group` → `source`** and normalize values to `"base" | "delve" | "yrt"` to match moves/assets. Single discriminator across all catalogues.
- Delve: 23 files (char-disposition, site-name, site-nature-*, threat-*, trap, monstrosity-*, feature-*, combat-event)
- YRT: 6 files (freeport-denizen, mana-backlash, touched-features, yrt-animal, yrt-region, yrt-touched)

### 1.3 Foes — `apps/api/data/foes/`

Per-file split. `foeSource()` in `foeStore.svelte.ts` derives source from id prefix and returns title-case values (`'Ironsworn' | 'Delve' | 'Yrt'`).
**Recommended:** add per-foe `"source"` with normalized values `"base" | "delve" | "yrt"`, and update `foeSource()` to read the field (falling back to id-prefix derivation for any un-migrated entries). Drives one unified `isSourceEnabled(source)` helper.

### 1.4 Assets — `apps/api/data/assets/`

| File | Content | Source |
|---|---|---|
| `assets_ironsworn.json` | Combat Talent, Companion, Path, Ritual | `base` |
| `assets_delve.json` | rarities only (no assets) | `delve` |
| `assets_yrt.json` | Touched (×2), Ritual (×4), Path (×2) | `yrt` |

**Schema change:** add per-item `"source"` to every asset and every rarity. Per-file is insufficient — a future merge might mix sources, and `Touched` vs. base `Ritual` already sits at the category level only.

### 1.5 Delve tables — `apps/api/data/delve/`

Five files (theme-features, theme-dangers, domain-features, domain-dangers, common-dangers). All Delve by definition. No schema change; keep loading regardless of toggle so existing sites render.

---

## 2. UI surfaces that filter

| Surface | File | Change |
|---|---|---|
| Moves browser | `MovesDialog.svelte` | Filter list + category chips by enabled sources. Keep `open(id)` resolving against full catalogue. |
| Oracles browser | `OraclesDialog.svelte` | Filter list + source chips (renamed from group). Keep `open(key)` for click-through. |
| Foe picker | `FoePickerDialog.svelte` | Filter grid + source chip row. Keep `openWithFoe(name)`. |
| Asset picker | `AssetPicker.svelte` | Filter tiles + category chips. |
| Rarity slot | `AssetCard.svelte` | Hide acquire-rarity UI when Delve off; render owned rarities unchanged. |
| Site creation | `routes/home/+page.svelte` | Hide "New Site" affordance when Delve off. |
| Delve roll actions | `GlobalContextBar.svelte` | Hide feature/danger roll buttons + Roll Denizen when Delve off. |
| Community region picker | `routes/home/+page.svelte` (~L1370) | Hide YRT radio when YRT off. |
| Denizen table | `DenizenDialog.svelte` | No internal filter; only reachable via Delve GCB — already gated. |

**Never filtered (render-time resolution):** `findMove`, `findOracle`, `findFoe`, `findAsset`, `findRarity`, `DELVE_THEMES`/`DELVE_DOMAINS` constants, Delve data endpoint, log entry click-through.

---

## 3. Reference resolution map

All of these already look up by id against the full catalogue and need no change:

- `LogEntry.html` anchors (`data-id="move/..."`, `data-oracle="..."`, `data-expedition-id=...`)
- `LogEntry.roll.moveId` (burn-momentum recompute)
- `CharacterAsset.assetId`, `CharacterAsset.rarityId`
- `Site.theme`, `Site.domain`, `Site.denizens[]`
- `FoeEncounter.foeId`
- `Community.region`

Cross-expansion references sanity-checked: no base move references Delve/YRT content; `move/cast-conclave-ritual` (YRT) references `move/pay-the-price` (base) and the `manaBacklash` YRT oracle — if YRT is off, that move isn't offered, so the reference is moot.

---

## 4. Hardcoded Delve/YRT behaviours (TS-level)

Answering the follow-up — yes, there are more beyond the "log miss" pattern. Inventory of TS/Svelte side-effects tied to expansions:

| Location | Behaviour | Gating |
|---|---|---|
| `GlobalContextBar.svelte` L26 | `loadDelveData()` on mount | **Keep unconditional** — render-time resolution depends on it |
| `GlobalContextBar.svelte` L166, L189 | Feature/Danger rollers using `buildCombinedTable()` | `if (!isDelveEnabled()) hide button` |
| `GlobalContextBar.svelte` L268–269 | Ritual/Touched nature colors | Keep (just CSS vars) |
| `routes/home/+page.svelte` L402 | `loadDelveData()` on page load | Keep |
| `routes/home/+page.svelte` L209, L711, L1375 | YRT region type + oracle roll + radio | Gate radio + creation path |
| `routes/home/+page.svelte` L849, L1336 | expedition `track === 'delve'` branch | Gate new-site creation only |
| `SiteCard.svelte` L156 | `appendLog(... Site — ...)` on miss/progress | Only reachable from Delve-gated entry points |
| `DenizenDialog.svelte` L97 | Site log entry on roll | Same — only reached via Delve-gated GCB action |
| `CharacterSheet.svelte` L197–204 | Hardcoded `mana` global counter | **Keep for existing characters.** Don't strip globalValues on toggle off; only gate new YRT asset acquisitions |
| `preconditions.ts` L134, L187–190, L204–225 | `mana` / `rarityCount` / `touched` precondition handlers | Keep — evaluated against existing character data. If a disabled-expansion asset is owned, its precondition still resolves. |
| `oracleStore.svelte.ts` L151, L237, L320, L393 | Compound roll logic for `yrtTouched` and `freeportDenizen` | Keep — only invoked by YRT-sourced oracles which the picker hides |
| `moveStore.svelte.ts` L23 | Category order includes `'Delve', 'Rarity', 'Yrt'` | Keep; filter at picker level |
| `foeStore.svelte.ts` L68, L141–142 | `SOURCE_ORDER`, id-prefix source derivation | Keep |
| `types.ts` | `TouchedLevel`, `DelveTheme`, `DelveDomain`, `AssetCategory` includes `Touched`, `touchedFeatures` flag | Type-level only, always available |

### Should any of this be codified in JSON?

**No for side-effects; yes for source tagging.** My recommendation:

- **JSON carries the `source` tag** on moves / assets / rarities. One new field, drives everything.
- **TS keeps the imperative behaviour** — `appendLog` calls, mana arithmetic, precondition evaluation, compound oracle rolls. A generic rules engine to express "on miss for move X, append log entry Y and roll oracle Z" would be a mini-DSL; the payoff doesn't justify the complexity at the current count of such rules (roughly a dozen).
- **Gate at the entry point**, not at every side-effect. The "Roll Denizen" button doesn't render when Delve is off, so every `appendLog` inside that flow is effectively gated with one `if`. Same pattern for YRT region selection and feature/danger rolls.

Reconsider a rules engine only if the rule count grows past ~20 or we add a third expansion with similar shape.

---

## 5. Settings storage

Mirror the 3D-dice pattern (`dice.ts` + `ironledger:dice3d` localStorage key).

New file: `apps/web/src/lib/expansionStore.svelte.ts`
- Keys: `ironledger:expansion:delve`, `ironledger:expansion:yrt`
- Reactive `$state` for `delveEnabled`, `yrtEnabled` (default `true`)
- Helpers: `setDelveEnabled(b)`, `setYrtEnabled(b)`, `isDelveEnabled()`, `isYrtEnabled()`, `isSourceEnabled(source: 'base' | 'delve' | 'yrt')` — single predicate used by every picker (moves, oracles, foes, assets)
- Hydrate from localStorage at import time (client-only guard)

Added to `SettingsDialog.svelte` as two new toggle rows alongside 3D Dice.

---

## 6. Items hidden per toggle

### Delve OFF hides
- Moves: all of `delve.json` + `rarity.json` (`move/wield-a-rarity`)
- Oracles (source `delve`): 23 entries — site-*, threat-*, monstrosity-*, feature-*, char-disposition, combat-event, trap
- Foes (source `Delve`): ~45 entries in `foes_delve.json`
- Rarities: all entries in `assets_delve.json` (from rarity slot picker)
- UI: "New Site" creation, GCB Delve feature/danger/denizen actions, Delve + Rarity category chips in MovesDialog, Delve group chip in OraclesDialog, Delve source chip in FoePickerDialog

**Preserved:** existing Site records, SiteCard change-theme/domain, owned rarities, log click-through to Delve moves/oracles/foes, Delve data endpoint

### YRT OFF hides
- Moves: all of `yrt.json` (Cast Conclave Ritual, etc.)
- Oracles (source `yrt`): freeport-denizen, mana-backlash, touched-features, yrt-animal, yrt-region, yrt-touched
- Foes (source `Yrt`): Blighted Guilder, Mana Wraith, Verdant Crawler, Amber Schemer
- Assets (source `yrt`): both Touched assets, 4 Ritual, 2 Path from `assets_yrt.json`
- UI: Touched category chip in AssetPicker, Yrt chips in Moves/Oracles/Foe pickers, YRT radio in community region picker

**Preserved:** existing YRT-regioned communities, characters with Touched/YRT assets, mana counter on existing characters, log click-through to YRT content, `mystic-backlash` oracle (source `base`, not YRT)

---

## 7. Edge cases

1. **`Rarity` category is Delve** — not labelled as such at the category level. Solved by per-move `source` field.
2. **`assets_delve.json` has `assets: []`** — only rarities. Per-item `source` field means filter works correctly.
3. **Denizen slot population** — user-populated names. No filter. Existing sites keep their denizens.
4. **Freeport rides with YRT** — single toggle. No separate Freeport flag.
5. **Cross-expansion move references** — none from base→Delve/YRT. Confirmed.
6. **Delve data fetch** — keep unconditional so `SiteCard` / `DelveTableDialog` resolve correctly.
7. **Mana on existing characters** — don't strip; existing characters keep the counter; new YRT Ritual acquisitions are what the toggle gates.
8. **Preconditions against disabled content** — `touched` / `rarityCount` / `mana` keep evaluating against character data so existing assets don't break.

---

## 8. Implementation steps

Ordered so each step compiles and tests green.

1. **Tag the JSON.** Add `"source"` (`"base" | "delve" | "yrt"`) to every entry in `apps/api/data/moves/*.json`, `apps/api/data/assets/assets_*.json`, `apps/api/data/foes/foes_*.json`. For oracles: **rename `"group"` → `"source"`** and normalize values (`"Core Ironsworn"` → `"base"`, `"Delve"` → `"delve"`, `"Yrt"` → `"yrt"`). Update `oracleStore.svelte.ts` and any consumer referencing `.group` (e.g. `OraclesDialog` group chips). Update `foeStore.foeSource()` to read the field first, id-prefix fallback.
2. **Extend types.** Add `source?: 'base' | 'delve' | 'yrt'` to `MoveDefinition`, `AssetDefinition`, `RarityDefinition` (wherever they live in `packages/shared` and `apps/web/src/lib/types.ts`).
3. **Create `expansionStore.svelte.ts`** with reactive state, localStorage persistence, and `isSourceEnabled`/`isGroupEnabled` helpers.
4. **Add `getVisible*` accessors** to `moveStore`, `oracleStore`, `foeStore`, `assetStore`. Leave `get*`/`find*` intact for render-time resolution.
5. **Rewire pickers.** Swap `getMoves` → `getVisibleMoves` (and equivalents) in `MovesDialog`, `OraclesDialog`, `FoePickerDialog`, `AssetPicker`. Hide the rarity slot UI in `AssetCard` when Delve off.
6. **Gate creation affordances.** "New Site" button in `routes/home/+page.svelte`, YRT region radio, GCB Delve actions.
7. **Add toggles to `SettingsDialog.svelte`** alongside 3D Dice.
8. **(Optional) Disabled-expansion badges** in Moves/Oracles/Foe/Asset detail views for direct-open resolution.
9. **Tests.** Vitest for `expansionStore` hydration, `getVisible*` under each toggle combo. Server endpoint test to confirm full catalogue is returned (no server-side filtering). Optional Playwright: toggle off → confirm hidden in picker, confirm log click-through still works.
10. **Docs.** Update `docs/DATA_FORMAT.md`, `docs/DATA_FORMAT_YRT.md` with the new `source` field. Note the two localStorage keys.

---

## Critical files

- `apps/web/src/lib/expansionStore.svelte.ts` *(new)*
- `apps/web/src/lib/moveStore.svelte.ts`
- `apps/web/src/lib/oracleStore.svelte.ts`
- `apps/web/src/lib/foeStore.svelte.ts`
- `apps/web/src/lib/assetStore.svelte.ts`
- `apps/web/src/lib/components/SettingsDialog.svelte`
- `apps/web/src/lib/components/AssetCard.svelte` (rarity slot gate)
- `apps/web/src/lib/components/GlobalContextBar.svelte` (Delve action gates)
- `apps/web/src/routes/home/+page.svelte` (New Site + YRT region gates)
- All `apps/api/data/moves/*.json` and `apps/api/data/assets/*.json` (source tagging)
