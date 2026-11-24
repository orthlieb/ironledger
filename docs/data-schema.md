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
  - [Outcome Text (markdown + command links)](#outcome-text-markdown--command-links)
  - [Links are commands](#links-are-commands)
  - [Moves that act on a vow or a companion (`choose`)](#moves-that-act-on-a-vow-or-a-companion-choose)
  - [Context-Aware Visibility (log-only / dialog-only)](#context-aware-visibility-log-only--dialog-only)
  - [Match Text (strongMatch / weakMatch / missMatch)](#match-text-strongmatch--weakmatch--missmatch)
  - [Inline Tables](#inline-tables)
  - [Special Move Types](#special-move-types)
- [Assets](#assets)
  - [Asset Object Fields](#asset-object-fields)
  - [Move Links in Ability Text](#move-links-in-ability-text)
  - [Auto-Enabled Abilities](#auto-enabled-abilities)
  - [XP Cost and Gating](#xp-cost-and-gating)
  - [Asset dialog: draft/snapshot model and consolidated log entries](#asset-dialog-draftsnapshot-model-and-consolidated-log-entries)
  - [Asset log entry format](#asset-log-entry-format)
  - [Ability log links (`log`)](#ability-log-links-log)
  - [Custom Fields](#custom-fields)
  - [Counter Icons](#counter-icons)
  - [Companion Assets](#companion-assets)
  - [Assets with Custom Fields — Examples](#assets-with-custom-fields--examples)
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

`preconditions` gates availability in the picker for both moves and assets.
It's one condition expression, a string
([command-language.md → Conditions](command-language.md#conditions) has the
whole language). For moves, a tile whose condition fails appears faded, with
the reason on hover. For assets, it's faded and can't be picked; an owned
asset whose condition fails is faded on the sheet.

```json
"preconditions": "character & foe & initiative == me"
```

| Operator                    | Meaning                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `==` `!=` `>=` `<=` `>` `<` | Compare a value with a number (`2`, `2b` boxes, `3t` ticks) or an option (`prime`). |
| `&` `\|` `!` `( )`          | And, or, not, group. Comparisons bind tightest, then `!`, then `&`, then `\|`.      |

A name on its own is true when it's above 0, chosen, or exists.

#### Names

| Category              | Names                                                                                         | Reads as                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Context**           | `character`, `foe`, `journey`, `site`, `scene`                                                | True when one is active.                                                                                                                          |
| **Initiative**        | `initiative`                                                                                  | `none`, `me` or `foe`: `initiative == me`.                                                                                                        |
| **Character values**  | `momentum`, `health`, `spirit`, `supply`, `xp`, `edge`, `heart`, `iron`, `shadow`, `wits`     | Numbers.                                                                                                                                          |
| **Tracks**            | `bonds`, `failures`                                                                           | Ticks; `b` counts boxes: `failures >= 6b`. They have no rank, so a plain number is ticks.                                                         |
| **Counts**            | `vowCount`, `assetCount`, `companionCount`, `rarityCount`                                     | Numbers.                                                                                                                                          |
| **Debilities**        | `wounded`, `shaken`, `unprepared`, `encumbered`, `maimed`, `corrupted`, `cursed`, `tormented` | True/false: `wounded`, `!shaken`.                                                                                                                 |
| **Character fields**  | Any field an extension declares (YRT's `touched`)                                             | A list by its options' order (`touched >= prime`), a counter as a number, a switch as true/false. See [character-fields.md](character-fields.md). |
| **Global counters**   | A counter shared by the assets that declare it (YRT's `mana`)                                 | A number: `mana >= 1`.                                                                                                                            |
| **Assets**            | An asset's id (`companion/hawk`); `a \| b` for any one of several                             | True when owned. By id, never by display name, which can read differently by language or pack.                                                    |
| **An asset's fields** | `self.<field>` (the asset the condition belongs to), `<asset id>.<field>`                     | As the field's type: `self.health >= 1`.                                                                                                          |

`npm run gen:manifest` fails on a condition that doesn't parse, names
nothing, or compares a value with something it can't be (a word with a
number, a unit off a track, an option the list doesn't have), with the
position in the string.

#### Examples

```jsonc
// Combat move — a character and a foe
"preconditions": "character & foe"

// Strike — the character has initiative
"preconditions": "character & foe & initiative == me"

// Face Death — health at 0
"preconditions": "character & health == 0"

// Companion Endure Harm — at least one companion
"preconditions": "character & companionCount >= 1"

// Cast Conclave Ritual — mana available
"preconditions": "character & mana >= 1"

// Learn From Your Failures — the failure track at 6 boxes or more
"preconditions": "character & failures >= 6b"

// A Touched asset — Prime or higher
"preconditions": "touched >= prime"

// Either of two assets, and not wounded
"preconditions": "(path/ritualist | ritual/bind) & !wounded"
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

### Outcome Text (markdown + command links)

The `strong`, `weak`, `miss`, `notes`, `trigger`, `logBody` and `table[].value`
fields are authored in **markdown with command links**, rendered by
`renderRich` (`#lib/dsl.ts`). This is the default — no per-move flag is needed.

- **Prose formatting** is mini-markdown: `**bold**`, `*italic*`, `-` / `*`
  bullet lists, `1.` ordered lists, blank-line paragraphs. (Raw HTML tags are
  **not** allowed in content — the lint rejects them.)
- **A link's target is a command** in the [command language](command-language.md):
  `[take +1 momentum](/momentum++)`. It renders as
  `<a class="cmd-link" data-cmd="/momentum++">` (`#lib/commands/links.ts`).
- **`html: true`** on a move is the escape hatch: that move's fields are
  treated as raw HTML and skip `renderRich`. The lint skips `html: true` moves.

The old `[label](scheme:path?value=…)` forms (`resource:`, `move:`,
`progress:`, …) are gone: content was rewritten to commands, and the lint
rejects any link whose target isn't a command or (in an oracle value) a
`roll:` blank, since anything else shows as the text it was written as. Foe
and delve-table text is plain, so the lint rejects any link there. An old link
saved in a log does nothing; its text stays.

### Links are commands

A link names things by **id or keyword**, never by a display name, so it
reads the same in any language or content pack. The lint
(`scripts/lint-dsl.mjs`) parses every link's command and fails the build on
one that doesn't parse, names nothing, or uses an operator its value doesn't
take.

| Link                                                                                          | Does                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `[Pay the Price](/move pay-the-price)`                                                        | Opens a move, by its id without `move/`. A number after it is the harm or amount it asks for: `[Endure Stress](/move endure-stress 2)`.  |
| `[Mana Backlash Oracle](/oracle manaBacklash)`                                                | Opens an oracle, by its key.                                                                                                             |
| `[+1 momentum](/momentum++)`, `[+2 health](/health+=2)`, `[−1 supply](/supply--)`             | Changes a value of the character: momentum, health, spirit, supply (the party's), xp, a stat, a content pack's field (`/mana--`).        |
| `[mark a tick](/bonds++)`, `[+2 failures](/failures+=2)`, `[clear all progress](/failures=0)` | Bonds and failures: ticks (they have no rank).                                                                                           |
| `[wounded](/wounded++)`, `[wounded](/wounded--)`                                              | Marks or clears a debility.                                                                                                              |
| `[You have initiative](/initiative=me)`                                                       | Sets initiative: `none`, `me`, `foe`.                                                                                                    |
| `[Inflict your harm](/foe.progress++)`, `[Inflict double harm](/foe.progress+=2)`             | The foe's progress, in marks by its rank (`b` boxes, `t` ticks).                                                                         |
| `/journey.progress++`, `/site.progress++`, `/scene.progress++`                                | The expedition's progress, by its rank.                                                                                                  |
| `[mark a countdown segment](/scene.countdown++)`                                              | The scene's countdown.                                                                                                                   |
| `/foe.vanquished++`, `/journey.complete++`                                                    | Vanquish a foe, complete an expedition (`--` undoes).                                                                                    |
| `[progress](/vow.progress++)`, `[mark menace](/vow.menace++)`                                 | The vow the Moves dialog asked for: the move needs `"choose": "vow"` (below).                                                            |
| `[+1 health](/companion.health++)`                                                            | The companion the Moves dialog asked for: `"choose": "companion"`.                                                                       |
| `[any companions](/companions.health++)`                                                      | Every companion the character has, alike (Make Camp, Sojourn): no `choose`.                                                              |
| `[+1 health](/allies.health++)`, `/everyone.momentum+=2`                                      | Every other character (`allies`), or the character and every ally (`everyone`), alike. Not a party value: `/allies.supply++` is refused. |
| `[-harm health](/health-=harm)`, `[-harm spirit](/spirit-=harm)`                              | Endure Harm / Endure Stress: the dialog shows the amount resolved, and its Apply button applies it.                                      |
| `/companion/hawk.health--`                                                                    | An asset's field, by its id. (Asset text itself links moves and oracles only.)                                                           |

A link can change a value, `/burn`, or open a move, an oracle or a site's
picker (`/site.theme`). It can't make something active, write a note, mark a
story section or open help: those are the command bar's.

**Binding.** When the app writes a log entry (a move's outcome, a rolled
oracle), each link is bound to it (`bindCommandLinks`): the entry's id, its
place in the entry, and the character, foe and expedition it was made for,
plus the vow or companion its move chose and Endure Harm's amount. Clicking
it runs the command against those, not whatever is active now; the log line
is the one typing the command writes, and the link is struck through, also
when the value was already what it sets (no log line then). A link
that can't run (a deleted foe, a read-only field) says why in the command
bar's status line and stays unspent.

**Ranges.** A change is held to the value's range, and when an edge cuts it
short the line names it: `+2 health` at 4 health logs
`Health: 4 → 5 (+2, max 5)`, and at 5 logs `Health: 5 → 5 (+2, max 5)` and
changes nothing. At the bottom, the [cascades](log.md#cascade-rules) say what
becomes of the rest (momentum lost, Face Death, Out of Supply). Health, spirit
and supply run 0–5, experience 0–30, a stat 0–4, momentum −6 to its max (10,
less one per debility), bonds and failures 0–40 ticks; a content pack's field
takes its range from its declaration (mana 0–10).

Use the `−` character (U+2212, minus sign) in the display text for negative
values, not a plain hyphen.

### Moves that act on a vow or a companion (`choose`)

`"choose": "vow"` or `"choose": "companion"` on a move makes the Moves dialog
ask which (a vow among the character's active ones; a companion among their
companion assets). The choice binds `vow` or `companion` in the move's links,
and:

- **Fulfill Your Vow** rolls against the chosen vow's progress.
- **Forsake Your Vow**'s Endure Stress link carries the chosen vow's rank
  (Troublesome 1 … Epic 5).
- **Reach a Milestone** marks the chosen vow's progress (`/vow.progress++`).
- **Advance a Threat** (Delve) marks its menace (`/vow.menace++`).
- **Companion Endure Harm** takes the harm off the chosen companion (its
  trigger's `[-harm health](/companion.health-=harm)`, with the dialog's amount
  and Apply, as Endure Harm's) and heals it (`/companion.health++`). Harm past
  its 0 health comes off the character's momentum, as a link.

The lint fails a move that links to `vow` or `companion` without the
matching `choose`.

### Context-Aware Visibility (log-only / dialog-only)

When outcome text needs to differ between the move dialog and the log, wrap the
context-specific text in a `[text]{.class}` DSL span:

- `[…]{.log-only}` — visible in the log (`.entry-body`), hidden in the move dialog (`.move-body`)
- `[…]{.dialog-only}` — visible in the move dialog (`.move-body`), hidden in the log (`.entry-body`)

A span may itself wrap links (e.g. a log-only restatement that includes
`[+2 health](/health+=2)`). This replaces the old `weakRef` /
`missRef` system: when a weak hit says "As above," the full referenced text is
inlined in the outcome but wrapped in `log-only` so it only appears in the log.

```json
{
  "strong": "Your care is helpful. Clear [wounded](/wounded--). Take [+2 health](/health+=2).",
  "weak": "[Your care is helpful. Clear [wounded](/wounded--). Take [+2 health](/health+=2). ]{.log-only}[As above, but you]{.dialog-only}[You]{.log-only} must suffer [−1 supply](/supply--) or [−1 momentum](/momentum--) (your choice)."
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

**Location:** one file per content pack:

| Pack  | File                                         | Holds                                      |
| ----- | -------------------------------------------- | ------------------------------------------ |
| base  | `apps/api/data/assets/assets_ironsworn.json` | The Ironsworn assets (`rarities` is empty) |
| Delve | `extensions/delve/assets/assets_delve.json`  | Rarities only (`assets` is empty)          |
| Yrt   | `extensions/yrt/assets/assets.json`          | Touched, ritual and path assets; a rarity  |

(The dev-only `sample` extension's `extensions/sample/assets/assets.json` is
stripped from `core`.) Each file is an object with an `assets` array, a
`rarities` array, and the pack's `source` id:

```json
{
  "assets": [ ... ],
  "rarities": [ ... ],
  "source": "base"
}
```

The merged totals are pinned in
`apps/api/tests/unit/extensionsManifest.test.ts` (see CLAUDE.md, "bump
catalogue count tests"), so adding or removing an asset or rarity means
bumping its count there.

### Asset Object Fields

| Field               | Type             | Required | Description                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                | string           | yes      | Unique identifier: `category-type/kebab-case-name` (e.g., `combat/archer`)                                                                                                                                                                                                                                                                                                           |
| `name`              | string           | yes      | Display name                                                                                                                                                                                                                                                                                                                                                                         |
| `category`          | string           | yes      | One of: `"Combat Talent"`, `"Companion"`, `"Path"`, `"Ritual"` (plus `"Touched"` in [Yrt](../extensions/yrt/README.md#touched-assets))                                                                                                                                                                                                                                               |
| `source`            | string           | yes      | Owning content pack (`"base"`, `"yrt"`, …), the same as the file's top-level `source`. Drives the picker's source chip and the expansion toggles.                                                                                                                                                                                                                                    |
| `icon`              | string           | no       | Icon slug (an SVG in `#lib/icons/` or the extension's `icons/`, filename without `.svg`) for the card and picker tile. Falls back to the category's icon.                                                                                                                                                                                                                            |
| `description`       | string           | no       | Markdown + the link DSL, shown on the card after the preamble. Used by Yrt's rituals.                                                                                                                                                                                                                                                                                                |
| `summary`           | string           | yes      | One-line plain-text summary shown in the picker tile. Preferred over `preamble` for the tile.                                                                                                                                                                                                                                                                                        |
| `preamble`          | string or null   | no       | Prerequisite or flavour text (e.g., `"If you wield a bow."`) — displayed on the asset card **before** the ability list. Rendered as markdown + the link DSL (same as ability `text`).                                                                                                                                                                                                |
| `postamble`         | string or null   | no       | Explanatory text displayed on the asset card **after** the ability list (e.g., asset-specific constraints, Touched feature-use note)                                                                                                                                                                                                                                                 |
| `preconditions`     | array of objects | no       | Conditions that must be met to add this asset. Same schema as move [Preconditions](#preconditions). Assets failing preconditions are faded and non-clickable in the picker. An owned asset whose preconditions stop holding (a Touched asset on a character set to Pure) stays on the sheet faded, with the reason on hover; its card says it can't be used, and Delete still works. |
| `abilities`         | array            | yes      | Exactly 3 ability objects                                                                                                                                                                                                                                                                                                                                                            |
| `customFields`      | CustomFieldDef[] | no       | Array of custom input fields rendered in the asset card body. Values stored in `CharacterAsset.customValues` keyed by `field.id`. See [Custom Fields](#custom-fields).                                                                                                                                                                                                               |
| `exclusiveGroup`    | string           | no       | If set, the character may own at most one asset whose `exclusiveGroup` matches this value at a time. Attempting to add a second triggers a user-facing error. Example: `"touched"` (only one Touched variant active at once).                                                                                                                                                        |
| `abilityMaxByField` | object           | no       | Maps a field id → option id → the most abilities that may be marked. The id names a `customField` of the asset, or a character field ([character-fields.md](character-fields.md)). A lower value unmarks the extra abilities, keeping the first ones. Example (the Touched assets): `{ "touched": { "pure": 0, "prime": 1, "second": 2, "third": 3, "feral": 3 } }`.                 |
| `characterFields`   | string[]         | no       | Character field ids the card shows as a line of text, read-only (a Touched asset's `["touched", "touchedAnimal"]` → "Second · Wolf"). The first text field with a value also names the asset's chit on the sheet.                                                                                                                                                                    |
| `html`              | boolean          | no       | Lint escape hatch: `npm run lint:dsl` skips an asset with `html: true`. Unlike a move's `html` flag, it does not change rendering: the asset card always renders its prose through `renderRich`. No asset uses it.                                                                                                                                                                   |

Yrt's assets use a few more fields, read by `AssetCard` and documented in
[the Yrt extension docs](../extensions/yrt/README.md#touched-assets): a pool
of selectable items with slots unlocked per ability (`cantrips` /
`cantripSlots`, or the generic `selectableItems` / `selectableSlots` /
`selectableLabel`) and a ritual's difficulty factors (`inspectionFactors` /
`inspectionExample`).

Each ability object:

| Field     | Type            | Required | Description                                                                                                                                                                                                                                                            |
| --------- | --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled` | boolean         | yes      | `true` if the ability starts checked when the asset is first acquired (see [Auto-Enabled Abilities](#auto-enabled-abilities))                                                                                                                                          |
| `text`    | string (md+DSL) | yes      | Ability description: markdown + the link DSL, with each move it names written as a `move:` link (see [Move Links in Ability Text](#move-links-in-ability-text)).                                                                                                       |
| `name`    | string          | no       | Named ability (companions only, e.g., `"Scout"`, `"Bonded"`)                                                                                                                                                                                                           |
| `moves`   | string[]        | no       | The moves the `text` links, as full ids (`"move/strike"`), in order of first appearance, without repeats. Omitted when the text links none. The Move dialog's **Relevant Assets** panel reads it. Nothing checks it against the text, so keep the two in step by hand. |
| `log`     | string (md+DSL) | no       | _(Planned.)_ What the ability does to the character once, as one-time log links: written to the asset's log entry when the ability is marked. See [Ability log links](#ability-log-links-log).                                                                         |
| `free`    | boolean         | no       | _(Planned.)_ `true` when the rules grant the ability rather than selling it, so marking it costs no XP (Oathbreaker's third ability, at redemption). See [Cost formula](#cost-formula).                                                                                |

### Move Links in Ability Text

Ability `text` (and `preamble` / `description`) use the same **markdown with
command links** as move outcomes — a move reference is a `[label](/move <id>)` link. Click
delegation is wired up in the asset dialog, so move and oracle links in asset
ability text open them. Asset text links **moves and oracles only**: an
asset never writes to the log. What an ability gives ("take +1 momentum on a
hit", "you and your companions take +1 health") stays text, the player's to
take (by hand, or with a command: `/companions.health++`). The Moves dialog's
**Relevant Assets** row lists the marked abilities that name the move being
made. The lint refuses a value link in asset text. See
[Links are commands](#links-are-commands) for the forms.

```text
<!-- Example: Archer ability 1 -->
When you [Secure an Advantage](/move secure-an-advantage) by...

<!-- Example: Archer ability 2 -->
...you may reroll any dice when you [Strike](/move strike) or [Clash](/move clash).
```

each link rendering as `<a class="cmd-link" data-cmd="/move …" data-verb="move">…</a>`.

**Rules:**

- One `[label](/move <id>)` per move reference; `<id>` is the move's `id` **without** the `move/` prefix (e.g. `secure-an-advantage`).
- The label preserves the original capitalisation from the source text.
- Ability text that does not reference any move is plain markdown.
- List the same moves in the ability's `moves` array, which the Move dialog's
  **Relevant Assets** panel reads to show the character's marked abilities
  that mention the move being rolled.

`moves` replaced a separate index of the same lists,
`apps/api/data/assets/asset-move-refs.json`, written by
`generate_move_refs.py` in the same folder. Nothing reads either any more.

### Auto-Enabled Abilities

When a character acquires an asset, each ability checkbox is pre-set to `ability.enabled`. The convention by category is:

| Category          | First ability starts | Other abilities start |
| ----------------- | -------------------- | --------------------- |
| **Path**          | ✓ Enabled            | ✗ Unchecked           |
| **Ritual**        | ✓ Enabled            | ✗ Unchecked           |
| **Combat Talent** | ✓ Enabled            | ✗ Unchecked           |
| **Companion**     | ✗ Unchecked          | ✗ Unchecked           |
| **Touched** (Yrt) | ✗ Unchecked          | ✗ Unchecked           |

Per the Ironsworn printable asset sheet: Paths, Rituals, and Combat Talents include their first ability when acquired (filled circle on the card). Companions start with no abilities pre-enabled: you choose the one yours starts with, and that first pick comes with the 3 XP purchase, as the first ability does for any other asset. Each ability after it costs 2 XP.

Touched assets also start with none marked: how many can be marked follows
the character's Touched field on the Details tab (`abilityMaxByField`), one at
Prime, two at Second, all three at Third and Feral. A character whose touched
level is Pure cannot use a Touched asset: each requires
`"touched >= prime"`.

### XP Cost and Gating

A new character starts with **9 XP** (`STARTING_XP` in `character.ts`,
set by the New Character dialog): enough to buy its three starting assets
through Advance, 3 XP each, spending each from its log link.

The UI enforces XP requirements for asset-related actions:

| Action                        | XP Cost                     | Gate                                                                |
| ----------------------------- | --------------------------- | ------------------------------------------------------------------- |
| Acquire a new asset           | 3 XP                        | None: `+ Asset` and the card's Add are always enabled               |
| Enable a new ability checkbox | 2 XP (0 if `free`, planned) | Ability checkbox disabled when the dialog's total would exceed `xp` |
| Unlock a rarity               | `rarity.xpCost` XP          | Rarity checkbox disabled when the dialog's total would exceed `xp`  |

"The dialog's total" is the whole diff for the open card (purchase, new
abilities and rarity together; see the cost formula below), so a companion's
first pick on a new card is free of the 2 XP gate.

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
   ONE clickable XP-cost-link for the total, followed (once built) by the
   `log` of each newly marked ability (see
   [Ability log links](#ability-log-links-log)). With no XP due and no
   `log` to write, **no log entry is written**.
4. **On X / Cancel** — the draft is discarded; live character state is
   untouched.

The XP cost link is a command link, `/xp-=N`, bound to the character, with
text using `−` (U+2212). Clicking deducts `N` from `character.xp` and strikes
it through, so it can't be spent twice.

#### Cost formula

```
purchaseCost    = mode === 'add' ? 3 : 0
newEnables      = count of indices where snapshot=false AND draft=true AND NOT ability.free  (free: planned)
includedPick    = (purchaseCost > 0 && no ability marked in snapshot) ? 1 : 0
rarityXp        = (draft.rarityId !== snapshot.rarityId && draft.rarityId) ? newRarity.xpCost : 0
totalCost       = purchaseCost + max(0, newEnables - includedPick) * 2 + rarityXp
```

`includedPick` is the companion's first pick: an asset bought with nothing
marked (a companion) gets its first ability in the 3 XP, as every other
asset does, so Advance prices it at 3, not 3 + 2.

Notable: a swap (disable A, enable B) charges only for the new enable —
A's XP is sunk. Toggle-on-then-off within the same dialog is free
(state-based diff, not history-based).

### Asset log entry format

All asset log entries are titled `{characterName} — Assets` (e.g.,
`Porcius Mona — Assets`). The body format is:

- **Asset added** (mode = add): `Asset added: **Name** −N experience`
  (XP link only present when `totalCost > 0`), then (planned) the `log` of
  each ability it comes with.
- **Asset modified** (mode = edit): `Asset modified: **Name** −N experience`
  (XP link only present when `totalCost > 0`), then (planned) the `log` of
  each ability newly marked.
- **Asset removed** (Delete button in edit mode): `Asset removed:
**Name** _(Category)_` — no XP charge or refund.

Rarity names are always displayed with the `RARITY:` prefix in the
asset card UI when expanded; the consolidated log entry shows the
asset name only.

### Ability log links (`log`)

> **Planned, not built yet.** This is how stat-changing abilities will work.
> Until the code lands, the asset dialog writes no `log`, `free` isn't read,
> and choice groups don't exist. Change a stat by double-clicking it on the
> sheet, or with a command (`/edge-=1`), meanwhile.

A few abilities change the character once, when you take them: four Path
assets in base Ironsworn change a stat. An ability's `log` holds that change
as one-time log links, in the same markdown with command links as `text`
(rendered by `renderRich`). The asset dialog writes it into the asset's log entry, after
the XP link:

- **Asset added:** the `log` of every ability marked when the asset is added
  (for a Path, its first ability).
- **Asset modified:** the `log` of every ability marked since the dialog
  opened (snapshot unmarked, draft marked).

Each ability's `log` gets its own line. Unmarking an ability doesn't take
its links back, and marking it again writes them again: nothing remembers
that they were used, so that's the player's call.

`text` stays the rules text shown on the card; `log` is only what goes in the
log. Its links usually change a stat (`/edge--`); a choice between links
("−1 edge or −1 iron") will need choice groups, which don't exist yet. Any
link works: `/corrupted++` to mark a debility, `/move face-desolation` to open
the move the ability sends you to.

The four stat-changing abilities:

```jsonc
// path/battle-scarred, ability 1 (comes with the asset)
"log": "You focus your energies: [−1 edge](/edge--) or [−1 iron](/iron--); then one point to [+1 wits](/wits++) or [+1 heart](/heart++), and another to [+1 wits](/wits++) or [+1 heart](/heart++) (to a maximum of +4)."

// path/shadow-kin, ability 1 (comes with the asset)
"log": "You harden your heart: [−1 heart](/heart--), then up to +2 shadow: [+1 shadow](/shadow++) [+1 shadow](/shadow++) (to a maximum of +4)."

// path/lorekeeper, ability 3
"log": "When you browse the archive's forbidden depths: [+1 wits](/wits++), and roll an action die. On 1–3, also [mark corrupted](/corrupted++) or [Face Desolation](/move face-desolation) (ignoring momentum)."

// path/oathbreaker, ability 3
"free": true,
"log": "You find redemption. Improve one stat: [+1 edge](/edge++), [+1 heart](/heart++), [+1 iron](/iron++), [+1 shadow](/shadow++) or [+1 wits](/wits++); then discard Oathbreaker (Delete on its card)."
```

Battle-Scarred's "+2 to wits or heart, or +1 to each" is two single points,
each to wits or heart, so three outcomes (+2 wits, +2 heart, +1 each) need
no link that changes two stats at once.

Lorekeeper's ability is "one time only, you may": its links are written
when the ability is bought and wait in the log until the player browses.

Oathbreaker's third ability activates itself, at no cost, on a hit when you
Fulfill Your Vow on the marked quest. The app doesn't record which vow is
marked, so the player marks the ability then; `free` keeps it from costing
2 XP.

Stats stay 0–4 whatever the asset says: Lorekeeper's and Oathbreaker's +1
don't state a maximum, but a stat link at 4 waits rather than going to 5.
For a change the links can't make, the player can double-click a stat on
the sheet to edit it (see [character-sheet.md](character-sheet.md)).

### Custom Fields

The `customFields` array on an asset definition declares interactive controls rendered in the card body. Values are stored in `CharacterAsset.customValues` as a `Record<string, string>` keyed by `field.id`. Counter values are stored as numeric strings.

#### CustomFieldDef Schema

| Field          | Type                  | Required | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------- | --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | string                | yes      | Unique key within this asset (e.g. `"health"`, `"armor"`). Used as the key in `customValues`.                                                                                                                                                                                                                                                                                                                                                                                    |
| `type`         | string                | yes      | One of `"string"`, `"counter"`, `"radio"`, `"dropdown"`, `"switch"`, `"markdown"`. `"markdown"` fields are rendered through the mini-markdown renderer in `apps/web/src/lib/markdown.ts` — supports `**bold**`, `*italic*` / `_italic_`, `# / ## / ### heading`, `- item` / `* item`, `1. item` ordered list. See [notes.md → Markdown Support](notes.md#markdown-support) for the full grammar.                                                                                 |
| `label`        | string                | yes      | Human-readable label shown next to the control                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `shortLabel`   | string                | no       | Short label used in the Global Context Bar pill (e.g. `"Hawk"` instead of `"Companion Health"`). Defaults to `label` when omitted. `string`-type fields are never shown as GCB pills regardless of this field.                                                                                                                                                                                                                                                                   |
| `tooltipLabel` | string                | no       | Tooltip text shown on hover over the GCB pill. Falls back to the asset's `name` when omitted. Use when the pill text (`shortLabel`) differs from what the tooltip should say (e.g. `shortLabel: "Mana"`, `tooltipLabel: "Conclave Ritual"`).                                                                                                                                                                                                                                     |
| `position`     | `"top"` \| `"bottom"` | no       | `"top"` (default) renders before the preamble; `"bottom"` renders after abilities                                                                                                                                                                                                                                                                                                                                                                                                |
| `default`      | string \| number      | no       | Initial value when the asset is first added                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `placeholder`  | string                | no       | Hint text for `string` fields                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `maxValue`     | number \| number[]    | no       | `counter` only. Max pip count. Array form maps per-ability: the effective max is the value at the index of the highest enabled ability (e.g. `[3, 6, 6]`)                                                                                                                                                                                                                                                                                                                        |
| `icon`         | string                | no       | `counter` only. Canonical icon name shown in the header badge. See [Counter Icons](#counter-icons).                                                                                                                                                                                                                                                                                                                                                                              |
| `writable`     | boolean               | no       | `false`: commands and log links can show the value but not change it (the card still edits it). Default `true`.                                                                                                                                                                                                                                                                                                                                                                  |
| `field`        | string                | no       | Instead of declaring the field: refer to a `global` field declared in `extension.json` (`{ "field": "mana", "position": "bottom", "tooltipLabel": "Conclave Ritual" }`). The field's type, label, range, default, icon and `writable` come from that one declaration; the asset gives only its placement and tooltip. The value is the character's, shared by every asset that refers to it. See [command-language.md → Declaring fields](command-language.md#declaring-fields). |
| `options`      | CustomFieldOption[]   | no       | `radio` / `dropdown` only. Each option: `{ id: string, label: string }`.                                                                                                                                                                                                                                                                                                                                                                                                         |

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
      "icon": "heart",
      "shortLabel": "Hawk"
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
      "icon": "rock-golem",
      "shortLabel": "Servant"
    }
  ]
}
```

Yrt adds Touched assets and ritual cantrips — see [the Yrt extension docs](../extensions/yrt/README.md#touched-assets).

### Rarities

Rarity enhancements for existing assets, from Delve (and one from Yrt):

```json
{
  "id": "rarity/farsight-quiver",
  "name": "Farsight Quiver",
  "assetId": "combat/archer",
  "xpCost": 4,
  "description": "This quiver is fashioned from tanned leather, and carved with elaborate, spiraling runes. …",
  "source": "delve"
}
```

| Field         | Type   | Description                                            |
| ------------- | ------ | ------------------------------------------------------ |
| `id`          | string | Unique identifier: `rarity/kebab-case-name`            |
| `name`        | string | Display name                                           |
| `assetId`     | string | The `id` of the asset this rarity enhances             |
| `xpCost`      | number | Experience cost to unlock                              |
| `description` | string | Narrative description                                  |
| `source`      | string | Owning content pack (`"delve"`, `"yrt"`), as on assets |

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

> **Where toggle state lives:** the extension toggles are **per-user preferences**, kept on the account in `user_data.session_state.extensions` (`GET` / `PATCH /api/v1/session/extensions`; an extension with no choice takes its manifest default). They are not stored in `CharacterData`. The catalogue endpoints always return the full data set; filtering happens at the picker level via `expansionStore.isSourceEnabled()`. See [expansion-toggles.md](expansion-toggles.md).

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
| Rarities  | `rarity/kebab-case-name`   | `rarity/farsight-quiver`               |
| Foes      | `source/kebab-case-name`   | `ironsworn/broken`, `yrt/mana-wraith`  |
| Oracles   | camelCase `key` field      | `action`, `settlementName`             |

IDs must be unique within their data type and stable across versions (they are referenced by saved game data and cross-references in other JSON files).
