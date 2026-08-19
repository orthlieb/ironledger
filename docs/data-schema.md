# Iron Ledger Data Schema Reference

This document describes the JSON data formats used by Iron Ledger for Ironsworn and Delve **catalogue/content** data (moves, assets, oracles, foes, delve tables). Base and Delve content lives under `apps/api/data/`; expansions ship as self-contained **extensions** under `extensions/<id>/` (per-source file locations below reflect the base/delve layout). Everything is merged via the extensions manifest and served to the web app on demand via the API's catalogue endpoints.

> For the **user-data export/import** JSON (characters, expeditions, connections, the session log, and the "everything" bundle), see [import-schema.md](import-schema.md).

> For how expansions are packaged and how to author one, see **[extensions.md](extensions.md)**.

For Yrt homebrew extensions (mana, Touched assets, cantrips, Yrt-specific oracles and foes), see **[the Yrt extension docs](../extensions/yrt/README.md)**.

## Table of Contents

- [Moves](#moves)
  - [Move Object Fields](#move-object-fields)
  - [Preconditions](#preconditions)
  - [Stat Entries](#stat-entries)
  - [Outcome Text (markdown + link DSL)](#outcome-text-markdown--link-dsl)
  - [Data-Driven Links](#data-driven-links)
  - [Context-Aware Visibility (log-only / dialog-only)](#context-aware-visibility-log-only--dialog-only)
  - [Match Text (strongMatch / weakMatch / missMatch)](#match-text-strongmatch--weakmatch--missmatch)
  - [Inline Tables](#inline-tables)
  - [Special Move Types](#special-move-types)
- [Assets](#assets)
  - [Asset Object Fields](#asset-object-fields)
  - [Move Links in Ability Text](#move-links-in-ability-text)
  - [Auto-Enabled Abilities](#auto-enabled-abilities)
  - [XP Cost and Gating](#xp-cost-and-gating)
  - [Asset Log Entry Titles](#asset-log-entry-titles)
  - [Companion Assets](#companion-assets)
  - [Counter Icons](#counter-icons)
  - [Assets with Optional Fields — Examples](#assets-with-optional-fields--examples)
  - [Rarities](#rarities)
  - [Asset Move References (asset-move-refs.json)](#asset-move-references-asset-move-refsjson)
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

| Field              | Type              | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | string            | yes      | Unique identifier: `move/kebab-case-name`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `name`             | string            | yes      | Display name (e.g., `"Face Danger"`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `category`         | string            | yes      | Must match the file's top-level `category`                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `triggerShort`     | string            | yes      | One-sentence summary shown on the move tile                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `trigger`          | string (md+DSL)   | yes      | Full trigger text with formatting                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `triggerPreamble`  | string (md+DSL)   | no       | Opening phrase before stat options (for multi-stat triggers)                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `triggerPostamble` | string (md+DSL)   | no       | Closing phrase after stat options                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `stats`            | array             | no       | Stat options for rolling (see [Stat Entries](#stat-entries))                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `strong`           | string (md+DSL)   | no       | Strong hit result text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `weak`             | string (md+DSL)   | no       | Weak hit result text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `miss`             | string (md+DSL)   | no       | Miss result text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `strongMatch`      | string (md+DSL)   | no       | Text shown in the log on a strong hit with matching challenge dice (overrides generic match text)                                                                                                                                                                                                                                                                                                                                                                                                          |
| `weakMatch`        | string (md+DSL)   | no       | Text shown in the log on a weak hit with matching challenge dice (overrides generic match text)                                                                                                                                                                                                                                                                                                                                                                                                            |
| `missMatch`        | string (md+DSL)   | no       | Text shown in the log on a miss with matching challenge dice (overrides generic match text)                                                                                                                                                                                                                                                                                                                                                                                                                |
| `notes`            | string (md+DSL)   | no       | Designer notes and guidance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `preconditions`    | array of objects  | no       | Conditions that must all be met (AND) for the move tile to be enabled. See [Preconditions](#preconditions).                                                                                                                                                                                                                                                                                                                                                                                                |
| `references`       | array of strings  | no       | Context dropdowns this move's text references (same valid values as `requires`). Unlike `requires`, these don't gate the tile — they inform the dialog/log which context to pull data from.                                                                                                                                                                                                                                                                                                                |
| `table`            | array             | no       | Inline outcome table (see [Inline Tables](#inline-tables))                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `tableType`        | string            | no       | Table variant: `"askOracle"` or `"delveDepths"`                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `progressTrack`    | string            | no       | Marks this as a progress move. Value is the track name (`"bonds"`, `"failures"`, `"vows"`, `"journey"`, `"combat"`, `"delve"`). Progress moves skip the d6 action die, ignore momentum, and compare the track score directly against 2d10 challenge dice. Adds are still adjustable and applied on top of the progress score. Track thresholds (e.g., failure track ≥ 6) are encoded via `preconditions`, not hardcoded.                                                                                   |
| `progressSource`   | string            | no       | For progress moves: identifies which runtime track provides the score. Valid values: `"combat"` (active foe encounter ticks ÷ 4), `"journey"` (active journey expedition ticks ÷ 4), `"delve"` (active site expedition ticks ÷ 4), `"bonds"` (character bonds ticks ÷ 4), `"failures"` (character failures ticks ÷ 4), `"vows"` (placeholder — shows 0 until individual vow routing is implemented). Defaults to `"combat"` if omitted. This field pairs with the `progressContext` prop on `MovesDialog`. |
| `tableRoll`        | boolean           | no       | If `true`, the move's primary action is rolling this table (no action+challenge roll)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `rarityRoll`       | boolean           | no       | If `true`, the move rolls a single d6 rarity die                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `logTitle`         | string (template) | no       | Template for the session log entry title. Supports placeholder variables: `{character}` (active character name), `{stat}` (stat label used in the roll), `{expedition}` (active expedition/site/journey name), `{foe}` (active foe name), `{move}` (move's literal name). Falls back to `{character} — {move name} ({stat})` or `{character} — {move name}` when omitted.                                                                                                                                  |
| `html`             | boolean           | no       | Escape hatch: when `true`, this move's prose fields are treated as **raw legacy HTML** (hand-written `<a class="…">` links) and bypass `renderRich`. Omit for normal moves — prose is markdown + the link DSL by default (see [Outcome Text](#outcome-text-markdown--link-dsl)). The DSL lint skips `html: true` moves.                                                                                                                                                                                    |

### Preconditions

The `preconditions` array gates availability in the picker for both moves and assets. Every condition must pass (AND logic) for the tile to be enabled. Each precondition is an object with a `key` and one or more comparison operators. For moves, disabled tiles appear faded with a tooltip. For assets, tiles that fail preconditions are faded out and non-clickable, alongside already-acquired assets.

#### Precondition Object Fields

| Field | Type    | Required | Description                                   |
| ----- | ------- | -------- | --------------------------------------------- |
| `key` | string  | yes      | The value to check (see key categories below) |
| `min` | integer | no       | Value must be ≥ this (range 1–10)             |
| `max` | integer | no       | Value must be ≤ this (range 1–10)             |
| `eq`  | integer | no       | Value must equal this exactly                 |
| `ne`  | integer | no       | Value must not equal this                     |

Multiple operators on one precondition are AND'd (e.g., `min: 2, max: 8` means "between 2 and 8 inclusive").

#### Key Categories

| Category             | Valid Keys                                                                                                | Values                                       | Notes                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| **Global Selection** | `hasCharacter`, `hasSite`, `hasJourney`, `hasFoe`                                                         | `eq: 1` (selected) or `eq: 0` (not selected) | Whether the corresponding dropdown has an active selection                      |
| **Character Values** | `momentum`, `health`, `spirit`, `supply`, `mana`, `experience`, `edge`, `heart`, `iron`, `shadow`, `wits` | Numeric, use `min`/`max`/`eq`/`ne`           | Direct character stat or resource read                                          |
| **Progress Tracks**  | `bonds`, `failures`                                                                                       | 1–10 (boxes)                                 | Stored as ticks internally; divided by 4 for comparison                         |
| **Computed Counts**  | `vowCount`, `assetCount`, `companionCount`, `rarityCount`                                                 | Numeric                                      | Count of active vows, total assets, companion assets, or assets with a rarity   |
| **Initiative**       | `initiative`                                                                                              | 0=none, 1=character, 2=foe                   | Combat initiative state; use `eq` to gate on who has initiative                 |
| **Debilities**       | `wounded`, `shaken`, `unprepared`, `encumbered`, `maimed`, `corrupted`, `cursed`, `tormented`             | `eq: 0` (off) or `eq: 1` (on)                | Boolean debility flags                                                          |
| **Touched**          | `touched`                                                                                                 | 0=pure, 1=prime, 2=second, 3=third, 4=feral  | Numeric scale; use `min`/`max` for thresholds (e.g., `min: 1` = prime or worse) |
| **Assets**           | Any asset name (e.g., `"Ritualist"`)                                                                      | `eq: 0` (lacks) or `eq: 1` (has)             | Checks character's asset list by name                                           |

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

### Outcome Text (markdown + link DSL)

The `strong`, `weak`, `miss`, `notes`, `trigger`, and `table[].value` fields are
authored in **markdown + the interactive-link DSL**, rendered by `renderRich`
(`$lib/dsl.ts`). This is the default — no per-move flag is needed.

- **Prose formatting** is mini-markdown: `**bold**`, `*italic*`, `-` / `*`
  bullet lists, `1.` ordered lists, blank-line paragraphs. (Raw HTML tags are
  **not** allowed in DSL content — the lint rejects them.)
- **Cross-references** to other game elements are markdown links with a known
  scheme: `[label](scheme:path?args)`. Each scheme compiles to the interactive
  `<a class="…" data-…>` HTML documented below; the app's click handlers
  (`enrichOutcomeLinks`, `resolveHarmLinks`) wire up the emitted markup.
- **`html: true`** on a move is the escape hatch: that move's fields are treated
  as raw legacy HTML (the `<a class="…">` forms below, hand-written) and skip
  `renderRich`. Use only for a construct the DSL can't express; the lint skips
  `html: true` moves.

Query args are parsed **leniently**: `+` stays literal (it is _not_ decoded to a
space), and `&` separates args. So `resource:momentum?value=+1` yields
`data-value="+1"`.

### Data-Driven Links

Authored as `[label](scheme:path?args)` markdown links in any prose field
(`strong`, `weak`, `miss`, `notes`, `trigger`, `table[].value`). Each row below
gives the DSL form and the HTML it compiles to. (Under `html: true`, hand-write
the compiled HTML instead.)

#### Move Links

Link to another move. In the move dialog, clicking opens that move's detail dialog. In the log, same behavior with character context preserved.

```text
[Pay the Price](move:pay-the-price)
[Endure Harm](move:endure-harm?harm=1)   ← optional data-harm
```

compiles to:

```html
<a class="move-link" data-id="move/pay-the-price">Pay the Price</a>
```

| DSL         | Description                                                        |
| ----------- | ------------------------------------------------------------------ |
| `move:<id>` | Target move's `id` **without** the `move/` prefix (e.g. `heal`)    |
| `?harm=<n>` | _(optional)_ numeric `data-harm`, for moves that carry a harm hint |

The link text (label) should be the move's display name.

#### Resource Links

Link that modifies a character resource. In the log, clicking applies the change to the character who rolled. In the move dialog, styled but not clickable (no character context).

```text
[+1 momentum](resource:momentum?value=+1)
[−2 health](resource:health?value=-2)
```

compiles to:

```html
<a class="resource-link" data-resource="momentum" data-value="+1">+1 momentum</a>
<a class="resource-link" data-resource="health" data-value="-2">−2 health</a>
```

| Part              | Description                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `resource:<name>` | One of: `momentum`, `health`, `spirit`, `supply`, `bonds`, `failures`, `xp` (plus `mana` in [Yrt](../extensions/yrt/README.md#mana-resource)) |
| `?value=<signed>` | Signed integer: `+1`, `+2`, `-1`, `-2`, etc. (`+` is kept literal)                                                                            |

Resources are clamped to their valid ranges:

| Resource   | Range             | Log Color          |
| ---------- | ----------------- | ------------------ |
| `momentum` | −6 to dynamic max | blue (`#60a5fa`)   |
| `health`   | 0–5               | red (`#f87171`)    |
| `spirit`   | 0–5               | purple (`#a78bfa`) |
| `supply`   | 0–5               | green (`#34d399`)  |
| `bonds`    | 0–40              | blue (`#60a5fa`)   |
| `failures` | 0–40              | red (`#f87171`)    |
| `xp`       | 0–30              | yellow (`#facc15`) |

See [Yrt extensions](../extensions/yrt/README.md#mana-resource) for the `mana` resource (0–10, amber `#f59e0b`).

The `xp` resource is used in log entries generated by the asset system: −3 experience when acquiring a new asset, −2 experience when upgrading an ability slot. These links are created in JavaScript, not in the JSON data files.

Use the `−` character (U+2212, minus sign) in the display text for negative values, not a plain hyphen.

#### Debility Links

Link that marks or clears a debility. In the log, clicking toggles the debility on the character. In the move dialog, styled but not clickable.

```text
[wounded](debility:wounded?value=1)   ← mark
[wounded](debility:wounded?value=0)   ← clear
```

compiles to `<a class="debility-link" data-debility="wounded" data-value="1">wounded</a>`.

| Part              | Description                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| `debility:<name>` | One of: `wounded`, `maimed`, `shaken`, `corrupted`, `cursed`, `tormented`, `unprepared`, `encumbered` |
| `?value=<0\|1>`   | `1` to mark the debility, `0` to clear it                                                             |

#### Progress Links

Link that marks progress on a named progress track. In the log, clicking marks the track (opening a picker where the track is ambiguous). In the move dialog, styled but not clickable.

```text
[mark combat progress](progress:combat?value=1)
[mark progress twice](progress:journey?value=2)
```

compiles to `<a class="progress-link" data-track="combat" data-value="1">…</a>`.

| Part               | Description                                                                      |
| ------------------ | -------------------------------------------------------------------------------- |
| `progress:<track>` | One of: `combat`, `delve`, `journey`, `bonds`, `failures`, `quest`, `expedition` |
| `?value=<n>`       | Positive integer: number of times to mark (usually `1`, `2`)                     |

The link gets the `applied` CSS class after use, preventing double-application (same pattern as resource-link and debility-link).

#### Menace Links

Link that marks menace progress on a vow's threat track. In the log, clicking opens a popup listing the character's vows that have threat tracks.

```text
[Mark menace](menace:1)
[Mark menace twice](menace:2)
```

compiles to `<a class="menace-link" data-value="1">Mark menace</a>`.

| Part         | Description                                      |
| ------------ | ------------------------------------------------ |
| `menace:<n>` | Positive integer: number of times to mark menace |

#### Reset-Track Links

Link that clears a named progress track to 0 ticks. In the log, clicking zeroes the track and logs the change. In the move dialog, styled but not clickable.

```text
[clear all progress](reset:failures)
```

compiles to `<a class="reset-track-link" data-track="failures">clear all progress</a>`.

| Part            | Description                                                                              |
| --------------- | ---------------------------------------------------------------------------------------- |
| `reset:<track>` | Name of the character track to reset: `failures`, `bonds`, or any other tick-count track |

After clicking, the link receives strikethrough styling (`.resource-spent`) to prevent double-application. A log entry is appended confirming the old value and the reset to 0.

Used in **Learn From Your Failures** outcomes to let the player clear the failure track after spending it.

#### Initiative Links

Link that sets combat initiative. In the log, clicking sets whether the character or the foe has initiative.

```text
[You are in control](initiative:character)
[You are in a bad spot](initiative:foe)
```

compiles to `<a class="initiative-link" data-value="character">You are in control</a>`.

| Part                 | Description                                         |
| -------------------- | --------------------------------------------------- |
| `initiative:<value>` | Either `character` (player has initiative) or `foe` |

#### Oracle Links

Link that opens an oracle table. Used in asset ability text and move outcome text.

```text
[Mana Backlash Oracle](oracle:manaBacklash)
```

compiles to `<a class="oracle-link" data-oracle="manaBacklash">Mana Backlash Oracle</a>`.

| Part           | Description                                                                             |
| -------------- | --------------------------------------------------------------------------------------- |
| `oracle:<key>` | The oracle table's `key` (e.g. `manaBacklash`, `monstrosityPrimaryForm`, `delveDepths`) |

**Stat-aware oracle links** — for multi-stat oracles (e.g. `delveDepths`) whose
column depends on which stat was rolled, author a plain `[…](oracle:delveDepths)`
with **no** stat; `MovesDialog` injects `data-stat` (`edge` / `shadow` / `wits`)
at log-write time. Do **not** encode the stat in the source. `LogPanel` reads
the injected `data-stat` and passes it to `OraclesDialog.open(key, undefined,
stat)`, which pre-selects and highlights the matching column.

#### Harm Links

A **display-only** placeholder replaced with the actual harm amount when a move result is logged. Used exclusively in Endure Harm and Endure Stress outcome text; not interactive.

```text
[-harm health](harm:health)
[-harm spirit](harm:spirit)
```

compiles to `<a class="harm-link" data-resource="health">-harm health</a>`.

| Part         | Description                                     |
| ------------ | ----------------------------------------------- |
| `harm:<res>` | The resource being harmed: `health` or `spirit` |

The label `-harm {resource}` is a static placeholder; when the move is logged the UI substitutes the actual harm value that was suffered. Clicking this element has no effect.

#### Vanquish Links

Link that resolves an active foe (Battle / a decisive blow). Takes no argument.

```text
[vanquish it](vanquish)
```

compiles to `<a class="vanquish-foe-link">vanquish it</a>`.

### Context-Aware Visibility (log-only / dialog-only)

When outcome text needs to differ between the move dialog and the log, wrap the
context-specific text in a `[text]{.class}` DSL span:

- `[…]{.log-only}` — visible in the log (`.entry-body`), hidden in the move dialog (`.move-body`)
- `[…]{.dialog-only}` — visible in the move dialog (`.move-body`), hidden in the log (`.entry-body`)

A span may itself wrap DSL links (e.g. a log-only restatement that includes
`[+2 health](resource:health?value=+2)`). This replaces the old `weakRef` /
`missRef` system: when a weak hit says "As above," the full referenced text is
inlined in the outcome but wrapped in `log-only` so it only appears in the log.

```json
{
  "strong": "Your care is helpful. Clear [wounded](debility:wounded?value=0). Take [+2 health](resource:health?value=+2).",
  "weak": "[Your care is helpful. Clear [wounded](debility:wounded?value=0). Take [+2 health](resource:health?value=+2). ]{.log-only}[As above, but you]{.dialog-only}[You]{.log-only} must suffer [−1 supply](resource:supply?value=-1) or [−1 momentum](resource:momentum?value=-1) (your choice)."
}
```

**In the move dialog:** "As above, but you must suffer −1 supply or −1 momentum (your choice)."
**In the log:** "Your care is helpful. Clear wounded. Take +2 health. You must suffer −1 supply or −1 momentum (your choice)."

### Match Text (strongMatch / weakMatch / missMatch)

When both challenge dice show the same number (a _match_), the log appends additional guidance text after the outcome text. Generic defaults are used unless a move provides its own match text via the `strongMatch`, `weakMatch`, or `missMatch` fields.

**Generic defaults:**

| Outcome    | Default match text                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| Strong Hit | "On a match, you may introduce an extraordinary twist, find an unexpected opportunity, or gain a dramatic advantage." |
| Weak Hit   | "On a match, you may introduce an unexpected complication, a surprising turn of events, or a new danger."             |
| Miss       | "On a match, you should introduce a dire threat, a devastating revelation, or a catastrophic turn of events."         |

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
    {
      "topRange": 10,
      "value": "The harm is mortal. <a class=\"move-link\" data-id=\"move/face-death\">Face Death</a>."
    },
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

#### Progress Moves (`progressTrack` + `progressSource`)

Progress moves roll the track score vs 2d10 (no d6 action die, no stat, no momentum). The `progressTrack` field classifies the move; the `progressSource` field tells the dialog where to read the score from at runtime.

The six progress moves and their sources:

| Move                     | `progressSource` | Runtime Source                               |
| ------------------------ | ---------------- | -------------------------------------------- |
| End the Fight            | `"combat"`       | Active foe encounter (ticks ÷ 4)             |
| Reach Your Destination   | `"journey"`      | Active journey expedition (ticks ÷ 4)        |
| Locate Your Objective    | `"delve"`        | Active site expedition (ticks ÷ 4)           |
| Fulfill Your Vow         | `"vows"`         | Placeholder (0) — individual vow routing TBD |
| Write Your Epilogue      | `"bonds"`        | Character bonds track (ticks ÷ 4)            |
| Learn From Your Failures | `"failures"`     | Character failures track (ticks ÷ 4)         |

Adds are still applied on top of the progress score during the roll.

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

| Field               | Type             | Required | Description                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | string           | yes      | Unique identifier: `category-type/kebab-case-name` (e.g., `combat/archer`)                                                                                                                                                                                                                                                             |
| `name`              | string           | yes      | Display name                                                                                                                                                                                                                                                                                                                           |
| `category`          | string           | yes      | One of: `"Combat Talent"`, `"Companion"`, `"Path"`, `"Ritual"` (plus `"Touched"` in [Yrt](../extensions/yrt/README.md#touched-assets))                                                                                                                                                                                                 |
| `summary`           | string           | yes      | One-line plain-text summary shown in the picker tile. Preferred over `preamble` for the tile.                                                                                                                                                                                                                                          |
| `preamble`          | string or null   | no       | Prerequisite or flavour text (e.g., `"If you wield a bow."`) — displayed on the asset card **before** the ability list. Rendered as markdown + the link DSL (same as ability `text`).                                                                                                                                                  |
| `postamble`         | string or null   | no       | Explanatory text displayed on the asset card **after** the ability list (e.g., asset-specific constraints, Touched feature-use note)                                                                                                                                                                                                   |
| `preconditions`     | array of objects | no       | Conditions that must be met to add this asset. Same schema as move [Preconditions](#preconditions). Assets failing preconditions are faded and non-clickable in the picker.                                                                                                                                                            |
| `abilities`         | array            | yes      | Exactly 3 ability objects                                                                                                                                                                                                                                                                                                              |
| `customFields`      | CustomFieldDef[] | no       | Array of custom input fields rendered in the asset card body. Values stored in `CharacterAsset.customValues` keyed by `field.id`. See [Custom Fields](#custom-fields).                                                                                                                                                                 |
| `exclusiveGroup`    | string           | no       | If set, the character may own at most one asset whose `exclusiveGroup` matches this value at a time. Attempting to add a second triggers a user-facing error. Example: `"touched"` (only one Touched variant active at once).                                                                                                          |
| `abilityMaxByField` | object           | no       | Maps a `customField.id` → option value → maximum number of enabled abilities. Used to gate ability checkboxes based on a dropdown selection. When the player selects a lower level, excess enabled abilities are automatically cleared. Example: `{ "touchedLevel": { "pure": 0, "prime": 1, "second": 2, "third": 3, "feral": 3 } }`. |
| `html`              | boolean          | no       | Escape hatch: when `true`, this asset's `preamble` / `description` / ability `text` are treated as **raw legacy HTML** and bypass `renderRich`. Omit for normal assets — prose is markdown + the link DSL by default. The DSL lint skips `html: true` assets.                                                                          |

Each ability object:

| Field     | Type            | Required | Description                                                                                                                                                              |
| --------- | --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `enabled` | boolean         | yes      | `true` if the ability starts checked when the asset is first acquired (see [Auto-Enabled Abilities](#auto-enabled-abilities))                                            |
| `text`    | string (md+DSL) | yes      | Ability description. Move names that appear in the text are decorated with `<a class="move-link">` tags (see [Move Links in Ability Text](#move-links-in-ability-text)). |
| `name`    | string          | no       | Named ability (companions only, e.g., `"Scout"`, `"Bonded"`)                                                                                                             |

### Move Links in Ability Text

Ability `text` (and `preamble` / `description`) use the same **markdown + link
DSL** as move outcomes — a move reference is a `[label](move:<id>)` link. Click
delegation is already wired up in `LogPanel` and `MovesDialog`, so move links in
asset ability text open the move's detail dialog automatically. See
[Data-Driven Links](#data-driven-links) for the full scheme table (`move:`,
`resource:`, `oracle:`, …).

```text
<!-- Example: Archer ability 1 -->
When you [Secure an Advantage](move:secure-an-advantage) by...

<!-- Example: Archer ability 2 -->
...you may reroll any dice when you [Strike](move:strike) or [Clash](move:clash).
```

each `move:` link compiling to `<a class="move-link" data-id="move/…">…</a>`.

**Rules:**

- One `[label](move:<id>)` per move reference; `<id>` is the move's `id` **without** the `move/` prefix (e.g. `secure-an-advantage`).
- The label preserves the original capitalisation from the source text.
- Ability text that does not reference any move is plain markdown.

A companion index file (`asset-move-refs.json`) lists every move ID that each asset and ability references — see [Asset Move References](#asset-move-references-asset-move-refsjson).

### Auto-Enabled Abilities

When a character acquires an asset, each ability checkbox is pre-set to `ability.enabled`. The convention by category is:

| Category          | First ability starts | Other abilities start |
| ----------------- | -------------------- | --------------------- |
| **Path**          | ✓ Enabled            | ✗ Unchecked           |
| **Ritual**        | ✓ Enabled            | ✗ Unchecked           |
| **Combat Talent** | ✓ Enabled            | ✗ Unchecked           |
| **Companion**     | ✗ Unchecked          | ✗ Unchecked           |
| **Touched** (Yrt) | ✓ Enabled            | ✗ Unchecked           |

Per the Ironsworn printable asset sheet: Paths, Rituals, and Combat Talents include their first ability when acquired (filled circle on the card). Companions start with no abilities pre-enabled — all three must be purchased with 2 XP each.

### XP Cost and Gating

The UI enforces XP requirements for asset-related actions:

| Action                        | XP Cost            | Gate                                               |
| ----------------------------- | ------------------ | -------------------------------------------------- |
| Acquire a new asset           | 3 XP               | `+ Asset` button disabled when `xp < 3`            |
| Enable a new ability checkbox | 2 XP               | Ability checkbox disabled when `xp < 2`            |
| Unlock a rarity               | `rarity.xpCost` XP | Rarity checkbox disabled when `xp < rarity.xpCost` |

Disabling a previously-enabled ability has no XP cost (per Ironsworn RAW
— XP spent is sunk) and is always allowed.

### Asset dialog: draft/snapshot model and consolidated log entries

Editing or adding an asset opens `AssetCard.svelte` inside a dialog
(`CharactersArea.svelte`). The dialog uses a **draft + snapshot**
pattern:

1. **On open** — the parent constructs a local draft `CharacterAsset`
   (cloned from the live asset in edit mode; seeded from definition
   defaults in add mode), snapshots `asset.abilities` and
   `asset.rarityId`, and clones `character.globalValues` into a draft
   copy.
2. **While the dialog is open** — every ability toggle, rarity change,
   custom field change, and counter ± mutates the draft, NOT the live
   character. The affordability gate uses the snapshot to allow only
   what the character can afford (purchase + new enables + rarity).
3. **On OK / Add** — the parent computes the diff against the snapshot
   (see `computeAssetXpDiff` in `character.ts`), persists the draft
   over the live asset, copies `dialogGlobals` into
   `character.globalValues`, and emits ONE consolidated log entry with
   ONE clickable XP-cost-link for the total. If the diff is 0, **no
   log entry is written**.
4. **On X / Cancel** — the draft is discarded; live character state is
   untouched.

The XP-cost-link is `<a class="xp-cost-link" data-entry-id="…"
data-cost="N" data-char-id="…">` with text using `−` (U+2212). Clicking
deducts `N` from `character.xp` and strikes through to prevent
double-use.

#### Cost formula

```
purchaseCost    = mode === 'add' ? 3 : 0
newEnables      = count of indices where snapshot=false AND draft=true
rarityXp        = (draft.rarityId !== snapshot.rarityId && draft.rarityId) ? newRarity.xpCost : 0
totalCost       = purchaseCost + newEnables * 2 + rarityXp
```

Notable: a swap (disable A, enable B) charges only for the new enable —
A's XP is sunk. Toggle-on-then-off within the same dialog is free
(state-based diff, not history-based).

### Asset log entry format

All asset log entries are titled `{characterName} — Assets` (e.g.,
`Porcius Mona — Assets`). The body format is:

- **Asset added** (mode = add): `Asset added: **Name** −N experience`
  (XP link only present when `totalCost > 0`).
- **Asset modified** (mode = edit): `Asset modified: **Name** −N experience`
  (XP link only present when `totalCost > 0`).
- **Asset removed** (Delete button in edit mode): `Asset removed:
**Name** (Category, N marked)` — no XP charge or refund.

Rarity names are always displayed with the `RARITY:` prefix in the
asset card UI when expanded; the consolidated log entry shows the
asset name only.

### Custom Fields

The `customFields` array on an asset definition declares interactive controls rendered in the card body. Values are stored in `CharacterAsset.customValues` as a `Record<string, string>` keyed by `field.id`. Counter values are stored as numeric strings.

#### CustomFieldDef Schema

| Field          | Type                  | Required | Description                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------- | --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`           | string                | yes      | Unique key within this asset (e.g. `"health"`, `"armor"`). Used as the key in `customValues`.                                                                                                                                                                                                                                                                                                    |
| `type`         | string                | yes      | One of `"string"`, `"counter"`, `"radio"`, `"dropdown"`, `"switch"`, `"markdown"`. `"markdown"` fields are rendered through the mini-markdown renderer in `apps/web/src/lib/markdown.ts` — supports `**bold**`, `*italic*` / `_italic_`, `# / ## / ### heading`, `- item` / `* item`, `1. item` ordered list. See [notes.md → Markdown Support](notes.md#markdown-support) for the full grammar. |
| `label`        | string                | yes      | Human-readable label shown next to the control                                                                                                                                                                                                                                                                                                                                                   |
| `shortLabel`   | string                | no       | Short label used in the Global Context Bar pill (e.g. `"Hawk"` instead of `"Companion Health"`). Defaults to `label` when omitted. `string`-type fields are never shown as GCB pills regardless of this field.                                                                                                                                                                                   |
| `tooltipLabel` | string                | no       | Tooltip text shown on hover over the GCB pill. Falls back to the asset's `name` when omitted. Use when the pill text (`shortLabel`) differs from what the tooltip should say (e.g. `shortLabel: "Mana"`, `tooltipLabel: "Conclave Ritual"`).                                                                                                                                                     |
| `position`     | `"top"` \| `"bottom"` | no       | `"top"` (default) renders before the preamble; `"bottom"` renders after abilities                                                                                                                                                                                                                                                                                                                |
| `default`      | string \| number      | no       | Initial value when the asset is first added                                                                                                                                                                                                                                                                                                                                                      |
| `placeholder`  | string                | no       | Hint text for `string` fields                                                                                                                                                                                                                                                                                                                                                                    |
| `maxValue`     | number \| number[]    | no       | `counter` only. Max pip count. Array form maps per-ability: the effective max is the value at the index of the highest enabled ability (e.g. `[3, 6, 6]`)                                                                                                                                                                                                                                        |
| `icon`         | string                | no       | `counter` only. Canonical icon name shown in the header badge. See [Counter Icons](#counter-icons).                                                                                                                                                                                                                                                                                              |
| `global`       | boolean               | no       | `counter` only. If `true`, all counter fields with the same `id` share one value across the character (e.g. shared supply).                                                                                                                                                                                                                                                                      |
| `options`      | CustomFieldOption[]   | no       | `radio` / `dropdown` only. Each option: `{ id: string, label: string }`.                                                                                                                                                                                                                                                                                                                         |

#### Counter Icons

The `icon` field on a counter `customField` references a canonical short name:

| Name                   | Description                              |
| ---------------------- | ---------------------------------------- |
| `heart`                | Health / vitality (companions)           |
| `skull-and-crossbones` | Poison / doses                           |
| `sword`                | Combat charges                           |
| `shield`               | Defensive charges                        |
| `eye`                  | Ritual / perception                      |
| `moon`                 | Magic / dark ritual                      |
| `sun`                  | Light / radiance                         |
| `dice`                 | Fate / chance                            |
| `note`                 | Knowledge / lore                         |
| `sack-dollar`          | Wealth (Fortune Hunter)                  |
| `mana`                 | Essence / mana (diamond shape)           |
| `puppet`               | Animated constructs (Awakening ritual)   |
| `rock-golem`           | Simulacrum constructs (Awakening ritual) |

### Companion Assets

Companions use `customFields` for the companion name and health track:

```json
{
  "id": "companion/hawk",
  "name": "Hawk",
  "category": "Companion",
  "customFields": [
    { "id": "companion-name", "type": "string", "label": "Companion Name" },
    {
      "id": "health",
      "type": "counter",
      "label": "Health",
      "position": "bottom",
      "maxValue": 3,
      "default": 3,
      "icon": "heart"
    }
  ],
  "abilities": [
    { "enabled": false, "name": "Far-seeing", "text": "..." },
    { "enabled": false, "name": "Fierce", "text": "..." },
    { "enabled": false, "name": "Bonded", "text": "..." }
  ]
}
```

The companion name is stored in `customValues["companion-name"]` and health in `customValues["health"]`.

### Assets with Custom Fields — Examples

**Path with counter (Fortune Hunter):**

```json
{
  "id": "path/fortune-hunter",
  "customFields": [
    {
      "id": "wealth",
      "type": "counter",
      "label": "Wealth",
      "position": "bottom",
      "maxValue": 5,
      "icon": "sack-dollar"
    }
  ]
}
```

**Path with two name inputs (Devotant):**

```json
{
  "id": "path/devotant",
  "customFields": [
    { "id": "gods-name", "type": "string", "label": "God's Name" },
    { "id": "stat", "type": "string", "label": "Stat" }
  ]
}
```

**Combat Talent with radio buttons (Ironclad):**

```json
{
  "id": "combat/ironclad",
  "customFields": [
    {
      "id": "armor",
      "type": "radio",
      "label": "Armor",
      "position": "bottom",
      "options": [
        { "id": "lightly-armored", "label": "Lightly Armored" },
        { "id": "geared-for-war", "label": "Geared for War" }
      ]
    }
  ]
}
```

**Ritual with array counter (Awakening — simulacrum health rises with abilities):**

```json
{
  "id": "ritual/awakening",
  "customFields": [
    {
      "id": "health",
      "type": "counter",
      "label": "Health",
      "position": "bottom",
      "maxValue": [3, 6, 6],
      "default": 3,
      "icon": "rock-golem"
    }
  ]
}
```

Yrt adds Touched assets and ritual cantrips — see [the Yrt extension docs](../extensions/yrt/README.md#touched-assets).

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

| Field         | Type   | Description                                 |
| ------------- | ------ | ------------------------------------------- |
| `id`          | string | Unique identifier: `rarity/kebab-case-name` |
| `name`        | string | Display name                                |
| `assetId`     | string | The `id` of the asset this rarity enhances  |
| `xpCost`      | number | Experience cost to unlock                   |
| `description` | string | Narrative description                       |

### Asset Move References (asset-move-refs.json)

**Location:** `data/assets/asset-move-refs.json`

A pre-computed index mapping each asset (and each of its abilities) to the set of move IDs referenced in its ability text. Generated from the decorated ability text in the three source files. Only assets that reference at least one move are included.

```json
[
  {
    "id": "combat/archer",
    "abilities": [
      { "index": 0, "moves": ["move/secure-an-advantage"] },
      { "index": 1, "moves": ["move/strike", "move/clash"] },
      { "index": 2, "moves": ["move/resupply"] }
    ],
    "allMoves": ["move/secure-an-advantage", "move/strike", "move/clash", "move/resupply"]
  }
]
```

| Field               | Type             | Description                                                                  |
| ------------------- | ---------------- | ---------------------------------------------------------------------------- |
| `id`                | string           | Asset ID (matches the asset's `id` field)                                    |
| `abilities`         | array            | Per-ability move lists (only abilities with ≥ 1 move reference are included) |
| `abilities[].index` | number           | 0-based index of the ability within the asset's `abilities` array            |
| `abilities[].moves` | array of strings | Move IDs referenced in this ability's `text`, in order of appearance         |
| `allMoves`          | array of strings | Deduplicated union of all move IDs across all abilities                      |

**Usage:** The MovesDialog "Relevant Assets" panel reads this index at dialog-open time to find which of the character's enabled abilities mention the currently-selected move, then surfaces those abilities as contextual suggestions without auto-applying any modifier.

---

## Oracles

**Location:** `apps/api/data/oracles/*.json` (70 table files)

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

| Field                       | Type   | Required | Description                                                                             |
| --------------------------- | ------ | -------- | --------------------------------------------------------------------------------------- |
| `key`                       | string | yes      | Unique identifier in camelCase (e.g., `"action"`, `"settlementName"`)                   |
| `title`                     | string | yes      | Display title                                                                           |
| `source`                    | string | yes      | Owning content pack (`"base"`, `"delve"`, an extension id, …)                           |
| `category`                  | string | no       | Ask/Oracles filter grouping (e.g. `"Location"`, `"Character"`); falls back to `"Other"` |
| `selectLabel`               | string | yes      | Label for the dropdown selector                                                         |
| `description`               | string | no       | Guidance text shown **above** the table                                                 |
| `postamble`                 | string | no       | Guidance text shown **below** the table (blank lines split paragraphs)                  |
| `tableType`                 | string | no       | Table variant — see [Special Oracle Types](#special-oracle-types)                       |
| `columns`                   | array  | no       | For `tableType: "columnSelect"` — `[{ key, label }]` roll columns                       |
| `outerLabel` / `innerLabel` | string | no       | For `tableType: "twoStep"` — the two column headings                                    |
| `data`                      | array  | yes      | Array of oracle entries                                                                 |

Each oracle entry:

| Field      | Type             | Description                                                 |
| ---------- | ---------------- | ----------------------------------------------------------- |
| `topRange` | number           | Upper boundary of the d100 range                            |
| `value`    | string or object | Result text (string) or structured data (see special types) |

### Special Oracle Types

> See **[oracles.md → Oracle layouts](oracles.md#oracle-layouts-tabletype-reference)**
> for the full catalogue of each layout with rendered examples, roll behaviour,
> and the canonical oracle that uses it.

Most oracles have simple string values (`value` is a string). Beyond that, a
few patterns are recognized **automatically from the JSON** — no code changes —
so an extension can use them from data alone:

- **Type column** — give any entry a `type` string and the detail table gains a
  **Type** column (e.g. Region → Settled / Boundary / Remote). Display-only.
- **Description column** — give any entry a `description` string and the detail
  table gains a **Description** column; the text is also echoed into the log on
  a roll (e.g. Delve Site Theme → "This place holds the secrets of a bygone
  age"). Display-only.
- **`tableType: "columnSelect"`** — a picker of `columns` (`[{ key, label }]`);
  the reader chooses a column and the roll resolves against that column's
  ranges. Each data row carries a `topRange` under each column key plus a shared
  `value` (Settlement: Type land tiers, Delve Depths).
- **`tableType: "matrix"`** — the transpose of `columnSelect`: a picker of
  `columns` where every column shares the **same** d100 ranges but each has its
  **own** value. Each data row carries one shared `topRange` plus one value per
  column key. The reader picks a column and rolls; the detail view renders
  `d100 | col1 | col2 | …` with the active column highlighted (Scale: Magnitude —
  Size / Number / Distance / Time / …).
- **`tableType: "twoStep"`** — a **double-rolling** oracle whose second table
  travels _inside its own rows_: roll the outer table for a category, then roll
  that row's `subtable` for the final result. Both rolls are logged and the
  detail view renders
  `d100 | outerLabel | d100 | innerLabel | d100 | innerLabel`. Set the two
  headings with `outerLabel` / `innerLabel` (defaults `"Category"` / `"Result"`).
  Each outer row's `value` is `{ label, subtable: [{ topRange, value }] }`. Used
  by `settlementName` (Category → Name) and `siteNamePlace` (Domain → Place):

  ```json
  {
    "key": "myCompoundOracle",
    "title": "My Compound Oracle",
    "category": "…",
    "selectLabel": "My Compound Oracle",
    "source": "myext",
    "tableType": "twoStep",
    "outerLabel": "Domain",
    "innerLabel": "Place",
    "data": [
      {
        "topRange": 50,
        "value": {
          "label": "Barrow",
          "subtable": [
            { "topRange": 50, "value": "Boneyard" },
            { "topRange": 100, "value": "Tomb" }
          ]
        }
      },
      {
        "topRange": 100,
        "value": {
          "label": "Cavern",
          "subtable": [
            { "topRange": 50, "value": "Abyss" },
            { "topRange": 100, "value": "Warren" }
          ]
        }
      }
    ]
  }
  ```

- **`tableType: "compound"`** — a **format-string builder** that composes a
  result by rolling _other_ oracles. Each `data` row's `value` is a template
  string containing `[label](roll:key)` blanks (the interactive-link DSL — see
  [Template blanks](#template-blanks--the-roll-dsl) below) plus any literal
  connective text (`of`, `'s`, `·`, newlines). To resolve: roll `data` to pick a
  template (a single row = one fixed format, no roll), then **recursively** roll
  each blank's target oracle and substitute its result. Every sub-roll is logged.
  The detail view renders each blank as a pill (its author-facing `label`).
  References may point at any oracle — including `twoStep` or other `compound`
  oracles (depth-guarded). The **`compound`** field on the oracle file selects
  how the result renders: `"phrase"` (one composed string) or `"dossier"`
  (per-field breakdown). Used by `siteName` (`phrase`, 7 formats) and
  `monstrosity` (`dossier`, one labelled format over four sub-oracles):

  ```json
  {
    "key": "siteName",
    "title": "Delve: Site Name",
    "category": "Delve Site",
    "selectLabel": "Delve: Site Name",
    "source": "delve",
    "tableType": "compound",
    "compound": "phrase",
    "data": [
      {
        "topRange": 50,
        "value": "[Description](roll:siteNameDescription) [Place](roll:siteNamePlace)"
      },
      {
        "topRange": 100,
        "value": "[Place](roll:siteNamePlace) of [Namesake](roll:siteNameNamesake)'s [Detail](roll:siteNameDetail)"
      }
    ]
  }
  ```

  **Repeat a blank** via query args on the `roll:` target — `?times=n` (exactly
  _n_) or `?rollFrom=n&rollTo=m` (a random count in _n_…_m_). The oracle is
  rolled that many times, results are **de-duplicated** (named refs only), and
  joined with `, `. A single-format `dossier` compound that rolls
  Characteristics/Abilities 1–3× each:

  ```json
  {
    "key": "monstrosity",
    "tableType": "compound",
    "compound": "dossier",
    "category": "Monstrosity",
    "…": "…",
    "data": [
      {
        "topRange": 100,
        "value": "Primary form: [Primary Form](roll:monstrosityPrimaryForm) · Size: [Size](roll:monstrositySize) · Characteristics: [Characteristics](roll:monstrosityCharacteristics?rollFrom=1&rollTo=3) · Abilities: [Abilities](roll:monstrosityAbilities?rollFrom=1&rollTo=3)"
      }
    ]
  }
  ```

  **Log output.** Each blank logs one line, labelled by its blank's `label`. A
  ranged/repeated blank first logs its count roll, then one indented line per
  kept result:

  ```
  Delve: Monstrosity
    Primary Form: Snake (d100 → 43)
    Size: Large (giant-sized) (d100 → 87)
    Characteristics: (d3 → 2)
    — Claws / talons (d100 → 14)
    — Strange color / markings (d100 → 18)
    Abilities: (d3 → 1)
    — Flier / glider (d100 → 41)
  ```

  `compound: "dossier"` renders the per-field lines above and omits the composed
  `Result:` line. `compound: "phrase"` keeps `Result:` (the assembled string is
  the payload).

  `compound` is substitution + repetition only — no conditionals. An oracle
  whose later rolls _depend on_ an earlier result (e.g. `yrtTouched`: Pure
  stops, Feral rolls an animal but no features) stays a hardcoded branch.

- **Value-level templates & `roll:self`** — the `[label](roll:…)` blanks above
  are not limited to `compound` tables: **any** row's value can carry a blank,
  resolved the same way when that row is rolled. The reserved target
  **`roll:self`** rolls the **current** table — this is how the **Roll Twice**
  mechanic is authored. A top row
  `{ "topRange": 100, "value": "[roll again](roll:self?times=2)" }` rolls this
  table twice, and **both results occur** (self refs are _not_ de-duplicated,
  unlike named refs); it cascades if a re-roll lands on another `roll:self`,
  depth-guarded to 5. Literal text around the blank is preserved (e.g.
  `"Hybrid ([roll again](roll:self?times=2))"`). In the reference table a blank
  renders as a pill (the `label` + an optional `×n` badge). This replaced the old
  `/roll twice/i` string match and the earlier `[self]{2}` token. Exceptions that
  stay prose: a value where the roll-twice text sits in a **non-primary** column
  (Mana Backlash's Effect), or a table read raw by a hardcoded consumer
  (`touchedFeatures` via `yrtTouched`).

### Template blanks — the `roll:` DSL

Compound/value templates use the same `[label](scheme:args)` interactive-link
DSL as moves and assets, with the `roll:` scheme:

| Form                                    | Meaning                                                           |
| --------------------------------------- | ----------------------------------------------------------------- |
| `[Label](roll:key)`                     | Roll oracle `key` once.                                           |
| `[Label](roll:key?times=n)`             | Roll `key` `n` times; **named** targets de-dupe repeats.          |
| `[Label](roll:key?rollFrom=n&rollTo=m)` | Roll `key` a random `n…m` number of times.                        |
| `[Label](roll:self?times=2)`            | Roll the **current** table twice; both results kept (no de-dupe). |

- **`tableType: "prefixSuffix"`** — each row's `value` is `{ prefix, suffix }`.
  A roll makes **two independent d100 rolls** and concatenates the first row's
  prefix with the second row's suffix (e.g. "Red" + "fall" → "Redfall"). The
  reference table lays the rows out in side-by-side `d100 | Prefix | Suffix`
  groups (three, or two on ≤ 640px). Canonical: Settlement: Quick Name.

Still hardcoded per-key (not available to extensions from JSON alone):
`yrtTouched` and the other Yrt structured tables — see
[the Yrt extension docs](../extensions/yrt/README.md#yrt-oracles).

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

| Field         | Type             | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------- | ---------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | string           | yes      | Unique identifier: `source/kebab-case-name` (e.g., `ironsworn/broken`, `yrt/mana-wraith`)                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `name`        | string           | yes      | Display name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `rank`        | number           | yes      | Difficulty rank (1–5, higher = harder)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `nature`      | string           | yes      | Category — one of `FoeNature`: `"Ironlander"`, `"Firstborn"`, `"Animal"`, `"Beast"`, `"Horror"`, `"Anomaly"`, `"Construct"`                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `features`    | array of strings | yes      | 2–5 descriptive physical/behavioral characteristics                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `drives`      | array of strings | yes      | 1–2 motivational drivers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `tactics`     | array of strings | yes      | 2–4 combat or conflict approaches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `description` | string           | yes      | Narrative background description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `extras`      | object           | no       | Per-extension namespace bag — each extension owns a key under its manifest id and stores custom flags/data under it. Consumers read through the `foeExtra(def, ext, key)` / `foeExtraFlag(def, ext, key)` helpers in `apps/web/src/lib/foeExtras.ts`. YRT-specific escalating-harm / escalating-defense flags live under `extras.yrt.escalates` / `extras.yrt.escalatesDefense` (with their config records `escalatingHarm` / `escalatingDefense` alongside). See [Yrt extensions](../extensions/yrt/README.md#escalating-harm-yrt-extension). |

Foe portraits are stored as images at `images/foes/{id-slug}.png` (matching the foe's id, with `/` replaced by `-`).

### Foe Encounter Fields

A `FoeEncounter` is the runtime record created when a player adds a foe to their active session. It references the catalogue definition by `foeId` and stores the mutable per-session state.

| Field            | Type    | Description                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | string  | `crypto.randomUUID()` — unique encounter instance ID                                                                                                                                                                                                                                                                                                                                                                                   |
| `foeId`          | string  | References a `FoeDef.id` in the catalogue                                                                                                                                                                                                                                                                                                                                                                                              |
| `quantity`       | string  | One of `"solo"`, `"pack"`, `"horde"`                                                                                                                                                                                                                                                                                                                                                                                                   |
| `effectiveRank`  | number  | Rank after quantity adjustment (1–5)                                                                                                                                                                                                                                                                                                                                                                                                   |
| `ticks`          | number  | Progress track ticks (0–40; 10 boxes × 4 ticks)                                                                                                                                                                                                                                                                                                                                                                                        |
| `notes`          | string  | Free-text encounter notes                                                                                                                                                                                                                                                                                                                                                                                                              |
| `customName`     | string  | Player-assigned name; if `""`, the foe's catalogue `name` is displayed                                                                                                                                                                                                                                                                                                                                                                 |
| `vanquished`     | boolean | Whether the foe has been defeated                                                                                                                                                                                                                                                                                                                                                                                                      |
| `currentHarm`    | number  | _(Optional)_ Current escalating harm level. Only meaningful when the foe def carries `extras.yrt.escalates`. Defaults to `1` when absent. See [Yrt extensions](../extensions/yrt/README.md#escalating-harm-yrt-extension).                                                                                                                                                                                                             |
| `currentDefense` | number  | _(Optional)_ Current escalating-defense (shield) level. Only meaningful when the foe def carries `extras.yrt.escalatesDefense`. Absent = `0` (no shield yet); increases by 1 per Miss up to a cap of `FOE_RANKS[effectiveRank].progressPerHit − 1`. Higher values reduce progress-per-hit (`progressPerHit − currentDefense`) toward a floor of 1. See [Yrt extensions](../extensions/yrt/README.md#escalating-defense-yrt-extension). |

### Foe Overrides (Expansion Extension Mechanism)

**Location:** `data/foes/foes_overrides_<source>.json` (one per expansion that wants to restrict or decorate the base foe catalogue)

Expansions can ship an overrides file to **exclude** base foes that don't fit their setting or **decorate** base foes with an addendum describing how they appear in that setting. Overrides apply **only while the owning expansion is enabled**; they affect the picker and the rendered description, but never `findFoe()` — existing FoeEncounter records keep resolving regardless of toggle state.

> **Where toggle state lives:** the Delve and YRT expansion toggles are **client-side preferences**, persisted in browser `localStorage` (`ironledger:expansion:delve`, `ironledger:expansion:yrt`, default `true`). They are not stored in `CharacterData` or on the server. The catalogue endpoints always return the full data set; filtering happens at the picker level via `expansionStore.isSourceEnabled()`. See [expansion-toggles.md](expansion-toggles.md).

File shape:

```json
{
  "source": "yrt",
  "overrides": {
    "ironsworn/basilisk": {
      "present": true,
      "addendum": "In the Yrt setting, a basilisk's petrifying gaze is an expression of bound Stone mana — the creature is less a beast than a walking focus."
    },
    "ironsworn/troll": {
      "present": false
    }
  }
}
```

| Field       | Type   | Required | Description                                                        |
| ----------- | ------ | -------- | ------------------------------------------------------------------ |
| `source`    | string | yes      | Expansion tag (`"base"` / `"delve"` / `"yrt"`) that owns this file |
| `overrides` | object | yes      | Map of foe id → `FoeOverride`                                      |

Per-foe `FoeOverride`:

| Field      | Type    | Required | Description                                                                                                                                          |
| ---------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `present`  | boolean | no       | When `false`, hides the foe from the Foe Picker while this expansion is active. Existing encounters stay visible.                                    |
| `addendum` | string  | no       | Prose appended to the foe's description (with a blank line separator) in the Foe Picker confirm view and on FoeCards, while this expansion is active |

**General mechanism:** any expansion may drop a `foes_overrides_<source>.json` file into `data/foes/`. Vetoes are additive — if any active expansion marks `present: false`, the foe is hidden. Addenda from multiple active expansions are concatenated in the order they're loaded.

**Preservation contract:** overrides never delete user data. A FoeEncounter referencing a now-excluded foe still renders via `findFoe(id)`. Only the catalogue-facing pickers filter.

---

## Delve Themes and Domains

**Location:** `data/delve/*.json` (5 lookup files)

- `delve-theme-features.json` — Feature tables keyed by theme name (rows 1–20)
- `delve-theme-dangers.json` — Danger tables keyed by theme name (rows 1–30)
- `delve-domain-features.json` — Feature tables keyed by domain name (rows 21–43)
- `delve-domain-dangers.json` — Danger tables keyed by domain name (rows 31–45)
- `delve-common-dangers.json` — Shared danger entries for rows 46–100 (appended to all danger rolls)

Each theme/domain file is a JSON object with theme/domain names as keys:

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

The `delve-common-dangers.json` is a flat array (not keyed by theme/domain):

```json
[
  { "topRange": 57, "value": "You encounter a hostile denizen." },
  ...
  { "topRange": 100, "value": "Roll twice more on this table. Both results occur." }
]
```

Each entry has `topRange` (d100 boundary, inclusive) and `value` (result text).

**How combined tables work** (per Ironsworn: Delve rules p.6):  
When rolling features or dangers for a site, the result is assembled from three partial tables:

- **Features**: theme rows (1–20) + domain rows (21–43) + domain rows continue to 100
- **Dangers**: theme rows (1–30) + domain rows (31–45) + common rows (46–100)

The `buildCombinedTable()` function in `delveStore.svelte.ts` assembles these at runtime for the selected theme and domain.

---

## ID Conventions

All IDs follow a `prefix/kebab-case-name` format for consistency and future localization support:

| Data Type | Format                     | Examples                               |
| --------- | -------------------------- | -------------------------------------- |
| Moves     | `move/kebab-case-name`     | `move/face-danger`, `move/endure-harm` |
| Assets    | `category/kebab-case-name` | `combat/archer`, `companion/hawk`      |
| Rarities  | `rarity/kebab-case-name`   | `rarity/hawks-eye-bow`                 |
| Foes      | `source/kebab-case-name`   | `ironsworn/broken`, `yrt/mana-wraith`  |
| Oracles   | camelCase `key` field      | `action`, `settlementName`             |

IDs must be unique within their data type and stable across versions (they are referenced by saved game data and cross-references in other JSON files).
