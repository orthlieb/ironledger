# Repo notes for Claude

## App-level scroll architecture

The viewport itself (`html` and `body`) **never** scrolls. `app.css` sets
both to `height: 100dvh; overflow: hidden;` permanently, and makes `body`
a flex column. `<main class="app-main">` is the per-route scroll container
(`flex: 1; min-height: 0; overflow-y: auto;`):

- Pages with their own internal scroll regions (e.g. `/home`'s `.home-shell`)
  set their root to `height: 100%; overflow: hidden;` so `main` doesn't need
  to scroll — only the inner area stages do.
- Pages with natural-flow content (e.g. `/about`, `/admin`) just let `main`
  scroll their content.

When any `<dialog>` is open, `app.css` also locks `main` (`body:has(dialog[open])
main.app-main { overflow: hidden }`). Combined with `dialog[open] {
overscroll-behavior: contain }` (see Rule 4 below), this means a scroll
gesture inside a dialog can never reach **any** ancestor scroll container —
viewport, main, or inner area stage.

Don't reintroduce `body { min-height: 100dvh }` without also restoring the
overflow:hidden; the body must always equal viewport size or shorter.

## `<dialog>` mobile rules (iOS Safari)

`<dialog>` elements live in the browser's top layer, which exposes three
collapsing footguns on iOS Safari. Any new dialog must avoid all three —
PR #11, #12, #13, and the dialog fixes on the `claude/fix-asset-cards-mobile-*`
branch all chased the same bug class.

### 1. Never use `dvh` on a `<dialog>`

iOS Safari reports `dvh` as `0` for top-layer dialogs, so `min(85dvh, 720px)`
collapses to `0`. Use `vh` for any dialog height, `top:`, or `max-height:`.

### 2. Never centre a `<dialog>` with `inset: 0; margin: auto`

Combined with an open-state `display: flex` container it renders as a thin
horizontal line on iOS Safari. Centre with:

```css
position: fixed;
top: 50%;
left: 50%;
margin: 0;
transform: translate(-50%, -50%);
```

### 3. Don't chain `display: flex` + `flex: 1; min-height: 0;` on a dialog

whose only sizing constraint is `max-height:`
With no explicit `height`, the flex algorithm collapses the body to zero on
iOS Safari. Two safe patterns:

**A. Fixed-size dialog.** Give the dialog an explicit `height: min(Xvh, Ypx)`.
The flex chain then has a real size to fill. Most multi-section dialogs in
this repo use this (MovesDialog, OraclesDialog, DenizenDialog, FoePickerDialog,
AssetPicker's `.picker-dialog`).

**B. Content-sized dialog.** Drop `display: flex` from the dialog entirely
and put the scroll constraint directly on the body:

```css
.dialog {
  max-height: 82vh;
  overflow: hidden;
}
.dialog-body {
  max-height: calc(82vh - 6rem);
  overflow-y: auto;
}
```

The `- 6rem` accounts for header + footer (~3rem each). This is what
`.ca-asset-dialog` (CharactersArea) and `.confirm-dialog` (AssetPicker) use.

### 4. Always lock background scroll while a dialog is open

Native `<dialog>.showModal()` blocks pointer events on the page behind the
backdrop but does **not** stop touch-scroll on iOS Safari — a drag inside the
dialog's chrome or at a scroll boundary can bleed through. Three layers of
defence work together:

**Viewport (permanent, in `apps/web/src/app.css`):**

```css
html,
body {
  height: 100dvh;
  overflow: hidden;
}
```

See the "App-level scroll architecture" section above — the viewport never
scrolls, so the dialog never has the document itself behind it to leak into.

**Route scroll container (locked when a dialog is open):**

```css
body:has(dialog[open]) main.app-main {
  overflow: hidden;
}
```

`<main>` is the per-route scroll container; this freezes it while a dialog
is up so dialog gestures can't reach it on routes that have overflowing
content.

**Dialog-level (also in `apps/web/src/app.css`):**

```css
dialog[open] {
  overscroll-behavior: contain;
}
```

This catches scroll chains regardless of where the gesture starts — wheel/
touch on a dialog's header, footer, or short non-scrolling content stops at
the dialog boundary instead of reaching inner scroll containers in the page
below (`.fa-stage`, `.ca-stage`, etc.).

**Per-dialog body:** every scrollable child inside a dialog should also set
`overscroll-behavior: contain` alongside its `overflow-y: auto`:

```css
.dialog-body {
  overflow-y: auto;
  overscroll-behavior: contain;
}
```

This is the innermost layer — it stops rubber-band at the body's own
scroll boundaries on iOS Safari.

The e2e test at `apps/web/tests/e2e/picker-scroll-lock.spec.ts` checks both
mechanisms on the foe picker — keep that test passing.

### Checklist when adding a new `<dialog>`

- [ ] No `dvh` anywhere on the dialog or its descendants.
- [ ] Centring uses `top/left + transform`, not `inset: 0; margin: auto`.
- [ ] Either an explicit `height:`, **or** no `display: flex` on the dialog
      and `max-height` lives on the scrollable child.
- [ ] Every `overflow-y: auto` child inside the dialog also sets
      `overscroll-behavior: contain` (defence in depth; the global
      `dialog[open]` rule is the primary catch).
- [ ] Smoke-test on a real iOS Safari (or DevTools iPhone emulation) before
      claiming the dialog works on mobile.

## Standard dialog title bar style

All draggable dialogs share the same header (grip ⠿ → title → optional
close ✕). **Use the `<DialogHeader>` component**
(`$lib/components/DialogHeader.svelte`) — do not hand-roll the markup/CSS
again. It is the single source of truth for the pattern; `use:draggable`
lives inside it.

```svelte
<script>
  import DialogHeader from '$lib/components/DialogHeader.svelte';
  import { headingText } from '$lib/fontStore.svelte.js';
</script>

<!-- standard: grip + title + ✕ close -->
<DialogHeader title={headingText('Dialog Title')} onclose={close} />

<!-- two-view detail: smaller, ellipsized dynamic title (no close) -->
<DialogHeader title={selectedThing.name} detail />

<!-- match an 8px-radius dialog -->
<DialogHeader title={headingText('…')} onclose={close} radius="8px 8px 0 0" />

<!-- custom trailing content instead of a close button (e.g. a badge) -->
<DialogHeader title={selectedMove.name} detail>
  {#snippet trailing()}
    <span class="md-category-badge">{selectedMove.category}</span>
  {/snippet}
</DialogHeader>
```

**Props:** `title` (string — apply `headingText()` yourself for static
labels), `onclose?` (renders the standard ✕; ignored when `trailing` is
given), `detail?` (smaller ellipsized title for detail views), `radius?`
(top corners, default `10px 10px 0 0`), `trailing?` (snippet rendered
after the title). The `.drag-grip` braille glyph is global in `app.css`.

**Two-view dialogs** (list → detail, e.g. OraclesDialog, MovesDialog,
DenizenDialog) render one `<DialogHeader>` per view so the dialog stays
draggable in both.

**Documented exceptions** (do NOT route through `<DialogHeader>`):

- **ConfirmDialog** — bits-ui `AlertDialog`; its own accent-tinted
  `.cm-header` + `AlertDialog.Title` bar is the header, no grip. Not
  draggable (the pre-migration bespoke drag was retired).
- **FoePickerDialog** confirm view (`fd-back-bar`) — nature-coloured band.
- **AssetCard** — inline-capable host, not a plain dialog header.

### Checklist when adding a new dialog header

- [ ] Use `<DialogHeader title={…} onclose={close} />` — don't reimplement
      the grip/title/close markup or CSS.
- [ ] Apply `headingText()` to static title labels yourself.
- [ ] Pass `radius="8px 8px 0 0"` if the dialog's `border-radius` is 8px.
- [ ] One `<DialogHeader>` per view in two-view dialogs; use `detail` on
      the detail view.

## Tooltips — use `use:tooltip`, not the native `title=` attribute

For every visible hover hint on HTML elements, use the `tooltip` action
from `$lib/actions/tooltip.js`:

```svelte
<script>
  import { tooltip } from '$lib/actions/tooltip.js';
</script>

<button use:tooltip={'Save changes'} aria-label="Save">{@html saveIcon}</button>
<button use:tooltip={isOn ? 'Hide' : 'Show'}>…</button>
```

**Don't** use the native HTML `title=` attribute for hover hints. It:

- Is clipped by `overflow: hidden/auto` ancestors (common inside `<dialog>`s).
- Renders OS-styled chrome that doesn't match the rest of the UI.
- Doesn't show on touch devices.

`use:tooltip` uses the browser's Popover API to promote the tip into the top
layer, so it works correctly above dialogs and other floating UI without DOM
walking. It also auto-shows on tap and dismisses after 2.5 s on mobile.

**Exceptions** (where `title=` is fine — these are NOT HTML `title`
attributes):

- The `title` _prop_ on `<ConfirmDialog title="...">` and the new-thing
  dialogs (NewCommunity, NewNPC, NewJourney, NewSite, ChangeTheme,
  ChangeDomain). These set the dialog's heading text, unrelated to hover.
- The HTML `<title>` element in the document `<head>`.

**Accessibility**: if you're converting a `title=` on an icon-only button
to `use:tooltip`, add `aria-label="..."` with the same text. The native
`title` attribute doubles as the accessible name for icon buttons; the
action does not.
