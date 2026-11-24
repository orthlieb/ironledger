# Moves System

The Moves system is the core gameplay mechanic of Iron Ledger. Players browse, filter, and roll Ironsworn moves from a dialog, with results logged to the session log including 3D dice animation and interactive outcome text.

## Architecture

### Data Flow

1. **API**: `GET /api/v1/catalogue/moves` serves 48 moves across 10 categories from static JSON files in `apps/api/data/moves/`.
2. **BFF Proxy**: `apps/web/src/routes/api/catalogue/moves/+server.ts` forwards requests with ETag caching.
3. **Store**: `moveStore.svelte.ts` fetches, caches, and provides reactive accessors for the move catalogue.
4. **Dialog**: `MovesDialog.svelte` presents a two-view interface (picker grid + detail view).
5. **Log**: Roll results are appended to the session log with styled HTML including outcome text.

### Move Categories (Display Order)

Adventure, Relationship, Combat, Suffer, Quest, Fate, Delve, Rarity, Failure, Yrt

## Move Types

### Standard Action Move

- Has `stats[]` array (e.g., edge, heart, iron, shadow, wits, health, supply)
- Roll: `1d6 + stat + adds` vs `2d10`
- **Strong Hit**: total beats both challenge dice
- **Weak Hit**: total beats one challenge die
- **Miss**: total beats neither
- **Match**: when both d10s show the same value (narrative significance)

### Progress Move

- Has `progressTrack` field (e.g., "combat", "journey", "bonds")
- Has `progressSource` field identifying which runtime track provides the score
- Roll: `progress score (0–10) + adds` vs `2d10`
- No action die, no stat, no momentum
- Adds are adjustable in the dialog and applied on top of the track score

### No-Roll Move

- No stats, empty or no outcomes (e.g., Reach a Milestone, Advance)
- Informational only — displays trigger text and any outcome sections

## Move Data Schema

```typescript
interface MoveDefinition {
  id: string; // e.g., "move/face-danger"
  name: string; // e.g., "Face Danger"
  category: string; // e.g., "Adventure"
  triggerShort: string; // Brief description for tile display
  trigger: string; // Full trigger text (markdown + link DSL)
  triggerPreamble?: string; // Alternate preamble (markdown + link DSL)
  stats?: Array<{ stat: string; desc: string }>;
  strong?: string; // Strong hit outcome (markdown + link DSL)
  weak?: string; // Weak hit outcome (markdown + link DSL)
  miss?: string; // Miss outcome (markdown + link DSL)
  preconditions?: Precondition[];
  progressTrack?: string; // Classifies this as a progress move (e.g., "combat", "bonds")
  progressSource?: string; // Runtime track source key (e.g., "combat", "journey", "delve", "bonds", "failures", "vows")
  spellRoll?: boolean; // Yrt ritual moves: d6 + mana + adds vs difficulty + d10
  notes?: string; // Designer tips (markdown + link DSL)
  logTitle?: string; // Log entry title template; supports {character}, {stat}, {expedition}, {foe}, {move}
  html?: boolean; // Escape hatch: treat prose as raw legacy HTML, bypass renderRich
}
```

Prose fields are authored in **markdown + the interactive-link DSL** and rendered
by `renderRich` (`#lib/dsl.ts`) — `**bold**` / `*italic*` / lists for formatting,
`[label](scheme:args)` links for cross-references. Set `html: true` to opt a move
back to raw legacy HTML. See
[data-schema.md → Outcome Text](data-schema.md#outcome-text-markdown--link-dsl)
for the authoring grammar and the full scheme table.

### Roll Status Display

The detail view always shows a reactive formula string between the spinners and the Roll Move button:

| Move Type     | Formula Example                                  |
| ------------- | ------------------------------------------------ |
| Action roll   | `d6 + iron[3] + adds[+1] vs d10 & d10`           |
| Spell roll    | `d6 + mana[2] + adds[+0] vs difficulty[3] & d10` |
| Progress roll | `progress[7] + adds[+0] vs d10 & d10`            |

The formula updates live as stat selection, adds, mana commit, or difficulty change.

## Momentum Cancellation

When a character's momentum is negative and `|momentum| === action die value`, the action die is treated as 0. This is displayed in the log as a "Momentum cancel!" warning.

## Links in Outcome Text

A link in a move's text is a command: `[take +1 momentum](/momentum++)`,
`[Inflict double harm](/foe.progress+=2)`, `[Endure Harm](/move endure-harm)`
(see [data-schema.md → Links are commands](data-schema.md#links-are-commands)).
When the move is rolled, its links are bound to the log entry and to the
character, foe and expedition it was rolled for, plus the vow or companion
the dialog asked for (`choose`, see
[data-schema.md](data-schema.md#moves-that-act-on-a-vow-or-a-companion-choose))
and Endure Harm's amount. A click in the log runs the command against those;
a value link is struck through once it has changed something, a move or
oracle link opens its dialog.

In the Moves dialog itself, outcome previews are read-only (their value
links come alive in the log, once the roll is made); a link in the trigger
runs for the dialog's character, and move and oracle links open what they
name.

`/health-=harm` and `/spirit-=harm` in Endure Harm and Endure Stress show the
amount resolved (`resolveHarmLinks`); the Apply button applies it. Companion
Endure Harm works the same way on the companion chosen:
`/companion.health-=harm` shows the amount, split at the companion's health,
and Apply takes it off the companion through the command runner, which logs
it and offers any leftover as −momentum.

**Special case**: `/move ask-the-oracle` opens the Oracles dialog instead of
the Moves dialog.

## Preconditions

A move's `preconditions` is one condition expression
([command-language.md → Conditions](command-language.md#conditions)), checked
by `movePreconditionFailure()`:

- `character`, `foe`, `site`, `journey`, `scene`: one is active.
- `initiative == me` (`foe`, `none`): who has initiative.
- Values and thresholds: `health == 0`, `mana >= 1`, `failures >= 6b`.
- Combined with `&`, `|`, `!` and parentheses: `character & foe & initiative == me`.

Moves that fail preconditions appear dimmed in the picker with a tooltip showing the reason.

## Log Entry Format

```html
<div class="roll-cancel">Momentum cancel! ...</div>
<!-- if applicable -->
<div class="roll-line">1d6 [3] + edge[4] + adds[+1] = <strong>8</strong> vs 2d10 [5] [7]</div>
<div class="roll-outcome-strong">
  <strong>Strong Hit</strong> <span class="roll-match">with a match!</span>
</div>
<div class="move-outcome">{outcome HTML with interactive links}</div>
```

## Phased Implementation

- **Phase 1** (complete): Browse, filter, roll, and log moves with 3D dice animation
- **Phase 2** (complete): Interactive log links — 7 link types with click handlers, action bus for stat mutations, strikethrough for applied links
- **Phase 3** (complete): Burn momentum — auto-appended "Momentum: Burn Available" log entry on action rolls where burn would upgrade the outcome; clicking it burns momentum and rewrites the outcome text in-place. The roll and the burn build the outcome with the same function (`moveOutcomeBlock` in `moveRoll.ts`: rendered text, harm links resolved, Delve the Depths' oracle on the column of the stat the roll saved), so a burned outcome reads as a roll to that result would

## Key Files

| File                                                  | Purpose                                                                                                   |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `apps/api/data/moves/*.json`                          | Move definitions (10 category files)                                                                      |
| `apps/api/src/routes/catalogue.ts`                    | API endpoint serving moves                                                                                |
| `apps/web/src/routes/api/catalogue/moves/+server.ts`  | BFF proxy with ETag caching                                                                               |
| `apps/web/src/lib/moveStore.svelte.ts`                | Reactive data store                                                                                       |
| `apps/web/src/lib/components/MovesDialog.svelte`      | Two-view dialog (picker + detail); `resolveTitle(move, stat?)` resolves `logTitle` templates at roll time |
| `apps/web/src/lib/components/GlobalContextBar.svelte` | Moves button in action bar                                                                                |
| `apps/web/src/lib/components/LogPanel.svelte`         | Move outcome CSS + click delegation for all link types                                                    |
| `apps/web/src/lib/components/OraclesDialog.svelte`    | Oracle dialog (supports open with key)                                                                    |
| `apps/web/src/lib/log.svelte.ts`                      | Session log store + XP spend bus + action bus                                                             |
| `apps/web/src/lib/components/CharacterSheet.svelte`   | Consumes action bus for resource/debility changes                                                         |
| `apps/web/src/lib/preconditions.ts`                   | Precondition evaluation engine                                                                            |
