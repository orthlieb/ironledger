# Global Context Bar

Reference extracted from `dev/yrt/IronLedger.html`.
Implemented in `apps/web/src/lib/components/GlobalContextBar.svelte`.

---

## Purpose

A full-width sticky bar rendered above the two-column page layout on the character detail page. It lets the user see and switch between the currently active character, expedition, and foe at a glance, and provides quick-launch buttons for Moves, Oracles, Dice, and Notes dialogs.

A stats/resources summary row beneath the selectors shows the selected character's five core stats and five resources without opening the full character sheet.

---

## HTML Structure (reference)

```html
<div class="global-context">
  <!-- Top row -->
  <div class="global-context-row" id="globalContextRow">
    <div class="gc-group">
      <label for="gcCharacter">Current Character</label>
      <select id="gcCharacter"></select>           <!-- populated by JS -->
    </div>
    <div class="gc-group">
      <label for="gcExpedition">Expedition</label>
      <select id="gcExpedition"></select>          <!-- journeys + sites optgroups -->
    </div>
    <div class="gc-group">
      <label for="gcFoe">Foe</label>
      <select id="gcFoe" disabled="disabled"></select>  <!-- enabled when combats exist -->
    </div>
    <div class="gc-actions">
      <button class="tab-dlg-btn" id="movesDlgBtn">Moves</button>
      <button class="tab-dlg-btn" id="oraclesDlgBtn">Oracles</button>
      <button class="tab-dlg-btn" id="diceDlgBtn">Dice</button>
      <button class="tab-dlg-btn" id="notesDlgBtn">Notes</button>
    </div>
  </div>

  <!-- Stats / resources summary row (hidden when no character selected) -->
  <div class="gc-stats-row" id="gcStatsRow" hidden>
    <!-- dynamically built by refreshGlobalStats() -->

    <!-- Initiative display — shown only when a foe is selected -->
    <div class="gc-initiative-group" id="gcInitiativeGroup" hidden>
      <span id="gcInitiative" class="gc-initiative-display"></span>
    </div>
  </div>
</div>
```

---

## Stat / Resource Definitions

### GC_STAT_DEFS
```js
const GC_STAT_DEFS = [
  { key: 'edge',   label: 'Edge',   color: '#3b82f6' },
  { key: 'heart',  label: 'Heart',  color: '#ef4444' },
  { key: 'iron',   label: 'Iron',   color: '#9ca3af' },
  { key: 'shadow', label: 'Shadow', color: '#a855f7' },
  { key: 'wits',   label: 'Wits',   color: '#f59e0b' },
];
```

### GC_RESOURCE_DEFS
```js
const GC_RESOURCE_DEFS = [
  { key: 'momentum', label: 'Mom',    color: '#60a5fa', icon: '<svg …>' },
  { key: 'health',   label: 'Health', color: '#f87171', icon: '<svg …>' },
  { key: 'spirit',   label: 'Spirit', color: '#a78bfa', icon: '<svg …>' },
  { key: 'supply',   label: 'Supply', color: '#34d399', icon: '<svg …>' },
  { key: 'mana',     label: 'Mana',   color: '#f59e0b', icon: '<svg …>' },
];
```

Resource icons are inline SVGs using `currentColor` so each one adopts its `color` value. In the Svelte component the icons come from `$lib/images/icon-*.svg?raw`.

---

## Key JavaScript Functions (reference)

| Function | What it does |
|---|---|
| `refreshCharacterDropdown()` | Rebuilds the character `<select>` from the `characters` array; persists selection in `localStorage`. |
| `refreshExpeditionDropdown()` | Rebuilds expedition `<select>` with `<optgroup>` for Journeys and Sites (filters out `complete` entries). Calls `refreshFoeDropdown()` after. |
| `refreshFoeDropdown()` | Rebuilds foe `<select>` from active (non-vanquished) `combats`. Disables the select when empty. |
| `refreshGlobalStats()` | Clears and rebuilds the `.gc-stats-row` DOM: stat pills → separator → resource pills → initiative. Hidden when no character is selected. |
| `refreshInitiativeDisplay()` | Updates the initiative badge: `"⚔ Initiative"` (blue) when character has it, `"🛡 Foe Initiative"` (red) when foe has it, hidden otherwise. Clicking the badge clears initiative. |

---

## CSS Theme

```css
.global-context {
  background: rgba(245, 158, 11, 0.07);   /* amber tint */
  border:     1px solid rgba(245, 158, 11, 0.18);
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
}

.global-context-row {
  display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end;
}

.gc-group {
  display: flex; flex-direction: column; flex: 1; min-width: 8rem;
}

.gc-actions {
  display: flex; gap: 0.35rem; align-self: stretch; align-items: flex-end;
  margin-left: auto; padding-left: 0.75rem;
  border-left: 1px solid rgba(245, 158, 11, 0.2);
}

.gc-stats-row {
  display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;
  margin-top: 0.5rem; padding-top: 0.4rem;
  border-top: 1px solid rgba(245, 158, 11, 0.15);
  font-size: 0.75rem;
}

/* Initiative badge variants */
.gc-init-char { background: rgba(96,165,250,0.15); color: #60a5fa; }
.gc-init-foe  { background: rgba(248,113,113,0.15); color: #f87171; }
.gc-init-clickable { cursor: pointer; }
```

---

## Svelte Implementation Notes

- **Component**: `GlobalContextBar.svelte` — props: `character: CharacterFull`
- Stats are derived with `hydrateCharacter(character.data)` so defaults fill in for any missing fields.
- On the character detail page the character selector is **display-only** (a styled `<span>`) because we are already scoped to one character.
- Expedition and Foe selectors are **disabled stubs** until those features are implemented.
- Action buttons (Moves / Oracles / Dice / Notes) are **disabled stubs**.
- Initiative section is **commented out** pending foe-tracking implementation.
- The wrapper `div.gc-wrapper` in `+page.svelte` is placed **above** `.page-layout` so the bar spans both the content and log columns.
