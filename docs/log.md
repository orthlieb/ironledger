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
// Reactive store
let entries: LogEntry[] = $state([]);

export function initLog(characterName: string): void
export function appendLog(entry: LogEntry): void
export function clearLog(): void
export function getLog(): LogEntry[]
```

`initLog` is called when the CharacterSheet mounts, setting the context character name.
`appendLog` is called from the character `$effect` watcher whenever a field changes.

### `LogPanel.svelte`
Props: `characterId: string`, `characterName: string`

Renders:
- Header bar with character name and **Clear** button (trash icon).
- Scrollable `<log role="log">` region listing entries in reverse-chronological order (newest at top).
- Empty state: `◊ NO CHANGES RECORDED YET.` with sub-text.

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

## Entry Format (reference)

```js
// YRT reference LogEntry shape
{
  ts:      number,   // Date.now()
  type:    LogEntryType,
  label:   string,   // e.g. "Health"
  from?:   number,   // previous value
  to?:     number,   // new value
  delta?:  number,   // to − from
  detail?: string,   // freeform note or move name
}
```
