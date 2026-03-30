# UI Components — Design Specifications

Canonical styles for shared UI patterns across the app. When creating or editing card components, follow these specs exactly to maintain visual consistency.

---

## Tooltips

**Always use CSS tooltips via `data-tooltip`. Never use the native `title` attribute** — browser `title` tooltips have unpredictable delays, can't be styled, and don't appear in all environments.

### Usage

```svelte
<span data-tooltip="Tooltip text">hover me</span>
<!-- Appears above by default -->

<span data-tooltip="Tooltip text" class="tooltip-down">hover me</span>
<!-- Appears below -->
```

The global rule in `app.css` handles all styling automatically — no extra CSS needed. The tooltip appears on `:hover` and `:focus-visible`.

### How it works (app.css)

- `[data-tooltip]` gets `position: relative`
- `::after` renders the bubble using `content: attr(data-tooltip)`
- `::before` renders the arrow caret
- Fade + scale transition on hover
- `.tooltip-down` class flips direction to below the element
- `z-index: 9999` on bubble, `10000` on JS tooltips (for clipped scroll contexts)

### When to use `use:tooltip` instead

If the element lives inside an `overflow: hidden` or `overflow: scroll` container (e.g. the GCB tile, scroll panels), the CSS `::after` tooltip will be clipped. **Always use `use:tooltip` for pills and controls inside the GCB or any scrollable/clipped container.**

```svelte
<script>
  import { tooltip } from '$lib/actions/tooltip.js';
</script>

<span use:tooltip="Asset name">pill text</span>
<span use:tooltip={{ text: 'Asset name', placement: 'below' }}>pill text</span>
```

The action appends a body-level `.js-tooltip` div (fixed position) so it is never clipped by any ancestor overflow.

---

## Card Headers

Used in: `CharacterSheet` (`.char-header`), `FoeCard` (`.fc-header`), `JourneyCard` (`.jc-header`), `SiteCard` (`.sc-header`)

### Layout & Sizing

```css
display: flex;
align-items: center;
gap: 8px;
padding: 8px 12px;
min-height: 55px;   /* portrait (38px) + padding (16px) + border-bottom (1px) = 55px box-sizing:border-box */
flex-wrap: wrap;
background: var(--bg-inset);
border-bottom: 1px solid var(--border);
```

### Collapsed State

When a card is collapsed, its body is hidden (`{#if !collapsed}`). Without removing the `border-bottom`, the header's bottom border overlaps the card's outer `border-bottom` at the same pixel, creating a double-line ("thick border") effect.

**Fix:** suppress the inner border when collapsed:

```css
.char-card.collapsed  .char-header { border-bottom: none; }
.foe-card.collapsed   .fc-header   { border-bottom: none; }
.jc-card.collapsed    .jc-header   { border-bottom: none; }
.sc-card.collapsed    .sc-header   { border-bottom: none; }
```

**Required:** The root card `<div>` must bind the collapsed state as a class so the selector fires:

```svelte
<div class="foe-card" class:collapsed={collapsed} ...>
```

Using only `{#if !collapsed}` for the body is not sufficient — the root element must also receive the class.

### Icon Buttons in Header

The global `.btn-icon` style uses `padding: 4px 8px; min-width: 28px` — **not square**. Each card header overrides explicitly:

```css
.xx-header .icon-btn {
    width: 26px;
    height: 26px;
    padding: 4px;
    flex-shrink: 0;
}
.xx-header .icon-btn :global(svg) {
    width: 13px;
    height: 13px;
    fill: currentColor;
}
```

---

## Canonical Pill / Badge Style

Used in: `FoeCard` (`.fc-badge`), `JourneyCard` (`.jc-badge`), `SiteCard` (`.sc-badge`), `GlobalContextBar` (`.gc-badge`)

### Base CSS

```css
font-family: var(--font-ui);
font-size: 0.6rem;
font-weight: 600;
letter-spacing: 0.05em;
text-transform: uppercase;
padding: 2px 7px;
border-radius: 10px;
border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
white-space: nowrap;
flex-shrink: 0;
```

### Colors by Type

| Type           | Background                        | Color                        |
|----------------|-----------------------------------|------------------------------|
| Nature         | `{FOE_NATURE_COLORS[nature]}22`   | `{FOE_NATURE_COLORS[nature]}`|
| Rank/Difficulty| `{RANK_COLORS[n].bg}22`           | `{RANK_COLORS[n].bg}`        |
| Quantity       | `rgba(255,255,255,0.08)`          | `var(--text-muted)`          |
| Harm           | `rgba(239,68,68,0.10)`            | `#ef4444`                    |
| Progress/boxes | `rgba(59,130,246,0.10)`           | `#60a5fa`                    |
| Journey type   | `rgba(52,211,153,0.15)`           | `#34d399`                    |
| Site type      | `rgba(96,165,250,0.15)`           | `#60a5fa`                    |
| Theme          | `rgba(168,85,247,0.15)`           | `#a855f7`                    |
| Domain         | `rgba(251,146,60,0.15)`           | `#fb923c`                    |

### Pill Order

- **Foe:** nature → rank → quantity → harm
- **Journey (body top):** Journey (type) → difficulty
- **Site (body top):** Site (type) → difficulty → theme → domain
- **GCB foe tile:** nature → rank → quantity → harm
- **GCB expedition tile:** type → difficulty → theme → domain

### Placement

Pills live at the **top of the collapsible body**, NOT in the title bar. Title bar contains only: collapse btn · name · status icon · delete.

### Pill Row Container

```css
.xx-pill-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    align-items: center;
}
```

### Rank/Difficulty Badge Helper

Copy into any component needing difficulty as a pill:

```typescript
import { RANK_COLORS } from '$lib/foeStore.svelte.js';
const DIFFICULTY_RANK: Record<string, number> = {
  troublesome: 1, dangerous: 2, formidable: 3, extreme: 4, epic: 5,
};
function diffBadgeStyle(difficulty: string): string {
  const rc = RANK_COLORS[DIFFICULTY_RANK[difficulty] ?? 2];
  if (!rc) return '';
  return `background: ${rc.bg}22; color: ${rc.bg}`;
}
```

`RANK_COLORS` is exported from `foeStore.svelte.ts`.

---

## Filter Pattern (Collapsible Toggle + Panel)

All filter rows in dialogs (FoePickerDialog, MovesDialog, OraclesDialog) follow the same collapsible pattern. **Never show filter chips inline always-visible** — they add visual noise when unused.

### Pattern

1. A **toggle button** is always visible in the controls area. It shows the label "FILTERS", optional active count badge, and a ▲/▼ chevron.
2. When toggled open, a **filter panel** appears below with the chips/tags inside.
3. The panel collapses back when toggled again or when all chips are deselected.

### Svelte State

```svelte
let filtersOpen = $state(false);
```

### Toggle Button HTML

```svelte
<button
  class="xx-filter-toggle"
  class:xx-filter-toggle--active={activeItems.size > 0}
  onclick={() => (filtersOpen = !filtersOpen)}
  aria-expanded={filtersOpen}
>
  Filters{#if activeItems.size > 0}&nbsp;<span class="xx-filter-badge">{activeItems.size}</span>{/if}
  {filtersOpen ? '▲' : '▼'}
</button>
{#if filtersOpen}
<div class="xx-filter-panel">
  <div class="xx-filter-chips">
    {#each items as item}
      <button
        class="xx-chip"
        class:xx-chip--active={activeItems.has(item)}
        onclick={() => toggleItem(item)}
      >{item}</button>
    {/each}
  </div>
</div>
{/if}
```

### CSS

```css
/* Toggle button */
.xx-filter-toggle {
    display:        flex;
    align-items:    center;
    gap:            6px;
    font-family:    var(--font-ui);
    font-size:      0.72rem;
    font-weight:    600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color:          var(--text-dimmer);
    background:     transparent;
    border:         1px solid var(--border);
    border-radius:  4px;
    padding:        3px 8px;
    cursor:         pointer;
    transition:     background 0.12s, color 0.12s, border-color 0.12s;
}
.xx-filter-toggle:hover        { color: var(--text); border-color: var(--border-mid); }
.xx-filter-toggle--active      { color: var(--accent); border-color: var(--accent); }

/* Active count badge (inside toggle button) */
.xx-filter-badge {
    display:         inline-flex;
    align-items:     center;
    justify-content: center;
    min-width:       16px;
    height:          16px;
    padding:         0 4px;
    border-radius:   8px;
    background:      var(--accent);
    color:           var(--bg);
    font-size:       0.6rem;
    font-weight:     700;
}

/* Collapsible panel */
.xx-filter-panel  { padding: 4px 0 2px; }
.xx-filter-chips  { display: flex; flex-wrap: wrap; gap: 4px; }

/* Individual chip/tag */
.xx-chip {
    font-family:    var(--font-ui);
    font-size:      0.65rem;
    font-weight:    600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color:          var(--text-dimmer);
    background:     transparent;
    border:         1px solid var(--border);
    border-radius:  3px;
    padding:        2px 8px;
    cursor:         pointer;
    white-space:    nowrap;
    transition:     background 0.12s, color 0.12s;
}
.xx-chip:hover     { background: color-mix(in srgb, var(--border) 30%, transparent); color: var(--text); }
.xx-chip--active   { background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); border-color: var(--accent); }
```

> Chips can use a `--gcolor` CSS variable for per-chip color (e.g. oracle groups). Set `style:--gcolor={color}` on each chip and reference `var(--gcolor, var(--text-dimmer))` for `color` and `var(--gcolor, var(--border))` for border/background mixing.

---

## Stat Tile (StatControl)

Square tile used for the five Ironsworn stats (Edge, Heart, Iron, Shadow, Wits).

### Design

- **52×52px** square with 6px border-radius
- **Border**: 2px solid at 50% opacity of stat color
- **Background**: 8% tint of stat color over card background
- **Background icon**: SVG icon dimmed to 12% opacity, centered and filling ~72% of tile. Icons: Edge=sword, Heart=heart, Iron=fist, Shadow=shadow, Wits=brain
- **Stat name** at top: 0.55rem, bold, uppercase, stat color
- **Stat value** at bottom: 1.3rem, bold, stat color + **`-webkit-text-stroke: 1px white`** for legibility against icon
- Focus state: full-opacity border + glow

### SVG Icon Sources

| Stat | File |
|------|------|
| Edge | `src/lib/icons/sword-solid-full.svg` |
| Heart | `src/lib/icons/icon-heart.svg` |
| Iron | `src/lib/icons/fist.svg` |
| Shadow | `src/lib/icons/shadow.svg` |
| Wits | `src/lib/icons/brain.svg` |

All imported as `?raw` and rendered with `{@html icon}`. The `:global(svg)` selector sets `fill: var(--stat-color)` and `width/height: 72%`.

---

## Design Tokens — Colors & Fonts

All defined in `apps/web/src/app.css`. Use CSS variables everywhere; never hardcode values except for semantic one-off colors (e.g. danger red `#ef4444`).

### Fonts

| Variable | Value | Use |
|----------|-------|-----|
| `--font-display` | `'Cinzel', 'Palatino Linotype', Georgia, serif` | Headings, brand name, card titles |
| `--font-body` | `'Crimson Pro', 'Palatino Linotype', Georgia, serif` | Body text, asset ability text |
| `--font-ui` | `'Roboto', system-ui, sans-serif` | Labels, buttons, stats, pills, all UI chrome |

### Text Colors

| Variable | Dark theme | Light/Print theme | Use |
|----------|-----------|-------------------|-----|
| `--text` | (body default) | (body default) | Main readable text |
| `--text-muted` | `#9a886a` | `#5a4e38` | Secondary labels, dimmed controls |
| `--text-dimmer` | `#6e5e42` | `#8a7860` | Very quiet labels, track readouts |
| `--text-accent` | `#e8a030` | `#8a4e08` | Brand color — nav logo, links, progress tick strokes, hover highlights |

### Background & Border Colors

| Variable | Dark theme | Light/Print theme | Use |
|----------|-----------|-------------------|-----|
| `--bg-card` | `#131008` | `#ede6d6` | Card backgrounds |
| `--bg-inset` | `#0d0b07` | `#f9f4ea` | Inset sections (card headers, inputs) |
| `--border` | `#3d3425` | `#c8b89a` | Card/section borders |
| `--border-mid` | `#574a32` | `#b0a080` | Button borders, control separators |

### Stat Colors

| Variable | Dark theme | Light/Print theme | Stat |
|----------|-----------|-------------------|------|
| `--color-edge` | `#4E80ED` | `#1a5fa0` | Edge |
| `--color-heart` | `#DD514C` | `#b02828` | Heart |
| `--color-iron` | `#9EA2AD` | `#5a6878` | Iron |
| `--color-shadow` | `#9E5BEE` | `#6a2aaa` | Shadow |
| `--color-wits` | `#E8A13B` | `#805800` | Wits |
| `--color-touched` | `#78DB88` | `#2a8840` | Touched (YRT homebrew) |

### Resource Colors

| Variable | Dark theme | Light/Print theme | Resource |
|----------|-----------|-------------------|----------|
| `--color-momentum` | `#73A4F4` | `#1a5fa0` | Momentum |
| `--color-health` | `#E77974` | `#b02828` | Health |
| `--color-spirit` | `#A28BF3` | `#6a2aaa` | Spirit |
| `--color-supply` | `#6ACF9D` | `#0e7a40` | Supply |
| `--color-mana` | `#f59e0b` | `#b45309` | Mana (YRT homebrew) |
| `--color-danger` | `#DD514C` | `#b02828` | Danger/menace (foe harm, menace track) |

### Asset Category Colors

Used in `AssetCard` and GCB asset pills. Maps `AssetCategory` → CSS variable:

| Category | CSS variable |
|----------|-------------|
| Combat Talent | `var(--color-iron)` |
| Path | `var(--color-edge)` |
| Companion | `var(--color-heart)` |
| Ritual | `var(--color-mana)` |
| Touched | `var(--color-touched)` |

### Progress Track Strokes

In `ProgressTrack.svelte`:
- **Box border**: `stroke="currentColor"` (inherits `--text-muted` from `.track-box`), `stroke-width="1.5"`
- **Tick marks**: `stroke="var(--text-accent)"`, `stroke-width="1.5"`
- **Hover**: `.track-box:hover` changes color to `var(--text-accent)`
- **Danger boxes**: box border becomes `#E77974`, fill tinted red
