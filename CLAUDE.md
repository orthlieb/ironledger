# Repo notes for Claude

## Standing order — fix all failing tests before shipping

If `pnpm lint`, `npm run format:check`, or any CI job on your target
branch is red, fix **every** failure before opening or merging a PR —
even the ones you didn't introduce. Pre-existing drift (stale count
assertions, selectors invalidated by a prior refactor, etc.) counts
as failure to fix, not context to explain away. Bundle drive-by CI
fixes into the same branch as your feature work when the diff stays
scoped; otherwise open a dedicated `fix(ci): …` branch. Reporting a
red CI and stopping is not an acceptable end state.

The one exception is a failure whose root cause is genuinely out of
scope — a broken third-party service, a flaky test that reproduces
only on CI hardware you can't inspect, an infrastructure regression.
In those cases: say so explicitly, name the failing job + line, and
ask what to do. Silence is not an option.

## Standing order — bump catalogue count tests when content changes

`apps/api/tests/unit/extensionsManifest.test.ts` is the **single** place
with hard-coded counts of catalogue content. They are deliberate drift
guards. Any time you **add or remove** a content item under
`apps/api/data/{assets,moves,oracles,foes}/` or
`extensions/*/{assets,moves,oracles,foes}/`, update the matching
assertion(s) **in the same branch** — the "CI / Test & Build" job goes
red otherwise (as it did when the "Touched, Varanine" asset took the
count 90 → 91 unbumped, staying red across four merges).

After any content-pack edit, run:

```
npx vitest run apps/api/tests/unit/extensionsManifest.test.ts
```

and update every count it flags **on purpose** — confirm the new number
is the one you intended, don't just paste what the runner reports. Map of
item → assertion(s) to bump:

| Added / removed…                                  | Bump these assertions                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| an **asset** (`assets[]`)                         | merged `assets` total (`reproduces the expected merged catalogue counts`)                                                                                                                                                                                     |
| an asset **rarity** (`rarities[]`)                | merged `rarities` total                                                                                                                                                                                                                                       |
| a **move** (`moves[]`)                            | merged `moves` total                                                                                                                                                                                                                                          |
| an **oracle** file (one with a `key`)             | merged `oracles` total **+** the owning source's row in `per-extension keyed oracle counts (drift guard)` **+** every row of the `base + delve=… yrt=… lodestar=…` visible-oracle `it.each` table where that source is enabled (base is always on → all rows) |
| a **foe** (`foes[]`)                              | merged `foes` total                                                                                                                                                                                                                                           |
| a **foe-override** file                           | `foeOverrides` total                                                                                                                                                                                                                                          |
| a **move-override** file                          | `moveOverrides` total (and, if it hides a base move, the visible-oracle table is unaffected but re-check the move total)                                                                                                                                      |
| a **delve table** file                            | `delve` (delveTables) total                                                                                                                                                                                                                                   |
| a `suppressesOracles` / `supersedesOracles` entry | the visible-oracle `it.each` table (net hides change) and, when a specific key flips, `suppression hides/supplants the expected keys`                                                                                                                         |

Notes:

- `oracle-order.json` carries no `key`, so it's excluded from oracle counts.
- The **sample** extension is dev-only and stripped from `core`; its items
  do **not** count toward any of these totals.
- Keep the explanatory `//` comment above each count in sync (it records
  the per-source breakdown) so the next person's bump is auditable.

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

Dialogs are all bits-ui `Dialog` / `AlertDialog` now (see "Prefer
bits-ui primitives over native controls" below). `Dialog.Content`
sets `preventScroll: true` by default, which locks body scroll for
the lifetime of the modal — no per-route `<main>` lock needed.
`Dialog.Content` in bits-ui is a plain `position: fixed` div, not
top-layer, so a dialog gesture can't reach the page behind it
unless something inside the dialog is itself scrollable and the
scroll chain escapes — put `overscroll-behavior: contain` on any
scrollable child inside a dialog to catch that.

Don't reintroduce `body { min-height: 100dvh }` without also restoring the
overflow:hidden; the body must always equal viewport size or shorter.

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
  `.cm-header` + `AlertDialog.Title` bar is the header. Draggable is
  opt-in via the `draggable` prop (off by default; when on, the header
  is the handle and shows the standard `⠿` grip). The form-style
  dialogs — New Character / Settlement / NPC / Place / Journey / Site
  and Change Theme / Domain — pass `draggable`; transient confirmations
  (delete, discard, etc.) leave it off.
- **FoePickerDialog** confirm view (`fd-back-bar`) — nature-coloured band.
- **AssetCard** — inline-capable host, not a plain dialog header.

### Checklist when adding a new dialog header

- [ ] Use `<DialogHeader title={…} onclose={close} />` — don't reimplement
      the grip/title/close markup or CSS.
- [ ] Apply `headingText()` to static title labels yourself.
- [ ] Pass `radius="8px 8px 0 0"` if the dialog's `border-radius` is 8px.
- [ ] One `<DialogHeader>` per view in two-view dialogs; use `detail` on
      the detail view.

## Dialog dismiss button label — Cancel vs Close

A footer dismiss button reads **Cancel** iff the dialog holds a draft
that a paired primary button will commit — New\* / edit forms,
`ConfirmDialog`, harm/stress-apply panels, `FoeRollDialog`'s post-roll
"Add to Foes" view, `FoePickerDialog`, `MarkerPropertiesDialog`. Clicking
Cancel discards those pending changes.

It reads **Close** when the dialog either (a) has no draft to discard, or
(b) has a primary action button whose click stands alone as the commit —
roll / ask / send dialogs (`OraclesDialog` detail view, `MovesDialog`
roll views, `PreludeTableDialog`, `FoeRollDialog` initial roll view,
`DiceRollerDialog`). The roll button IS the commit; Close doesn't undo
anything — it just dismisses.

Reference and menu dialogs use the header ✕ only, no footer button
(`CommandHelpDialog`, `SettingsDialog`, `DenizenDialog`, all
`*OptionsDialog`).

The header ✕ (rendered by `<DialogHeader onclose>`) is always labeled
`"Close"` as its aria-label — the label names the mechanic (dismiss the
dialog), not the semantic. In a draft dialog the ✕ behaves like Cancel;
in a Close-dialog it behaves like Close. That's the universal convention
and doesn't need per-dialog customization.

## Icon SVGs — normalize before checking in

Every SVG under `apps/web/src/lib/icons/` and `extensions/*/icons/` is
inlined via `?raw` and rendered inside a container whose CSS applies
`fill: currentColor`. The consumer picks the tint — the icon must not
hard-code one. Icons downloaded from game-icons.net, Font Awesome
exports from Fontello / IcoMoon, and Adobe Illustrator "Save As SVG"
output all ship with wrappers that break this.

**Required shape for a new icon:**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H"><!--source "name" by author — LICENSE-->
  <path fill="currentColor" d="…"/>
</svg>
```

- Only `xmlns` + `viewBox` on the root `<svg>`. No `width`, `height`,
  `style="height:…"`, `enable-background`, `xmlns:xlink`, `x`, `y`,
  `version`, or `xml:space`.
- Every fill-carrying `<path>` uses `fill="currentColor"` (never
  `fill="#000"`, `fill="black"`, or `fill-opacity`).
- No full-canvas background rect like `<path d="M0 0h512v512H0z"
fill="#fff"/>`. If the source ships one, delete it.
- No wrapping `<g class="" transform="translate(0,0)" style="">` — flatten
  it. Only keep a `<g>` when it carries a real transform.
- No embedded `<style>…</style>` blocks (`.st0{fill:none;}` style classes
  from Illustrator). Inline any real `fill:none` onto the path.
- Attribution comment right after the opening tag so provenance survives
  minification. game-icons.net icons are CC BY 3.0; credit the artist.

**Checklist before adding a new icon file:**

- [ ] Root is just `<svg xmlns="…" viewBox="0 0 W H">`.
- [ ] Every `<path>` uses `fill="currentColor"` (or has no fill attr, so
      CSS wins).
- [ ] No `<rect>` / `<path>` covering the whole canvas as a background.
- [ ] No inline `style`, `enable-background`, or embedded `<style>` block.
- [ ] Attribution comment present.

Add the raw asset to `docs/icons/raw/<slug>.svg` (or paste it into the
PR body) if you'd like the source preserved for future re-normalization —
the checked-in file is the cleaned version, not the vendor export.

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

## Prefer bits-ui primitives over native controls

For any new UI that needs a select, combobox, popover, dropdown menu,
tooltip host, dialog, alert dialog, tabs, accordion, or other overlay/
picker primitive, **use bits-ui** (or the shared wrapper the app has
already built on top of it) — not the native HTML control. Uniform
chrome across desktop and mobile is worth more than the native picker;
the app has a full house-style visual system on bits-ui and every new
native control drifts from it.

Concretely:

- `<select>` → `<Select>` (`$lib/components/Select.svelte` — bits-ui
  `Select` inside). See `docs/ui-components.md` → "Simple dropdown
  fields — `<Select>` wrapper".
- Searchable pickers → bits-ui `Popover + Command` (the shadcn shape;
  `.mp-combobox` trigger + `.mp-cmd-*` popover body). See
  `docs/ui-components.md` → "Combobox pattern".
- Confirmations → bits-ui `AlertDialog` via `<ConfirmDialog>`; other
  modals → bits-ui `Dialog`. Don't hand-roll a `<dialog>` for new
  work.
- Hover hints → `use:tooltip` (see the section above), not native
  `title=`.
- Toolbar dropdowns / kebab menus → bits-ui `DropdownMenu`.
- Native `<input type="color">` / `<input type="date">` etc. — reach
  for the shared widget the app already uses (`Pickr` for colour;
  ask before introducing a new one).

Native controls remain fine for plain form fields with no picker
UI attached: `<input type="text|number|checkbox|radio|range>`,
`<textarea>`, and `<button>`. When in doubt, look for an existing
bits-ui-based component or wrapper first; if none exists and the
control is worth sharing, build a small wrapper in
`$lib/components/` (see `Select.svelte` as the template — one
`:global(.foo-*)` block, a docstring in prose without embedded
`<TagName>` syntax so Svelte's script tokenizer doesn't choke).

Explicit **exceptions**, where a native control stays: a `<select>`
whose whole job is a native-first mobile experience (a full-screen
picker wheel on iOS the custom popover can't match) — flag the
choice in a comment above the element so a later refactor knows to
skip it.

## Dialog focus rule

When any modal dialog opens, the caret must land somewhere the
user can immediately act — never on the header ✕ close button
(which is what bits-ui defaults to, since ✕ is the first
tabbable descendant).

Order of preference:

1. **Search field** — if the dialog has a search / filter input
   as its primary purpose (MovesDialog, OraclesDialog,
   FoePickerDialog, AssetPicker, MapDialog's icon picker),
   focus that input on open. Users are opening the dialog to
   find something.
2. **Primary composer field** — if the dialog's whole point is
   composing text (NotesDialog textarea, BugReportDialog form,
   StoryDialog prompt), focus the first meaningful text control.
3. **Primary default button** — otherwise focus the affirmative
   / go button (Roll, Start, Save, Confirm). The one the user is
   probably about to press.
4. **Fallback** — genuinely no primary target (a pure settings
   sheet, a static reference dialog like CommandHelpDialog):
   let bits-ui do its default. Don't force focus onto ✕.

For bits-ui `Dialog.Content` / `AlertDialog.Content`, wire it
through `onOpenAutoFocus`:

```svelte
<Dialog.Content
  onOpenAutoFocus={(e) => {
    e.preventDefault();
    // setTimeout(0) so bits-ui finishes its own focus routine +
    // any conditional-mount subtree paints before we grab focus.
    setTimeout(() => targetEl?.focus(), 0);
  }}
>
```

For still-native `<dialog>` elements (until they migrate to
bits-ui), use HTML `autofocus` on the target input. It fires on
first mount only, so if the dialog persists across opens (like
MapDialog's icon picker), also bind a ref and call `.focus()`
inside the `showModal()` call site.
