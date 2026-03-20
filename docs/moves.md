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
  id: string;              // e.g., "move/face-danger"
  name: string;            // e.g., "Face Danger"
  category: string;        // e.g., "Adventure"
  triggerShort: string;    // Brief description for tile display
  trigger: string;         // Full trigger HTML
  triggerPreamble?: string; // Alternate preamble HTML
  stats?: Array<{ stat: string; desc: string }>;
  strong?: string;         // Strong hit outcome HTML
  weak?: string;           // Weak hit outcome HTML
  miss?: string;           // Miss outcome HTML
  preconditions?: Precondition[];
  progressTrack?: string;  // Classifies this as a progress move (e.g., "combat", "bonds")
  progressSource?: string; // Runtime track source key (e.g., "combat", "journey", "delve", "bonds", "failures", "vows")
  spellRoll?: boolean;     // Yrt ritual moves: d6 + mana + adds vs difficulty + d10
  notes?: string;          // Designer tips
}
```

### Roll Status Display

The detail view always shows a reactive formula string between the spinners and the Roll Move button:

| Move Type | Formula Example |
|-----------|----------------|
| Action roll | `d6 + iron[3] + adds[+1] vs d10 & d10` |
| Spell roll | `d6 + mana[2] + adds[+0] vs difficulty[3] & d10` |
| Progress roll | `progress[7] + adds[+0] vs d10 & d10` |

The formula updates live as stat selection, adds, mana commit, or difficulty change.

## Momentum Cancellation

When a character's momentum is negative and `|momentum| === action die value`, the action die is treated as 0. This is displayed in the log as a "Momentum cancel!" warning.

## Interactive Links in Outcome HTML

Move outcome HTML contains 7 interactive link types plus one display-only link type. When a move is rolled, `data-entry-id` and `data-char-id` attributes are injected into links that modify state (resource, debility, progress, initiative, menace) so LogPanel can identify the log entry and character. Links that modify state are drawn in strikethrough after being clicked to prevent double-application.

| Link Type | CSS Class | Data Attributes | Click Behavior | After Click |
|-----------|-----------|-----------------|---------------|-------------|
| Resource | `.resource-link` | `data-resource`, `data-value` | Modify character stat via action bus | Strikethrough |
| Move | `.move-link` | `data-id` | Open MovesDialog to that move | No change |
| Oracle | `.oracle-link` | `data-oracle` | Open OraclesDialog to that oracle | No change |
| Progress | `.progress-link` | `data-value`, `data-track` | Mark progress on active track (combat/journey/delve) | Strikethrough |
| Initiative | `.initiative-link` | `data-value` | Set initiative state (character/foe) | Strikethrough |
| Debility | `.debility-link` | `data-debility`, `data-value` | Toggle debility on character via action bus | Strikethrough |
| Menace | `.menace-link` | `data-value` | Mark menace on active vow | Strikethrough |
| Harm *(display-only)* | `.harm-link` | `data-resource` | None — styled placeholder for actual harm amount in Endure Harm/Stress outcomes | No change |

**Special case**: `move/ask-the-oracle` move-link opens OraclesDialog instead of MovesDialog.

## Preconditions

Moves can have preconditions checked via `firstPreconditionFailure()`:
- `hasCharacter` — requires a character selected
- `hasFoe` — requires a foe encounter active
- `hasSite` — requires a site expedition active
- `hasJourney` — requires a journey expedition active
- `initiative` — requires specific initiative state
- Stat thresholds (momentum, health, etc.)

Moves that fail preconditions appear dimmed in the picker with a tooltip showing the reason.

## Log Entry Format

```html
<div class="roll-cancel">Momentum cancel! ...</div>  <!-- if applicable -->
<div class="roll-line">1d6 [3] + edge[4] + adds[+1] = <strong>8</strong> vs 2d10 [5] [7]</div>
<div class="roll-outcome-strong"><strong>Strong Hit</strong> <span class="roll-match">with a match!</span></div>
<div class="move-outcome">{outcome HTML with interactive links}</div>
```

## Phased Implementation

- **Phase 1** (complete): Browse, filter, roll, and log moves with 3D dice animation
- **Phase 2** (complete): Interactive log links — 7 link types with click handlers, action bus for stat mutations, strikethrough for applied links
- **Phase 3** (complete): Burn momentum — auto-appended "Momentum: Burn Available" log entry on action rolls where burn would upgrade the outcome; clicking it burns momentum and rewrites the outcome text in-place

## Key Files

| File | Purpose |
|------|---------|
| `apps/api/data/moves/*.json` | Move definitions (10 category files) |
| `apps/api/src/routes/catalogue.ts` | API endpoint serving moves |
| `apps/web/src/routes/api/catalogue/moves/+server.ts` | BFF proxy with ETag caching |
| `apps/web/src/lib/moveStore.svelte.ts` | Reactive data store |
| `apps/web/src/lib/components/MovesDialog.svelte` | Two-view dialog (picker + detail) |
| `apps/web/src/lib/components/GlobalContextBar.svelte` | Moves button in action bar |
| `apps/web/src/lib/components/LogPanel.svelte` | Move outcome CSS + click delegation for all link types |
| `apps/web/src/lib/components/OraclesDialog.svelte` | Oracle dialog (supports open with key) |
| `apps/web/src/lib/log.svelte.ts` | Session log store + XP spend bus + action bus |
| `apps/web/src/lib/components/CharacterSheet.svelte` | Consumes action bus for resource/debility changes |
| `apps/web/src/lib/preconditions.ts` | Precondition evaluation engine |
