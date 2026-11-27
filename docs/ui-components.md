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

`type="button"` so it doesn't submit any enclosing form. `disabled={rolling}` prevents double-rolls while the d6 animation is in flight. SVG comes from `#icons/dice-d6-light.svg?raw` — never use a unicode die character.

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
  import { tooltip } from '#lib/actions/tooltip.js';
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

## Image drop targets — `use:dropImage`

An image uploader also takes an image file dragged in from the desktop. Put
`use:dropImage` (`#lib/actions/dropImage.ts`) on the element to drop on, and
give it the same function the file input's change handler calls, so cropping,
size limits and error messages stay in one place:

```svelte
<script>
  import { dropImage, canDropFiles } from '#lib/actions/dropImage.js';
  const dropHint = canDropFiles(); // mouse or trackpad: mention dropping
</script>

<div class="x-wrap" use:dropImage={{ ondrop: upload, disabled: uploading }}>…</div>

<style>
  /* The action sets data-drop-over while an image is over the element;
     :global() because Svelte can't see an attribute set at runtime and
     would strip the rule as unused. */
  .x-wrap:global([data-drop-over]) {
    outline: 2px dashed var(--text-accent);
  }
</style>
```

- Only drags that carry an image react: text, links, non-image files and the
  app's own pointer drags get no highlight and the browser's "no drop" cursor.
- The highlight survives moving across the element's children, and clears on
  leave or drop.
- Mention dropping in hints only where `canDropFiles()` is true; a touch
  screen has nothing to drag from.
- The root layout mounts `guardStrayFileDrops()`, so a file dropped beside a
  target is ignored rather than opened by the browser in place of the app.

In use: `PortraitUploader` (characters, NPCs, settlements, expeditions;
dropping on a filled portrait replaces it) and the map's background
(`.mp-body` in `MapDialog`). The import dialog's `.zip` drop zone predates
the action and handles its own drag events.

---

## Server-rendered form fields — `defaultValue`, not `value`

The log-in, register, forgot-password and new-link pages are plain
`<form method="POST">` pages that take typing before their scripts load.
Give such a field its starting value with `defaultValue`, not `value`:

```svelte
<input type="email" name="email" required defaultValue={form?.email ?? ''} />
```

The server renders both as the same `value="…"` attribute, but on hydration
Svelte sets a `value={…}` field back to that value, wiping whatever was typed
or autofilled before the page loaded. An emptied `required` field then stops
the form from sending, and no message says why. `defaultValue` (and
`bind:value`) keep what's there. `PasswordInput` passes its `value` prop as
`defaultValue`. `tests/e2e/auth-forms.spec.ts` types into each page with its
scripts held back and checks the typing survives.

---

## Loading — `LoadingSpinner`

Anything the app waits on shows `LoadingSpinner`
(`#lib/components/LoadingSpinner.svelte`), not bare "Loading…" text. It turns
the active livery's brand mark (the axe by default, Jack's pumpkin, Yorick's
skull…; see `liveries.md` → "Brand icon"), tinted `--text-accent`, with an
optional label under it.

```svelte
<script>
  import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
</script>

<div class="ca-loading"><LoadingSpinner label="Loading…" /></div>
<LoadingSpinner size={22} />
<LoadingSpinner label="Saving" inline />
```

The first is an area's loading state; the second a smaller mark with no
label ("Loading" is read out only); the third sits beside its label, for a
line of text.

**Props:** `label` (shown and read out; when left out, "Loading" is read out
only), `size` (the mark's height in px, default 28), `inline` (mark beside the
label instead of above it).

- It fades in after 150 ms, so a load that's over quickly never flashes it.
- With `prefers-reduced-motion` it pulses instead of turning.
- It is `role="status"`, so a screen reader announces it.
- Keep the area's own wrapper class (`.ca-loading`, `.md-loading`…) around it
  for layout; tests wait on those classes going away.

Where it shows:

- **The home areas** (Characters, Expeditions, Foes, Connections) until their
  first load settles. Each store keeps a "settled" flag for that
  (`isCharacterLoaded()`, `isEncounterLoaded()`, `isExpeditionLoaded()`,
  `isCommunityLoaded()`), so an area shows the spinner rather than flashing
  its empty state before the load starts. A failed load settles too and falls
  back to the empty state, so the spinner never turns forever.
- **The Moves and Oracles dialogs, the asset picker and the admin page** while
  their catalogues or figures load.
- **Page changes:** `+layout.svelte` lays a faint veil with a larger spinner
  over the page while SvelteKit's `navigating.to` is set. The veil takes no
  clicks and, like the spinner, waits 150 ms before it shows.

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
import { RANK_COLORS } from '#lib/foeStore.svelte.js';
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

### `ProgressTrackPanel` (`#lib/components/ProgressTrackPanel.svelte`)

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

### `MarkdownNotes` (`#lib/components/MarkdownNotes.svelte`)

Click-to-edit markdown notes field — rendered HTML in display mode,
textarea on click, returns to display on blur. Supports both
`bind:value` and `value + oninput` for parents whose data lives in
nested state.

```svelte
<MarkdownNotes
  label="Background"
  bind:value={d.background}
  placeholder="Origin, upbringing, major traits…"
/>
```

Props: `value` (bindable), `editing?` (bindable, exposes the dialog
state so parents can hide e.g. floating portraits during edit),
`label?`, `placeholder?`, `rows?` (default 4), `oninput?`. Used by
Characters (background), TrackNotesDialog (Bonds Formed, Lessons Learned), VowCard,
ExpeditionsArea, CommunitiesArea (core + notes tab).

### `PortraitUploader` (`#lib/components/PortraitUploader.svelte`)

170×170 floating portrait with file picker + clear button. Crops to a
256-pixel-square JPEG via `cropImageFile()` (`#lib/imageCrop.ts`).

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

### `EditableName` (`#lib/editableName.svelte.ts`)

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

### `cropImageFile()` (`#lib/imageCrop.ts`)

Pure async helper: takes a `File`, returns a Promise<string> resolving
to a centred-square JPEG data URL (default max 256 × 256 at 0.85
quality). Used internally by `PortraitUploader`.

### Global counter registry (`#lib/globalCounters.ts`)

`buildGlobalCounterRegistry(assets, onMismatch?)` and
`getGlobalCounterDef(id)` / `getGlobalCounterIds()` (re-exported by
`#lib/assetStore.svelte.ts`) provide the canonical definition for
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

| Layer          | z-index                       | Notes                                                                                                                                                                |
| -------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Popover / menu | `contentZ(depth)` = `81 + 2n` | `.bui-select-content`, `.cb-popover` push the shared dialog stack on open and set their z-index inline; a popover opened from a nested dialog picks a tier above it. |
| Modal content  | `contentZ(depth)` = `81 + 2n` | `.confirm-modal`, dialog body — see `dialogStack.svelte.ts`.                                                                                                         |
| Modal overlay  | `overlayZ(depth)` = `80 + 2n` | `.cm-overlay`, other alert-dialog scrims.                                                                                                                            |
| App chrome     | `< 20`                        | Toolbars, sidebar.                                                                                                                                                   |

**The backdrop's look is shared.** Every Dialog / AlertDialog overlay
carries `class="dialog-overlay <prefix>-overlay"`: `.dialog-overlay`
(`app.css`) draws the dimmed, lightly blurred layer the same for every
modal, and the dialog's own `*-overlay` class stays as a hook for tests and
local tweaks (the asset dialog's fade-in). The Lightbox adds
`.dialog-overlay--dark` to frame a picture. Don't give a new dialog its own
backdrop colour or blur.

Popovers / menus sit **above** modal content on purpose: a
`<Select>`, combobox, or `DropdownMenu` opened from inside a
`ConfirmDialog` / `AlertDialog` still needs to render on top
of the dialog itself. The trigger is inside the modal, so the
popover almost always is too — z-index 60 would put it behind
the dialog it was launched from.

Keep new bits-ui surfaces inside this budget; don't invent a `999`
one-off.

### Combobox pattern (search-first pickers) — `<Combobox>` wrapper

For any pick-from-a-list-with-typeahead — the shadcn-svelte
combobox shape — use the shared **`#lib/components/Combobox.svelte`**
wrapper (bits-ui `Popover` + `Command` inside, `.cb-*` styles). It
is to the searchable picker what `<Select>` is to the plain
dropdown: one component owns the trigger, the search box, an
optional filter-pill row, the list (per-item check + tinted glyph +
name), an optional leading "clear" row, and optional trailing
action rows. Reach for it for every "switch or add X" header and
any field whose option list is long enough to want typeahead.

```svelte
<script>
  import Combobox from '#lib/components/Combobox.svelte';
</script>

<Combobox
  bind:open={pickerOpen}
  items={sortedThings}
  getKey={(t) => t.id}
  getLabel={(t) => t.name}
  getIcon={(t) => KIND_META[t.kind].icon}
  getColor={(t) => KIND_META[t.kind].color}
  activeKey={activeId}
  onselect={(t) => select(t.id)}
  triggerValue={active ? active.name : ''}
  placeholder="— No things yet —"
  searchPlaceholder="Search things…"
  emptyText="No matching things."
  ariaLabel="Switch or add thing"
  class="xx-hdr-combobox"
  filters={KIND_PILLS}
  bind:activeFilters={kindFilter}
  filterOf={(t) => t.kind}
  actions={[{ label: '+ New thing…', value: '+ New thing', onselect: addThing }]}
/>
```

Key props (see the component's docstring for the full list):

- **`items` + `getKey` / `getLabel`** — the domain list and how to
  read a stable key + the display/search text off each item. bits-ui
  `Command` filters by the label; you don't pre-filter for search.
- **`getIcon` / `getColor`** — optional per-item glyph (raw inline
  SVG, same convention as `<Select>`) and its accent colour.
- **`activeKey`** — draws the leading checkmark on the current item.
- **`triggerValue` / `placeholder`** — trigger text; empty
  `triggerValue` shows the muted-italic placeholder. `triggerIcon` /
  `triggerColor` add a leading glyph to the trigger (e.g. the
  selected kind's icon — the marker link picker uses this).
- **`filters` + `bind:activeFilters` + `filterOf`** — when present,
  renders the kind/type filter-pill row (+ clear button) and narrows
  the list to `filterOf(item) ∈ activeFilters` (empty set = all).
- **`clearItem`** — a leading muted "clear" row (Nowhere / No link),
  checked when `activeKey` is falsy.
- **`actions`** — trailing "+ New …" rows after a separator (the
  separator only renders when there's something above it).
- **`trigger`** snippet — escape hatch to render custom trigger
  content; the default (glyph + value + caret) covers every current
  call site. Pass `portalTo` a parent native `<dialog>` when the
  combobox lives inside one.

Used by: the Characters / Foes / Expeditions / Connections **switchers**
(the last two add filter pills), the Connections **Within** picker
(pills + `clearItem`), the **map switcher** and **marker link picker**
in `MapDialog` / `MarkerPropertiesDialog`. Sort items yourself before
passing them — `Command` filters but does not sort.

The wrapper owns the `.cb-*` styles (single source of truth, the way
`Select.svelte` owns `.bui-select-*`). Per-call-site width tweaks ride
along via the `class` prop (e.g. `.ea-hdr-combobox`, `.cm-within-select`).

**When to use bits-ui `Combobox` (the primitive) instead** — only when
you specifically want the trigger to _be_ the input (search-as-you-type
without a separate popover input). That's a different interaction
pattern; the wrapper above is the default. If a call site needs
something the wrapper can't express, add a prop to the wrapper rather
than hand-rolling a fresh `Popover` + `Command` block.

### Dropdown menus — spread `touchSafeTrigger()` on the trigger

bits-ui's `DropdownMenu.Trigger` opens on a touch's pointerup, and also
toggles on a click whose `detail` is 0 (meant for a screen reader's click).
Some browsers follow a tap with just such a click, so the menu shuts the
moment it opens. Give every `DropdownMenu.Trigger` its own guard, which
drops the click that comes from a touch and leaves a mouse, key or screen
reader alone:

```svelte
<script>
  import { touchSafeTrigger } from '#lib/touchSafeTrigger.js';
  const touchGuard = touchSafeTrigger();
</script>

<DropdownMenu.Trigger class="…" {...touchGuard}>…</DropdownMenu.Trigger>
```

The ☰ menu (`HamburgerMenu`) and the stat-array menu (`StatAllocator`)
use it; `navigation.spec.ts` (☰ menu on a phone) checks a tap followed by
that click leaves the menu open.

### Simple dropdown fields — `<Select>` wrapper

For a plain form-field dropdown (a native `<select>` you'd
otherwise reach for), use the shared
`#lib/components/Select.svelte` wrapper — bits-ui `Select`
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
    <AlertDialog.Overlay class="dialog-overlay cm-overlay" />
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

### Progress pattern (long-running work)

Use bits-ui `Progress` for any operation the user has to wait
through — but only once the wait is real. `ImportDialog` is the
reference implementation.

```svelte
<Progress.Root
  value={progress.done}
  max={progress.total}
  class="imd-bar"
  aria-label="Import progress"
>
  <div
    class="imd-bar-fill"
    style="width: {Math.round((progress.done / progress.total) * 100)}%"
  ></div>
</Progress.Root>
```

```css
:global(.imd-bar) {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: var(--bg-inset);
  border: 1px solid var(--border);
  overflow: hidden;
}
:global(.imd-bar-fill) {
  height: 100%;
  background: var(--text-accent);
  border-radius: inherit;
  transition: width 0.18s ease-out;
}
@media (prefers-reduced-motion: reduce) {
  :global(.imd-bar-fill) {
    transition: none;
  }
}
```

`Progress.Root` renders one element and owns the ARIA
(`role="progressbar"`, the value/max attributes). You draw the
fill yourself as a child — the library ships no styling. Both
classes cross into a bits-ui component, so both need `:global`
per the class-scoping rule above.

**Hold the bar back for ~5s.** Most runs finish well inside that
and are better served by the spinner alone: a bar that appears
and vanishes reads as a glitch, and one that fills instantly
tells the user nothing they didn't already know. Past the
threshold the wait is real and they want a fraction.

The delay belongs to the _dialog_, not to whoever does the work —
it's a presentation decision, and keeping it there leaves the
progress state honest (`total` is always the true count, never
withheld to fake a hidden bar).

```ts
const BAR_DELAY_MS = 5000;
let barReady = $state(false);

// Reads `stage` and nothing else on purpose: `progress` changes on
// every unit of work, and tracking it here would restart the timer
// forever so the bar would never appear.
$effect(() => {
  if (stage !== 'importing') {
    barReady = false;
    return;
  }
  const t = setTimeout(() => (barReady = true), BAR_DELAY_MS);
  return () => clearTimeout(t);
});
```

That `$effect` dependency note is the whole trap. An effect
tracks what it _reads_, so read only the phase flag; a stray read
of the progress object turns the timer into a treadmill.

The remaining rough edge is a run that finishes just past the
threshold, which flashes the bar for a moment. Don't fix it by
holding the dialog open for a minimum display time — delaying a
completed result to protect an animation is a worse trade than
the flash.

**State shape.** One nullable object, owned by whoever does the
work:

```ts
let progress = $state<{ done: number; total: number; label: string } | null>(null);
```

- `null` — not running. Callers that drive the same code path
  headlessly (the first-run starter seed) leave it null and pay
  none of the cost below.
- `total: 0` — running, count not yet known. Pass
  `value={null}` to `Progress.Root` for the indeterminate state,
  or fall back to a spinner as `ImportDialog` does.
- `total > 0` — determinate, and shown once `barReady`.

Keep ticking the state while the bar is hidden. The counter costs
nothing, and gating the _work_ on the bar's visibility would mean
the bar arrives with nothing to show.

Reassign rather than mutate (`progress = { ...progress, done:
progress.done + 1 }`) so reactivity is unambiguous at a glance.

**Instrument one funnel, not every call site.** If the work
already routes through a single helper — `ImportDialog`'s host
runs every row through `step(label, fn)` — put the label set and
the tick there. Set the label _before_ the unit runs so it reads
as "doing this now", and increment _after_ it lands.

**Never let `done` overshoot `total`.** Derive the total from the
same list the loop walks, not from a parallel count of what you
think is in the payload. A bar that sticks at 96% or reads
"71 of 68" is worse than no bar.

#### Two traps, both about paint

**Synchronous work cannot be animated.** If a phase blocks the
main thread — `fflate.unzipSync` then `JSON.parse` over a 20 MB
archive, say — nothing repaints until it returns, so no bar can
move through it. Don't fake one. Instead:

1. Set the indeterminate state and open the dialog.
2. Hand the browser a frame _before_ the blocking call, or the
   dialog paints blank (or not at all) on a large input:
   `await new Promise((r) => requestAnimationFrame(() => r(null)));`
3. Go determinate once the blocking phase returns a count.

If a phase is both slow and blocking often enough to matter, the
fix is a Web Worker, not a smaller input cap.

**Awaiting is not the same as yielding.** A loop whose units hit
the network repaints fine — `fetch` yields a macrotask. A loop
whose units resolve synchronously (appending log entries) chains
microtasks only, and the browser never gets to paint: the bar
jumps 0 → 100 at the end. Give up a real macrotask on a time
threshold rather than every iteration, which would add ~4ms per
unit:

```ts
let lastPaint = 0;
const paint = async () => {
  const now = performance.now();
  if (now - lastPaint < 50) return;
  lastPaint = now;
  await new Promise((r) => setTimeout(r, 0));
};
```

**Disable the dismiss control while the work runs.** Cancel is
disabled at `stage === 'importing'` in `ImportDialog` — there is
no rollback, so offering an out that doesn't undo anything is a
lie. If the operation ever becomes abortable, the button becomes
a real cancel.

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

| Prefix         | Primitive                              | Example use                                                        |
| -------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `cm-*`         | `AlertDialog` (Confirm)                | `.cm-overlay`, `.cm-header`, `.cm-actions`                         |
| `cb-*`         | `<Combobox>` wrapper (Popover+Command) | `.cb-trigger`, `.cb-popover`, `.cb-search`, `.cb-item`, `.cb-pill` |
| `bui-select-*` | `<Select>` wrapper (bits-ui)           | `.bui-select-trigger`, `.bui-select-content`, `.bui-select-item`   |
| `hm-*`         | `DropdownMenu` (title-bar hamburger)   | `.hm-menu`, `.hm-item`, `.hm-sep`, `.hm-item--danger`              |
| `imd-*`        | `ImportDialog` (incl. its `Progress`)  | `.imd-bar`, `.imd-bar-fill`, `.imd-state`, `.imd-spinner`          |

New primitives get a fresh prefix keyed to their surface — pick
one that's short and searchable. Don't stack unrelated bits-ui
controls under the same prefix.
