# Expansion Toggles (Delve / YRT)

Iron Ledger ships content from three sources:

| Source  | Content                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------- |
| `base`  | Core Ironsworn — always on                                                                                       |
| `delve` | Ironsworn: Delve supplement (sites, themes, domains, rarities, monstrosity & feature/danger oracles, Delve foes) |
| `yrt`   | Yrt homebrew expansion (Touched assets, mana, Conclave rituals, freeport denizens, YRT foes & oracles)           |

Each user can toggle the **Delve** and **YRT** sources independently. The toggles live in **browser `localStorage`** — they are not stored in `CharacterData` and do not sync between devices or browsers.

```
ironledger:expansion:delve
ironledger:expansion:yrt
```

A missing key is treated as **enabled** (default ON). Setting either to `'off'` disables that source. There is no toggle for `base`.

> **Where is the UI?** Settings dialog → **Expansions** section, alongside the 3D Dice toggle.

---

## Design Contract

The toggles are a **picker filter**, not a content firewall.

1. **Pickers and catalogues** filter by enabled source. Disabled-source items don't appear in `MovesDialog`, `OraclesDialog`, `FoePickerDialog`, `AssetPicker`, or the rarity slot.
2. **Render-time `findX(id)` lookups are never filtered.** A log entry, owned asset, populated denizen, or active site referencing a now-disabled source still resolves and displays.
3. **User-created data is never deleted** when a toggle flips. Existing sites, encounters, communities, NPCs, and assets remain untouched. The toggle gates _new_ acquisitions and _new_ picker visibility only.
4. **Defaults are both ON** — existing users see no change on first load.

This means a player can disable YRT before a session, run an Ironsworn-only game without distraction in the pickers, and re-enable YRT later with all of their prior YRT data intact.

---

## Store API

`apps/web/src/lib/expansionStore.svelte.ts`

```typescript
import type { CatalogueSource } from '$lib/types.js';
// CatalogueSource = 'base' | 'delve' | 'yrt'

export function isDelveEnabled(): boolean;
export function isYrtEnabled(): boolean;

/** Single predicate used by every catalogue filter. */
export function isSourceEnabled(source: CatalogueSource | string | undefined): boolean;

export function setDelveEnabled(enabled: boolean): void;
export function setYrtEnabled(enabled: boolean): void;

/** 'base' → 'Core', 'delve' → 'Delve', 'yrt' → 'YRT'. Used for picker chips. */
export function sourceLabel(source: CatalogueSource | string): string;
```

Hydration is synchronous on first import (with a `typeof window` guard for SSR). The state uses Svelte 5 module-level `$state`, so any component reading `isDelveEnabled()` re-runs reactively when a toggle flips.

`isSourceEnabled` deliberately defaults unknown sources to enabled — a future expansion added before its toggle exists won't silently disappear.

---

## What Gets Hidden

### Delve OFF

| Surface                         | Effect                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `MovesDialog`                   | Hides Delve & Rarity category chips and their moves (`delve.json`, `rarity.json`)                         |
| `OraclesDialog`                 | Hides 23 Delve oracles (site-_, threat-_, monstrosity-_, feature-_, char-disposition, combat-event, trap) |
| `FoePickerDialog`               | Hides ~45 entries from `foes_delve.json`                                                                  |
| `AssetCard` (rarity slot)       | Hides the acquire-rarity affordance                                                                       |
| Expeditions tab                 | Hides **+ New Site** (Journey creation still works)                                                       |
| `GlobalContextBar`              | Hides feature/danger roll buttons and **Roll Denizen** action                                             |
| `CharacterSheet`                | Hides the Failures track group                                                                            |
| `VowCard`                       | Hides the Threat + Menace controls; `ProgressTrack` is rendered with `dangerCount: 0`                     |
| `MovesDialog` outcome rendering | Suppresses the `+1 failure` link on a miss                                                                |

### YRT OFF

| Surface           | Effect                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `MovesDialog`     | Hides Yrt chip and `yrt.json` (Cast Conclave Ritual, etc.)                                   |
| `OraclesDialog`   | Hides freeport-denizen, mana-backlash, touched-features, yrt-animal, yrt-region, yrt-touched |
| `FoePickerDialog` | Hides Blighted Guilder, Mana Wraith, Verdant Crawler, Amber Schemer                          |
| `AssetPicker`     | Hides Touched chip and YRT assets (2 Touched, 4 Ritual, 2 Path from `assets_yrt.json`)       |
| Communities       | Hides the YRT radio in the region picker                                                     |

### Always preserved

- Existing `Site` records and the `/api/v1/catalogue/delve` endpoint (so `SiteCard` and `DelveTableDialog` resolve themes/domains)
- `mana` global counter on existing characters — toggling YRT off doesn't strip globals; only new YRT asset acquisitions are gated
- `touched` / `rarityCount` / `mana` precondition handlers continue to evaluate against character data so existing assets don't break
- The base `mystic-backlash` oracle (`source: base`, not YRT)
- All `find*` lookups: `findMove`, `findOracle`, `findFoe`, `findAsset`, `findRarity`

---

## Source Tagging in Data

Catalogue entries carry a `source` field with normalized values `'base' | 'delve' | 'yrt'`.

| Catalogue            | Tagged at                                     | Notes                                                                                                     |
| -------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Moves                | per move + per file                           | `rarity.json` is `'delve'` even though the category is "Rarity"                                           |
| Oracles              | per oracle (was `group`, renamed to `source`) | Values normalized: `"Core Ironsworn"` → `"base"`, etc.                                                    |
| Foes                 | per foe                                       | `foeStore.foeSource()` reads the field, with id-prefix fallback for un-migrated entries                   |
| Assets               | per asset                                     | Per-file would be insufficient — `Touched` vs. base `Ritual` only differs at the category level otherwise |
| Rarities             | per rarity in `assets_delve.json`             | All `'delve'`                                                                                             |
| Delve themes/domains | implicit (`'delve'`)                          | No per-entry tag; loaded unconditionally so existing sites resolve                                        |

See [data-schema.md](data-schema.md) for the catalogue schemas.

---

## Foe Overrides

A second mechanism — independent of the picker filter — lets an active expansion **decorate or exclude base foes**. A `foes_overrides_<source>.json` file ships per-expansion:

```json
{
  "source": "yrt",
  "overrides": {
    "ironsworn/basilisk": {
      "present": true,
      "addendum": "In Yrt, a basilisk's gaze is bound Stone mana — a walking focus."
    },
    "ironsworn/troll": { "present": false }
  }
}
```

Overrides apply **only while their owning expansion is enabled**. `resolveFoeDescription()` in `foeStore.svelte.ts` walks all loaded override files, skips disabled-source files, and concatenates active addenda. Vetoes (`present: false`) are additive across active expansions. Existing `FoeEncounter` records resolve regardless. See [data-schema.md § Foe Overrides](data-schema.md#foe-overrides-expansion-extension-mechanism) for the file format.

---

## Cross-Expansion References

Audited at the time of the toggles' introduction:

- No `base` move references Delve or YRT content
- `move/cast-conclave-ritual` (YRT) references `move/pay-the-price` (base) and the `manaBacklash` YRT oracle — moot, since the move isn't offered when YRT is off
- `Community.region` may hold `'yrt'` regions — preserved as-is when YRT is off; the region label still renders, only the picker radio is hidden

---

## Adding a New Expansion

If a fourth source is added (say `'foo'`):

1. Tag every new catalogue entry with `"source": "foo"`.
2. Add `foo` to `CatalogueSource` in `apps/web/src/lib/types.ts`.
3. Add `_fooEnabled` state, getter, setter, and a case in `isSourceEnabled()` in `expansionStore.svelte.ts`.
4. Add the toggle row to `SettingsDialog.svelte`.
5. (Optional) Ship `foes_overrides_foo.json` to decorate or veto base foes for the new setting.

Picker filtering is automatic — `getVisibleMoves()`, `getVisibleOracles()`, etc. all route through `isSourceEnabled()`.

A rules engine for hardcoded TS-level expansion behaviours (mana arithmetic, log-on-miss for specific moves, compound oracle rolls for `yrtTouched` / `freeportDenizen`) was considered but **deliberately rejected** at the current rule count (~12). Reconsider if a third expansion lands with similar shape, or if the rule count grows past ~20.
