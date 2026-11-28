# Command language — spec

**Status: built.** Conditions, field declarations, the value registry, typed
commands with typeahead ([command-bar.md](command-bar.md)), and log links as
commands, with the Moves dialog asking for a vow or a companion. Where the
build settled something the design left open, it's said where it applies.

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
- **operator**: what to do with it. Left out, the command reads the value
  and changes nothing.

Naming something only ever reads it. Only an operator changes anything.

Every command that runs has output in the log, as on a command line: a read
as much as a change. `/foe.progress` writes an entry titled **Wolf —
Progress** reading **Progress: 2 boxes, 2 ticks** (boxes, then ticks, each
left out when there are none). An owner on its own (`/foe`, `/me`, a name)
writes a line per value: a foe's rank and progress, a character's health,
spirit, momentum and supply. A group (`/companions.health`) writes an entry
for each. A value already what a change asks for says so
(**Wounded: already Cleared**), and making something active says it is. A
command that can't run writes nothing; it says why in the status line.

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
| (none)   | Read the value: it's logged and said in the status line.                    | `/mana` → "Mana 3/10"            |
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
`/foe` → "Wolf (Dangerous foe): 3 boxes, 2 ticks".

**Harm** is the harm of the foe by its rank, Troublesome 1 to Epic 5. It's
an amount, written after `+=` or `-=`: `/health-=harm`. Typed, it's the
active foe's; in a log link, the foe the entry was made against.

### Owners and names

| Owner                                | Example                                        | Notes                                        |
| ------------------------------------ | ---------------------------------------------- | -------------------------------------------- |
| (left out)                           | `/health-=2`                                   | The active character; for supply, the party. |
| `me`                                 | `/me.health-=harm`                             | The active character, said: the same.        |
| Another character, by name           | `/Bjorn.health-=2`                             | Acts on Bjorn without making him active.     |
| `foe`, `journey`, `site`, `scene`    | `/foe.progress++`                              | The active one of that kind.                 |
| A foe, expedition or vow, by name    | `/Wolf.progress++`, `/Avenge Bjorn.progress++` | A vow: one of the active character's.        |
| An asset, by name or id              | `/hawk.health--`, `/companion/hawk.health--`   | One of the active character's assets.        |
| A companion, by the name you gave it | `/Ash.health--`                                |                                              |
| `companions`                         | `/companions.health++`                         | Every companion of the active character.     |
| `allies`                             | `/allies.spirit++`                             | Every other character.                       |
| `everyone`                           | `/everyone.momentum+=2`                        | The active character and every ally.         |
| `self` (content only)                | `self.health >= 1`                             | The asset a condition belongs to.            |
| `vow`, `companion` (content only)    | `/vow.menace++`                                | The one chosen in the Moves dialog.          |

Typed commands may use the names you gave things. Content (links in move and
asset text, conditions) uses ids and keywords only, because a display name
can read differently from one language or content pack to another.

A party value has one home, so it takes no owner: `/Bjorn.supply++` is
refused ("Supply is the party's: /supply++").

`vow` and `companion` are content-only keywords too: in a move's links they
mean the vow or companion chosen in the Moves dialog ([below](#moves-that-act-on-a-vow-or-a-companion)).

`companions` is every companion the active character has: one command (or
one click) gives each the same change, and each gets its own log entry, as
if it were typed by name: `/companions.health++` with Ash at 1 and Bran at 2
reads "Ash: Health 1 → 2; Bran: Health 2 → 3". A companion is a Companion
asset (the hawk, horse, hound and the rest of the animals, and Kindred); not
another character, and not an asset that only has health, like Awakening's
simulacrum, which "is not a companion and may not be healed". A character
with none answers "Bjorn has no companions."

`me` is you: the active character, or in a link the character its entry
was made for. `/me.health-=harm` is `/health-=harm` with the owner said, and
reads well beside `/allies.` and `/everyone.`. It's also initiative's
setting for you: `/initiative=me` (`none`, `me`, `foe`), and Strike's
condition is `initiative == me`. `/me` shows you; it chooses no one
(`/character=Edda` does).

`allies` is every other character ("everyone but me"; the rules' own word:
"any allies who choose to partake also take +1 health"), and `everyone` is
the active character and every ally: `/everyone.momentum+=2` reads "Bjorn:
Momentum 2 → 4; Edda: Momentum 2 → 4". In a link, "the active character" is
the one the entry was made for. A party value has one home, so
`/allies.supply++` is refused like `/Bjorn.supply++`. A move whose allies
"may each choose" (Make Camp, Sojourn) leaves the choosing to each: its
links are the roller's, and an ally's choice is typed (`/Edda.health++`).

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

Eight commands do things that aren't values. A verb takes free text after
it, so operators don't apply.

| Command                                      | Does                                                                                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/move <name> [n]`                           | Opens the move. A number is the harm or amount it asks for (`/move endure harm 2`).                                                                                                                                                               |
| `/oracle <name>`                             | Opens the oracle.                                                                                                                                                                                                                                 |
| `/roll <dice>…`                              | Rolls dice: `/roll 2d10 1d6+2` (as today).                                                                                                                                                                                                        |
| `/note <text>`                               | Adds a note. Text with no `/` in front does the same.                                                                                                                                                                                             |
| `/burn`                                      | Burns momentum on the newest action roll.                                                                                                                                                                                                         |
| `/discard <asset>`                           | Gives up one of the character's assets, as Delete on its card does: `/discard oathbreaker`. By its name, id or the name you gave it; in content, by id (`/discard path/oathbreaker`). What it held (a companion's health, its name) goes with it. |
| `/story start`, `/story end`, `/story write` | Marks the start or end of a story section, or opens Generate on it.                                                                                                                                                                               |
| `/help [topic]`                              | Opens the command help, on a topic if given (`/help progress`).                                                                                                                                                                                   |

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
| Give up an asset                            | `/discard oathbreaker`                                                                 |
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

| Typed so far                  | Suggests                                                                                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                           | Everything that can start a command: the active character's values, the kind keywords, names, and the verbs. Each row has a kind icon and its current value or active name: "health 4/5", "foe — Wolf", "Bjorn (character)", "move…".       |
| `/he`                         | The same, narrowed: matches at the start of a word first (`health`, `heart`), then anywhere in a name. `/pro` offers the active foe's and expedition's `foe.progress`, `journey.progress`.                                                  |
| `/hawk.` (an owner)           | That owner's values: "health 2/3", "companion-name Ash".                                                                                                                                                                                    |
| `/health`                     | The operators that fit, each with its result: "`++` Health 4 → 5", "`=`". With a foe active, health's first is "`-=harm` Health 4 → 2 (Wolf's harm)", so `/he`, Tab, Tab, Enter takes it. A read-only value shows a lock and only "(show)". |
| `/initiative=`, `/touched=`   | The options, the current one ticked. A custom field adds a "Use "…"" row for the typed text.                                                                                                                                                |
| `/foe=`                       | The foes, the active one ticked; `/journey=`, `/site=` and `/scene=` list their kind.                                                                                                                                                       |
| `/foe.progress+=2`            | The units, each with its result: "(marks) 3 → 7 boxes", "`b` 3 → 5 boxes", "`t` 3 → 3 boxes 2 ticks".                                                                                                                                       |
| `/move `, `/oracle `          | Moves or oracles. Moves that can't be made now are greyed, with the condition that fails.                                                                                                                                                   |
| `/roll `, `/story `, `/help ` | Dice presets; `start`, `end`, `write`; help topics.                                                                                                                                                                                         |

**The top row** always says what Enter does with the input as it stands:
"Enter: Health 4 → 2", "Enter: Wolf becomes the active foe", or the error
it would give ("Mana is read-only"). An incomplete command says what's
missing ("Needs an operator: ++ -- += -= = !").

**Ghost text**: the rest of the highlighted suggestion shows greyed after the
cursor. <kbd>→</kbd> at the end of the input or <kbd>Tab</kbd> accepts it;
so does <kbd>Space</kbd> partway through a word, as a phone keyboard's inline
prediction does (<kbd>Backspace</kbd> straight after undoes it). Once a word
is whole, Space is a space.

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

**On a phone** the strip's rows are tap targets: a tap is <kbd>Tab</kbd>.
Space partway through a word works as on a desktop, and a ↵ button by the
input (or the keyboard's send key) is <kbd>Enter</kbd>. A
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
[Endure Harm](/move endure-harm)
[Roll on Region](/oracle region)
```

A link in content uses ids and keywords (`foe`, `journey`, `site`, `scene`,
`vow`, `companion`, `companions`, `allies`, `everyone`, `companion/hawk`),
never display names. The content linter
(`scripts/lint-dsl.mjs`) parses every link's command and fails the build on
one that doesn't parse or names nothing. (The manifest checker,
`scripts/gen-extensions-manifest.mjs`, checks conditions, not links.)

### Clicking them

When the app writes a log entry (a move's outcome, a rolled oracle), each
link records its command and the character, foe and expedition the entry
was made for (plus the vow or companion its move chose, Endure Harm's amount,
and, for a `/burn` offer, the roll it's offered on). Clicking it runs the
command for that character, against that foe and expedition, not whatever is
active now; a binding the entry didn't record (an oracle rolled with no foe)
falls back to what's active. The log line is the one typing the command
writes, and the link is struck through, spent. A value already what the link
sets (You retain initiative, when you have it; Mark Shaken, when you're
shaken) writes no log line (typed, it would), says so in the status line,
and is spent all the same: what it asks for holds.

A link runs only commands that change a value, `/burn`, `/discard`, `/move`
and `/oracle` (and `/site.theme`, `/site.domain`, which open the site's
picker). A `/discard` link asks first, with the Delete Asset question the
card's Delete asks (`AssetDiscardConfirm`, mounted in `+layout.svelte`):
DELETE removes the asset from the character its entry was made for and
spends the link; Cancel leaves both. An ability's `log` uses it where the
rules say to discard the asset (Oathbreaker, at redemption). An asset's card
text can't: it links moves and oracles only. Typed, `/discard` doesn't ask:
the line typed is the intent.
It can't make something active, write a note, mark a story section or open
help. A link whose command can't run (a read-only field, an asset the
character no longer has, a deleted foe) says why in the command bar's status
line and stays unspent. A link that opens something (`/move`, `/oracle`, a
site's picker) stays live, since opening it changes nothing. A `/burn` offer
whose momentum has since fallen too low to improve its roll burns nothing and
is spent, its moment passed. A `/move` or `/oracle` link opens it even when its
content pack is off, as a saved log can name one from a pack turned off
since. Clicking does what the sheet would: the cascades (momentum lost past
0 health, Face Death at 0, …) follow a link as they follow a change on the
sheet.

### Old links

Links already in saved logs, in the old forms, stop doing anything; their
text stays. Old backups imported later are the same. The content's old-form
links (about 650, in `[label](scheme:path?value=…)` form) are rewritten to
commands by a one-off script in the same change, and the linter then rejects
the old form. The script missed End the Fight's `[Vanquish Foe](vanquish)`,
a bare target with no scheme, which showed as written until it became
`/foe.vanquished++`; the linter now rejects any target that isn't a command or
a `roll:` blank.

## Conditions

### Shape

A condition is one expression, a string:

```json
"preconditions": "character & foe & initiative == me"
```

| Operator                    | Meaning                                                       |
| --------------------------- | ------------------------------------------------------------- |
| `==` `!=` `>=` `<=` `>` `<` | Compare a value with a number (`2`, `2b`, `3t`) or an option. |
| `&`                         | And.                                                          |
| `\|`                        | Or.                                                           |
| `!`                         | Not (written before what it negates).                         |
| `( )`                       | Group.                                                        |

Comparisons bind tightest, then `!`, then `&`, then `|`; `!` negates the
test or group after it, so `!touched >= prime` is "not (touched >= prime)",
and `!wounded & mana >= 2 | self.health >= 1` means
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
| `initiative == me` (`foe`, `none`)                        | Who has initiative.                                                                           |
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

### Conversion from the object form

The 102 condition objects in content used two operators, `eq` and `min`. A
one-off script converted them to 70 expressions (one per move, asset or
field); the object form is now rejected.

| Today                                       | Expression           |
| ------------------------------------------- | -------------------- |
| `[{ "key": "hasCharacter", "eq": 1 }]`      | `"character"`        |
| `[{ "key": "hasFoe", "eq": 0 }]`            | `"!foe"`             |
| `[{ "key": "initiative", "eq": 1 }]`        | `"initiative == me"` |
| `[{ "key": "touched", "min": 1 }]`          | `"touched >= prime"` |
| `[{ "key": "supply", "min": 1 }]`           | `"supply >= 1"`      |
| `[{ "key": "bonds", "min": 2 }]` (boxes)    | `"bonds >= 2b"`      |
| `[{ "key": "companion/hawk", "eq": 1 }]`    | `"companion/hawk"`   |
| `[{ "key": "hasAnyAsset", "ids": [a, b] }]` | `"a \| b"`           |
| A list of several                           | Joined with `&`      |

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
| `initiative`                                                                                  | character                      | `none`, `me`, `foe`                   | yes      |
| `progress`                                                                                    | foe, journey, site, scene, vow | track, 0–40 ticks, by its rank        | yes      |
| `vanquished`                                                                                  | foe                            | true/false                            | yes      |
| `complete`                                                                                    | journey, site, scene           | true/false                            | yes      |
| `countdown`                                                                                   | scene                          | 0–4 segments                          | yes      |
| `menace`                                                                                      | vow                            | 0–10                                  | yes      |
| `status`                                                                                      | vow                            | `active`, `fulfilled`, `forsaken`     | yes      |
| `theme`, `domain`                                                                             | site                           | list (Delve)                          | yes      |
| `vowCount`, `assetCount`, `companionCount`, `rarityCount`                                     | character                      | counts                                | no       |

Setting a vow's `status` to `forsaken` (typed, or by a link) also writes what
the vow card's Forsake writes: "Forsook the iron vow **Avenge Bjorn**
(Dangerous) — [Endure Stress](/move endure-stress 2) (−2) for its rank".

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
"customFields": [{ "field": "mana", "position": "bottom" }]
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

| Move                     | Asks for    | Its links                                                                     |
| ------------------------ | ----------- | ----------------------------------------------------------------------------- |
| Reach a Milestone        | a vow       | `[mark progress](/vow.progress++)`                                            |
| Fulfill Your Vow         | a vow       | Rolls against that vow's progress.                                            |
| Forsake Your Vow         | a vow       | Use Move forsakes it; the entry has Endure Stress at that vow's rank.         |
| Advance a Threat (Delve) | a vow       | `[mark menace](/vow.menace++)`                                                |
| Companion Endure Harm    | a companion | `[-harm health](/companion.health-=harm)`, `[+1 health](/companion.health++)` |

A move says what it asks for with `"choose": "vow"` or `"choose":
"companion"`; the lint fails a move that links to `vow` or `companion`
without it. The choice binds `vow` and `companion` in the move's links, as
the active foe binds `foe`, and the log entry records it like the foe and
expedition.

The moves that give something to every companion don't ask: Make Camp's
Recuperate and Partake and Sojourn's Recuperate link "any companions" to
`/companions.health++` (`+=2` for Sojourn), beside the character's own
health, and Take a Hiatus (Delve) writes one link per companion below its
maximum, bound to it: "Ash +2 health" is `/companion.health=3`.

An asset's text links moves and oracles only, never a value: an asset
doesn't write to the log. What an ability gives is the player's to take,
with the Moves dialog's Relevant Assets row as the reminder; the groups make
it one command (Herbalist's meal: `/companions.health++`,
`/allies.health++`)
([data-schema.md → Move Links in Ability Text](data-schema.md#move-links-in-ability-text)).

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
