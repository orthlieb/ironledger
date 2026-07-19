# Command Bar

The command bar is the always-visible input strip at the bottom of `/home`. It
accepts freeform prose (added to the log as a Note) or slash commands that
drive the same surfaces the buttons and dialogs do — moves, oracles, active
character/foe/expedition, vitals, debilities, tracks, story sections. The
whole surface is a single reactive Svelte component
(`apps/web/src/lib/components/CommandBar.svelte`) plus a pure parser
(`apps/web/src/lib/commandBar.ts`).

The bar exists so a session doesn't have to leave the keyboard for the most
frequent actions. When you're playing, the loop is prose → `/move face` →
`/foe +2` → prose again; every command opens or drives what a button would,
and every mutation lands in the session log with the same formatting as a
click would produce.

## Input contract

- **Bare prose** → Note log entry (rendered through `renderNote()`).
- **`/verb …`** → slash command; unknown verbs surface `Unknown command:
/verb. Type /help for a list.`
- **Empty input** → nothing happens.

Verb names and enum tokens are matched case-insensitively; freeform text
arguments (names, notes) preserve case as-typed. Autocomplete assists every
slot; the parser itself is strict — no prefix matching on enums, no fuzzy
"did you mean" for names inside the parser (the _dispatcher_ resolves names
fuzzily against the appropriate store).

## Commands

### Log & notes

| Syntax         | Effect                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------- |
| `<prose>`      | Adds a Note log entry (light markdown → HTML).                                            |
| `/note <text>` | Same as bare prose.                                                                       |
| `/help`        | Opens the [Command Help Dialog](../apps/web/src/lib/components/CommandHelpDialog.svelte). |

### Session dialogs

| Syntax            | Effect                                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/oracle <table>` | Opens `OraclesDialog` on the matched table (fuzzy).                                                                                                             |
| `/move <name>`    | Opens `MovesDialog` on the matched move, filtered to moves available in the current precondition context (matches the "hide unavailable" toggle in the dialog). |

### Active context — overloaded verbs

All three follow the same argument-shape overload. Empty args opens the help
dialog scrolled to and highlighting the verb's row.

**`/char`** — active character

| Syntax         | Effect                                                                                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/char`        | Help focused on `char`.                                                                                                                                                                                                                            |
| `/char <name>` | Set active character (fuzzy match).                                                                                                                                                                                                                |
| `/char + [n]`  | Heal `n` health (default 1). Applied through the resource action bus (clamps 0..5).                                                                                                                                                                |
| `/char - [n]`  | Take `n` harm. **If `n` is omitted and a foe is active, `n` becomes that foe's rank harm** (troublesome=1 … epic=5) — the most common combat action becomes a single keystroke sequence. If no foe active, default is 1. Explicit `n` always wins. |

**`/foe`** — active foe

| Syntax          | Effect                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/foe`          | Help focused on `foe`.                                                                                                                     |
| `/foe <name>`   | Set active foe (fuzzy match).                                                                                                              |
| `/foe + [n]`    | Advance combat progress by `n` boxes. **Rank-aware** — `n` counts progress boxes; the FoesArea applier expands to `n × ticksPerBox(rank)`. |
| `/foe - [n]`    | Reduce combat progress by `n` boxes.                                                                                                       |
| `/foe vanquish` | Mark active foe vanquished. Does not delete the encounter.                                                                                 |
| `/foe active`   | Reactivate a previously-vanquished active foe (inverse of `vanquish`). No-op if the foe is already active.                                 |

**`/exp`** — active expedition

| Syntax        | Effect                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `/exp`        | Help focused on `exp`.                                                                                      |
| `/exp <name>` | Set active expedition (journey or site).                                                                    |
| `/exp + [n]`  | Advance by `n` marks. Difficulty-aware — ExpeditionsArea multiplies by `EXPEDITION_MARK_TICKS[difficulty]`. |
| `/exp - [n]`  | Reduce by `n` marks.                                                                                        |

`=` is deliberately absent on `/char`, `/foe`, `/exp` — the ticks-vs-boxes
semantics on foe/exp progress made `=N` ambiguous ("N ticks or N boxes?"),
and consistency across the three overloads wins over cleverness. For an
absolute set on any character field, use `/vital <res> = N`. Attempting `=`
returns an explicit "= is not supported here — use + or -" error.

### Character sheet edits

All require an active character; error message points at `/char <name>` if
none.

| Syntax                     | Effect                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/vital <name> <op> [n]`   | Adjust a vital. `name` = `momentum` \| `health` \| `spirit` \| `supply` \| `xp` \| `experience` (alias for xp). `op` = `+` \| `-` \| `=`. `n` defaults to 1 for `+/-`; is **required** for `=` (bare `=` errors). Negatives allowed on `=` (permitted where the field allows, e.g. momentum's -6 floor). Delegates to the existing resource/set action bus so the per-field clamps and auto-log lines flow through unchanged. |
| `/debility <name> <state>` | Mark a debility. `name` is one of the eight canonical debilities: `wounded`, `shaken`, `unprepared`, `encumbered`, `maimed`, `corrupted`, `cursed`, `tormented`. `state` = `on` \| `off` \| `toggle` (**required** — no default). `toggle` is resolved at dispatch time by reading the character's current value; the action bus itself only knows on/off.                                                                    |
| `/bonds <op> [n]`          | Edit the bonds track (0..40). Same operator grammar as `/vital`.                                                                                                                                                                                                                                                                                                                                                              |
| `/failures <op> [n]`       | Edit the failures track (0..40). Same operator grammar as `/vital`.                                                                                                                                                                                                                                                                                                                                                           |
| `/initiative <who>`        | Set combat initiative. `who` = `none` \| `character` \| `foe`. No numeric aliases (`/initiative 1` errors); no shortcuts (`char`, `me`, `you` all errored). Uses the `initiative` action-bus type, which clamps to 0..2 defensively and emits the log line `"Initiative: None → Character"`.                                                                                                                                  |

### Freeform dice

| Syntax           | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/roll <group>+` | Roll one or more dice groups. Each group is `[n]d<sides>[±k]`: `n` defaults to 1, `sides` is one of `4 \| 6 \| 8 \| 10 \| 12 \| 20 \| 100` (what `@3d-dice/dice-box-threejs` supports), `k` is an optional flat modifier. Up to `ROLL_MAX_GROUPS` (4) groups per `/roll`; `n ≤ ROLL_MAX_N` (10), \|k\| ≤ `ROLL_MAX_MODIFIER` (99). Drives the 3D dice animation when the `dice3d` preference is on; otherwise just logs. Each group's rolled values + sum land in a `"Roll — 2d10 1d6+2"` log entry, with a `Total` row when there's more than one group. No active-context requirement — the roll is freeform, unlike `/move` which needs a character. |

Examples:

```
/roll 2d10 1d6+2      # full action roll: challenge + action die + adds
/roll d100            # oracle
/roll 3d6+1 2d8-2     # two independent groups, each with its own sum
```

Autocomplete on `/roll ` offers presets for the common Ironsworn shapes
(`2d10 1d6`, `2d10`, `1d6`, `1d100`, `1d6+2`), prefix-filtered by what's
been typed.

### AI story sections

Section markers pin two log-entry ids (start ▲ and end ▼); the story flow
consumes the section. See [ai-story.md](ai-story.md) and
[log.md § Story sections](log.md#story-sections-----markers).

| Syntax   | Effect                                                                            |
| -------- | --------------------------------------------------------------------------------- |
| `/start` | Pin ▲ on the current newest log entry (open, growing selection).                  |
| `/end`   | Pin ▼ on the current newest log entry (closes the selection). Errors if no ▲ set. |
| `/story` | Open the Generate dialog on the current section. Errors if no section marked.     |

## Grammar reference (regex)

Per-verb patterns matching the full input after the leading `/`. Real
parsing is case-insensitive on the verb + enum tokens.

```regex
# ── simple ──
/help$
/note\s+(?<text>.+)$
/oracle\s+(?<key>.+)$
/move\s+(?<name>.+)$

# ── section markers (any trailing content ignored) ──
/(start|end|story)(\s+.*)?$

# ── initiative (exact enum) ──
/initiative\s+(?<who>none|character|foe)$

# ── vital (accepts =) ──
/vital\s+(?<name>momentum|health|spirit|supply|xp|experience)\s*(?<op>[+\-=])\s*(?<n>-?\d+)?$

# ── debility ──
/debility\s+(?<name>wounded|shaken|unprepared|encumbered|maimed|corrupted|cursed|tormented)\s+(?<state>on|off|toggle)$

# ── flat tracks (accept =) ──
/(?<track>bonds|failures)\s*(?<op>[+\-=])\s*(?<n>-?\d+)?$

# ── freeform dice ──
# One group per whitespace-separated token; 1..4 groups per command.
# Each group: [n]d<sides>[±k]
#   n ∈ 1..10, defaults to 1 when omitted
#   sides ∈ {4, 6, 8, 10, 12, 20, 100}   (dice-box-threejs set)
#   k ∈ -99..99, optional
/roll\s+(?<groups>((\d+)?d(\d+)([+\-]\d+)?\s*)+)$
# Per-group inner pattern (parseRollGroup consumes this):
#   ^(?<n>\d+)?d(?<sides>\d+)(?<mod>[+\-]\d+)?$

# ── overloaded verbs — order matters: subcommand → op → name ──
/char$                                            # help focus=char
/char\s+(?<op>[+\-])\s*(?<n>\d+)?$                # char-harm (bare op = defaulted)
/char\s+(?<name>[^+\-=\s].*?)\s*$                 # set active

/foe$                                             # help focus=foe
/foe\s+vanquish\s*$                               # vanquish subcommand
/foe\s+active\s*$                                 # reactivate (un-vanquish) subcommand
/foe\s+(?<op>[+\-])\s*(?<n>\d+)?$                 # foe-progress (boxes)
/foe\s+(?<name>[^+\-=\s].*?)\s*$                  # set active

/exp$                                             # help focus=exp
/exp\s+(?<op>[+\-])\s*(?<n>\d+)?$                 # exp-progress (marks)
/exp\s+(?<name>[^+\-=\s].*?)\s*$                  # set active
```

**Notes on the overloaded three.** The `name` pattern's `[^+\-=\s]`
first-char guard is what stops `+2` / `-3` / `= 4` from matching the name
branch. Any argument starting with an operator sign is an op — never a
name. `/foe vanquish` beats `/foe <name=vanquish>` by rule order; foes
cannot be named `vanquish` (repo policy).

**What the regexes don't capture** (and why the parser exists):

- `defaulted: true` on `char-harm` when `n` was omitted — needed so the
  dispatcher can substitute the active foe's rank harm.
- Error routing for `+ -N` (regex would match; parser rejects with "use
  the opposite operator for negative deltas").
- Structured `Command` output (regex tells you _if_, parser gives you
  _what_).

## Operators

Shared across `/vital`, `/bonds`, `/failures`, `/foe`, `/exp`, `/char`:

| Form    | Meaning      | Notes                                                                                                                                                                                          |
| ------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `+ [n]` | Delta up     | `n` defaults to 1; negative `n` rejected — flips the sign. Errors: `"Use - for negative deltas."`                                                                                              |
| `- [n]` | Delta down   | Same defaults / positivity rule.                                                                                                                                                               |
| `= n`   | Set absolute | `n` **required**; bare `=` errors with `"= needs a value (e.g. /vital xp = 12)."` Negatives allowed. **Only accepted on `/vital`, `/bonds`, `/failures`** — not on the three overloaded verbs. |

Both spaced and jammed forms parse: `/vital momentum + 2`, `/vital
momentum +2`, `/vital xp=12`, `/vital momentum = -3`. Whitespace around
the sign is optional.

## Autocomplete

The suggestion strip floats above the input and updates on every
keystroke. Discovery flow — the goal is that no one memorises syntax:

- **Verb** — `/` alone lists all verbs with one-line hints. Fuzzy prefix
  match narrows as you type.
- **Resource** (`/vital <?>`) — six aliases: `momentum`, `health`,
  `spirit`, `supply`, `experience`, `xp`. `xp` shows `alias for
experience`.
- **Operator** (`/vital <res> <?>`, `/bonds <?>`, `/failures <?>`) — `+`,
  `-`, `=` with per-op hints.
- **Debility name** then **state** (`/debility <?>` then `/debility <name>
  <?>`) — two-stage autocomplete for the 8 × 3 combinations.
- **Initiative value** (`/initiative <?>`) — three enum values with
  "who holds it" hints.
- **Overloaded verbs** — when the corresponding entity is active,
  `/char`, `/foe`, `/exp` show the operator tokens _and_ the entity
  names in the same strip, prefix-filtered together. `/foe` also shows
  `vanquish`. `/char -` hint is dynamic: when a foe is active it reads
  `take N harm (active foe rank)` where `N` is the rank harm — so the
  behavior is discoverable _before_ Enter.

Keys:

- <kbd>Tab</kbd> — complete the highlighted suggestion.
- <kbd>↑</kbd> / <kbd>↓</kbd> — move through suggestions.
- <kbd>Enter</kbd> — fire the highlighted suggestion (name-arg verbs) or
  parse-and-dispatch the raw input.
- <kbd>Esc</kbd> — clear the input.

## Dispatch — where each command lands

Most commands route through infrastructure that already existed for
log-link clicks; the command bar is just another producer on the same
buses.

| Command family                       | Producer                                                  | Consumer                                                              | Bus / method    |
| ------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------- | --------------- |
| `/note`                              | `appendLog('Note', …)`                                    | LogPanel                                                              | direct write    |
| `/help`                              | `helpDialogRef.open(focus)`                               | CommandHelpDialog                                                     | ref call        |
| `/move`, `/oracle`                   | `CustomEvent('ironledger:open-move' / 'open-oracle')`     | `+layout.svelte` opens the dialog                                     | DOM event       |
| `/char`, `/foe`, `/exp` (set-active) | `setActive*Id(id)`                                        | Active-context store                                                  | direct write    |
| `/char + / -`                        | `triggerAction({type: 'resource', key: 'health', …})`     | CharactersArea drain                                                  | LogAction bus   |
| `/vital`, `/bonds`, `/failures`      | `triggerAction({type: 'resource'\|'set', …})`             | CharactersArea drain                                                  | LogAction bus   |
| `/debility`                          | `triggerAction({type: 'debility', …})`                    | CharactersArea drain                                                  | LogAction bus   |
| `/initiative`                        | `triggerAction({type: 'initiative', …})`                  | CharactersArea drain (new applier)                                    | LogAction bus   |
| `/foe + / - / vanquish`              | `CustomEvent('ironledger:foe-progress' / 'foe-vanquish')` | `/home/+page.svelte` → `foeAreaRef.applyMenace` / `vanquishActiveFoe` | DOM event → ref |
| `/exp + / -`                         | `CustomEvent('ironledger:exp-progress')`                  | `/home/+page.svelte` → `expAreaRef.applyProgress`                     | DOM event → ref |
| `/start`, `/end`                     | `setStart(id)` / `setEnd(id)`                             | sectionStore                                                          | direct write    |
| `/story`                             | `CustomEvent('ironledger:story-generate')`                | LogPanel → StoryDialog.open                                           | DOM event       |

The action bus (`LogAction`) is drained inside `CharactersArea` — see
[log.md § Action Bus](log.md#generalized-action-bus). CharactersArea
runs a Svelte `$effect` that watches the bus nonce and dispatches to
`applyResourceChange` / `applyDebilityToggle` / `applySet` /
`applyInitiative`. Those mutations write to `activeData` (a reactive
`$state`) so the character sheet UI updates as soon as the command
returns, and each applier calls `appendLog(…)` so the log entry is
written in the same shape a click would produce.

The bus/CustomEvent split is deliberate: character-sheet mutations flow
through the typed action bus (so non-active characters can be updated
too, and every applier lives in one place), while cross-component
"open this dialog on this thing" signals use the CustomEvent bus (so
the CommandBar doesn't need refs to unrelated dialogs).

## Empty-args behavior

- `/char`, `/foe`, `/exp` — empty args open the help dialog _focused on
  that verb_ (row scrolls into view + accent-tint highlight, fades after
  ~2.5s). The overloaded grammar is the reason: an inline error is a
  worse tour than showing the grammar next to it in the dialog.
- Every other command with a required arg (`/note`, `/oracle`, `/move`,
  `/vital`, `/debility`, `/bonds`, `/failures`, `/initiative`) errors
  inline with a one-line message. These grammars fit in a status pill;
  the dialog would be overkill.

## Mobile

Nothing in the command bar is mobile-hidden — every command works from
the phone keyboard. The story-selection UI _around_ the log is hidden
below 768px (see [mobile.md](mobile.md#ai-story-selection--desktop-only)),
but `/start`, `/end`, `/story` still function; they mutate the same
`sectionStore` state, and a section pinned via commands is highlighted
in the log the moment the user returns to desktop.

## Tests

Parser is pure and unit-tested:
[`apps/web/tests/unit/commandBar.test.ts`](../apps/web/tests/unit/commandBar.test.ts)
covers every verb — happy paths, defaults, case-insensitivity, error
routing (including the `= is not supported` message on the delta-only
overloaded verbs), the `defaulted` flag on `char-harm`, jammed vs
spaced operator forms, and each verb's specific edge cases (the eight
debilities enumerated, mana rejected from `/vital`, `/foe vanquished`
not matching the subcommand, etc.). 105+ tests over the parser alone.

Dispatch is exercised end-to-end by the existing E2E specs — story
sections in `story.spec.ts`, and each character-sheet mutation shares
the log-link click paths already covered by `characters` / `foes` /
`log-link` specs.

## When to add a new command

Fitting rule:

- **Fits a bar command** — a session-loop action a player takes many
  times per session (mutate a resource, tick progress, open a dialog on
  a specific thing).
- **Doesn't fit** — anything requiring interactive selection (creating
  entities, portrait uploads, multi-step wizards), or anything rare
  enough that finding the toolbar button once per session is fine
  (settings, admin, import/export).

Adding a new command touches four files uniformly:

1. `apps/web/src/lib/commandBar.ts` — extend the `Command` union, add
   the verb to `COMMAND_NAMES`, add a parser case.
2. `apps/web/src/lib/components/CommandBar.svelte` — dispatch case,
   `verbHint()` entry, autocomplete branch if the args are enumerable.
3. `apps/web/src/lib/components/CommandHelpDialog.svelte` — a `Row`
   entry with the syntax + one-sentence hint. Set the `verb` field for
   focus-scroll.
4. `apps/web/tests/unit/commandBar.test.ts` — happy path + at least
   two error paths.

If the command needs a new mutation shape:

- **Character-sheet field** — add a new `type` to `LogAction` and a new
  applier + branch in CharactersArea's drain effect and its
  `applyActionToData` (non-active char branch).
- **Cross-component signal** — dispatch a `CustomEvent` with an
  `ironledger:` prefix; register a listener in `/home/+page.svelte`
  (component refs live there) or `/routes/+layout.svelte` (dialog refs
  live there).

Keep the parser strict, put discoverability into the autocomplete.
