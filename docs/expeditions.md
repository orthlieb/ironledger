# Expeditions

Reference extracted from `dev/yrt/IronLedger.html`.
Not yet implemented in Iron Ledger (stub tab shown).

---

## Purpose

Tracks journey and site expeditions for the current character. Expeditions represent the two types of progress-track-based travel/exploration in Ironsworn/Starforged:

- **Journey** — overland or sea travel toward a destination.
- **Site** — a dangerous place (dungeon, lair, ruin) being delved.

Both use 10-box progress tracks with 4 ticks per box and a difficulty rank.

---

## Data Model (reference)

### Journey
```js
{
  id:         string,
  name:       string,
  difficulty: 'troublesome' | 'dangerous' | 'formidable' | 'extreme' | 'epic',
  ticks:      number,   // 0–40
  complete:   boolean,
  notes:      string,
}
```

### Site
```js
{
  id:         string,
  name:       string,
  theme:      string,   // e.g. "Ancient", "Corrupted", "Haunted"
  domain:     string,   // e.g. "Barrow", "Cavern", "Ruin", "Stronghold"
  difficulty: 'troublesome' | 'dangerous' | 'formidable' | 'extreme' | 'epic',
  ticks:      number,   // 0–40
  complete:   boolean,
  notes:      string,
  // denizen table entries (optional)
  denizens:   Array<{ range: string; name: string }>,
}
```

---

## UI Structure (reference)

The Expeditions tab in the YRT app contains two sub-sections:

### Journeys sub-tab
- **Add Journey** button — name + difficulty picker.
- Journey cards each show: name, difficulty badge, 10-box progress track, **Reach Destination** (complete) button, notes field.

### Sites sub-tab
- **Add Site** button — name, theme, domain, difficulty picker.
- Site cards each show: name, theme/domain badges, difficulty, progress track, **Locate Objective** (complete) button, denizen table, notes.

Completed expeditions move to a collapsed "Completed" accordion at the bottom.

---

## Global Context Integration

The **Expedition selector** in GlobalContextBar is populated with active (non-complete) journeys and sites in separate `<optgroup>` elements:

```html
<optgroup label="Journeys">…</optgroup>
<optgroup label="Sites">…</optgroup>
```

`refreshExpeditionDropdown()` in the reference code handles this population and calls `refreshFoeDropdown()` after, since some foe encounters may be tied to the selected expedition.

---

## Iron Ledger Implementation Status

- **Stub only** — the Expeditions tab renders an empty state (`"No Expeditions"`).
- The Expedition selector in GlobalContextBar is disabled until this feature is built.

### Planned work
1. Add `journeys` and `sites` arrays to character data schema.
2. Implement the Expeditions tab: sub-tabs for Journeys and Sites, add/complete/notes.
3. Wire up the Expedition selector in GlobalContextBar.
4. Optionally link expedition progress to relevant move outcomes in the Moves dialog.
