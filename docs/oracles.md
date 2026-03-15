# Iron Ledger — Oracles

## Overview

Oracles are d100 random-result tables drawn from the Ironsworn, Ironsworn: Delve, and Yrt game systems. The player opens the Oracle picker, selects a table, rolls d100, and the result is appended to the session log. The 3D dice animation plays while the log entry is written.

---

## Data

### Source files

```
apps/api/data/oracles/          49 JSON files
```

Served by the API at **`GET /api/catalogue`** (bundled with assets, moves, etc.).
The oracle subset lives under the `oracles` key of the catalogue response.

### Oracle JSON structure

Every oracle file exports one object:

```jsonc
{
  "key":         "action",                    // camelCase unique ID
  "title":       "Oracle 1: Action",          // Full display title
  "group":       "Core Ironsworn",            // "Core Ironsworn" | "Delve" | "Yrt"
  "selectLabel": "Oracle 1: Action",          // Label used in picker / dropdowns
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

| Group | Count | Keys (excerpt) |
|---|---|---|
| **Core Ironsworn** | 24 | action, theme, region, location, settlement*, character*, names*, combat*, mystic*, plotTwist, challengeRank, feature*, siteName*, combatEvent |
| **Delve** | 14 | siteName, trap, monstrosity* (×4), threat* (×9) |
| **Yrt** | 6 | yrtTouched, touchedCount, touchedFeatures, yrtAnimal, manaBacklash, freeportDenizen |

---

## Oracle types and special handling

### 1. Simple (default) — string value

Most oracles. Single d100 roll → string result.

```json
{ "topRange": 25, "value": "Investigate a Threat" }
```

**Result HTML:**
```html
<div class="roll-line">Roll: d100 → 17</div>
<div>Result: <strong>Investigate a Threat</strong></div>
```

### 2. Settlement Name (`key: "settlementName"`) — two-step subtable

First roll selects a **category**; the category contains a `subtable` for a second d100 roll.

```json
{
  "topRange": 15,
  "value": {
    "description": "A feature of the landscape…",
    "subtable": [
      { "topRange": 10, "value": "Highmount" },
      …
    ]
  }
}
```

**Rolling:**
1. Roll d100 → select category entry
2. Roll d100 again → select from `entry.value.subtable`

**Result HTML:**
```html
<div class="roll-line">Category roll: d100 → 12</div>
<div><em>A feature of the landscape…</em></div>
<div class="roll-line">Name roll: d100 → 47</div>
<div>Name: <strong>Highmount</strong></div>
```

### 3. Settlement Name Quick (`key: "settlementNameQuick"`) — prefix + suffix

Each entry contains `{ prefix, suffix }`. **Two** independent d100 rolls are made; the results are concatenated.

```json
{ "topRange": 5, "value": { "prefix": "Red", "suffix": "fall" } }
```

**Rolling:** Roll once for prefix, roll again (independently) for suffix → `"Redfall"`.

**Result HTML:**
```html
<div class="roll-line">Prefix roll: d100 → 3 | Suffix roll: d100 → 68</div>
<div>Settlement name: <strong>Redfall</strong></div>
```

### 4. Names (Other) (`key: "namesOther"`) — multi-field

A single d100 roll returns **three** parallel name fields for Giants, Varou, and Trolls.

```json
{ "topRange": 4, "value": { "giants": "Chony", "varou": "Vata", "trolls": "Rattle" } }
```

**Result HTML:**
```html
<div class="roll-line">Roll: d100 → 2</div>
<div>Giants: Chony | Varou: Vata | Trolls: Rattle</div>
```

### 5. Yrt Touched (`key: "yrtTouched"`) — compound multi-roll

The most complex oracle. A single "roll" actually performs **multiple** sub-rolls:
1. Roll d100 → select Touched class (socialRank, className, description)
2. Roll d100 on `touchedCount` → number of features
3. Roll that many unique features from `touchedFeatures` (re-roll duplicates)
4. Roll d100 on `yrtAnimal` → animal aspect

**Table entry structure:**
```json
{
  "topRange": 20,
  "value": { "socialRank": 2, "className": "Touched", "description": "Has visible characteristics." }
}
```

**Result HTML** (multi-line):
```html
<div class="roll-line">Class roll: d100 → 12</div>
<div><strong>Touched</strong> (Social rank 2) — Has visible characteristics.</div>
<div class="roll-line">Animal roll: d100 → 44</div>
<div>Animal aspect: Wolf</div>
<div class="roll-line">Feature count roll: d100 → 55 → 2 features</div>
<ul><li>Feature A</li><li>Feature B</li></ul>
```

### 6. Freeport Denizen (`key: "freeportDenizen"`) — structured object

Each entry is a structured record for a denizen type.

```json
{
  "topRange": 11,
  "value": {
    "type":   "Merchants, traders, brokers",
    "notes":  "Shops, stalls, warehouses…",
    "salary": "80–120 gents",
    "count":  2000
  }
}
```

**Result HTML:**
```html
<div class="roll-line">Roll: d100 → 7</div>
<div><strong>Merchants, traders, brokers</strong></div>
<div>Shops, stalls, warehouses…</div>
<div>Typical annual salary: 80–120 gents (Population: 2000)</div>
```

---

## Rolling algorithm

```typescript
function rollFromRangeTable(table: OracleEntry[]): { roll: number; value: unknown } {
  const roll  = rollD100();                    // 1–100 inclusive
  let picked  = table[table.length - 1];       // fallback: last entry
  for (const entry of table) {
    if (roll <= entry.topRange) { picked = entry; break; }
  }
  return { roll, value: picked.value };
}
```

**Range label helper** (for table display):
```typescript
function rangeLabelForEntry(table: OracleEntry[], index: number): string {
  const low  = index === 0 ? 1 : table[index - 1].topRange + 1;
  const high = table[index].topRange;
  return low === high ? `${low}` : `${low}–${high}`;
}
```

---

## Table rendering

The detail view shows the full oracle table. Layout varies by entry count and oracle type:

| Condition | Layout |
|---|---|
| ≤ 40 entries | 2 columns: d100 \| Result |
| 41–60 entries | 4 columns: d100 \| Result \| d100 \| Result (side-by-side) |
| > 60 entries | 6 columns: 3-column side-by-side |
| `settlementName` | Custom: category (rowspan) + sub-entries in 2 sub-columns |
| `settlementNameQuick` | Custom: 9 columns (3 groups of d100 \| Prefix \| Suffix) |
| `namesOther` | Custom: d100 \| Giants \| Varou \| Trolls |
| `yrtTouched` | Custom: d100 \| Class \| Social Rank \| Description |
| `freeportDenizen` | Custom: d100 \| Type \| Notes \| Salary \| Count |

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
          │    3. appendLog(SESSION_LOG_ID, title, html) → session log entry
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
  const classRes    = rollFromRangeTable(oracleTable('yrtTouched'));
  const animalRes   = rollFromRangeTable(oracleTable('yrtAnimal'));
  const countRes    = rollFromRangeTable(oracleTable('touchedCount'));
  const features    = rollUniqueFeatures(countRes.value as number);
  // … build multi-line HTML
}

// Roll N unique features from touchedFeatures, re-rolling duplicates
function rollUniqueFeatures(count: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let safety = 0;
  while (out.length < count && safety++ < 1000) {
    const r = rollFromRangeTable(oracleTable('touchedFeatures'));
    if (!seen.has(r.value as string)) { seen.add(r.value as string); out.push(r.value as string); }
  }
  return out;
}
```

---

## Session log format

Oracle rolls follow the same HTML convention as dice rolls:

```html
<!-- Title stored as: "Oracle: <oracle title>" or "<CharName> — Oracle: <title>" -->
<div class="roll-line">Roll: d100 → 42</div>
<div>Result: <strong>Investigate a Threat</strong></div>
```

All entries go to `SESSION_LOG_ID` via `appendLog(SESSION_LOG_ID, title, html)`.

---

## Notes

- **No character required** — oracle rolls are always available regardless of whether a character is selected. The `ctx` prop is not needed for OraclesDialog.
- **Animation** — always plays the d100 animation (black tens + white ones d10s) matching `quickRollD100()` in DiceRollerDialog.
- **Catalogue caching** — the API returns an `ETag` header; the client should cache oracle data for the session and not re-fetch on every dialog open.
- **`oracle-order.json`** — acts as metadata only; it is NOT itself a rollable oracle and should be excluded from the picker tile list.
