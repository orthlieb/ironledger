# Iron Ledger — Oracles

## Overview

Oracles are d100 random-result tables drawn from the Ironsworn, Ironsworn: Delve, and Yrt game systems. The player opens the Oracle picker, selects a table, rolls d100, and the result is appended to the session log. The 3D dice animation plays while the log entry is written.

---

## Data

### Source files

```
apps/api/data/oracles/          57 JSON files   (base + delve; Yrt & Lodestar live under extensions/<id>/oracles/)
```

Served by the API at **`GET /api/catalogue`** (bundled with assets, moves, etc.).
The oracle subset lives under the `oracles` key of the catalogue response.

### Oracle JSON structure

Every oracle file exports one object:

```jsonc
{
  "key":         "action",                    // camelCase unique ID
  "title":       "Core: Action",              // Full display title
  "category":    "Core",                      // chip grouping (Core, Combat, Story, Location, …)
  "source":      "base",                      // "base" | "delve" | "yrt" | "lodestar"
  "selectLabel": "Core: Action",              // Label used in picker / dropdowns
  "description": "Use this table when you …", // Guidance text shown in detail view
  "data": [
    { "topRange": 1,   "value": "Scheme" },   // Roll ≤ topRange → this result
    { "topRange": 2,   "value": "Clash"  },
    …
    { "topRange": 100, "value": "Defy"   }
  ]
}
```

`data` entries are **sorted ascending** by `topRange`.
The algorithm selects the **first** entry whose `topRange ≥ roll`.

### Display order

`oracle-order.json` maps `key → sort weight` (decimal, allowing fine-grained insertion):

```json
{ "action": 0, "theme": 1, "region": 2, … "threatZealousCult": 49 }
```

The UI sorts oracle tiles by this weight within each group.

### Groups

Counts are keyed (rollable) oracles per `source`; see
`apps/api/data/extensions.manifest.json` for the authoritative per-extension
list. `oracle-order.json` is a display-order index, not a rollable oracle.

| Group                       | Count | Keys (excerpt)                                                                                                                                               |
| --------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Core Ironsworn** (`base`) | 24    | action, theme, region, location, settlementName / settlementNameQuick / settlementTrouble, character\*, names\*, combatAction, majorPlotTwist, challengeRank |
| **Delve** (`delve`)         | 32    | siteName\*, siteNature\*, trap\*, monstrosity\*, threat\*, combatEvent / combatEventMethod / combatEventTarget, feature\*, charDisposition                   |
| **Yrt** (`yrt`)             | 13    | yrtRegion, yrtSettlement\*, yrtTouched / touchedFeatures / yrtAnimal, manaBacklash, freeportDenizen, yrtStoryRegion                                          |
| **Lodestar** (`lodestar`)   | 19    | overland\* / coastalWaters\* journey oracles, settlementType / settlementCondition / settlementFirstLook / …, storyRegion, storyClue, combatBattleground     |

### Category

Separate from `source` (the owning expansion), every oracle has an optional
**`category`** — the thematic chip the Ask/Oracles picker filters by (Core,
Character, Location, Combat, Story, Magic, Scale, Settlement, Delve Site, Threat,
Monstrosity, Name, Prelude, …). It's independent of source: a `Character` oracle
may come from base, delve, or yrt. Missing → "Other". The chip colours live in
`CATEGORY_COLORS` in `OraclesDialog.svelte`; a new category only needs a colour
added there, else it falls back to the accent.

---

## Oracle layouts (`tableType` reference)

Every oracle file may set a `tableType`; when it is absent the oracle is
**simple**. The `tableType` plus the row shape decide how the detail view
renders and how a roll resolves. Each layout below gives a minimal example, how
it renders, the roll behaviour, and the canonical oracle(s). See
[data-schema.md](data-schema.md) for the authoritative field spec.

### Flat table — `columns` + `roll` (no picker `tableType`)

The default, and the unified home for what used to be three shapes (simple,
typed, described). Each row picks a result by d100 range and may carry several
named fields:

- **Columns** are derived from the row keys — `value → "Result"`, `type →
"Type"`, `description → "Description"` — or declared explicitly with
  `columns: [{ key, label }]` for custom labels/order (and the only way to carry
  arbitrary field keys, e.g. `salary`).
- **`roll: [key…]`** names which columns to echo on a roll, each as
  `Label: value` on its own line (the first value bold). With **no** `roll`, only
  the result is logged (plus a label-less `description` echo when present — the
  legacy shape), so the ~72 plain oracles are byte-for-byte untouched.

```jsonc
// simple — value only (no columns / roll)
{ "topRange": 25, "value": "Investigate a Threat" }

// typed — echo the classification too
"roll": ["value", "type"]
{ "topRange": 7, "value": "Piscis", "type": "Settled" }

// described — a detail column with a custom label, echoed
"columns": [{ "key": "value", "label": "Result" }, { "key": "description", "label": "Examples" }]
"roll": ["value", "description"]
{ "topRange": 5, "value": "Slippery surface", "description": "Mud, ice, rain-slick rocks" }

// multi-column — no `value`; every column named + echoed
"columns": [{ "key": "type", "label": "Type" }, { "key": "salary", "label": "Salary" }]
"roll": ["type", "salary"]
{ "topRange": 11, "type": "Merchants, traders, brokers", "salary": "80–120 gents" }
```

Renders `D100 | col1 | col2 | …` (a lone value column keeps the space-saving
2-/3-column layout for long lists). A `91–100 → "Roll twice…"` row on the primary
column re-rolls twice and combines. _Canonical:_ Core: Action (simple), YRT
Region (typed), Combat: Battleground + Delve Site Nature Theme/Domain (described),
YRT: Freeport Occupation (multi-column), Mana Backlash (Backlash / Effect).

### `columnSelect` — pick a column; per-column ranges, one shared result

`columns: [{ key, label }]`. Each row carries a `topRange` **under every column
key** plus one shared `value`. The reader picks a column; the roll resolves
against **that column's** ranges to the shared result — i.e. the columns change
the _frequency_ of a result, not its text.

```json
{
  "tableType": "columnSelect",
  "columns": [
    { "key": "settled", "label": "Settled Lands" },
    { "key": "boundary", "label": "Boundary Lands" },
    { "key": "remote", "label": "Remote Lands" }
  ],
  "data": [{ "settled": 15, "boundary": 20, "remote": 25, "value": "<strong>Stead</strong> — …" }]
}
```

Renders one range column per `columns` entry + a **Result** column. _Canonical:_
Settlement: Type. (See also `delveDepths`.)

### `matrix` — pick a column; shared ranges, per-column value

The transpose of `columnSelect`: every column shares the **same** ranges but has
its **own** value. Each row carries one `topRange` plus one value per column key.
Pick a column, roll, get that column's value — the columns change the _result_,
not the frequency.

```json
{
  "tableType": "matrix",
  "columns": [
    { "key": "giants", "label": "Giants" },
    { "key": "varou", "label": "Varou" },
    { "key": "trolls", "label": "Trolls" }
  ],
  "data": [{ "topRange": 4, "giants": "Chony", "varou": "Vata", "trolls": "Rattle" }]
}
```

Renders `D100 | col1 | col2 | …` with the active column highlighted. _Canonical:_
Scale: Magnitude (9 columns), Name: Elf (Elf 1/Elf 2), Name: Other
(Giants/Varou/Trolls).

### `twoStep` — outer roll → the row's own subtable

The second table travels **inside** each outer row: roll the outer table for a
category, then roll that row's `subtable` for the final result. `outerLabel` /
`innerLabel` name the two rolls (defaults "Category" / "Result").

```json
{
  "topRange": 15,
  "value": {
    "description": "A feature of the landscape…",
    "subtable": [{ "topRange": 10, "value": "Highmount" }]
  }
}
```

_Canonical:_ Settlement: Name.

### `compound` — a format string with `[oracleKey]` blanks

`value` is a template string; each `[oracleKey]` blank is resolved by rolling
that oracle, recursively. Supports a regex-style repeat quantifier
`[key]{n}` / `[key]{n,m}` (uniform count, de-duped). Full spec in
[data-schema.md](data-schema.md).

```json
{ "topRange": 100, "value": "[siteNameDescription] [siteNameNamesake]" }
```

_Canonical:_ Delve: Site Name, Delve: Monstrosity.

### `delveDepths` — a hardcoded stat-column `columnSelect`

Same shape as `columnSelect` but with fixed **Edge / Shadow / Wits** columns and
its own render branch. Pick a stat, roll against its ranges → the shared result.

```json
{
  "edge": 45,
  "shadow": 30,
  "wits": 40,
  "value": "<a …>Mark progress</a> and <a …>Reveal a Danger</a>."
}
```

_Canonical:_ Delve the Depths Weak Hit Oracle.

### Column-picker UX (`columnSelect` · `matrix` · `delveDepths`)

These three share the chip picker:

- A chip row selects the active column; the chips + the active column are
  **colour-coded per column** (a cycled stat palette — Delve the Depths keeps
  its edge/shadow/wits colours).
- On **≤ 640px** the table **collapses** to `[always-on column | active column]`
  (D100 for matrix, Result for columnSelect/delveDepths), locked **50/50** so
  switching chips doesn't resize the layout; the chips **wrap**.

### Structured specials (hardcoded by key)

Two oracles still keep bespoke render/roll branches. (`freeportDenizen` used to
be here; it is now a plain **flat multi-column** oracle — see above.)

- **`yrtTouched`** (YRT: Touched) — a compound multi-roll: class → animal aspect
  → a feature-count roll (Second/Third: 1–3 / 4–6) → that many unique features
  from `touchedFeatures`. Logged as a monstrosity-style multi-line breakdown.

- **`settlementNameQuick`** (Settlement: Quick Name) — each row is
  `{ prefix, suffix }`; two independent d100 rolls are concatenated
  (e.g. "Red" + "fall" → "Redfall").

## Supersession — one oracle replacing another

An extension can **hide** an oracle from a lower-priority extension and stand in
with its own. In the extension's `extension.json`:

```json
{
  "id": "yrt",
  "suppressesOracles": ["region", "storyRegion", "settlementCondition", "settlementType"]
}
```

When that extension is enabled, `expansionStore.suppressedOracleKeys()` unions
the keys from every enabled extension and `getVisibleOracles()` filters them out
of the picker. The extension then ships a **differently-keyed** replacement — so
YRT's `yrtRegion` supplants base `region`, and `yrtStoryRegion` supplants
Lodestar `storyRegion`. Priority follows the extension `order` (base 0 → delve 10
→ yrt 20 → lodestar 30); Lodestar likewise hides base `location` and delve
`featureAspect` / `featureFocus` / `charDisposition`.

Suppression only removes an oracle from the **picker** — a saved roll or a direct
`rollOracle(key)` still resolves it. See
[extensions.md — Oracle supersession](extensions.md) and the enabled-combination
count guards in `apps/api/tests/unit/extensionsManifest.test.ts`.

---

## Rolling algorithm

```typescript
function rollFromRangeTable(table: OracleEntry[]): { roll: number; value: unknown } {
  const roll = rollD100(); // 1–100 inclusive
  let picked = table[table.length - 1]; // fallback: last entry
  for (const entry of table) {
    if (roll <= entry.topRange) {
      picked = entry;
      break;
    }
  }
  return { roll, value: picked.value };
}
```

**Range label helper** (for table display):

```typescript
function rangeLabelForEntry(table: OracleEntry[], index: number): string {
  const low = index === 0 ? 1 : table[index - 1].topRange + 1;
  const high = table[index].topRange;
  return low === high ? `${low}` : `${low}–${high}`;
}
```

---

## Table rendering

The detail view shows the full oracle table. Layout varies by entry count and oracle type:

| Condition                 | Layout                                                               |
| ------------------------- | -------------------------------------------------------------------- |
| ≤ 40 entries              | 2 columns: d100 \| Result                                            |
| 41–60 entries             | 4 columns: d100 \| Result \| d100 \| Result (side-by-side)           |
| > 60 entries              | 6 columns: 3-column side-by-side                                     |
| Flat with `columns`       | d100 + one column per entry (e.g. Battleground, Freeport Occupation) |
| `columnSelect` / `matrix` | column picker + per-column table (see Oracle layouts)                |
| `settlementName`          | twoStep: category (rowspan) + sub-entries in 2 sub-columns           |
| `settlementNameQuick`     | Custom: 9 columns (3 groups of d100 \| Prefix \| Suffix)             |
| `yrtTouched`              | Custom: d100 \| Class \| Social Rank \| Description                  |

---

## UI flow

```
[Oracles] button (GlobalContextBar)
    │
    ▼
OraclesDialog
  ├── Search input (free-text, filters on name + description)
  ├── Group filter tags (Core Ironsworn | Delve | Yrt) — toggle, multi-select
  └── Tile grid (sorted by oracle-order.json weight)
        │  Each tile: colour-coded group stripe, oracle name, description snippet (2-line clamp)
        ▼
  OracleDetailDialog (on tile click)
    ├── Oracle title + description
    ├── Full table (rendered HTML)
    └── [Cancel] [Roll] buttons
          │  Roll button:
          │    1. Call rollOracle(key) → build result HTML
          │    2. animateDice([d100])  → 3D dice animation (black + white d10s)
          │    3. appendLog(title, html) → session log entry
          │    4. Close both dialogs
```

---

## Implementation plan

### Phase 1 — Core engine (`src/lib/oracles.svelte.ts`)

Module-level reactive store:

```typescript
export let oracleData = $state<OracleFile[]>([]);   // loaded from /api/catalogue

// Pure helpers (ported from oracles-pure.js)
export function rollFromRangeTable(table) { … }
export function rangeLabelForEntry(table, i) { … }
export function buildTableHtml(key, table) { … }

// Special roll dispatchers
export function rollOracle(key: string): { roll: number; html: string; title: string }
```

### Phase 2 — Picker dialog (`OraclesDialog.svelte`)

- Fetch oracle data via catalogue API on first mount (or use pre-loaded store)
- Group filter tags rendered from distinct `group` values
- Tile grid: `display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))`
- Search: `oninput` filter on tile `data-name` + `data-desc` attributes
- On tile click → open detail sub-dialog

### Phase 3 — Detail dialog (nested in OraclesDialog or separate component)

- Show `description`
- Render `buildTableHtml(key, table)` as `{@html}`
- Roll button → `rollOracle(key)` → `animateDice` → `appendLog` → close

### Phase 4 — Wire up

- `GlobalContextBar.svelte` — enable Oracles button; add `onOraclesClick?: () => void` prop
- `characters/+page.svelte` — import `OraclesDialog`, mount it, pass `onOraclesClick`

---

## Yrt-specific helpers

```typescript
// Roll yrtTouched: class + animal + count + unique features
function rollYrtTouched(): { html: string; roll: number } {
  const classRes = rollFromRangeTable(oracleTable('yrtTouched'));
  const animalRes = rollFromRangeTable(oracleTable('yrtAnimal'));
  const countRes = rollFromRangeTable(oracleTable('touchedCount'));
  const features = rollUniqueFeatures(countRes.value as number);
  // … build multi-line HTML
}

// Roll N unique features from touchedFeatures, re-rolling duplicates
function rollUniqueFeatures(count: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let safety = 0;
  while (out.length < count && safety++ < 1000) {
    const r = rollFromRangeTable(oracleTable('touchedFeatures'));
    if (!seen.has(r.value as string)) {
      seen.add(r.value as string);
      out.push(r.value as string);
    }
  }
  return out;
}
```

---

## Session log format

Oracle rolls follow the same HTML convention as dice rolls:

```html
<!-- Title stored as: "Oracle <oracle title>" or "<CharName> — Oracle <title>" -->
<div class="roll-line">Roll: d100 → 42</div>
<div>Result: <strong>Investigate a Threat</strong></div>
```

All entries go to the global session log via `appendLog(title, html)`.

---

## Notes

- **No character required** — oracle rolls are always available regardless of whether a character is selected. The `ctx` prop is not needed for OraclesDialog.
- **Animation** — always plays the d100 animation (black tens + white ones d10s) matching `quickRollD100()` in DiceRollerDialog.
- **Catalogue caching** — the API returns an `ETag` header; the client should cache oracle data for the session and not re-fetch on every dialog open.
- **`oracle-order.json`** — acts as metadata only; it is NOT itself a rollable oracle and should be excluded from the picker tile list.
