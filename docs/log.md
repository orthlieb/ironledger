# Session Log

Reference extracted from `dev/yrt/IronLedger.html`.
Implemented in `apps/web/src/lib/components/LogPanel.svelte` and `apps/web/src/lib/log.svelte.ts`.

---

## Purpose

Records every significant change to the character during a play session (stat/resource edits, move outcomes, vow progress, etc.). Acts as a session history so the player can review what happened without reconstructing it from memory.

The log is **ephemeral by default** — it tracks changes made in the current browser session. It does not persist to the database (no server round-trip). A "Clear" button resets it.

---

## Layout

| Viewport | Log position |
|---|---|
| Desktop (≥ 768 px) | Always-visible sticky right-hand column (50% of the page width) |
| Mobile (< 768 px) | Hidden by default; revealed as a 4th tab ("Log") in the tab bar |

The log panel fills `calc(100dvh - 52px)` on desktop so it extends to the bottom of the viewport below the app nav.

---

## Log Entry Types (reference)

Entries in the YRT app are typed and rendered with different icons / colors:

| Type | Icon | Description |
|---|---|---|
| `stat` | pencil | Stat value changed |
| `resource` | arrow | Resource (momentum/health/spirit/supply/mana) changed |
| `roll` | dice | Move roll result |
| `vow` | checkmark | Vow progress updated |
| `bond` | link | Bond ticks updated |
| `note` | speech bubble | Manual player note |
| `asset` | card | Asset added / ability toggled |
| `debility` | warning | Debility flag changed |

Each entry records a **timestamp**, an optional **delta** (old → new value), and a **description** string.

---

## Svelte Implementation

### `log.svelte.ts`
```ts
// Module-level reactive state: map of charId → entries (newest first)
export let logs = $state<Record<string, LogEntry[]>>({});

export function initLog(charId: string): void        // Load from localStorage
export function appendLog(charId: string, title: string, html: string, id?: string, source?: string): void
export function updateLogEntryHtml(charId: string, entryId: string, html: string, source?: string): void
export function deleteLogEntry(charId: string, entryId: string): void
export function updateLogEntryNote(charId: string, entryId: string, note: string): void
export function clearLog(charId: string): void
```

Entries are stored per-character in localStorage keyed as `il-log:{charId}`, max 500 entries. A special `SESSION_LOG_ID = '__session__'` key is used for the global session log shared by all components.

#### XP Spend Bus
```ts
export function getXpSpendNonce(): number      // Read in $effect to subscribe
export function triggerXpSpend(charId, amount)  // Queue XP spend from LogPanel
export function drainXpSpend(charId): number    // Consume in CharacterSheet $effect
```

#### Generalized Action Bus
```ts
export interface LogAction { charId: string; type: 'resource' | 'debility'; key: string; value: number; }
export function getActionNonce(): number        // Read in $effect to subscribe
export function triggerAction(action: LogAction) // Queue from LogPanel click handlers
export function drainActions(charId): LogAction[] // Consume in CharacterSheet $effect
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

Callback props: `onMoveLink`, `onOracleLink`, `onProgressLink`, `onInitiativeLink`, `onMenaceLink`.

---

## CSS Structure

The log pane in `+page.svelte`:
```css
/* Desktop */
.log-pane {
  position: sticky; top: 52px;
  height: calc(100dvh - 52px);
  align-self: start; overflow: hidden;
  display: flex; flex-direction: column;
}

/* Mobile: hidden by default, shown when log tab active */
.log-pane { display: none; height: calc(100dvh - 52px - 44px); }
.page-layout.log-active .log-pane { display: flex; }
.page-layout.log-active .tab-body  { display: none; }
```

---

## Entry Format

```ts
interface LogEntry {
  id:      string;   // crypto.randomUUID()
  title:   string;   // e.g. "Silk Char — Face Danger (Edge)"
  html:    string;   // rendered HTML content (move outcomes, resource changes, notes)
  ts:      string;   // ISO 8601 timestamp
  note?:   string;   // user-authored note attached to this entry
  source?: string;   // original markdown source (for editable entries like Notes)
}
```
