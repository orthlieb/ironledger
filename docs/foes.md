# Foes

Tracks active combat encounters (foes). Each encounter record links to a foe definition from the foe catalogue and stores combat-specific state (progress track, custom name, vanquished flag).

---

## Data Model

### Encounter (stored per-character)

```js
{
  id:              string,   // crypto.randomUUID()
  foeId:           string,   // references foe catalogue entry
  customName:      string,   // optional display name override
  effectiveRank:   number,   // effective rank (1-5, after quantity adjustment)
  quantity:        'solo' | 'pack' | 'horde',
  ticks:           number,   // 0-40 progress track
  vanquished:      boolean,
  currentHarm?:    number,   // escalating harm level (1–rank); only when the foe
                             // def carries extras.yrt.escalates
  currentDefense?: number,   // escalating defense level; only when the foe def
                             // carries extras.yrt.escalatesDefense
                             // absent = full cap (FOE_RANKS[effectiveRank].progressPerHit)
}
```

### Foe Catalogue Entry (FoeDef)

```js
{
  id:                 string,       // e.g. "ironsworn/bear", "delve/troll"
  name:               string,
  nature:             FoeNature,    // Ironlander | Firstborn | Animal | Beast | Horror | Anomaly
  rank:               number,       // base rank 1-5
  description:        string,
  features:           string[],
  drives:             string[],
  tactics:            string[],
  /**
   * Per-extension extras bag — each extension namespaces custom flags/data
   * under its manifest id. YRT reads escalating-harm / escalating-defense
   * flags off `extras.yrt.escalates` / `extras.yrt.escalatesDefense`.
   * Consumers read through `foeExtraFlag(def, 'yrt', 'escalates')`
   * (see apps/web/src/lib/foeExtras.ts) so core code stays extension-agnostic.
   */
  extras?: Record<string, unknown>,
}
```

---

## Foe Catalogue

Static JSON data served via:

- **API**: `GET /api/v1/catalogue/foes` (public, cached with ETag)
- **BFF proxy**: `GET /api/catalogue/foes`
- **Client store**: `foeStore.svelte.ts`

Sources: Ironsworn core, Delve supplement, Yrt homebrew. Each foe's `source` (`base` / `delve` / `yrt`) is read from the foe definition (with id-prefix fallback in `foeStore.foeSource()`).

The **Delve** and **YRT** [expansion toggles](expansion-toggles.md) filter which foes appear in the picker:

- Delve off → foes from `foes_delve.json` are hidden in `FoePickerDialog`
- YRT off → foes from `foes_yrt.json` are hidden, and any `foes_overrides_yrt.json` entries with `present: false` no longer apply to base foes

`findFoe(id)` is **not** filtered — existing `FoeEncounter` records keep resolving regardless of toggle state. See [data-schema.md § Foe Overrides](data-schema.md#foe-overrides-expansion-extension-mechanism) for how overrides decorate or exclude base foes per active expansion.

### Ranks & Mechanics

| Rank        | Progress/Hit | Harm/Strike |
| ----------- | ------------ | ----------- |
| Troublesome | 12           | 1           |
| Dangerous   | 8            | 2           |
| Formidable  | 4            | 3           |
| Extreme     | 2            | 4           |
| Epic        | 1            | 5           |

### Quantities

- **Solo** — base rank, one foe
- **Pack (2-4)** — +1 rank adjustment
- **Horde (5+)** — +2 rank adjustment

---

## UI Structure

The Foes area (`apps/web/src/lib/components/v2/FoesArea.svelte`) shows one encounter at a time:

- **Header** — the switcher (`Combobox`) lists the encounters, each with its foe's nature glyph and colour, and its **+ New foe…** action opens FoePickerDialog. The gear opens `FoeOptionsDialog` (rename — the encounter's `customName` — and delete).
- **Core** tab:
  - Pill row: nature → rank → quantity → harm (↑ italic when escalating) → progress (↓ italic when defense active)
  - **Active** / **Vanquished** status toggle
  - 10-box progress track (`ProgressTrackPanel`); its +/− buttons mark `progressPerHit − currentDefense` ticks and stay enabled by track state alone (defense only changes the step)
  - **Escalating Harm** row (− / value / + / cap) when `foeExtraFlag(foeDef, 'yrt', 'escalates')` — tracks `currentHarm`
  - **Escalating Defense** row (− / value / + / cap) when `foeExtraFlag(foeDef, 'yrt', 'escalatesDefense')` — tracks `currentDefense`
- **Description** tab: the portrait (click to enlarge) floated right of the description, with any active expansion's addendum (`resolveFoeDescription`), then features, drives, and tactics

### FoePickerDialog

- Searchable grid of foe tiles filtered by name and nature
- Two modes:
  - **Encounter mode** — pick foe → confirm with quantity selector → adds encounter
  - **Denizen mode** — pick foe → immediately returns the foe's id (the site's denizen cell shows its name)

---

## Active foe

The encounter open in the Foes area is the active foe: FoesArea publishes it with `setActiveFoeId()` (`activeContext.svelte.ts`). The Moves dialog (wired in `+layout.svelte`) reads it for foe conditions (`hasFoe`, which moves like Strike and Clash require), the foe's harm, and the combat progress roll; the command bar shows it as a chip in its nature colour and points `/foe.…` commands at it. A vanquished encounter counts as no foe. Initiative belongs to the character, on the sheet's Core tab (see [character-sheet.md](character-sheet.md#initiative)).

---

## Escalating Mechanics (YRT Extension)

Two optional escalating mechanics extend base foes. Both are additive — they don't replace any core Ironsworn rules and can coexist on the same foe.

### Escalating Harm (`extras.yrt.escalates: true`)

The foe's harm starts at 1 and increases on each Miss. Cap = effective rank + 1 (Troublesome = 2, Dangerous = 3, Formidable = 4, Extreme = 5), capped at 5 for Epic.

- **+** button increases harm (on Miss)
- **−** button decreases harm (on Strong Hit recovering)
- Current value stored as `enc.currentHarm` (absent = 1)
- Pill shows `Harm: N ↑` in italic red when active

See [Yrt extension docs § Escalating Harm](../extensions/yrt/README.md#escalating-harm-yrt-extension) for full spec.

### Escalating Defense (`extras.yrt.escalatesDefense: true`)

The foe's armor builds up on each Miss, reducing progress ticks per mark. Defense starts at 0 and increases by 1 on each Miss. Max = `FOE_RANKS[effectiveRank].progressPerHit − 1` (Troublesome = 11, Dangerous = 7, … Epic = 0). Ticks per progress mark = `progressPerHit − currentDefense` (minimum 1).

- **+** button increases defense by 1 on a Miss (armor consolidates)
- **−** button decreases defense by 1 (armor recovers)
- Current value stored as `enc.currentDefense` (absent = 0)
- Progress pill shows `Progress: N ↓` in italic blue when defense > 0; N = ticks per mark
- Progress buttons always enabled per normal track rules; mark/unmark `progressPerHit − currentDefense` ticks

See [Yrt extension docs § Escalating Defense](../extensions/yrt/README.md#escalating-defense-yrt-extension) for full spec.

---

## Components

| Component        | File                                 | Purpose                                            |
| ---------------- | ------------------------------------ | -------------------------------------------------- |
| FoesArea         | `components/v2/FoesArea.svelte`      | The Foes area: switcher, Core and Description tabs |
| FoeOptionsDialog | `components/FoeOptionsDialog.svelte` | Rename and delete an encounter                     |
| FoePickerDialog  | `components/FoePickerDialog.svelte`  | Foe selection dialog                               |

## Stores

| Store          | File                       | Purpose                      |
| -------------- | -------------------------- | ---------------------------- |
| encounterStore | `encounterStore.svelte.ts` | Encounter CRUD + persistence |
| foeStore       | `foeStore.svelte.ts`       | Foe catalogue data + lookups |
