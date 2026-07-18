# Session Log

Reference extracted from `dev/yrt/IronLedger.html`.
Implemented in `apps/web/src/lib/components/LogPanel.svelte` and `apps/web/src/lib/log.svelte.ts`.

---

## Purpose

Records every significant change to the character during a play session (stat/resource edits, move outcomes, vow progress, etc.). Acts as a session history so the player can review what happened without reconstructing it from memory.

The log is **ephemeral by default** — it tracks changes made in the current browser session. It does not persist to the database (no server round-trip). A "Clear" button resets it.

---

## Layout

The log lives inside the **Adventure** tab in both layouts.

| Viewport           | Log position                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop (≥ 768 px) | Right-hand column of the Adventure tab, side-by-side with the GCB. Drag-to-resize horizontally; split persists in `localStorage['ironledger.adventureSplit']` (25–75%, default 50). |
| Mobile (< 768 px)  | Bottom panel of the Adventure tab, below the GCB. Drag-to-resize vertically; split persists in `localStorage['il:adventure:split:mobile']` (20–95%, default 80% GCB / 20% log).     |

The log panel fills `calc(100dvh - 52px)` on desktop so it extends to the bottom of the viewport below the app nav. See [mobile.md § Adventure Split Panel](mobile.md#adventure-split-panel) for the mobile resize implementation.

---

## Log Entry Types (reference)

Entries in the YRT app are typed and rendered with different icons / colors:

| Type       | Icon          | Description                                           |
| ---------- | ------------- | ----------------------------------------------------- |
| `stat`     | pencil        | Stat value changed                                    |
| `resource` | arrow         | Resource (momentum/health/spirit/supply/mana) changed |
| `roll`     | dice          | Move roll result                                      |
| `vow`      | checkmark     | Vow progress updated                                  |
| `bond`     | link          | Bond ticks updated                                    |
| `note`     | speech bubble | Manual player note                                    |
| `asset`    | card          | Asset added / ability toggled                         |
| `debility` | warning       | Debility flag changed                                 |

Each entry records a **timestamp**, an optional **delta** (old → new value), and a **description** string.

---

## Svelte Implementation

### `log.svelte.ts`

```ts
// Module-level reactive state: the single global session log (newest first).
// Components read `sessionLog.entries` inside $derived for proxy tracking.
export const sessionLog = $state<{ entries: LogEntry[] }>({ entries: [] });

export function initLog(): void; // Fetch latest 200 entries from the server (idempotent)
export function appendLog(
  title: string,
  html: string,
  id?: string,
  source?: string,
  roll?: RollMeta,
): void;
export function updateLogEntryHtml(
  entryId: string,
  html: string,
  source?: string,
  clearRoll?: boolean,
): void;
export function deleteLogEntry(entryId: string): void;
export function updateLogEntryNote(entryId: string, note: string): void;
export function clearLog(): void;
```

The log is **global, not per-character** — one DB row per entry (JSONB), server-side, capped at 1000. Local state is optimistic and the source of truth for rendering; API calls are fire-and-forget. (The log functions previously took a `charId` first arg keyed against a per-character map; that was always called with a single `SESSION_LOG_ID` constant and was removed as dead code.) The `charId` on the buses below is unrelated — it's the real character a resource/XP action targets.

#### XP Spend Bus

```ts
export function getXpSpendNonce(): number; // Read in $effect to subscribe
export function triggerXpSpend(charId, amount); // Queue XP spend from LogPanel
export function drainXpSpend(charId): number; // Consume in CharacterSheet $effect
```

#### Generalized Action Bus

```ts
export interface LogAction {
  charId: string;
  type: 'resource' | 'debility' | 'reset-track';
  key: string;
  value: number;
}
export function getActionNonce(): number; // Read in $effect to subscribe
export function triggerAction(action: LogAction); // Queue from LogPanel click handlers
export function drainActions(charId): LogAction[]; // Consume in CharacterSheet $effect
```

### `LogPanel.svelte`

Renders:

- Header bar with "SESSION LOG" title, export-as-markdown button, and clear button.
- Scrollable `<log role="log">` region listing entries in reverse-chronological order (newest at top).
- Each entry shows title, timestamp, edit/delete buttons, and rendered HTML content.
- Per-entry notes with markdown support.
- Empty state: `◊ NO ENTRIES YET.` with sub-text.

#### Interactive Link Click Delegation

LogPanel handles clicks on 7 interactive link types embedded in move outcome HTML via event delegation on the entries container. Links that modify state (resource, debility, progress, initiative, menace) are replaced with strikethrough after clicking. Move-links and oracle-links open their respective dialogs.

| Link type   | CSS class           | Behavior                                       | After click   |
| ----------- | ------------------- | ---------------------------------------------- | ------------- |
| Resource    | `.resource-link`    | Apply ± stat change via action bus             | Strikethrough |
| Move        | `.move-link`        | Open MovesDialog to that move                  | No change     |
| Oracle      | `.oracle-link`      | Open OraclesDialog to that oracle              | No change     |
| Progress    | `.progress-link`    | Mark progress on active track                  | Strikethrough |
| Initiative  | `.initiative-link`  | Set initiative state                           | Strikethrough |
| Debility    | `.debility-link`    | Toggle debility via action bus                 | Strikethrough |
| Menace      | `.menace-link`      | Mark menace on active vow                      | Strikethrough |
| Reset Track | `.reset-track-link` | Clear named progress track to 0 via action bus | Strikethrough |

Additionally, LogPanel handles two JS-generated link types not present in move JSON data:

- **`.burn-momentum-link`** — Appears in the auto-appended "Momentum: Burn Available" log entry after action rolls where burning would upgrade the outcome. Clicking it burns the character's momentum and updates the roll entry's outcome text.
- **`.xp-cost-link`** — Appears in asset log entries. **One link per add/modify dialog session, not per individual change.** When the user opens the asset dialog (add or edit mode), edits accumulate in a draft; on OK/Add the parent computes the total XP cost (asset purchase cost + 2 × newly-enabled abilities + rarity xpCost, if applicable) and emits one log entry with one xp-cost-link for the cumulative total. Clicking the link deducts that total from the character and strikes through to prevent double-use. If the diff is 0 (e.g. user opened the dialog, toggled an ability on then back off, clicked OK), no log entry is written at all.

#### Cascade Rules

LogPanel also auto-appends additional log entries in response to resource-link clicks when cascade conditions are met:

- **Overflow** (`OVERFLOW_RULES`): health or spirit drops below 0 — a new entry is appended offering to convert the overflow to momentum loss.
- **Floor overflow** (`FLOOR_OVERFLOW_RULES`): resource is already at its minimum and further reduction is attempted:
  - Momentum at −6 → "Face a Setback" entry with per-point clickable exchange links (−health / −spirit / −supply) and a Face a Setback move-link
  - Health at 0 → "Face Death" entry with a Face Death move-link
  - Spirit at 0 → "Face Desolation" entry with a Face Desolation move-link
  - Supply at 0 → "Out of Supply" entry with per-point clickable exchange links (−health / −spirit / −momentum)

CharacterSheet auto-appends entries from **floor rules** (`FLOOR_RULES`) when a resource transitions into its minimum:

- Momentum hits −6 → "Momentum: Desperate" note appended
- Supply hits 0 → "Supply: Exhausted" note with clickable Unprepared debility link

Callback props: `onMoveLink`, `onOracleLink`, `onProgressLink`, `onInitiativeLink`, `onMenaceLink`.

---

## CSS Structure

The log pane in `+page.svelte`:

```css
/* Desktop */
.log-pane {
  position: sticky;
  top: 52px;
  height: calc(100dvh - 52px);
  align-self: start;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Mobile: hidden by default, shown when log tab active */
.log-pane {
  display: none;
  height: calc(100dvh - 52px - 44px);
}
.page-layout.log-active .log-pane {
  display: flex;
}
.page-layout.log-active .tab-body {
  display: none;
}
```

---

## Entry Format

```ts
interface LogEntry {
  id: string; // crypto.randomUUID()
  title: string; // e.g. "Silk Char — Face Danger (Edge)"
  html: string; // rendered HTML content (move outcomes, resource changes, notes)
  ts: string; // ISO 8601 timestamp
  note?: string; // user-authored note attached to this entry
  source?: string; // original markdown source (for editable entries like Notes)
  roll?: RollMeta; // present on action roll entries — enables burn-momentum after the fact
}
```

---

## Story Sections (▲ / ▼ Markers)

A section is a contiguous slice of the log the user selects for AI-story
generation. It's defined by **two markers** pinned to log-entry ids:

- **▲ start** — the **oldest** entry included (bottom of the selection, since
  the log renders newest-first).
- **▼ end** — the **newest** entry included. **`null` means "top of log, live"**:
  the section stays open and grows as new entries land.

Marker state lives in `apps/web/src/lib/sectionStore.svelte.ts` — module-level
`$state` persisted to `localStorage['ironledger:ai:section']` so a reload
keeps the selection. Markers are **client-side UI state only**, not part of
the log data model — they aren't included in the JSON export (see
[import-schema.md § Session log](import-schema.md#session-log)).

### Semantics

| `startId` | `endId` | Section is…                                                         |
| --------- | ------- | ------------------------------------------------------------------- |
| `null`    | —       | Empty — nothing to generate. The Generate button is disabled.       |
| set       | `null`  | **Open**: growing forward from `startId` to the current top of log. |
| set       | set     | **Closed**: fixed range `[startId … endId]`, inclusive.             |

Setting a new `startId` clears the old `endId` — the section is reset around
the new pin. Setting an `endId` before a `startId` is a no-op.

### Placing markers

Three surfaces write to the store; all funnel through `toggleStart`/
`toggleEnd` / `setStart` / `setEnd`:

1. **Per-entry ▲ / ▼ hover buttons** on the entry-actions row (Font Awesome
   `caret-large-up-solid` / `caret-large-down-solid`). Hover-revealed like
   Edit / Delete; the active marker stays visible even without hover so the
   user can see where the pins are. The ▼ button is disabled until a ▲ is
   set (a bare end has no meaning).
2. **Command bar** — see [`docs/global-context-bar.md`](global-context-bar.md)
   for the surface, and `apps/web/src/lib/commandBar.ts` for the parser. Three
   verbs mutate the store:
   - `/start` — pin ▲ on the current newest entry (opens an open, growing
     section).
   - `/end` — pin ▼ on the current newest entry (closes the section).
   - `/story` — dispatch `ironledger:story-generate`, which LogPanel handles
     by opening the Story dialog on the current section. No-ops with a status
     message when nothing is pinned.
3. **Toolbar Generate button + floating strip** at the bottom of the log —
   both call `storyDialogRef?.open()` on the current section, which reads
   `sectionEntries()`. The strip also has a **Clear** button that calls
   `clearSection()`.

After a successful **Save to Log**, `clearSection()` drops both markers —
the section has been consumed. The user pins a fresh ▲ for the next one.

### Highlight rendering

Entries inside the section get:

- `.log-entry-in-section` — 6% accent-tint background, 3px inset accent
  left-border.
- `.log-entry-section-start` / `.log-entry-section-end` — extra 6% accent
  bump on top of the tint so the pinned entries visibly cap the range.

The `isEntryInSection(id)` helper in `sectionStore` is what LogPanel uses to
compute the classes — it walks entry positions each render (no caching), so
the highlight follows entry deletion, log-clear, or a reordered log without
manual invalidation.

### Mobile

The whole selection surface is CSS-hidden below `768px` (matches
[`mobile.md`](mobile.md)'s canonical breakpoint). Hover-revealed marker
buttons are awkward on touch, and the log gets only ~20% of the viewport on
mobile Adventure (per the split-panel default). The underlying `sectionStore`
state is untouched; a section pinned on desktop stays highlighted (read-only)
if the user switches to mobile.

### End-to-end flow

See [`docs/ai-story.md`](ai-story.md) for the full AI-story flow (provider
config, preface, prompt shape, and the Regenerate / Export paths). This
section covers just the log-panel selection mechanics; the story-generation
itself is one dialog downstream.
