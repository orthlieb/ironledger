# Mobile Support

Iron Ledger's layout is responsive down to ~360px wide. This doc describes the
mobile-specific behaviours that differ meaningfully from the desktop layout.
Pure visual tweaks (padding, font-size, wrap order) are not listed here — see
the individual component files for those.

The primary layout breakpoint is **`max-width: 900px`** (i.e. `< 900px`): below
it, `/home` collapses its three-column desktop grid into a single-column,
tab-switched layout. A second, smaller breakpoint at **`max-width: 767px`**
governs the log's AI-story UI (see [AI Story Selection](#ai-story-selection--desktop-only)).
These two numbers are deliberately different — 900px is where the desktop
_layout_ stops fitting; 767px is where the log's per-entry hover affordances
stop being usable on touch.

---

## Home Layout

Implemented in `apps/web/src/routes/home/+page.svelte`.

**Desktop (> 900px)** is a three-column grid: Characters over Foes in column 1,
Expeditions over Connections in column 2, and the session log as a persistent
column 3.

```
┌────────────────┬────────────────┬──────────┐
│   Characters   │   Expeditions  │          │
├────────────────┼────────────────┤   Log    │
│     Foes       │  Connections   │          │
└────────────────┴────────────────┴──────────┘
```

**Mobile (≤ 900px)** rotates to a single flex column: a tab bar, the active
area, a drag handle, and the log pinned at the bottom.

```
┌─────────────────────────────┐
│ [Chars][Foes][Exp][Comm]    │  ← tab bar (.mob-tabbar)
├─────────────────────────────┤
│   active area (scrollable)  │
├─────────────────────────────┤
│   ─── drag handle ────────  │  ← .mob-resize-handle
├─────────────────────────────┤
│   log (scrollable)          │
└─────────────────────────────┘
```

Key points:

- **Four tabs**, tap-to-switch (`.mob-tab`): Characters, Foes, Expeditions,
  Connections. The Connections tab's internal id is `communities`
  (`MobileTab = 'characters' | 'foes' | 'expeditions' | 'communities'`). Each
  tab shows a stacked icon + a small uppercase label; there is no icons-only
  breakpoint — all four labels always render.
- **No swipe-to-switch.** Tabs change only on tap. All four areas stay mounted
  in the DOM at all times (the desktop grid cells); on mobile the inactive ones
  are hidden with `class:mob-hidden` → `display: none`. Because they never
  unmount, switching tabs is instant and each area keeps its scroll position
  and local state. (The only `touchstart` handlers on this page are the
  pane-resize handles, not tab gestures.)
- **The log is persistent, not tab-bound** — there is no separate Log tab. On
  desktop it is the right-hand column; on mobile it is the bottom panel, always
  visible beneath whichever tab is active.

### Resize handles + persistence

Every split is drag-resizable (mouse **and** touch) and its size is persisted
to `localStorage`:

| Split                      | Handle                | Range                        | Default                       | Key                    |
| -------------------------- | --------------------- | ---------------------------- | ----------------------------- | ---------------------- |
| Desktop log width          | `.home-resize-handle` | 240 – 800 px                 | ⅓ of `innerWidth`             | `il:home:logWidth`     |
| Desktop column 1 width     | `.col-resize-handle`  | ≥ 200 px each side           | half the available width      | `il:home:col1Width`    |
| Desktop row split (shared) | `.row-resize-handle`  | ≥ 80 px each area            | half the column height        | `il:home:rowHeight`    |
| Mobile log height          | `.mob-resize-handle`  | 80 px → 70% of `innerHeight` | 25% of `innerHeight` (`25vh`) | `il:home:mobLogHeight` |

The row split is a **single shared value** so the Characters/Foes divider stays
aligned with the Expeditions/Connections divider. Older exports used separate
`il:home:charHeight` / `il:home:expedHeight` keys; onMount reads whichever is
present as a fallback so a returning user doesn't get a fresh 50/50 split.

The mobile log handle drags up to grow the log (`delta = startY - y`). The
desktop resize handles are `display: none` on mobile and vice-versa.

---

## Picker Dialogs

`FoePickerDialog`, `MovesDialog`, and `OraclesDialog` are flex columns (title
row, search/filter row, scrollable body). On desktop the natural `fit-content`
sizing works fine; on mobile browsers it does not — `fit-content` +
`max-height` leaves the `flex: 1` body with no extrinsic height to grow into,
and the dialog collapses to ~200px showing only the title and search.

Fix: a **definite** height, clamped against the viewport.

```css
/* FoePickerDialog.svelte */
width: min(640px, calc(100vw - 1rem));
height: min(85vh, 720px);

/* MovesDialog.svelte + OraclesDialog.svelte */
width: min(640px, calc(100vw - 1rem));
height: min(84vh, 720px);
```

The `min(…, 720px)` cap keeps the dialog from becoming absurdly tall on a large
phone in landscape while still filling a small portrait screen. Body scroll is
locked while any picker dialog is open (bits-ui `Dialog` sets
`preventScroll: true`), so touch-drag on the backdrop doesn't scroll the page
behind it.

---

## AI Story Selection — Desktop Only

The story-selection surface in the log — the per-entry ▲ / ▼ marker buttons
(`.entry-marker-btn`), the toolbar Generate/Story button (`.story-btn`), and
the floating strip at the bottom (`.section-strip`) — is hidden below
**`max-width: 767px`** (`display: none !important`, `LogPanel.svelte`). The
rationale:

- The ▲ / ▼ buttons are hover-revealed (opacity 0 → 1 on `.log-entry:hover`),
  which is fine on desktop but produces phantom targets on touch — either you
  can't see them, or they leak into the tap area of another entry.
- On mobile the log defaults to ~25% of the viewport (see
  [Home Layout](#home-layout)); the toolbar button and floating strip would
  each steal a whole row of that budget.
- AI story generation is a between-session write-up feature, not something you
  reach for mid-scene from a phone.

The `sectionStore` state is not gated — a section pinned from desktop stays
highlighted (read-only) if the user opens the phone later. See
[log.md § Story sections](log.md#story-sections-----markers) and
[ai-story.md](ai-story.md) for the full flow.

---

## Tooltips

Native `title` tooltips behave unpredictably on touch devices — some browsers
swallow them entirely, others fire them on long-press but leave them stuck on
the next tap. The project's canonical mechanism is the **`use:tooltip` action**
(`apps/web/src/lib/actions/tooltip.ts`), which promotes the tip into the top
layer via the Popover API so it works above dialogs and inside scrollable
containers (like the GCB) without being clipped, and auto-shows on tap for
touch. See [ui-components.md § Tooltips](ui-components.md#tooltips) and the
CLAUDE.md note — new UI should always use this action, not native `title=`.

A legacy CSS `[data-tooltip]` mechanism still survives in
`apps/web/src/app.css` (revealed on `:hover` / `:focus-visible`) and is still
used by `SettingsDialog.svelte`. On touch it appears on tap-and-hold
(`:focus-visible`), the closest practical equivalent to hover. New code should
prefer `use:tooltip`; treat `data-tooltip` as not-yet-migrated rather than a
pattern to copy.

---

## Testing Mobile Changes

- **Playwright e2e:** `apps/web/tests/e2e/navigation.spec.ts` covers the
  click-based home tab bar — that the `.mob-tabbar` appears at ≤ 900px (tested
  at an 800 × 900 viewport), that Characters is the default active tab, that
  tapping the Foes `.mob-tab` switches the visible area, and that the tab bar is
  hidden on desktop (1280px). There is **no** swipe coverage — swipe-to-switch
  was removed. `tabs.spec.ts` covers the per-area card tabs
  (Characters/Communities/Expeditions/Foes), which are unrelated to home nav.
  The mobile log-height drag has no automated coverage — verify it manually.
- **Manual:** Chrome DevTools device emulation at **390 × 844** (iPhone 14) is
  the primary target. Cross the 900px line to confirm the grid ↔ tab-bar swap,
  and drag the mobile log handle to confirm the 80px / 70%-of-viewport clamps.
- When touching layout or resize code, re-test both orientations — portrait and
  landscape — because the mobile log-height clamp is a fraction of
  `window.innerHeight` and reflows on rotation.
