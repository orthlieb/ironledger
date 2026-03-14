# Foes

Reference extracted from `dev/yrt/IronLedger.html`.
Not yet implemented in Iron Ledger (stub tab shown).

---

## Purpose

Tracks active combat encounters (foes) for the current character. Each encounter record links to a foe definition from the foe catalogue and stores combat-specific state (HP track, custom name, vanquished flag, initiative).

---

## Data Model (reference)

```js
// Single encounter entry stored in the combats array
{
  foeId:       string,   // references foe catalogue entry
  customName:  string,   // optional override displayed in selectors/UI
  vanquished:  boolean,  // true once foe is defeated (filtered out of active lists)
  // HP/harm track: stored as ticks similar to progress tracks
  harm:        number,   // 0–max ticks (4 ticks per box, varies by foe)
}
```

Foe catalogue entries (`foeDef`):
```js
{
  id:       string,
  name:     string,
  rank:     'troublesome' | 'dangerous' | 'formidable' | 'extreme' | 'epic',
  harm:     number,   // harm boxes
  // ... tags, moves, description
}
```

---

## UI Structure (reference)

The Foes tab / panel in the YRT app contains:

- **Add Foe** button — opens a picker dialog filtered by name/rank.
- **Active encounters list** — each card shows:
  - Foe name (custom or catalogue name)
  - Rank badge
  - Harm track (progress boxes)
  - **Vanquish** button
- **Vanquished foes** accordion — collapsed list of defeated foes for the session.

---

## Global Context Integration

When foes exist the **Foe selector** in the GlobalContextBar becomes enabled. The selected foe drives:

- **Initiative display** — shows `"⚔ Initiative"` (character) or `"🛡 Foe Initiative"` (foe) badge. Clicking clears initiative.
- **Move outcomes** — some moves reference the selected foe's harm track.

`refreshFoeDropdown()` in the reference code filters the `combats` array to non-vanquished entries and populates the `<select id="gcFoe">`.

---

## Iron Ledger Implementation Status

- **Stub only** — the Foes tab renders an empty state (`"No Foes Tracked"`).
- The Foe selector in GlobalContextBar is disabled until this feature is built.
- Initiative in GlobalContextBar is commented out pending foe tracking.

### Planned work
1. Add `foes` / `combats` array to character data schema.
2. Build foe catalogue (static JSON or DB table).
3. Implement the Foes tab: list, add, harm track, vanquish.
4. Wire up the Foe selector in GlobalContextBar.
5. Implement initiative tracking and the initiative badge.
