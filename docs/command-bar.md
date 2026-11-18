# Command Bar

The command bar is the input strip at the bottom of `/home`. Plain text goes
in the log as a note; a line starting with `/` is a command in the
[command language](command-language.md): show a value, change it, make
something active, or open a move or an oracle. Every change is held to the
value's rules and logged with the line a click on the sheet would write.

The bar exists so a session doesn't have to leave the keyboard: prose →
`/move strike` → `/foe.progress+=2` → `/health-=harm` → prose again.

This page is how the bar works. The language itself (operators, units,
owners, names, collisions) is specified in
[command-language.md](command-language.md); the in-app help
(`CommandHelpDialog`, the bar's **?** button or `/help`) is the same
reference, shorter.

## At a glance

| Typed                            | Does                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `Bjorn reaches the hall`         | Adds a note (as `/note …` does).                                                  |
| `/health`                        | Shows the active character's health in the status line.                           |
| `/momentum++`, `/supply--`       | Adds or takes away 1.                                                             |
| `/health+=2`, `/health-=2`       | Adds or takes away an amount; `-=harm` takes the active foe's.                    |
| `/xp=12`, `/initiative=foe`      | Sets a value: a number, a list's option, or text.                                 |
| `/wounded!`                      | Flips a true/false value; `++` marks it, `--` clears it.                          |
| `/foe.progress+=2`               | Two marks on the active foe's track, by its rank (`b` boxes, `t` ticks).          |
| `/Bjorn.health-=2`               | Another character's value, without making them active.                            |
| `/Ash.health--`                  | A companion by the name you gave it (or `/hawk.health--`).                        |
| `/me.health-=harm`               | You, said: the same as `/health-=harm`.                                           |
| `/companions.health++`           | Every companion of the active character, each changed alike.                      |
| `/allies.spirit++`               | Every other character (`/everyone.spirit++`: you and them).                       |
| `/Avenge Bjorn.menace++`         | A vow by its name.                                                                |
| `/foe=Wolf`                      | Makes Wolf the active foe (also `/character=`, `/journey=`, `/site=`, `/scene=`). |
| `/foe:Raider#2.progress++`       | A name two things share: the kind before it, and which of two.                    |
| `/move face danger`              | Opens a move; `/move endure harm 2` with an amount.                               |
| `/oracle region`                 | Opens an oracle.                                                                  |
| `/roll 2d10 1d6+2`               | Rolls dice and logs them.                                                         |
| `/burn`                          | Burns momentum on the newest action roll.                                         |
| `/story start` / `end` / `write` | Marks a story section, or opens Generate on it.                                   |
| `/help tracks`                   | Opens the help at a topic.                                                        |

Old verbs (`/vital`, `/char`, `/exp`, `/debility`, `/bonds +`, `/start`, …)
are gone, with no aliases.

## Typeahead

Nobody should have to remember the syntax. The suggestion strip above the
input follows the command slot by slot:

| Typed so far                  | Suggests                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`, `/he`, `/pro`            | The kind keywords (with what's active), the active character's values (with their values), the active foe's and expedition's values through their keyword (`foe.progress`, `scene.countdown`), the verbs, and the names: characters, foes, expeditions, the active character's vows and assets. |
| `/hawk.`                      | That owner's values.                                                                                                                                                                                                                                                                            |
| `/health`                     | The operators that fit, each with its result: `++ Health 4 → 5`. With a foe active, health's first is `-=harm Health 4 → 2 (Wolf’s harm)`. A read-only value shows only "(show)".                                                                                                               |
| `/initiative=`                | The options, the current one ticked; a field that takes its own values adds "Use “…”".                                                                                                                                                                                                          |
| `/foe=`                       | The foes, the active one ticked, two of a name numbered (`Raider#2`).                                                                                                                                                                                                                           |
| `/foe.progress+=2`            | The units with what each comes to: `2` (marks), `2b`, `2t`.                                                                                                                                                                                                                                     |
| `/move `, `/oracle `          | Moves (those that can't be made now greyed, saying why) or oracles.                                                                                                                                                                                                                             |
| `/roll `, `/story `, `/help ` | Dice presets; `start`, `end`, `write`; help topics.                                                                                                                                                                                                                                             |

The **top row** says what <kbd>Enter</kbd> does with the input as it stands
("Enter: Health 4 → 2", "Enter: Wolf becomes the active foe", or the error
it would give). While a command can't run yet but a suggestion fits, it says
what Enter will complete it to ("Enter: /health").

**Ghost text**: the rest of the highlighted suggestion shows greyed after
the caret.

**The quick paths in a fight**: `/he`, Tab, Tab, Enter takes the active
foe's harm (Tab takes `health`, Tab again its first operator, `-=harm`);
`/pro`, Tab, Tab, Enter marks progress on the active foe by its rank
(`/foe.progress++`). Enter on a value alone only shows it: naming a value
never changes it.

**Keys**

- <kbd>Tab</kbd> — take the highlighted suggestion. An owner brings its dot,
  so its values come next.
- <kbd>→</kbd> at the end of the input — take the ghost text.
- <kbd>↑</kbd> / <kbd>↓</kbd> — move through the suggestions. In an empty bar
  they step through the commands run before (newest first, kept in
  `localStorage` under `ironledger:command-history`, 50 at most).
- <kbd>Enter</kbd> — run the input if it's a whole command; otherwise take
  the highlighted suggestion (and run it, when that makes a whole command:
  an operator like `++`, an option, a foe after `/foe=`, a move). Moving the
  highlight with ↑/↓ first makes Enter take that row.
- <kbd>Esc</kbd> — clear the bar.

**On a phone** (a coarse pointer) a tap on a row takes it, as Tab does, and a
row of operator keys (`++` `--` `+=` `-=` `=` `!` `.`) sits under the
suggestions, since phone keyboards bury those characters.

## How it's built

Four modules under `apps/web/src/lib/commands/`, the first three pure:

| Module          | Does                                                                                                                                                                                                                                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parse.ts`      | Syntax only: `/[owner.]value[operator]`, the seven verbs, quotes, `kind:` qualifiers and `#n`, amounts (`2`, `2b`, `3t`, `harm`), `/roll` dice. Never fails on a half-typed command: a lone `+` or an open quote is reported, not refused.                                                                                                                  |
| `values.ts`     | **The value registry.** Every value an owner has — a character's built-ins and its content packs' fields (party, character and global), a foe's, an expedition's, a vow's, an asset's — bound to the owner's live object, with its kind (number, true/false, list, text, track, notes), its range or options, whether it's writable, and a `get` and `set`. |
| `change.ts`     | `planChange()`: what an operator does to a value, without doing it — before and after, held to the range, the log line the sheet writes, and a summary ("Health 4 → 5 (max 5)").                                                                                                                                                                            |
| `resolve.ts`    | `plan(input, world)`: names and keywords to owners (only owners that have the value count; keywords win over names; a collision lists how to name each), then a `Plan` — show, change, select, a verb, or an error.                                                                                                                                         |
| `suggest.ts`    | `suggest(input, world)`: the rows for the slot being typed and the top row. `ghostText()`. `HELP_TOPICS`, the help dialog's sections.                                                                                                                                                                                                                       |
| `run.svelte.ts` | `buildWorld()` from the stores (characters, foes, expeditions, what's active, the enabled packs' fields, moves and whether each can be made now, oracles); `runPlan()` carries a plan out.                                                                                                                                                                  |

`CommandBar.svelte` builds the world (`$derived`), shows `suggest()`'s rows,
and on Enter hands the plan to `runPlan()`.

### What running a plan does

| Plan                | Runner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| change              | Writes through the registry's `set` on the live store object, logs `title` + `line`, saves (`flushCharacterToApi`, `flushEncountersToApi`, `persistExpeditionsNow`). A party value reaches every character (`setPartySupply`, `setPartyFields`). Cascades as the sheet's do: marking a debility brings momentum down to its new top; a resource reaching its floor logs the floor rule (`FLOOR_RULES`); a field an asset's ability limit follows unmarks abilities above it (`capAbilitiesForField`). |
| select              | `setActiveCharacterId` / `setActiveFoeId` / `setActiveExpeditionId`.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| show                | The status line. `/site.theme` and `/site.domain` also open the site's picker (`ironledger:site-picker` → `/home`'s `ExpeditionsArea` ref).                                                                                                                                                                                                                                                                                                                                                           |
| `/move`, `/oracle`  | `ironledger:open-move` (`{ id, harm }`) / `ironledger:open-oracle` (`{ key }`), handled by `+layout.svelte`.                                                                                                                                                                                                                                                                                                                                                                                          |
| `/roll`             | Rolls (`rollDie`), animates (`animateDice`), logs each group.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `/burn`             | `ironledger:burn` with a `reply` callback: LogPanel burns momentum on the newest action roll when a burn is on offer for it (its burn link), spends that link, and replies.                                                                                                                                                                                                                                                                                                                           |
| `/story`            | `sectionStore.setStart` / `setEnd` on the newest entry; `write` dispatches `ironledger:story-generate`.                                                                                                                                                                                                                                                                                                                                                                                               |
| `/note`, plain text | `appendLog('Note', renderNote(text))`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `/help`             | `CommandHelpDialog.open(topic)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Log links are commands too (`runLink`, the same runner, bound to the entry
they're in: [log.md → Command links](log.md#command-links)), so a link and a
typed command change a value the same way and log the same line.

## Mobile

Every command works from a phone keyboard. The story-selection UI around the
log is hidden below 768px (see
[mobile.md](mobile.md#ai-story-selection--desktop-only)), but `/story start`,
`end` and `write` still work: they change the same `sectionStore`.

## Tests

- **Unit** ([`apps/web/tests/unit/commands.test.ts`](../apps/web/tests/unit/commands.test.ts)),
  on a world built by hand: the parser (spaces, where names end, quotes,
  qualifiers, amounts), every kind of value and operator, units on tracks,
  harm, read-only and party values, owners by keyword, name, id and given
  name, collisions and the references that resolve them, making something
  active, the verbs, and the typeahead rows and top row.
- **Browser** ([`command-bar.spec.ts`](../apps/web/tests/e2e/command-bar.spec.ts)):
  changes reach the sheet, the log and the server; foes and expeditions by
  keyword and name; mana held to its declared range and a read-only field
  refused; Tab, Enter, ↑ and the dialogs; the phone's operator keys. The
  ranges are also covered in `log-inject.spec.ts` (`/health=9`) and party
  supply in `supply-sync.spec.ts` (`/supply=1`).

## Adding to it

- **A value** — a content pack declares a field ([command-language.md →
  Declaring fields](command-language.md#declaring-fields)) and it's a value
  at once: shown, changed, suggested. A new built-in value goes in
  `values.ts` (`characterValues` or the owner's case in `valuesOf`).
- **A verb** — add it to `VERBS` in `parse.ts`, its plan in `resolve.ts`
  (`onVerb`), its rows in `suggest.ts` (`verbSlot`, `VERB_HINTS`), its
  running in `run.svelte.ts`, a row in `CommandHelpDialog`, and tests.
  Verbs are for what isn't a value; a thing with a value is better reached
  as one.
- **A cross-component signal** — a `CustomEvent` named `ironledger:…`,
  listened for in `/home/+page.svelte` (area refs) or `+layout.svelte`
  (dialog refs).
