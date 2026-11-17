# Command language — spec

**Status: agreed design, not built yet.** The command bar still runs the
syntax in [command-bar.md](command-bar.md), and moves, assets and fields
still use the old link and precondition forms. This page is what replaces
them; [Build order](#build-order) says how.

One language for three things:

- **Commands** typed in the command bar: show a value, change it, make
  something active, open a move or an oracle.
- **Log links**: a link in a log entry is a command, run for you when you
  click it.
- **Conditions**: when a move can be made, an asset taken, a field shown.
  A condition reads values by the same names a command does.

There is one spelling for each thing. Old commands, old link forms and old
precondition objects are not kept as aliases.

## Commands

### Shape

```
/[owner.]value[operator]
```

- **value**: what to look at or change: `health`, `wounded`, `mana`,
  `progress`, `touched`.
- **owner**: whose value. Left out, it's the active character's, or the
  party's for a party value (supply). Written before a dot: `Bjorn.health`,
  `foe.progress`, `Wolf.progress`, `hawk.health`.
- **operator**: what to do with it. Left out, the command shows the value
  and changes nothing.

Naming something only ever shows it. Only an operator changes anything.

Spaces are optional everywhere except inside names: `/momentum+=2`,
`/momentum += 2` and `/ momentum += 2` are the same command. Case doesn't
matter. The parser finds where a name ends from the names it knows, the dot
and the operator, so `/Avenge Bjorn.progress++`,
`/companion/hawk.health--` and `/The Black Wolf.progress+=2` all read
correctly: the hyphen, slash and spaces belong to the names. A name that
contains a dot or an operator, or is also a keyword, goes in double quotes:
`/"Wolf.Bane".progress++`.

### Operators

| Operator | Meaning                                                                     | Example                          |
| -------- | --------------------------------------------------------------------------- | -------------------------------- |
| (none)   | Show the value in the status line. Logs nothing.                            | `/mana` → "Mana 3/10"            |
| `++`     | Add 1. True/false: set true, only if it's false.                            | `/momentum++`, `/wounded++`      |
| `--`     | Take away 1. True/false: set false, only if it's true.                      | `/supply--`, `/wounded--`        |
| `+=n`    | Add `n`, a positive whole number. On a track, see [units](#kinds-of-value). | `/health+=2`, `/foe.progress+=2` |
| `-=n`    | Take away `n`. `-=harm` takes the foe's harm.                               | `/health-=2`, `/health-=harm`    |
| `=v`     | Set it: a number, a list option, or text.                                   | `/xp=12`, `/initiative=foe`      |
| `!`      | Flip a true/false value.                                                    | `/wounded!`                      |

`=` takes the rest of the line as its value; double quotes around it are
optional (`/hawk.companion-name="Ash"`). `=-2` sets −2; `-=2` takes 2 away.

Every change goes through the value's rules: it's held to the value's range,
refused if the value is read-only, and logged with the same line a click on
the sheet writes ("Momentum: 2 → 4 (+2)", "Health: 4 → 5 (+2, max 5)").

### Kinds of value

**Numbers** (momentum, health, mana, a companion's health…) take every
operator but `!`. A change past the range stops at its edge and says so.

**True/false** values (the eight debilities, switch fields, `vanquished`,
`complete`) are 0 or 1: any number above 0 is true, 0 is false. `++` and `--`
set them, `!` flips them, `=n` sets them (`=3` is true).

**Lists** (dropdown and radio fields, `initiative`, a vow's `status`) take
`=` with an option's label or id, ignoring case. `++`, `--` and `!` are
refused: a list has no "next". A value that isn't an option is refused with
the options listed (`Region has no option "Timbuktu": Barrier Islands, …`),
unless the field allows custom values ([below](#declaring-fields)), when it's
stored as typed.

**Text** fields take `=` with the text. Markdown fields (notes) are edited on
the sheet only.

**Progress tracks** (a foe's, journey's, site's, scene's or vow's
`progress`, and a character's `bonds` and `failures`) hold 40 ticks, 10
boxes of 4. A number on a track counts by the game's rules unless it carries
a unit:

| Written | Means                                                                                                                                                                                   | Example             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `n`     | `n` marks: counted by the game condition the track depends on, its rank (Troublesome 12 ticks a mark, Dangerous 8, Formidable 4, Extreme 2, Epic 1). With no such condition, `n` ticks. | `/foe.progress+=2`  |
| `nb`    | `n` boxes, 4 ticks each, whatever the rank.                                                                                                                                             | `/foe.progress=4b`  |
| `nt`    | `n` ticks.                                                                                                                                                                              | `/foe.progress+=3t` |

So `=1`, `=1t` and `=1b` differ: on a Dangerous foe, `/foe.progress=1` is 8
ticks, `=1t` is 1 tick and `=1b` is 4. A track with no condition to count by
treats a plain number as ticks: bonds and failures, which have no rank, and
a track whose rank isn't set.

`++` and `--` are one mark, so the same rule applies: one mark by rank, or
one tick with none. Showing a track gives boxes and ticks:
`/foe` → "Wolf (Dangerous): 3 boxes, 2 ticks".

**Harm** is the harm of the foe by its rank, Troublesome 1 to Epic 5. It's
an amount, written after `+=` or `-=`: `/health-=harm`. Typed, it's the
active foe's; in a log link, the foe the entry was made against.

### Owners and names

| Owner                                | Example                                        | Notes                                        |
| ------------------------------------ | ---------------------------------------------- | -------------------------------------------- |
| (left out)                           | `/health-=2`                                   | The active character; for supply, the party. |
| Another character, by name           | `/Bjorn.health-=2`                             | Acts on Bjorn without making him active.     |
| `foe`, `journey`, `site`, `scene`    | `/foe.progress++`                              | The active one of that kind.                 |
| A foe, expedition or vow, by name    | `/Wolf.progress++`, `/Avenge Bjorn.progress++` |                                              |
| An asset, by name or id              | `/hawk.health--`, `/companion/hawk.health--`   | One of the active character's assets.        |
| A companion, by the name you gave it | `/Ash.health--`                                |                                              |
| `self` (content only)                | `self.health >= 1`                             | The asset a condition or link belongs to.    |
| `vow`, `companion` (content only)    | `/vow.menace++`                                | The one chosen in the Moves dialog.          |

Typed commands may use the names you gave things. Content (links in move and
asset text, conditions) uses ids and keywords only, because a display name
can read differently from one language or content pack to another.

A party value has one home, so it takes no owner: `/Bjorn.supply++` is
refused ("Supply is the party's: /supply++").

`vow` and `companion` are content-only keywords too: in a move's links they
mean the vow or companion chosen in the Moves dialog ([below](#moves-that-act-on-a-vow-or-a-companion)).

### When names collide

Names you give things needn't be unique: a character and a foe can both be
called Wolf, and two foes can both be called Raider. Content never meets the
problem, since it uses ids and keywords. Typed commands resolve a name in
three steps:

1. **Only things that have the value count.** Foes have no `health` and
   characters no `progress`, so `/Wolf.health--` is the character and
   `/Wolf.progress++` the foe. Most collisions end here.
2. **Keywords and built-in values win over names.** A foe called "Supply" is
   reached by quoting it: `/"Supply".progress++`.
3. **Still more than one?** The command is refused, listing them ("Barrow is
   a foe and a site"), and typeahead shows one row each, with its kind and
   current value. Choosing a row inserts a qualifier: the kind before the
   name, `/foe:Barrow.progress++`, `/site:Barrow.progress++`; and, between
   two of the same kind, its place in that area's list, `/foe:Raider#2`.

A qualifier is never wrong, so it's always accepted, but typeahead only
writes one when it's needed. `=` on a kind looks only at that kind, so
`/foe=Wolf` needs a qualifier only between two foes called Wolf.

### Making something active

`=` on a kind's keyword chooses which one is active:

| Command                  | Meaning                                     |
| ------------------------ | ------------------------------------------- |
| `/character=Bjorn`       | Bjorn becomes the active character.         |
| `/foe=Wolf`              | Wolf becomes the active foe.                |
| `/journey=The Long Road` | That journey becomes the active expedition. |
| `/site=The Barrow`       | That site becomes the active expedition.    |
| `/scene=Duel at Dawn`    | That scene becomes the active expedition.   |
| `/foe`                   | Shows the active foe.                       |

One expedition is active at a time, whatever its kind: after
`/scene=Duel at Dawn`, `/journey` answers "No active journey: the active
expedition is the scene Duel at Dawn".

### Verbs

Seven commands do things that aren't values. A verb takes free text after
it, so operators don't apply.

| Command                                      | Does                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `/move <name> [n]`                           | Opens the move. A number is the harm or amount it asks for (`/move endure harm 2`). |
| `/oracle <name>`                             | Opens the oracle.                                                                   |
| `/roll <dice>…`                              | Rolls dice: `/roll 2d10 1d6+2` (as today).                                          |
| `/note <text>`                               | Adds a note. Text with no `/` in front does the same.                               |
| `/burn`                                      | Burns momentum on the newest action roll.                                           |
| `/story start`, `/story end`, `/story write` | Marks the start or end of a story section, or opens Generate on it.                 |
| `/help [topic]`                              | Opens the command help, on a topic if given (`/help progress`).                     |

### Everything it does

| Ability                                     | Command                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| Change momentum, health, spirit, supply, XP | `/momentum++`, `/health-=2`, `/supply+=1`, `/xp=12`                                    |
| Take the foe's harm                         | `/health-=harm`                                                                        |
| Spend XP                                    | `/xp-=3`                                                                               |
| Bonds, failures                             | `/bonds++`, `/failures+=1b`, `/failures=0`                                             |
| Stats                                       | `/edge=3`                                                                              |
| Debilities                                  | `/wounded++`, `/wounded--`, `/wounded!`                                                |
| Initiative                                  | `/initiative=foe`, `/initiative=none`                                                  |
| Burn momentum                               | `/burn`                                                                                |
| Content-pack fields                         | `/mana--`, `/hawk.health--`, `/Ash.health--`, `/touched`                               |
| Another character's value                   | `/Bjorn.health-=2`                                                                     |
| Make a character, foe or expedition active  | `/character=Bjorn`, `/foe=Wolf`, `/site=The Barrow`                                    |
| Foe progress                                | `/foe.progress++`, `/foe.progress+=2`, `/foe.progress=4b`, `/foe.progress+=3t`         |
| Expedition progress                         | `/journey.progress++`, `/site.progress++`, `/scene.progress++`                         |
| Scene countdown                             | `/scene.countdown++`                                                                   |
| Vanquish, complete, reopen                  | `/foe.vanquished++`, `/journey.complete++`, `/foe.vanquished--`                        |
| Site theme or domain                        | `/site.theme` (opens the picker), `/site.theme=Ancient`                                |
| Vow progress, menace, status                | `/Avenge Bjorn.progress++`, `/Avenge Bjorn.menace++`, `/Avenge Bjorn.status=fulfilled` |
| Open a move or an oracle                    | `/move face danger`, `/oracle region`                                                  |
| Roll dice, write a note                     | `/roll 2d10 1d6+2`, `/note …` or plain text                                            |
| Story sections, help                        | `/story start`, `/story end`, `/story write`, `/help`                                  |

### Errors

A command that can't run changes nothing and says why in the status line:

- `Mana is read-only.` (a field declared `"writable": false`)
- `Mana isn't true/false.` (`/mana!`)
- `Health takes no unit.` (`/health-=2b`: units are for tracks)
- `Region has no option "Timbuktu": Barrier Islands, Ragged Coast, …`
- `Edda has no Hawk.` (an asset she doesn't own)
- `No active foe.` (`/foe.progress++` with none)
- `No foe to take harm from.` (`/health-=harm` with none)
- `Supply is the party's: /supply++`
- `Unknown name "Wlof". Did you mean Wolf?`

### Typeahead

Nobody should have to remember the syntax. The suggestion strip above the
input follows the cursor through the command, one slot at a time, and shows
what Enter would do before it's pressed.

**What it suggests, slot by slot**

| Typed so far                  | Suggests                                                                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                           | Everything that can start a command: the active character's values, the kind keywords, names, and the verbs. Each row has a kind icon and its current value or active name: "health 4/5", "foe — Wolf", "Bjorn (character)", "move…". |
| `/he`                         | The same, narrowed: matches at the start of a word first (`health`, `heart`), then anywhere in a name.                                                                                                                                |
| `/hawk.` (an owner)           | That owner's values: "health 2/3", "companion-name Ash".                                                                                                                                                                              |
| `/health`                     | The operators that fit, each with its result: "`++` Health 4 → 5", "`-=harm` Health 4 → 2 (Wolf's harm)", "`=`". A read-only value shows a lock and only "(show)".                                                                    |
| `/initiative=`, `/touched=`   | The options, the current one ticked. A custom field adds a "Use "…"" row for the typed text.                                                                                                                                          |
| `/foe=`                       | The foes, the active one ticked; `/journey=`, `/site=` and `/scene=` list their kind.                                                                                                                                                 |
| `/foe.progress+=2`            | The units, each with its result: "(marks) 3 → 7 boxes", "`b` 3 → 5 boxes", "`t` 3 → 3 boxes 2 ticks".                                                                                                                                 |
| `/move `, `/oracle `          | Moves or oracles. Moves that can't be made now are greyed, with the condition that fails.                                                                                                                                             |
| `/roll `, `/story `, `/help ` | Dice presets; `start`, `end`, `write`; help topics.                                                                                                                                                                                   |

**The top row** always says what Enter does with the input as it stands:
"Enter: Health 4 → 2", "Enter: Wolf becomes the active foe", or the error
it would give ("Mana is read-only"). An incomplete command says what's
missing ("Needs an operator: ++ -- += -= = !").

**Ghost text**: the rest of the highlighted suggestion shows greyed after the
cursor. <kbd>→</kbd> at the end of the input or <kbd>Tab</kbd> accepts it.

**Keys**

- <kbd>Tab</kbd>: accept the highlighted suggestion. Accepting an owner adds
  its `.`, so the next slot opens at once.
- <kbd>↑</kbd> / <kbd>↓</kbd>: move through the suggestions. In an empty
  input, they step through the commands you've run, newest first (kept on
  this device).
- <kbd>Enter</kbd>: run the input if it's a whole command; otherwise accept
  the highlighted suggestion, as <kbd>Tab</kbd> does.
- <kbd>Esc</kbd>: clear the input.

**Names** are inserted as written, spaces and all; quotes are added only
when a name needs them (it contains a dot or an operator, or is a keyword).

**On a phone** the strip's rows are tap targets: a tap is <kbd>Tab</kbd>. A
row of operator keys (`++` `--` `+=` `-=` `=` `!` `.`) sits at the end of the
strip, since phone keyboards bury those characters.

## Log links

### Writing them

In move, asset and oracle text, a link's target is a command:

```markdown
[take +1 momentum](/momentum++)
[Inflict double harm](/foe.progress+=2)
[suffer -1 supply](/supply--)
[mark wounded](/wounded++)
[Endure Harm](/move endure harm)
[Roll on Region](/oracle region)
```

A link in content uses ids and keywords (`foe`, `journey`, `site`, `scene`,
`self`, `companion/hawk`), never display names. The content linter
(`scripts/lint-dsl.mjs`) and the manifest checker parse every link's command
and fail the build on one that doesn't parse or names nothing.

### Clicking them

When the app writes a log entry (a move's outcome, a rolled oracle), each
link records its command and the character, foe and expedition the entry
was made for. Clicking it runs the command for that character, against that
foe and expedition, not whatever is active now. The log line is the one
typing the command writes, and the link is struck through, spent.

A link runs only commands that change a value, `/burn`, `/move` and
`/oracle`. It can't make something active, write a note, mark a story
section or open help. A link whose command can't run (a read-only field, an
asset the character no longer has, a deleted foe) says why and stays
unspent.

### Old links

Links already in saved logs, in the old forms, stop doing anything; their
text stays. Old backups imported later are the same. The content's old-form
links (about 650, in `[label](scheme:path?value=…)` form) are rewritten to
commands by a one-off script in the same change, and the linter then rejects
the old form.

## Conditions

### Shape

A condition is one expression, a string:

```json
"preconditions": "character & foe & initiative == character"
```

| Operator                    | Meaning                                                       |
| --------------------------- | ------------------------------------------------------------- |
| `==` `!=` `>=` `<=` `>` `<` | Compare a value with a number (`2`, `2b`, `3t`) or an option. |
| `&`                         | And.                                                          |
| `\|`                        | Or.                                                           |
| `!`                         | Not (written before what it negates).                         |
| `( )`                       | Group.                                                        |

`!` binds tightest, then comparisons, then `&`, then `|`:
`!wounded & mana >= 2 | self.health >= 1` means
`((!wounded) & (mana >= 2)) | (self.health >= 1)`.

A value on its own is true when it's above 0, set, or exists: `wounded` (a
debility), `companion/hawk` (an owned asset), `foe` (there's an active foe),
`origin` (an origin is chosen).

`!` before a name is "not", in conditions; `!` after a value, in a command,
is "flip". They never meet: a command doesn't take an expression.

### Names in conditions

The same values and owners as commands, with ids only:

| Name                                                      | True / reads as                                                                               |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `character`                                               | There's an active character.                                                                  |
| `foe`, `journey`, `site`, `scene`                         | There's an active one of that kind.                                                           |
| `initiative == character` (`foe`, `none`)                 | Who has initiative.                                                                           |
| `momentum`, `health`, `edge`, `mana`, …                   | The value, as a number.                                                                       |
| `bonds >= 2b`                                             | A track: a plain number as for commands (marks by rank, ticks with none), or with `b` or `t`. |
| `wounded`, `!shaken`                                      | A debility.                                                                                   |
| `touched >= prime`                                        | A list: by its options' order.                                                                |
| `companion/hawk`                                          | The active character owns that asset.                                                         |
| `companion/hawk \| companion/raven`                       | Owns either.                                                                                  |
| `self.health >= 1`                                        | A value of the asset this condition belongs to.                                               |
| `vowCount`, `assetCount`, `companionCount`, `rarityCount` | Counts.                                                                                       |

### Where they go

- A move's or an asset's `preconditions`: one expression.
- A field's `if`: one expression; while it's false the field is hidden.

### Today's conditions

The 102 conditions in content today use two operators, `eq` and `min`. A
one-off script converts them; the object form is then rejected.

| Today                                       | Expression                  |
| ------------------------------------------- | --------------------------- |
| `[{ "key": "hasCharacter", "eq": 1 }]`      | `"character"`               |
| `[{ "key": "hasFoe", "eq": 0 }]`            | `"!foe"`                    |
| `[{ "key": "initiative", "eq": 1 }]`        | `"initiative == character"` |
| `[{ "key": "touched", "min": 1 }]`          | `"touched >= prime"`        |
| `[{ "key": "supply", "min": 1 }]`           | `"supply >= 1"`             |
| `[{ "key": "bonds", "min": 2 }]` (boxes)    | `"bonds >= 2b"`             |
| `[{ "key": "companion/hawk", "eq": 1 }]`    | `"companion/hawk"`          |
| `[{ "key": "hasAnyAsset", "ids": [a, b] }]` | `"a \| b"`                  |
| A list of several                           | Joined with `&`             |

### Failure messages

Built from the expression, as they're built from the objects now: "Requires
Touched: Prime or higher", "Requires an active foe", "Requires no active
foe", "Requires Supply 1 or more", "Requires Hawk or Raven". For `&`, the
first part that fails; for `|`, every part.

### Checking

The expression parser lives in `packages/shared`, so the web app and
`scripts/gen-extensions-manifest.mjs` use the same one. The build fails on
a condition that doesn't parse or names a value that doesn't exist, with the
position in the string.

## Values

### Built in

| Name                                                                                          | Belongs to                     | Values                                | Writable |
| --------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------- | -------- |
| `momentum`                                                                                    | character                      | −6 to max (10, less one per debility) | yes      |
| `health`, `spirit`                                                                            | character                      | 0–5                                   | yes      |
| `supply`                                                                                      | party                          | 0–5, shared by every character        | yes      |
| `xp`                                                                                          | character                      | 0–30                                  | yes      |
| `edge`, `heart`, `iron`, `shadow`, `wits`                                                     | character                      | 0–4                                   | yes      |
| `bonds`, `failures`                                                                           | character                      | track, 0–40 ticks                     | yes      |
| `wounded`, `shaken`, `unprepared`, `encumbered`, `maimed`, `corrupted`, `cursed`, `tormented` | character                      | true/false                            | yes      |
| `initiative`                                                                                  | character                      | `none`, `character`, `foe`            | yes      |
| `progress`                                                                                    | foe, journey, site, scene, vow | track, 0–40 ticks, by its rank        | yes      |
| `vanquished`                                                                                  | foe                            | true/false                            | yes      |
| `complete`                                                                                    | journey, site, scene           | true/false                            | yes      |
| `countdown`                                                                                   | scene                          | 0–4 segments                          | yes      |
| `menace`                                                                                      | vow                            | 0–10                                  | yes      |
| `status`                                                                                      | vow                            | `active`, `fulfilled`, `forsaken`     | yes      |
| `theme`, `domain`                                                                             | site                           | list (Delve)                          | yes      |
| `vowCount`, `assetCount`, `companionCount`, `rarityCount`                                     | character                      | counts                                | no       |

### Scopes

A content pack's field has one of four scopes, which say whose it is:

| Scope       | One value per…                                    | Example          | Stored in (unchanged)                              |
| ----------- | ------------------------------------------------- | ---------------- | -------------------------------------------------- |
| `party`     | campaign, every character sees it                 | (supply is one)  | each character's `fields`, copied to all on change |
| `character` | character                                         | touched          | `data.fields`                                      |
| `global`    | character, shared by every asset that declares it | mana             | `data.globalValues`                                |
| `asset`     | owned asset                                       | companion health | `asset.customValues`                               |

Storage doesn't change, so import and export need no migration.

### Declaring fields

In `extension.json`, `fields` (renamed from `characterFields`, with
`fieldsHeading` from `characterFieldsHeading`) declares a pack's party,
character and global fields:

```jsonc
"fields": [
  {
    "id": "mana",
    "scope": "global",
    "type": "counter",
    "label": "Mana",
    "shortLabel": "Mana",
    "maxValue": 10,
    "default": "0",
    "icon": "mana"
  },
  {
    "id": "touched",
    "type": "dropdown",
    "writable": false,
    …
  }
]
```

- `scope`: `party`, `character` (the default) or `global`.
- `writable`: `true` (the default) or `false`. A read-only field can be shown
  by commands and tested by conditions; commands and links can't change it.
  The sheet edits it either way. Region of origin, Religion and Touched are
  `false`.
- `custom` (dropdowns only): `true` lets a value that isn't an option be
  stored as typed; on the sheet the field becomes a combobox that takes text.
  A custom value has no place in the options' order, so a condition on such a
  field can only test whether something is chosen; the checker rejects any
  other comparison on it.

An asset declares its own `asset` fields in `customFields`, as now (they
take `writable` too). It refers to a `global` field rather than declaring it:

```jsonc
"customFields": [{ "field": "mana", "position": "bottom", "tooltipLabel": "Conclave Ritual" }]
```

The four Conclave Rituals each refer to mana this way, so its maximum,
default and icon are declared once. `"global": true` on an asset field is
gone.

The checker fails the build on a field id that's declared twice, clashes
with a built-in value or a keyword (`character`, `foe`, `journey`, `site`,
`scene`, `self`, `vow`, `companion`, `harm` and the verbs), or a `{ "field" }` that
names no global field in its pack or base.

## Moves that act on a vow or a companion

A foe, a journey, a site and a scene can be active, so a move's links reach
them through the active one. A vow and a companion are never active, so a
move that acts on one asks for it in the Moves dialog:

| Move                                                                            | Asks for                                | Its links                          |
| ------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------- |
| Reach a Milestone                                                               | a vow                                   | `[mark progress](/vow.progress++)` |
| Fulfill Your Vow                                                                | a vow                                   | Rolls against that vow's progress. |
| Forsake Your Vow                                                                | a vow                                   | Endure Stress at that vow's rank.  |
| Advance a Threat (Delve)                                                        | a vow                                   | `[mark menace](/vow.menace++)`     |
| Companion Endure Harm, and the companion parts of Make Camp, Sojourn and Battle | a companion, when there's more than one | `[-1 health](/companion.health--)` |

The choice binds `vow` and `companion` in the move's links, as the active
foe binds `foe`, and the log entry records it like the foe and expedition.
Typed, `vow` and `companion` have nothing to refer to:
`/vow.menace++` answers "Which vow? Name it: /Avenge Bjorn.menace++".

This also fixes two things that are wrong today: Fulfill Your Vow rolls
against a progress of 0, because nothing tells the dialog which vow; and
Advance a Threat's "mark menace" links add progress to the active foe.

## Build order

1. **Values.**
   - Field declarations: `fields`, `scope`, `writable`, `custom`, and mana declared once.
   - The value registry: reading, writing and ranges for every scope.
   - Conditions as expressions: the parser in `packages/shared`, and the 102 converted.
2. **Typed commands.**
   - The parser and resolver over the registry and the stores.
   - [Typeahead](#typeahead), and the help dialog.
   - [command-bar.md](command-bar.md) rewritten to this syntax, and the old verbs removed.
3. **Log links.**
   - Content links rewritten to commands by a script.
   - App-written links become command links bound to the entry.
   - The linter, the HTML sanitiser's allowlist and the AI export updated.
   - Browser tests for typing and clicking.

Each stage ships with its unit and browser tests, and the standing orders in
`CLAUDE.md` apply (catalogue counts, YRT reference pages, import and export).
