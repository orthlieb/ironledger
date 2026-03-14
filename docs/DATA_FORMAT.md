# Iron Ledger Data Format Reference

This document describes the JSON data formats used by Iron Ledger for Ironsworn and Delve content. All data lives under `data/` and is injected into `ironledger.html` at build time.

For Yrt homebrew extensions (mana, Touched assets, cantrips, Yrt-specific oracles and foes), see **[DATA_FORMAT_YRT.md](DATA_FORMAT_YRT.md)**.

## Table of Contents

- [Moves](#moves)
  - [Move Object Fields](#move-object-fields)
  - [Preconditions](#preconditions)
  - [Stat Entries](#stat-entries)
  - [Outcome Text and HTML](#outcome-text-and-html)
  - [Data-Driven Links](#data-driven-links)
  - [Context-Aware Visibility (log-only / dialog-only)](#context-aware-visibility-log-only--dialog-only)
  - [Match Text (strongMatch / weakMatch / missMatch)](#match-text-strongmatch--weakmatch--missmatch)
  - [Inline Tables](#inline-tables)
  - [Special Move Types](#special-move-types)
- [Assets](#assets)
  - [Asset Object Fields](#asset-object-fields)
  - [Auto-Enabled Abilities](#auto-enabled-abilities)
  - [XP Cost and Gating](#xp-cost-and-gating)
  - [Asset Log Entry Titles](#asset-log-entry-titles)
  - [Companion Assets](#companion-assets)
  - [Rarities](#rarities)
- [Oracles](#oracles)
  - [Oracle Object Fields](#oracle-object-fields)
  - [Special Oracle Types](#special-oracle-types)
- [Foes](#foes)
- [Delve Themes and Domains](#delve-themes-and-domains)
- [ID Conventions](#id-conventions)

---

## Moves

**Location:** `data/moves/*.json` (10 category files, 48 moves total)

Each file contains one category of moves:

```json
{
  "category": "Adventure",
  "moves": [ ... ]
}
```

### Move Object Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier: `move/kebab-case-name` |
| `name` | string | yes | Display name (e.g., `"Face Danger"`) |
| `category` | string | yes | Must match the file's top-level `category` |
| `triggerShort` | string | yes | One-sentence summary shown on the move tile |
| `trigger` | string (HTML) | yes | Full trigger text with formatting |
| `triggerPreamble` | string (HTML) | no | Opening phrase before stat options (for multi-stat triggers) |
| `triggerPostamble` | string (HTML) | no | Closing phrase after stat options |
| `stats` | array | no | Stat options for rolling (see [Stat Entries](#stat-entries)) |
| `strong` | string (HTML) | no | Strong hit result text |
| `weak` | string (HTML) | no | Weak hit result text |
| `miss` | string (HTML) | no | Miss result text |
| `strongMatch` | string (HTML) | no | Text shown in the log on a strong hit with matching challenge dice (overrides generic match text) |
| `weakMatch` | string (HTML) | no | Text shown in the log on a weak hit with matching challenge dice (overrides generic match text) |
| `missMatch` | string (HTML) | no | Text shown in the log on a miss with matching challenge dice (overrides generic match text) |
| `notes` | string (HTML) | no | Designer notes and guidance |
| `preconditions` | array of objects | no | Conditions that must all be met (AND) for the move tile to be enabled. See [Preconditions](#preconditions). |
| `references` | array of strings | no | Context dropdowns this move's text references (same valid values as `requires`). Unlike `requires`, these don't gate the tile — they inform the dialog/log which context to pull data from. |
| `table` | array | no | Inline outcome table (see [Inline Tables](#inline-tables)) |
| `tableType` | string | no | Table variant: `"askOracle"` or `"delveDepths"` |
| `progressTrack` | string | no | Marks this as a progress move. Value is the track name (`"bonds"`, `"failures"`, `"vows"`, `"journey"`, `"combat"`, `"delve"`). Progress moves skip the d6 action die, ignore momentum, and compare the track value directly against 2d10 challenge dice. Moves with a `stats` entry (bonds, failures) auto-read from the character; moves without `stats` (vows, journey, combat, delve) show a progress spinner (0–10) in the dialog. Track thresholds (e.g., failure track ≥ 6) are encoded via `preconditions`, not hardcoded. |
| `tableRoll` | boolean | no | If `true`, the move's primary action is rolling this table (no action+challenge roll) |
| `rarityRoll` | boolean | no | If `true`, the move rolls a single d6 rarity die |

### Preconditions

The `preconditions` array gates availability in the picker for both moves and assets. Every condition must pass (AND logic) for the tile to be enabled. Each precondition is an object with a `key` and one or more comparison operators. For moves, disabled tiles appear faded with a tooltip. For assets, tiles that fail preconditions are faded out and non-clickable, alongside already-acquired assets.

#### Precondition Object Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | yes | The value to check (see key categories below) |
| `min` | integer | no | Value must be ≥ this (range 1–10) |
| `max` | integer | no | Value must be ≤ this (range 1–10) |
| `eq` | integer | no | Value must equal this exactly |
| `ne` | integer | no | Value must not equal this |

Multiple operators on one precondition are AND'd (e.g., `min: 2, max: 8` means "between 2 and 8 inclusive").

#### Key Categories

| Category | Valid Keys | Values | Notes |
|----------|-----------|--------|-------|
| **Global Selection** | `hasCharacter`, `hasSite`, `hasJourney`, `hasFoe` | `eq: 1` (selected) or `eq: 0` (not selected) | Whether the corresponding dropdown has an active selection |
| **Character Values** | `momentum`, `health`, `spirit`, `supply`, `mana`, `experience`, `edge`, `heart`, `iron`, `shadow`, `wits` | Numeric, use `min`/`max`/`eq`/`ne` | Direct character stat or resource read |
| **Progress Tracks** | `bonds`, `failures` | 1–10 (boxes) | Stored as ticks internally; divided by 4 for comparison |
| **Computed Counts** | `vowCount`, `assetCount`, `companionCount`, `rarityCount` | Numeric | Count of active vows, total assets, companion assets, or assets with a rarity |
| **Initiative** | `initiative` | 0=none, 1=character, 2=foe | Combat initiative state; use `eq` to gate on who has initiative |
| **Debilities** | `wounded`, `shaken`, `unprepared`, `encumbered`, `maimed`, `corrupted`, `cursed`, `tormented` | `eq: 0` (off) or `eq: 1` (on) | Boolean debility flags |
| **Touched** | `touched` | 0=pure, 1=prime, 2=second, 3=third, 4=feral | Numeric scale; use `min`/`max` for thresholds (e.g., `min: 1` = prime or worse) |
| **Assets** | Any asset name (e.g., `"Ritualist"`) | `eq: 0` (lacks) or `eq: 1` (has) | Checks character's asset list by name |

#### Examples

```json
// Combat move — requires character and foe selected
"preconditions": [
  { "key": "hasCharacter", "eq": 1 },
  { "key": "hasFoe", "eq": 1 }
]

// Strike — requires character has initiative
"preconditions": [
  { "key": "hasCharacter", "eq": 1 },
  { "key": "hasFoe", "eq": 1 },
  { "key": "initiative", "eq": 1 }
]

// Clash — requires foe has initiative
"preconditions": [
  { "key": "hasCharacter", "eq": 1 },
  { "key": "hasFoe", "eq": 1 },
  { "key": "initiative", "eq": 2 }
]

// Face Death — requires health at 0
"preconditions": [
  { "key": "hasCharacter", "eq": 1 },
  { "key": "health", "eq": 0 }
]

// Companion Endure Harm — requires at least one companion asset
"preconditions": [
  { "key": "hasCharacter", "eq": 1 },
  { "key": "companionCount", "min": 1 }
]

// Cast Conclave Ritual — requires mana available
"preconditions": [
  { "key": "hasCharacter", "eq": 1 },
  { "key": "mana", "min": 1 }
]

// Learn From Your Failures — requires failure track ≥ 6 boxes
"preconditions": [
  { "key": "hasCharacter", "eq": 1 },
  { "key": "failures", "min": 6 }
]

// Hypothetical — requires Ritualist asset and touched prime or worse
"preconditions": [
  { "key": "hasCharacter", "eq": 1 },
  { "key": "Ritualist", "eq": 1 },
  { "key": "touched", "min": 1 }
]

// Hypothetical — must not be wounded, spirit > 0
"preconditions": [
  { "key": "wounded", "eq": 0 },
  { "key": "spirit", "min": 1 }
]
```

### Stat Entries

The `stats` array defines which stats a character can roll with. Each entry:

```json
{
  "stat": "edge",
  "desc": "With speed, agility, or precision"
}
```

- `stat` — one of: `edge`, `heart`, `iron`, `shadow`, `wits`, `health`, `spirit`, `supply`, `bonds`, `failures`
- `desc` — when to use this stat (shown as a label in the move dialog)

If `stats` is omitted or empty, the move has no action roll (it's log-only or table-only).

When a move has multiple stats, the `triggerPreamble` field provides the text before the stat choices, and the dialog renders stat checkboxes inline. Example:

```json
{
  "triggerPreamble": "When you <strong>attempt something risky</strong>, envision your action and roll. If you act…",
  "stats": [
    { "stat": "edge", "desc": "With speed, agility, or precision" },
    { "stat": "heart", "desc": "With charm, loyalty, or courage" },
    { "stat": "iron", "desc": "With aggressive action, forceful defence, or endurance" },
    { "stat": "shadow", "desc": "With deception, stealth, or trickery" },
    { "stat": "wits", "desc": "With expertise, insight, or observation" }
  ]
}
```

### Outcome Text and HTML

The `strong`, `weak`, `miss`, `notes`, and `trigger` fields all support HTML. Use standard HTML tags:

- `<strong>` for bold emphasis
- `<ul><li>` for bullet lists
- `<em>` for italic emphasis (use sparingly — only for genuine italics, **not** for move references)

For cross-references to other game elements, use the data-driven link tags described below.

### Data-Driven Links

Embed these `<a>` tags in any HTML field (`strong`, `weak`, `miss`, `notes`, `trigger`, `table[].value`) to create interactive links.

#### Move Links

Link to another move. In the move dialog, clicking opens that move's detail dialog. In the log, same behavior with character context preserved.

```html
<a class="move-link" data-id="move/pay-the-price">Pay the Price</a>
```

| Attribute | Description |
|-----------|-------------|
| `class` | Must be `move-link` |
| `data-id` | The target move's `id` field (e.g., `move/endure-harm`) |

The link text should be the move's display name.

#### Resource Links

Link that modifies a character resource. In the log, clicking applies the change to the character who rolled. In the move dialog, styled but not clickable (no character context).

```html
<a class="resource-link" data-resource="momentum" data-value="+1">+1 momentum</a>
<a class="resource-link" data-resource="health" data-value="-2">−2 health</a>
```

| Attribute | Description |
|-----------|-------------|
| `class` | Must be `resource-link` |
| `data-resource` | One of: `momentum`, `health`, `spirit`, `supply`, `bonds`, `failures`, `xp` (plus `mana` in [Yrt](DATA_FORMAT_YRT.md#mana-resource)) |
| `data-value` | Signed integer: `+1`, `+2`, `-1`, `-2`, etc. |

Resources are clamped to their valid ranges:

| Resource | Range | Log Color |
|----------|-------|-----------|
| `momentum` | −6 to dynamic max | blue (`#60a5fa`) |
| `health` | 0–5 | red (`#f87171`) |
| `spirit` | 0–5 | purple (`#a78bfa`) |
| `supply` | 0–5 | green (`#34d399`) |
| `bonds` | 0–40 | blue (`#60a5fa`) |
| `failures` | 0–40 | red (`#f87171`) |
| `xp` | 0–30 | yellow (`#facc15`) |

See [Yrt extensions](DATA_FORMAT_YRT.md#mana-resource) for the `mana` resource (0–10, amber `#f59e0b`).

The `xp` resource is used in log entries generated by the asset system: −3 experience when acquiring a new asset, −2 experience when upgrading an ability slot. These links are created in JavaScript, not in the JSON data files.

Use the `−` character (U+2212, minus sign) in the display text for negative values, not a plain hyphen.

#### Debility Links

Link that marks or clears a debility. In the log, clicking toggles the debility on the character. In the move dialog, styled but not clickable.

```html
<a class="debility-link" data-debility="wounded" data-value="1">wounded</a>
<a class="debility-link" data-debility="wounded" data-value="0">wounded</a>
```

| Attribute | Description |
|-----------|-------------|
| `class` | Must be `debility-link` |
| `data-debility` | One of: `wounded`, `maimed`, `shaken`, `corrupted`, `cursed`, `tormented`, `unprepared`, `encumbered` |
| `data-value` | `1` to mark the debility, `0` to clear it |

#### Progress Links

Link that marks progress on one of the character's progress tracks (vows, bonds, failures, threats). In the log, clicking opens a popup listing the character's available tracks to mark. In the move dialog, styled but not clickable.

```html
<a class="progress-link" data-value="1">Mark progress</a>
<a class="progress-link" data-value="2">Mark progress twice</a>
```

| Attribute | Description |
|-----------|-------------|
| `class` | Must be `progress-link` |
| `data-value` | Positive integer: number of times to mark progress (usually `1`, `2` for "mark progress twice") |

When clicked in the log, the user selects which track to mark from a popup showing:
- **Vows** — each active (unfulfilled) vow, marking by difficulty-based ticks (VOW_MARK_TICKS)
- **Bonds** — single track, +1 tick per mark
- **Failures** — single track, +1 tick per mark
- **Threats** — each vow's threat track (where threat name is non-empty), +1 menace per mark

The link gets the `applied` CSS class after use, preventing double-application (same pattern as resource-link and debility-link).

#### Menace Links

Link that marks menace progress on a vow's threat track. In the log, clicking opens a popup listing the character's vows that have threat tracks.

```html
<a class="menace-link" data-value="1">Mark menace</a>
<a class="menace-link" data-value="2">Mark menace twice</a>
```

| Attribute | Description |
|-----------|-------------|
| `class` | Must be `menace-link` |
| `data-value` | Positive integer: number of times to mark menace |

#### Initiative Links

Link that sets combat initiative. In the log, clicking sets whether the character or the foe has initiative.

```html
<a class="initiative-link" data-value="character">You are in control</a>
<a class="initiative-link" data-value="foe">You are in a bad spot</a>
```

| Attribute | Description |
|-----------|-------------|
| `class` | Must be `initiative-link` |
| `data-value` | Either `"character"` (player has initiative) or `"foe"` (foe has initiative) |

#### Oracle Links

Link that rolls an oracle table inline. Used in asset ability text and move outcome text.

```html
<a class="oracle-link" data-oracle="manaBacklash">Mana Backlash Oracle</a>
```

| Attribute | Description |
|-----------|-------------|
| `class` | Must be `oracle-link` |
| `data-oracle` | The oracle table's `key` value (e.g., `"manaBacklash"`, `"monstrosityPrimaryForm"`) |

### Context-Aware Visibility (log-only / dialog-only)

When outcome text needs to differ between the move dialog and the log, use `<span>` elements with `log-only` or `dialog-only` CSS classes:

- `class="log-only"` — visible in the log (`.entry-body`), hidden in the move dialog (`.move-body`)
- `class="dialog-only"` — visible in the move dialog (`.move-body`), hidden in the log (`.entry-body`)

This replaces the old `weakRef`/`missRef` system. When a weak hit says "As above," the full referenced text is inlined in the outcome but wrapped in `log-only` so it only appears in the log.

```json
{
  "strong": "Your care is helpful. Clear wounded. Take +2 health.",
  "weak": "<span class=\"log-only\">Your care is helpful. Clear wounded. Take +2 health. </span><span class=\"dialog-only\">As above, but you</span><span class=\"log-only\">You</span> must suffer −1 supply or −1 momentum (your choice)."
}
```

**In the move dialog:** "As above, but you must suffer −1 supply or −1 momentum (your choice)."
**In the log:** "Your care is helpful. Clear wounded. Take +2 health. You must suffer −1 supply or −1 momentum (your choice)."

### Match Text (strongMatch / weakMatch / missMatch)

When both challenge dice show the same number (a *match*), the log appends additional guidance text after the outcome text. Generic defaults are used unless a move provides its own match text via the `strongMatch`, `weakMatch`, or `missMatch` fields.

**Generic defaults:**

| Outcome | Default match text |
|---------|-------------------|
| Strong Hit | "On a match, you may introduce an extraordinary twist, find an unexpected opportunity, or gain a dramatic advantage." |
| Weak Hit | "On a match, you may introduce an unexpected complication, a surprising turn of events, or a new danger." |
| Miss | "On a match, you should introduce a dire threat, a devastating revelation, or a catastrophic turn of events." |

**Override example:**

```json
{
  "strongMatch": "On a match, you also discover a hidden cache of supplies. Take +2 supply.",
  "weakMatch": "On a match, an ally is put in danger by the same threat.",
  "missMatch": "On a match, the threat escalates beyond what you imagined."
}
```

Match text is styled with a purple left border in the log and appears after the outcome text block.

### Inline Tables

Some moves have a `table` array for conditional outcomes (e.g., Endure Harm's miss table, Pay the Price).

#### Standard Table

```json
{
  "table": [
    { "topRange": 10, "value": "The harm is mortal. <a class=\"move-link\" data-id=\"move/face-death\">Face Death</a>." },
    { "topRange": 35, "value": "You are unconscious." },
    { "topRange": 100, "value": "You are battered but still standing." }
  ]
}
```

- `topRange` — upper boundary of the d100 roll for this entry (ranges are contiguous; entry covers `prevTopRange+1` to `topRange`)
- `value` — result text (HTML with data-driven links supported)

#### Ask the Oracle Table (`tableType: "askOracle"`)

```json
{
  "tableType": "askOracle",
  "table": [
    { "topRange": 10, "value": { "odds": "Almost Certain", "threshold": 11 } },
    { "topRange": 50, "value": { "odds": "50/50", "threshold": 51 } }
  ]
}
```

Each entry's `value` is an object with `odds` (label) and `threshold` (minimum d100 roll for "Yes").

#### Delve Depths Table (`tableType: "delveDepths"`)

```json
{
  "tableType": "delveDepths",
  "table": [
    { "edge": 45, "shadow": 30, "wits": 40, "value": "Mark progress and Reveal a Danger." },
    { "edge": 65, "shadow": 65, "wits": 55, "value": "Mark progress." }
  ]
}
```

Each entry has per-stat `topRange` values (`edge`, `shadow`, `wits`) instead of a single `topRange`. The roll is resolved against the stat the player chose.

### Special Move Types

#### Table-Roll Moves (`tableRoll: true`)

The move's primary action is rolling its inline table (no action die + challenge dice). Example: Advance a Threat, Pay the Price.

#### Rarity-Roll Moves (`rarityRoll: true`)

The move rolls a single d6 "rarity die" instead of the normal action + challenge roll. Example: Wield a Rarity.

#### Log-Only Moves

Moves with no `strong`/`weak`/`miss`, no `tableRoll`, and no `rarityRoll` are log-only — clicking "Log" just records the move name in the history. Example: Take a Hiatus.

---

## Assets

**Location:** `data/assets/*.json` (3 source files)

Each file contains an `assets` array and an optional `rarities` array:

```json
{
  "assets": [ ... ],
  "rarities": [ ... ]
}
```

### Asset Object Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier: `category-type/kebab-case-name` (e.g., `combat/archer`) |
| `name` | string | yes | Display name |
| `category` | string | yes | One of: `"Combat Talent"`, `"Companion"`, `"Path"`, `"Ritual"` (plus `"Touched"` in [Yrt](DATA_FORMAT_YRT.md#touched-assets)) |
| `summary` | string | yes | One-line plain-text summary shown in the picker tile (falls back to `preamble` if absent) |
| `preamble` | string or null | no | Prerequisite or flavour text (e.g., `"If you wield a bow."`) — displayed on the asset card **before** the ability list checkboxes |
| `postamble` | string or null | no | Explanatory text displayed on the asset card **after** the ability list checkboxes (e.g., asset-specific constraints, Touched feature-use note) |
| `preconditions` | array of objects | no | Conditions that must be met to add this asset. Same schema as move [Preconditions](#preconditions). Assets failing preconditions are faded and non-clickable in the picker. |
| `abilities` | array | yes | Exactly 3 ability objects |

Each ability object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enabled` | boolean | yes | `true` if the ability starts checked when the asset is first acquired (see [Auto-Enabled Abilities](#auto-enabled-abilities)) |
| `text` | string (HTML) | yes | Ability description |
| `name` | string | no | Named ability (companions only, e.g., `"Scout"`, `"Bonded"`) |

### Auto-Enabled Abilities

When a character acquires an asset, each ability checkbox is pre-set to `ability.enabled`. The convention by category is:

| Category | First ability starts | Other abilities start |
|----------|---------------------|-----------------------|
| **Path** | ✓ Enabled | ✗ Unchecked |
| **Ritual** | ✓ Enabled | ✗ Unchecked |
| **Combat Talent** | ✓ Enabled | ✗ Unchecked |
| **Companion** | ✗ Unchecked | ✗ Unchecked |
| **Touched** (Yrt) | ✓ Enabled | ✗ Unchecked |

Per the Ironsworn printable asset sheet: Paths, Rituals, and Combat Talents include their first ability when acquired (filled circle on the card). Companions start with no abilities pre-enabled — all three must be purchased with 2 XP each.

### XP Cost and Gating

The UI enforces XP requirements for asset-related actions:

| Action | XP Cost | Gate |
|--------|---------|------|
| Acquire a new asset | 3 XP | `+ Asset` button disabled when `xp < 3` |
| Enable a new ability checkbox | 2 XP | Ability checkbox disabled when `xp < 2` |
| Unlock a rarity | `rarity.xpCost` XP | Rarity checkbox disabled when `xp < rarity.xpCost` |

Disabling a previously-enabled ability has no XP cost and is always allowed.

Each XP-costing action appends a log entry whose body includes a **clickable XP cost link**. Clicking the link deducts the cost from the character's `xp` and strikes through the link to prevent double-use. These links are generated by `AssetsSection.svelte` and `AssetCard.svelte` (not from JSON data), using `<a class="xp-cost-link">` elements with `data-entry-id` and `data-cost` attributes. The link text uses the `−` character (U+2212).

### Asset Log Entry Titles

All asset log entries are titled `{characterName} — Assets` (e.g., `Porcius Mona — Assets`). Within each entry body:

- **Add asset:** `Asset added: **Name** *(Category)* −3 experience` (XP link)
- **Enable ability:** `Ability: **Name** #N — **enabled** −2 experience` (XP link)
- **Disable ability:** `Ability: **Name** #N — **disabled**` (no cost)
- **Acquire rarity:** `Rarity acquired: **RARITY: Name** for **Asset** −N experience` (XP link)
- **Remove rarity:** `Rarity removed: **RARITY: Name** from **Asset**`
- **Remove asset:** `Asset removed: **Name** (Category, N marked)`

Rarity names are always displayed with the `RARITY:` prefix in both the asset card UI and log entries.

### Companion Assets

Companion assets add a health track:

```json
{
  "id": "companion/hawk",
  "name": "Hawk",
  "category": "Companion",
  "companionHealthMax": 3,
  "abilities": [
    { "enabled": false, "name": "Far-seeing", "text": "..." },
    { "enabled": false, "name": "Fierce", "text": "..." },
    { "enabled": false, "name": "Bonded", "text": "..." }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `companionHealthMax` | number | Maximum companion health (typically 3–5) |

Yrt adds Touched assets and ritual cantrips — see [DATA_FORMAT_YRT.md](DATA_FORMAT_YRT.md#touched-assets).

### Rarities

Rarity enhancements for existing assets:

```json
{
  "id": "rarity/hawks-eye-bow",
  "name": "Hawk's Eye Bow",
  "assetId": "combat/archer",
  "xpCost": 3,
  "description": "A bow crafted with uncanny precision..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier: `rarity/kebab-case-name` |
| `name` | string | Display name |
| `assetId` | string | The `id` of the asset this rarity enhances |
| `xpCost` | number | Experience cost to unlock |
| `description` | string | Narrative description |

---

## Oracles

**Location:** `data/oracles/*.json` (49 table files)

Each file is a single oracle table:

```json
{
  "key": "action",
  "title": "Action",
  "group": "Core Ironsworn",
  "selectLabel": "Action",
  "description": "Use this oracle to...",
  "data": [
    { "topRange": 1, "value": "Scheme" },
    { "topRange": 2, "value": "Clash" },
    ...
    { "topRange": 100, "value": "Defy" }
  ]
}
```

### Oracle Object Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | yes | Unique identifier in camelCase (e.g., `"action"`, `"settlementName"`) |
| `title` | string | yes | Display title |
| `group` | string | yes | Grouping label (e.g., `"Core Ironsworn"`, `"Delve"`, `"Yrt"`) |
| `selectLabel` | string | yes | Label for the dropdown selector |
| `description` | string | no | Guidance text for how to use the oracle |
| `data` | array | yes | Array of oracle entries |

Each oracle entry:

| Field | Type | Description |
|-------|------|-------------|
| `topRange` | number | Upper boundary of the d100 range |
| `value` | string or object | Result text (string) or structured data (see special types) |

### Special Oracle Types

Most oracles have simple string values. Some have structured data:

- **Settlement Name** (`settlementName`): Entries have `description` and a `subtable` array of `{ topRange, value }` entries for two-step generation.
- **Names Other** (`namesOther`): Entries have `giants`, `varou`, `trolls` fields instead of a single `value`.

Yrt adds additional oracle tables with structured values — see [DATA_FORMAT_YRT.md](DATA_FORMAT_YRT.md#yrt-oracles).

---

## Foes

**Location:** `data/foes/*.json` (3 source files)

Each file contains a `foes` array:

```json
{
  "foes": [ ... ]
}
```

### Foe Object Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier: `source/kebab-case-name` (e.g., `ironsworn/broken`, `yrt/mana-wraith`) |
| `name` | string | yes | Display name |
| `rank` | number | yes | Difficulty rank (1–5, higher = harder) |
| `nature` | string | yes | Category (e.g., `"Ironlander"`, `"Horror"`, `"Beast"`, `"Creature"`) |
| `features` | array of strings | yes | 2–5 descriptive physical/behavioral characteristics |
| `drives` | array of strings | yes | 1–2 motivational drivers |
| `tactics` | array of strings | yes | 2–4 combat or conflict approaches |
| `description` | string | yes | Narrative background description |

Foe portraits are stored as images at `images/foes/{id-slug}.png` (matching the foe's id, with `/` replaced by `-`).

---

## Delve Themes and Domains

**Location:** `data/delve/*.json` (4 lookup files)

- `delve-theme-features.json` — Feature tables keyed by theme name
- `delve-theme-dangers.json` — Danger tables keyed by theme name
- `delve-domain-features.json` — Feature tables keyed by domain name
- `delve-domain-dangers.json` — Danger tables keyed by domain name

Each file is a JSON object with theme/domain names as keys:

```json
{
  "Ancient": [
    { "topRange": 4, "value": "Evidence of lost knowledge" },
    { "topRange": 8, "value": "Inscrutable relics" },
    ...
  ],
  "Corrupted": [
    { "topRange": 4, "value": "Mystic focus or conduit" },
    ...
  ]
}
```

Each entry has `topRange` (d100 boundary) and `value` (result text). These tables typically have 5 entries per theme/domain, covering the first 20% of the d100 range (the remaining 80% is handled by shared tables at the Delve site level).

---

## ID Conventions

All IDs follow a `prefix/kebab-case-name` format for consistency and future localization support:

| Data Type | Format | Examples |
|-----------|--------|----------|
| Moves | `move/kebab-case-name` | `move/face-danger`, `move/endure-harm` |
| Assets | `category/kebab-case-name` | `combat/archer`, `companion/hawk` |
| Rarities | `rarity/kebab-case-name` | `rarity/hawks-eye-bow` |
| Foes | `source/kebab-case-name` | `ironsworn/broken`, `yrt/mana-wraith` |
| Oracles | camelCase `key` field | `action`, `settlementName` |

IDs must be unique within their data type and stable across versions (they are referenced by saved game data and cross-references in other JSON files).
