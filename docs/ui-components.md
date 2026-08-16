# UI Components — Design Specifications

Canonical styles for shared UI patterns across the app.

> **⚠️ v2 note.** The **GlobalContextBar** was removed in the v2 rewrite (see
> [global-context-bar.md](global-context-bar.md)) — any `.gc-*` classes and
> "GCB tile" references below are historical. Several card-pattern specs here
> also predate v2's deck-of-cards layout, where the standalone card components
> were merged into the `v2/*Area.svelte` hosts. The pill / badge / icon-button
> style specs remain accurate; treat GCB- and card-component-specific structure
> as reference for retired components.

---

## Toolbar Button Hierarchy

Toolbars use two button styles to signal action priority. Never invent a third style — pick one of these two.

| Style         | Classes           | Dark theme                                                                                     | Light theme                                                                                         | When to use                                       |
| ------------- | ----------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Primary**   | `btn btn-primary` | Gold border + gold text (`--text-accent` = `#e8a030`) on putty bg (`--bg-control` = `#1e1a10`) | Dark amber border + text (`--text-accent` = `#8a4e08`) on parchment bg (`--bg-control` = `#f0e9d8`) | Frequent actions — creating items, asking oracles |
| **Secondary** | `btn`             | Muted text (`--text-muted` = `#9a886a`), border (`--border-mid` = `#574a32`) on putty bg       | Muted text (`--text-muted` = `#5a4e38`), border (`--border-mid` = `#b0a080`) on parchment bg        | Utility/infrequent — Export, Import, Clear        |

Icon buttons in toolbars use `btn icon-btn` (secondary by default). Add `btn-primary` when the action is frequently used (e.g. Ask oracle on the Communities toolbar).

### Examples by tab

| Tab         | Primary (gold)          | Secondary (putty) |
| ----------- | ----------------------- | ----------------- |
| Characters  | + Character             | Import            |
| Foes        | + Foe                   | —                 |
| Expeditions | + Journey, + Site       | —                 |
| Communities | Ask, + Community, + NPC | Export            |
| Adventure   | Move, Ask, Roll, Note   | —                 |
| Session Log | —                       | Export, Clear     |

> **Rule:** If a button opens a dialog or creates something the user will click many times per session, it should be primary. One-off or data-management actions (export, clear, import) stay secondary.

---

## Inline Roll / Dice Button

Small square button that sits inline with a single-line input or select and triggers an oracle roll (or any randomiser) for that field. Used wherever a labelled field has a "roll me" affordance — site Theme/Domain/Feature/Danger, community Trouble, future per-field random buttons.

**One global class — `.dice-btn`.** This is the **preferred** d6 button style. It
lives in `app.css` as a global class; new d6 buttons apply `class="dice-btn"`
directly and do **not** re-style per component. The Delve site Theme/Domain/
Feature/Danger rolls (`ExpeditionsArea`) and the community Trouble roll
(`CommunitiesArea`) use it. (The former per-area `.ea-dice-btn` / `.cm-dice-btn`
copies were consolidated into `.dice-btn`.)

### Canonical CSS (defined once in `app.css`)

```css
.dice-btn {
  all: unset;
  cursor: pointer;
  box-sizing: border-box;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-mid);
  border-radius: 3px;
  background: transparent;
  color: var(--text-muted);
  flex-shrink: 0;
  transition:
    color 0.12s,
    border-color 0.12s,
    background 0.12s;
}
.dice-btn:hover:not(:disabled) {
  color: var(--text-accent);
  border-color: var(--text-accent);
}
.dice-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.dice-btn svg {
  width: 12px;
  height: 12px;
  fill: currentColor;
  pointer-events: none;
}
```

### Why 22×22 / 12 svg

22 px matches the height of the adjacent `.<area>-input` (`padding: 3px 8px` + `font-size: 0.78rem` + 1 px border = ~22 px), so the button and the input read as one control on the row. A 12 px svg inside a 22 px button leaves a 5 px halo on each side — the same ratio as the rest of the icon-button family (`btn icon-btn`).

### Markup template

```svelte
<button
  class="dice-btn"
  type="button"
  onclick={rollSomething}
  disabled={rolling}
  use:tooltip={'Roll <field name> oracle'}
  aria-label="Roll <field name> oracle">{@html diceD6Svg}</button
>
```

`type="button"` so it doesn't submit any enclosing form. `disabled={rolling}` prevents double-rolls while the d6 animation is in flight. SVG comes from `$icons/dice-d6-light.svg?raw` — never use a unicode die character.

### Checklist when adding a new inline roller

- [ ] Use the global `class="dice-btn"` — do not copy the CSS into a new per-area class.
- [ ] `disabled` is bound to the per-component `rolling` flag.
- [ ] `use:tooltip` and `aria-label` carry the same text — the action ("Roll <thing> oracle"), not just "Roll".
- [ ] `await load<Store>()` is the first line of the handler — `loadOracles()` for oracle rolls, `loadDelveData()` for theme/domain combined-table rolls, etc. Without it, a user clicking the button before the catalogue fetch settles hits a silent empty-result return (`rollOracle` for the missing-key case) or a crash (`rollFromRangeTable([])` reading `picked.value` on an empty table).

---

## Tooltips

**Use the `use:tooltip` action for every hover hint. Never use the native
`title` attribute** — native `title` has unpredictable delays, can't be styled,
doesn't show on touch, and is clipped by `overflow: hidden/auto` ancestors
(common inside dialogs). This is the app-wide standard — see CLAUDE.md →
"Tooltips".

### Usage

```svelte
<script>
  import { tooltip } from '$lib/actions/tooltip.js';
</script>

<button use:tooltip={'Save changes'} aria-label="Save">{@html saveIcon}</button>
<span use:tooltip={{ text: 'Asset name', placement: 'below' }}>pill text</span>
```

`use:tooltip` promotes the tip into the top layer via the browser's Popover API
(a body-level `.js-tooltip`), so it renders correctly above dialogs and other
floating UI and is never clipped by an ancestor's overflow; it also auto-shows
on tap and dismisses on mobile. For icon-only buttons add a matching
`aria-label` — the action doesn't set the accessible name (native `title` used
to double as it).

### Legacy `[data-tooltip]` CSS system

A lightweight CSS-only tooltip (`data-tooltip="…"` on an element, styled
globally in `app.css` via `::after`/`::before` on `:hover`/`:focus-visible`) is
still used by a few non-clipped controls (e.g. SettingsDialog). It's fine where
it already lives, but prefer `use:tooltip` for new work — the CSS bubble is
clipped inside any `overflow: hidden/scroll` ancestor and doesn't show on touch.
(The old `.tooltip-down` "flip below" modifier was removed.)

---

## Card Headers

Used in: `CharacterSheet` (`.char-header`), `FoeCard` (`.fc-header`), `JourneyCard` (`.jc-header`), `SiteCard` (`.sc-header`)

### Layout & Sizing

```css
display: flex;
align-items: center;
gap: 8px;
padding: 8px 12px;
min-height: 55px; /* portrait (38px) + padding (16px) + border-bottom (1px) = 55px box-sizing:border-box */
flex-wrap: wrap;
background: var(--bg-inset);
border-bottom: 1px solid var(--border);
```

### Collapsed State

When a card is collapsed, its body is hidden (`{#if !collapsed}`). Without removing the `border-bottom`, the header's bottom border overlaps the card's outer `border-bottom` at the same pixel, creating a double-line ("thick border") effect.

**Fix:** suppress the inner border when collapsed:

```css
.char-card.collapsed .char-header {
  border-bottom: none;
}
.foe-card.collapsed .fc-header {
  border-bottom: none;
}
.jc-card.collapsed .jc-header {
  border-bottom: none;
}
.sc-card.collapsed .sc-header {
  border-bottom: none;
}
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

Used in: `FoeCard` (`.fc-badge`), `JourneyCard` (`.jc-badge`), `SiteCard` (`.sc-badge`), `GlobalContextBar` (`.gc-badge`, `.gc-debility-pill`, `.gc-asset-pill`)

### Base CSS

Every pill/badge **must** include all of these properties. `line-height: 1` is required to guarantee uniform pill height regardless of the parent container's inherited line-height.

```css
font-family: var(--font-ui);
font-size: 0.6rem;
font-weight: 600;
letter-spacing: 0.05em;
text-transform: uppercase;
padding: 2px 7px;
border-radius: 10px;
border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
line-height: 1;
white-space: nowrap;
flex-shrink: 0;
```

> **Important:** Put `border` in the CSS class, not in an inline `style` attribute. `currentColor` picks up the `color` value (set inline or by a modifier class), so the border always matches the pill's text color at 35% opacity.

### Colors by Type

| Type                  | Background                                     | Color                         | Notes                   |
| --------------------- | ---------------------------------------------- | ----------------------------- | ----------------------- |
| Nature                | `{FOE_NATURE_COLORS[nature]}22`                | `{FOE_NATURE_COLORS[nature]}` |                         |
| Rank/Difficulty       | `{RANK_COLORS[n].bg}22`                        | `{RANK_COLORS[n].bg}`         |                         |
| Quantity              | `rgba(255,255,255,0.08)`                       | `var(--text-muted)`           |                         |
| Harm                  | `rgba(239,68,68,0.10)`                         | `#ef4444`                     | static                  |
| Harm (escalating)     | `rgba(239,68,68,0.18)`                         | `#ef4444`                     | italic, `Harm: N ↑`     |
| Progress/boxes        | `rgba(59,130,246,0.10)`                        | `#60a5fa`                     | static                  |
| Progress (defense up) | `rgba(96,165,250,0.18)`                        | `#60a5fa`                     | italic, `Progress: N ↓` |
| Journey type          | `rgba(52,211,153,0.15)`                        | `#34d399`                     |                         |
| Site type             | `rgba(96,165,250,0.15)`                        | `#60a5fa`                     |                         |
| Theme                 | `rgba(168,85,247,0.15)`                        | `#a855f7`                     |                         |
| Domain                | `rgba(251,146,60,0.15)`                        | `#fb923c`                     |                         |
| Debility              | `color-mix(in srgb, {color} 12%, transparent)` | `var(--color-danger)`         |                         |
| Asset                 | `color-mix(in srgb, {color} 12%, transparent)` | `ASSET_CAT_COLOR[category]`   |                         |

### Pill Order

- **Foe:** nature → rank → quantity → harm (↑ italic when escalating) → progress (↓ italic when defense active)
- **Journey (body top):** Journey (type) → difficulty
- **Site (body top):** Site (type) → difficulty → theme → domain
- **GCB character tile:** debilities → assets (below initiative toggle)
- **GCB foe tile:** nature → rank → quantity → harm (↑ italic when escalating) → progress (↓ italic when defense active)
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
  troublesome: 1,
  dangerous: 2,
  formidable: 3,
  extreme: 4,
  epic: 5,
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
  Filters{#if activeItems.size > 0}&nbsp;<span class="xx-filter-badge">{activeItems.size}</span
    >{/if}
  {filtersOpen ? '▲' : '▼'}
</button>
{#if filtersOpen}
  <div class="xx-filter-panel">
    <div class="xx-filter-chips">
      {#each items as item}
        <button
          class="xx-chip"
          class:xx-chip--active={activeItems.has(item)}
          onclick={() => toggleItem(item)}>{item}</button
        >
      {/each}
    </div>
  </div>
{/if}
```

### CSS

```css
/* Toggle button */
.xx-filter-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-ui);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-dimmer);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 3px 8px;
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s,
    border-color 0.12s;
}
.xx-filter-toggle:hover {
  color: var(--text);
  border-color: var(--border-mid);
}
.xx-filter-toggle--active {
  color: var(--accent);
  border-color: var(--accent);
}

/* Active count badge (inside toggle button) */
.xx-filter-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--accent);
  color: var(--bg);
  font-size: 0.6rem;
  font-weight: 700;
}

/* Collapsible panel */
.xx-filter-panel {
  padding: 4px 0 2px;
}
.xx-filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

/* Individual chip/tag */
.xx-chip {
  font-family: var(--font-ui);
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-dimmer);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 2px 8px;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.12s,
    color 0.12s;
}
.xx-chip:hover {
  background: color-mix(in srgb, var(--border) 30%, transparent);
  color: var(--text);
}
.xx-chip--active {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
  border-color: var(--accent);
}
```

> Chips can use a `--gcolor` CSS variable for per-chip color (e.g. oracle groups). Set `style:--gcolor={color}` on each chip and reference `var(--gcolor, var(--text-dimmer))` for `color` and `var(--gcolor, var(--border))` for border/background mixing.

---

## GCB Empty Tile Placeholder Icons

Empty tiles in the GlobalContextBar display a placeholder `<img>` icon (loaded via URL, not inline SVG). Because the source images are dark silhouettes, they require a CSS filter chain to match the surrounding text colour on each theme.

### Dark theme (default)

Target colour: `--text-muted` ≈ `#96886D`

Filter derivation (applied to a black source image):

1. `invert(1)` — black → white
2. `brightness(0.59)` — white → mid-gray (150, 150, 150)
3. `sepia(1)` — gray → warm (203, 180, 141)
4. `brightness(0.75)` — trim to (152, 135, 106) ≈ `#96886A`

```css
.gc-placeholder-img {
  filter: invert(1) brightness(0.59) sepia(1) brightness(0.75);
}
.gc-tile-btn:hover .gc-placeholder-img {
  filter: invert(1) brightness(0.59) sepia(1) brightness(0.9);
}
```

### Light theme override

Images are dark on a light background — no invert needed. Override restores original dark appearance at reduced opacity:

```css
.gc-placeholder-img {
  opacity: 0.45;
  filter: grayscale(0.45) brightness(0.75);
}
.gc-tile-btn:hover .gc-placeholder-img {
  opacity: 0.65;
  filter: grayscale(0.2) brightness(0.85);
}
```

> **Rule:** Never use `opacity` alone on the dark theme placeholder — the source images are nearly black and will be invisible against a dark background regardless of opacity. Always use the `invert → brightness → sepia → brightness` filter chain.

---

## Section Labels

A narrow vertical strip on the **left** side of a content area. Text runs bottom-to-top. Used for STATS, VITALS, DEBILITIES in `CharacterSheet` and "Current Scenario" in `GlobalContextBar`.

All side labels share the same typography and border — the only difference is how they self-align within their flex parent.

### Base CSS (shared by all side labels)

```css
.xx-side-label {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-family: var(--font-ui);
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-dimmer);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-left: 1px solid var(--border);
  padding-left: 4px;
}
```

### Variant A — compact row (`align-self: stretch`)

Used when the label sits alongside a compact, fixed-height row (STATS, VITALS, DEBILITIES). `align-self: stretch` lets the border-left span the full row height as a continuous vertical rule.

```svelte
<div class="xx-row-wrapper">
  <div class="xx-side-label" style="align-self: stretch">STATS</div>
  <div class="xx-content"><!-- stat tiles --></div>
</div>
```

```css
.xx-row-wrapper {
  display: flex;
  align-items: center; /* or flex-start for multi-line content */
  gap: 6px;
}
```

### Variant B — tall container (`align-self: stretch` + `margin`)

Used when the label sits alongside a potentially tall container (e.g. the GCB tile area). `align-self: stretch` is still used so the border spans cleanly, but equal `margin` top and bottom prevents it from reaching the outer edges of the container. Set the margin to match the adjacent content area's vertical padding so the border aligns with the content bounds.

```svelte
<div class="xx-side-label" style="align-self: stretch; margin: 0.25rem 0">CURRENT SCENARIO</div>
```

```css
.gc-scenario-heading {
  /* …base properties… */
  align-self: stretch;
  margin: 0.25rem 0; /* match gc-layout vertical padding — equal top and bottom */
  padding-left: 4px; /* border gap only, no top/bottom padding */
}
```

> **Why not `align-self: center`?** With `writing-mode: vertical-rl`, flex auto-margins for centering don't always compute symmetrically across browsers. Explicit equal margins on a stretched element are more reliable.

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

| Stat   | File                                 |
| ------ | ------------------------------------ |
| Edge   | `src/lib/icons/sword-solid-full.svg` |
| Heart  | `src/lib/icons/icon-heart.svg`       |
| Iron   | `src/lib/icons/fist.svg`             |
| Shadow | `src/lib/icons/shadow.svg`           |
| Wits   | `src/lib/icons/brain.svg`            |

All imported as `?raw` and rendered with `{@html icon}`. The `:global(svg)` selector sets `fill: var(--stat-color)` and `width/height: 72%`.

---

## Design Tokens — Colors & Fonts

All defined in `apps/web/src/app.css`. Use CSS variables everywhere; never hardcode values except for semantic one-off colors (e.g. danger red `#ef4444`).

### Fonts

| Variable         | Value                                                | Use                                          |
| ---------------- | ---------------------------------------------------- | -------------------------------------------- |
| `--font-display` | `'Cinzel', 'Palatino Linotype', Georgia, serif`      | Headings, brand name, card titles            |
| `--font-body`    | `'Crimson Pro', 'Palatino Linotype', Georgia, serif` | Body text, asset ability text                |
| `--font-ui`      | `'Roboto', system-ui, sans-serif`                    | Labels, buttons, stats, pills, all UI chrome |

### Text Colors

| Variable        | Dark theme     | Light/Print theme | Use                                                                    |
| --------------- | -------------- | ----------------- | ---------------------------------------------------------------------- |
| `--text`        | (body default) | (body default)    | Main readable text                                                     |
| `--text-muted`  | `#9a886a`      | `#5a4e38`         | Secondary labels, dimmed controls                                      |
| `--text-dimmer` | `#6e5e42`      | `#8a7860`         | Very quiet labels, track readouts                                      |
| `--text-accent` | `#e8a030`      | `#8a4e08`         | Brand color — nav logo, links, progress tick strokes, hover highlights |

### Background & Border Colors

| Variable       | Dark theme | Light/Print theme | Use                                   |
| -------------- | ---------- | ----------------- | ------------------------------------- |
| `--bg-card`    | `#131008`  | `#ede6d6`         | Card backgrounds                      |
| `--bg-inset`   | `#0d0b07`  | `#f9f4ea`         | Inset sections (card headers, inputs) |
| `--border`     | `#3d3425`  | `#c8b89a`         | Card/section borders                  |
| `--border-mid` | `#574a32`  | `#b0a080`         | Button borders, control separators    |

### Stat Colors

| Variable          | Dark theme | Light/Print theme | Stat                   |
| ----------------- | ---------- | ----------------- | ---------------------- |
| `--color-edge`    | `#5B9CF6`  | `#1565C0`         | Edge                   |
| `--color-heart`   | `#F06880`  | `#C0184C`         | Heart                  |
| `--color-iron`    | `#94A8BC`  | `#3D5A70`         | Iron                   |
| `--color-shadow`  | `#C084FC`  | `#7C3AED`         | Shadow                 |
| `--color-wits`    | `#FBBF24`  | `#A16207`         | Wits                   |
| `--color-touched` | `#78DB88`  | `#2a8840`         | Touched (YRT homebrew) |

### Resource Colors

| Variable           | Dark theme | Light/Print theme | Resource                               |
| ------------------ | ---------- | ----------------- | -------------------------------------- |
| `--color-momentum` | `#22D3EE`  | `#0891B2`         | Momentum                               |
| `--color-health`   | `#4ADE80`  | `#15803D`         | Health                                 |
| `--color-spirit`   | `#818CF8`  | `#3730A3`         | Spirit                                 |
| `--color-supply`   | `#FB923C`  | `#C2410C`         | Supply                                 |
| `--color-xp`       | `#A3E635`  | `#4D7C0F`         | XP                                     |
| `--color-mana`     | `#f59e0b`  | `#b45309`         | Mana (YRT homebrew)                    |
| `--color-danger`   | `#DD514C`  | `#b02828`         | Danger/menace (foe harm, menace track) |

### Asset Category Colors

Used in `AssetCard` and GCB asset pills. Maps `AssetCategory` → CSS variable:

| Category      | CSS variable           |
| ------------- | ---------------------- |
| Combat Talent | `var(--color-iron)`    |
| Path          | `var(--color-edge)`    |
| Companion     | `var(--color-heart)`   |
| Ritual        | `var(--color-mana)`    |
| Touched       | `var(--color-touched)` |

### Progress Track Strokes

In `ProgressTrack.svelte`:

- **Box border**: `stroke="currentColor"` (inherits `--text-muted` from `.track-box`), `stroke-width="1.5"`
- **Tick marks**: `stroke="var(--text-accent)"`, `stroke-width="1.5"`
- **Hover**: `.track-box:hover` changes color to `var(--text-accent)`
- **Danger boxes**: box border becomes `#E77974`, fill tinted red

---

## Shared components extracted from per-area duplication

Several patterns that were originally copy-pasted across area
components (CharactersArea, FoesArea, ExpeditionsArea, CommunitiesArea,
VowCard, AssetCard) have been extracted into single shared components.
Prefer these over rebuilding the pattern inline.

### `ProgressTrackPanel` (`$lib/components/ProgressTrackPanel.svelte`)

Wraps `ProgressTrack` with the **foe-pattern** layout: a label row
(title + tally) above a controls row (boxes + ± buttons),
`align-self: flex-start` shrinks the group to the controls width so the
tally lands flush with the + button.

```svelte
<ProgressTrackPanel label="Bonds" bind:value={d.bonds} />

<ProgressTrackPanel
  label="Progress"
  bind:value={vow.ticks}
  step={VOW_MARK_TICKS[vow.difficulty]}
  showStep
  dangerCount={vow.menace}
/>
```

Props: `value` (bindable), `label`, `color?`, `step?` (default 1),
`showStep?`, `min?`, `max?` (default 40), `boxes?`, `dangerCount?`,
`onchange?`. Used by Characters (Bonds, Failures), VowCard, FoesArea,
ExpeditionsArea.

### `MarkdownNotes` (`$lib/components/MarkdownNotes.svelte`)

Click-to-edit markdown notes field — rendered HTML in display mode,
textarea on click, returns to display on blur. Supports both
`bind:value` and `value + oninput` for parents whose data lives in
nested state.

```svelte
<MarkdownNotes
  label="Bonds Formed"
  bind:value={d.bondsFormed}
  placeholder="Note significant bonds…"
/>
```

Props: `value` (bindable), `editing?` (bindable, exposes the dialog
state so parents can hide e.g. floating portraits during edit),
`label?`, `placeholder?`, `rows?` (default 4), `oninput?`. Used by
Characters (background, bondsFormed, lessonsLearned), VowCard,
ExpeditionsArea, CommunitiesArea (core + notes tab).

### `PortraitUploader` (`$lib/components/PortraitUploader.svelte`)

170×170 floating portrait with file picker + clear button. Crops to a
256-pixel-square JPEG via `cropImageFile()` (`$lib/imageCrop.ts`).

```svelte
<PortraitUploader
  bind:value={d.portrait}
  placeholderSvg={hornedHelmSvg}
  alt={`Portrait of ${d.name}`}
/>
```

Props: `value` (bindable, JPEG data URL), `placeholderSvg` (raw SVG
string), `alt?`, `oninput?`. Used by Characters, CommunitiesArea
(community + NPC), ExpeditionsArea.

### `EditableName` (`$lib/editableName.svelte.ts`)

Helper class (NOT a component) encapsulating the click-to-edit name
pattern — state, focus/select effect, Enter/Escape key handling,
snapshot-and-restore on cancel. The parent renders the markup but
delegates behaviour to this helper, so per-area stage-header styling
remains in the parent.

```ts
const nameEdit = new EditableName((restored) => {
  d.name = restored;
});
```

```svelte
{#if nameEdit.editing}
  <input
    bind:this={nameEdit.inputEl}
    bind:value={d.name}
    onblur={nameEdit.commit}
    onkeydown={nameEdit.onKeydown}
  />
{:else}
  <button onclick={() => nameEdit.start(d.name)}>{d.name}</button>
{/if}
```

Used by Characters, FoesArea, ExpeditionsArea, CommunitiesArea,
VowCard.

### `cropImageFile()` (`$lib/imageCrop.ts`)

Pure async helper: takes a `File`, returns a Promise<string> resolving
to a centred-square JPEG data URL (default max 256 × 256 at 0.85
quality). Used internally by `PortraitUploader`.

### Global counter registry (`$lib/globalCounters.ts`)

`buildGlobalCounterRegistry(assets, onMismatch?)` and
`getGlobalCounterDef(id)` / `getGlobalCounterIds()` (re-exported by
`$lib/assetStore.svelte.ts`) provide the canonical definition for
counter fields declared `global: true`. First declaration wins; later
mismatches log `console.error`. See `docs/data-schema.md` for the
draft/snapshot model that depends on this.

---

## bits-ui — Controls Library

We're incrementally migrating hand-rolled dialogs, dropdowns, and
pickers to [`bits-ui`](https://bits-ui.com/) primitives (Svelte 5
headless — no built-in styling, we own every pixel). Started with
the marker link picker (`Combobox`) and `ConfirmDialog`
(`AlertDialog`). The plan is documented in the session log; the
rules below apply to any new bits-ui integration.

### Why bits-ui

Keyboard nav, focus trap, focus return, correct ARIA roles,
portalling, positioning middleware — all correct-by-construction.
Every hand-rolled dropdown / dialog in this repo was slowly
reinventing the same wheels. Adopt bits-ui for anything with an
equivalent primitive; keep custom code only where the library has
no answer (colour picker → Pickr, uploader, the SVG map, dice
animations, `DialogHeader` grip + drag).

### Class scoping — always `:global(…)` for classes on bits-ui components

bits-ui components own their DOM subtree. Svelte's CSS pruning
can't see class names threaded through a foreign component's
render, so scoped selectors get compiled out with an "unused
selector" warning. **Rule:** any class passed via `class="…"` to a
bits-ui component must be styled with `:global(.classname)`, not
`.classname`.

```svelte
<AlertDialog.Content class="confirm-modal">…</AlertDialog.Content>
```

```css
/* Correct */
:global(.confirm-modal) { … }

/* Wrong — will get pruned */
.confirm-modal { … }
```

Descendant selectors on the same class also need `:global`:
`:global(.confirm-modal .cm-body)`, not `:global(.confirm-modal)
.cm-body`.

Classes that land on a **plain HTML element you wrote** (a `<div>`
wrapper around bits-ui parts, for example) stay in normal scope —
Svelte's pruning sees them. Only cross the `:global` boundary at
the bits-ui component itself.

### Portals — pick the target deliberately

Any bits-ui primitive with a `Portal` (Dialog, AlertDialog,
Combobox, Popover, DropdownMenu, …) defaults to
`document.body`. That's fine at the app root, but a **portal to
body renders below any parent native `<dialog>` in the top
layer**. If the primitive lives inside a still-native dialog,
pass `to={parentDialogEl}` so the portalled content ends up in
the same top-layer scope:

```svelte
<Popover.Portal to={dialogEl ?? undefined}>…</Popover.Portal>
```

Every bits-ui primitive we build inside `MapDialog` currently
portals into `dialogEl` (the map's native `<dialog>` ref) for
exactly this reason. Once `MapDialog` itself migrates to
`Dialog`, the portal target can go back to body.

Expose a `portalTo?: Element | string` prop on reusable
components (see `ConfirmDialog`) so a caller inside a native
dialog can override.

### Overlay / z-index budget

Portalled bits-ui content is a plain `<div>` (not top-layer). We
reserve **z-index 80+** for it so it wins over the app chrome:

| Layer          | z-index | Notes                                                               |
| -------------- | ------- | ------------------------------------------------------------------- |
| Popover / menu | `90`    | `.bui-select-content`, `.mp-cmd-popover`, `.hm-menu` — must beat 81 |
| Modal content  | `81`    | `.confirm-modal`, dialog body                                       |
| Modal overlay  | `80`    | `.cm-overlay`, other alert-dialog scrims                            |
| App chrome     | `< 20`  | Toolbars, sidebar                                                   |

Popovers / menus sit **above** modal content on purpose: a
`<Select>`, combobox, or `DropdownMenu` opened from inside a
`ConfirmDialog` / `AlertDialog` still needs to render on top
of the dialog itself. The trigger is inside the modal, so the
popover almost always is too — z-index 60 would put it behind
the dialog it was launched from.

Keep new bits-ui surfaces inside this budget; don't invent a `999`
one-off.

### Combobox pattern (search-first pickers)

For any pick-from-a-list-with-typeahead — the shadcn-svelte
combobox shape — use bits-ui **`Popover` + `Command`**. The
trigger is a text-field-styled `<button>` that shows the current
value (or a placeholder) and a chevron; clicking opens a popover
with its own search `<input>` at the top and a filtered list
below.

```svelte
<Popover.Root bind:open>
  <Popover.Trigger class="mp-combobox {extraClass}" aria-label="…">
    {#if current}
      <span class="mp-combobox-value">{current.name}</span>
    {:else}
      <span class="mp-combobox-value mp-combobox-value--placeholder">— Select —</span>
    {/if}
    <span class="mp-combobox-caret" aria-hidden="true">{@html caretDownSvg}</span>
  </Popover.Trigger>
  <Popover.Portal to={dialogEl ?? undefined}>
    <Popover.Content class="mp-cmd-popover" sideOffset={4} align="start" collisionPadding={8}>
      <Command.Root class="mp-cmd">
        <div class="mp-cmd-search-row">
          <span class="mp-cmd-search-icon" aria-hidden="true">{@html searchIconSvg}</span>
          <Command.Input class="mp-cmd-search" placeholder="Search…" />
        </div>
        <Command.List class="mp-cmd-list">
          <Command.Empty class="mp-cmd-empty">No results.</Command.Empty>
          {#each items as it}
            <Command.Item class="mp-cmd-item" value={it.name} onSelect={() => pick(it)}>
              <span class="mp-cmd-check"
                >{#if selected(it)}<check-svg />{/if}</span
              >
              <span class="mp-cmd-item-name">{it.name}</span>
            </Command.Item>
          {/each}
        </Command.List>
      </Command.Root>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
```

Notes:

- **Trigger is a `<button>`, not an `<input>`** — the visible field is
  a shell that opens the popover. All typing happens inside the
  popover's `Command.Input`. This is the shape most designers
  reach for; it also avoids the global `input:focus` box-shadow
  bleeding through the trigger.
- **`Command.Item value={…}` is what the search filters against** —
  usually the item's user-facing name. `onSelect` fires when the
  item is picked. Selection state (checkmark) is tracked in your
  own store; there's no `bind:value` on the Command.
- **`Command.Empty`** renders when the list is empty after
  filtering — Command handles this automatically.
- **`Command.Separator`** for a divider before a footer action row
  (e.g. "+ New map…" at the bottom of the map switcher).
- Sort items yourself before passing to the `{#each}` — Command
  filters but does not sort. Reserve one CSS prefix per surface —
  the two comboboxes in `MapDialog` (map switcher and marker link
  picker) share `.mp-cmd-*` on purpose so they look identical.

**When to use bits-ui `Combobox` instead** — only when you
specifically want the trigger to _be_ the input (search-as-you-
type without a separate popover input). That's a different
interaction pattern; the shadcn shape above is the default.

### Simple dropdown fields — `<Select>` wrapper

For a plain form-field dropdown (a native `<select>` you'd
otherwise reach for), use the shared
`$lib/components/Select.svelte` wrapper — bits-ui `Select`
underneath, uniform trigger + popover chrome across the app.
Every native `<select>` in the app was migrated to this in the
same pass that introduced the Popover + Command combobox above;
new field selects should go through `<Select>` unless the option
count is high enough that typeahead search is worth the combobox.

```svelte
<Select
  bind:value={difficulty}
  ariaLabel="Vow difficulty"
  options={[
    { value: 'troublesome', label: 'Troublesome' },
    { value: 'dangerous', label: 'Dangerous' },
    { value: 'formidable', label: 'Formidable' },
  ]}
/>
```

Notes:

- **Generic over its value type** — `<script generics="T extends string">`,
  so `value` and each option's `value` type-check against a
  string-literal union (like `VowDifficulty`) without casts.
- **`bind:value` is the usual channel**; `onchange` is available
  when you need side-effects on the new value (a callback that
  can't be expressed as a reactive `$effect`).
- **Portal target** — pass `portalTo={dialogEl ?? undefined}` when
  the select lives inside a native `<dialog>` so the popover
  renders on top of that dialog's top layer instead of behind
  it. Same rule as the combobox.
- **Base trigger styling comes from `.bui-select-trigger`** (in
  `Select.svelte`, `:global`). Site-specific tweaks pass an
  extra class (e.g. `class="ea-select"`) that also has to be
  `:global(...)` in the caller's stylesheet — Svelte's CSS
  pruning can't see through the component boundary.

### AlertDialog pattern (confirmations)

For destructive-action confirmations use `AlertDialog` (blocks
outside-click; Escape still closes):

```svelte
<AlertDialog.Root bind:open onOpenChange={…}>
  <AlertDialog.Portal to={portalTo}>
    <AlertDialog.Overlay class="cm-overlay" />
    <AlertDialog.Content class="confirm-modal" style="--accent: …">
      <div class="cm-header">
        <AlertDialog.Title class="cm-title">…</AlertDialog.Title>
      </div>
      <div class="cm-body">
        {@render children?.()}
        <div class="cm-actions">
          <AlertDialog.Cancel class="btn" onclick={handleCancel}>Cancel</AlertDialog.Cancel>
          <AlertDialog.Action class="btn btn-danger" onclick={handleConfirm}>Delete</AlertDialog.Action>
        </div>
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>
```

Notes:

- Use `AlertDialog` when the user must respond (delete /
  overwrite / discard). Use plain `Dialog` for informational or
  editable panels where clicking outside should close.
- `AlertDialog.Cancel` and `AlertDialog.Action` both close the
  dialog on click and carry the right ARIA semantics — always
  prefer them over a bare `<button onclick={close}>`.
- If you need to distinguish "cancel via button" from
  "cancel via Escape / outside click", track intent in a local
  state variable and read it inside `onOpenChange` (see
  `ConfirmDialog._closeIntent`).

### CLAUDE.md dialog rules — apply where?

The iOS-safe `<dialog>` rules in [`CLAUDE.md`](../CLAUDE.md) (no
`dvh`, no `inset:0; margin:auto`, no `flex 1; min-height:0` chain
on the dialog element) apply **only to native `<dialog>`
elements**. bits-ui `Dialog` / `AlertDialog` render as
`position: fixed` divs and don't hit any of those iOS Safari
footguns. When migrating a native dialog to bits-ui you can
retire the workarounds those rules imposed — but until every
consumer of a shared dialog primitive is migrated, keep them.

### Component naming conventions

Reserve class prefixes so it's obvious at a glance which
primitive a class belongs to:

| Prefix          | Primitive                            | Example use                                                      |
| --------------- | ------------------------------------ | ---------------------------------------------------------------- |
| `cm-*`          | `AlertDialog` (Confirm)              | `.cm-overlay`, `.cm-header`, `.cm-actions`                       |
| `mp-combobox-*` | `Popover.Trigger` combobox shell     | `.mp-combobox`, `.mp-combobox-value`, `-caret`                   |
| `mp-cmd-*`      | `Popover + Command` popover body     | `.mp-cmd-popover`, `.mp-cmd-search`, `.mp-cmd-item`              |
| `bui-select-*`  | `<Select>` wrapper (bits-ui)         | `.bui-select-trigger`, `.bui-select-content`, `.bui-select-item` |
| `hm-*`          | `DropdownMenu` (title-bar hamburger) | `.hm-menu`, `.hm-item`, `.hm-sep`, `.hm-item--danger`            |

New primitives get a fresh prefix keyed to their surface — pick
one that's short and searchable. Don't stack unrelated bits-ui
controls under the same prefix.
