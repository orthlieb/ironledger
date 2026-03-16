# Global Context Bar

Implemented in `apps/web/src/lib/components/GlobalContextBar.svelte`.

---

## Purpose

A full-width sticky bar rendered above the two-column page layout on the character detail page. It provides quick-launch action buttons (Moves, Oracles, Dice, Notes) and three entity tiles showing the currently active character, foe, and expedition at a glance.

---

## Layout

```
┌───────────────────────────────────────────────────────────────┐
│                         [Moves] [Oracles] [Dice] [Notes]      │
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────┐ │
│  │ [img] Porcius     │  │ [img] Nightspawn │  │ JOURNEY     │ │
│  │ E:1 H:1 I:1 S:1  │  │ Beast Formidable │  │ My Journey  │ │
│  │ →2 ♥5 ●5 ■3 ◆0   │  │ Harm:3           │  │ Dangerous   │ │
│  │                   │  │ Progress 0/10    │  │ Progress 0/10│
│  └──────────────────┘  └──────────────────┘  └─────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

- Action buttons right-aligned in a top row with bottom border
- Three tiles in a `grid-template-columns: 1fr 1fr 1fr` layout below
- Mobile (<768px): tiles stack vertically via `grid-template-columns: 1fr`

---

## Tile States

### Empty State
- Dashed border, dimmed background
- Centered placeholder text: "Select Character" / "Select Foe" / "Select Expedition"

### Active State
- Solid border with amber accent (`rgba(245, 158, 11, 0.3)`)
- Left accent stripe (3px solid amber)
- Card background color
- Entity data displayed in compact rows

---

## Tile Content (Moderate Detail)

### Character Tile
- **Row 1**: Portrait (24px circle) + character name (display font, bold)
- **Row 2**: 5 core stats as colored abbreviations (E:1 H:1 I:1 S:1 W:1)
- **Row 3**: 5 resource icons with values (momentum, health, spirit, supply, mana)

### Foe Tile
- **Row 1**: Portrait (24px circle) + foe name (display font, bold)
- **Row 2**: Nature (colored) + rank label + harm value
- **Row 3**: Progress X/10 + quantity (if not solo) + initiative badge + vanquished marker

### Expedition Tile
- **Row 1**: Type badge (Journey green / Site blue) + expedition name (display font, bold)
- **Row 2**: Difficulty + progress X/10
- **Row 3**: Theme + domain (sites only) + complete marker

---

## Selection Mechanism

Clicking a tile toggles a popover dropdown anchored below it:
- Popover lists "(None)" + all available entities as clickable rows
- Active entity is highlighted with accent color and bold weight
- Clicking outside or selecting an option closes the popover
- Popover has scrollable max-height (12rem) for long lists

State managed by: `let openSelector = $state<'character' | 'foe' | 'expedition' | null>(null)`

A `<svelte:window onclick>` handler closes the popover when clicking outside any tile.

---

## Stat / Resource Definitions

### STAT_DEFS
```js
const STAT_DEFS = [
  { key: 'edge',   label: 'E', color: '#3b82f6' },
  { key: 'heart',  label: 'H', color: '#ef4444' },
  { key: 'iron',   label: 'I', color: '#9ca3af' },
  { key: 'shadow', label: 'S', color: '#a855f7' },
  { key: 'wits',   label: 'W', color: '#f59e0b' },
];
```

### RESOURCE_DEFS
```js
const RESOURCE_DEFS = [
  { key: 'momentum', icon: iconMomentum, color: '#60a5fa' },
  { key: 'health',   icon: iconHeart,    color: '#f87171' },
  { key: 'spirit',   icon: iconSpirit,   color: '#a78bfa' },
  { key: 'supply',   icon: iconSupply,   color: '#34d399' },
  { key: 'mana',     icon: iconMana,     color: '#f59e0b' },
];
```

Resource icons are inline SVGs from `$lib/images/icon-*.svg?raw` using `currentColor`.

---

## Props

```typescript
{
  chars:               CharacterFull[];
  activeCharId:        string;
  encounters?:         FoeEncounter[];
  activeFoeId?:        string;
  expeditions?:        Expedition[];
  activeExpeditionId?: string;
  initiative?:         number;        // 0=none, 1=character, 2=foe
  onSelect:            (id: string) => void;
  onFoeSelect?:        (id: string) => void;
  onExpeditionSelect?: (id: string) => void;
  onDiceClick?:        () => void;
  onOraclesClick?:     () => void;
  onMovesClick?:       () => void;
  onNotesClick?:       () => void;
}
```

---

## Derived State

| Derived | Source | Purpose |
|---------|--------|---------|
| `character` | `chars.find(c => c.id === activeCharId)` | Active character object |
| `data` | `hydrateCharacter(character.data)` | Typed character data with defaults |
| `activeFoe` | `encounters.find(e => e.id === activeFoeId)` | Active encounter |
| `activeFoeDef` | `findFoe(activeFoe.foeId)` | Catalogue entry for active foe |
| `activeFoeRank` | `FOE_RANKS[activeFoe.effectiveRank]` | Rank label + harm |
| `activeFoeNature` | `FOE_NATURE_COLORS[activeFoeDef.nature]` | Nature color |
| `activeFoeProgress` | `Math.floor(activeFoe.ticks / 4)` | Progress score 0-10 |
| `activeExpedition` | `expeditions.find(e => e.id === activeExpeditionId)` | Active expedition |
| `expProgress` | `Math.floor(activeExpedition.ticks / 4)` | Expedition progress 0-10 |

---

## CSS Theme

```css
.global-context {
  background: rgba(245, 158, 11, 0.07);   /* amber tint */
  border: 1px solid rgba(245, 158, 11, 0.18);
  border-radius: 6px;
  padding: 0.5rem 0.6rem;
}

.gc-tiles {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.5rem;
}

.gc-tile--empty {
  border: 1.5px dashed var(--border);
  background: rgba(0, 0, 0, 0.06);
}

.gc-tile--active {
  border: 1.5px solid rgba(245, 158, 11, 0.3);
  background: var(--bg-card);
  border-left: 3px solid rgba(245, 158, 11, 0.6);
}

.gc-popover {
  position: absolute;
  top: 100%;
  z-index: 50;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  max-height: 12rem;
  overflow-y: auto;
}

/* Mobile: stack tiles vertically */
@media (max-width: 768px) {
  .gc-tiles { grid-template-columns: 1fr; }
}
```

---

## Initiative Badge

Shown in the foe tile when initiative state is set:
- `initiative === 1`: Green "You" badge (character has initiative)
- `initiative === 2`: Red "Foe" badge (foe has initiative)
- Set via interactive initiative-links in move outcomes

---

## Svelte Implementation Notes

- **Component**: `GlobalContextBar.svelte`
- Props interface is identical whether passed from `+page.svelte` or any parent
- Stats derived with `hydrateCharacter(character.data)` to fill defaults
- Foe catalogue lookup via `findFoe()` from `foeStore.svelte.js`
- Foe ranks/nature colors from `FOE_RANKS`, `FOE_NATURE_COLORS` constants
- No `<select>` elements — all selection done via custom popover dropdowns
- The wrapper `div.gc-wrapper` in `+page.svelte` is placed above `.page-layout` so the bar spans both content and log columns
