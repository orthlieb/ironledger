# Mobile Support

Iron Ledger's layout is responsive down to ~360px wide. This doc describes the mobile-specific behaviours that differ meaningfully from the desktop layout. Pure visual tweaks (padding, font-size, wrap order) are not listed here — see the individual component files for those.

The canonical mobile breakpoint is **`max-width: 767px`** (i.e. `< 768px`). A secondary breakpoint at **`max-width: 540px`** collapses the tab bar to icons-only (except for the active tab). The 540px cutoff was chosen to cover the inner width of a Surface Duo in portrait.

---

## Swipe-to-Switch-Tab

Implemented in `apps/web/src/routes/home/+page.svelte` (`handleTabBodyTouchStart` / `handleTabBodyTouchEnd`).

A horizontal swipe on the tab body advances or retreats one tab. Swipes clamp at each end — there is no wrap-around.

| Parameter | Value |
|---|---|
| Minimum horizontal distance | 60 px |
| Direction ratio (\|dx\| / \|dy\|) | > 1.5 |
| Maximum gesture duration | 600 ms |
| Multi-finger gestures | Ignored |

Admin users swipe through `[characters, foes, expeditions, adventure, communities, log, admin]`. Non-admins don't see `admin` in the order, so a swipe can never land there.

### Opting out

Any descendant that needs its own horizontal touch handling (e.g. a carousel, a draggable pill, a swipeable list item) can mark itself with `data-no-swipe-tabs`:

```svelte
<div class="my-carousel" data-no-swipe-tabs>…</div>
```

`touchstart` walks the ancestor chain of the target; if any ancestor has the attribute, the swipe is ignored for that gesture.

---

## Adventure Split Panel

On desktop the Adventure tab is a side-by-side layout: GlobalContextBar on the left, session log on the right, draggable column resize. On mobile that same layout would be unusable — the GCB tiles need ~320px to read and the log would be a sliver.

Below 768px the layout rotates: **GCB on top, log below, drag-to-resize horizontally**. Implementation is in `apps/web/src/routes/home/+page.svelte`.

- Default split: GCB 80% / log 20% of the available height
- Drag range: 20% → 95%
- Persistence: `localStorage['il:adventure:split:mobile']` (desktop uses a separate key, `ironledger.adventureSplit`)
- Height: measured via `rAF` after mount and on resize, as `window.innerHeight - layoutRef.top`. Measurement is wrapped in `requestAnimationFrame` so it runs after orientation-change layout settles.
- Body scroll: `document.body.style.overflow = 'hidden'` while this tab is active on mobile, so neither panel causes the page to scroll — each panel scrolls independently.
- Resize handle: shared CSS base class, only `cursor` (`row-resize` on mobile, `col-resize` on desktop) and the `::before` / `::after` content rules differ per breakpoint.

---

## Session Log Placement

See [log.md](log.md#layout) for the canonical table.

| Viewport | Log position |
|---|---|
| ≥ 768 px | Always-visible sticky right column |
| < 768 px | Hidden by default; revealed as a 4th tab ("Log") in the tab bar |

The mobile log tab and the Adventure-tab split panel are two different views of the same `LogPanel.svelte` — one gets the full viewport, the other gets 20–80% of it. The log store is a single module-level `$state` so entries appear in both without coordination.

---

## Picker Dialogs

`FoePickerDialog`, `MovesDialog`, and `OraclesDialog` are flex columns (title row, search/filter row, scrollable body). On desktop the natural `fit-content` sizing works fine; on mobile browsers it does not — `fit-content` + `max-height: 80vh` leaves the `flex: 1` body with no extrinsic height to grow into, and the dialog collapses to ~200px showing only the title and search.

Fix: definite height using dynamic viewport units.

```css
height: min(85dvh, 720px);   /* FoePickerDialog, OraclesDialog */
height: min(84dvh, 720px);   /* MovesDialog */
width:  min(calc(100vw - 1rem), …);
```

`dvh` (dynamic viewport height) accounts for mobile browser chrome showing and hiding. `vh` would over-size the dialog when the URL bar is visible.

Body scroll is locked while any picker dialog is open, so touch-drag on the backdrop doesn't scroll the underlying page.

---

## Collapsible Search Pill (Expeditions, Communities)

On desktop, search is always visible as a frosted-glass pill in the toolbar. On mobile the toolbar is too narrow to host both the search input and the action buttons, so search collapses:

- Initial state: a single magnifying-glass icon button in the toolbar
- Tapped: expands to a full-width frosted-glass pill (backdrop-filter blur + saturate, top-edge inset highlight), auto-focused
- Action buttons hide while the pill is open
- X button clears the query and collapses the pill
- Tab change resets the pill state

---

## Icon-Only Tabs (≤ 540 px)

On Surface-Duo-class screens (540 px inner width in portrait), labels don't fit alongside every tab icon plus the admin badge. Below 540px the tab bar hides labels for inactive tabs and shows only the icon; the active tab keeps its label for orientation.

```css
@media (max-width: 540px) {
    .tab-label { display: none; }
    .tab-btn { padding: 10px 12px 8px; gap: 0; }
    .tab-btn.active { gap: 0.35rem; }
    .tab-btn.active .tab-label { display: inline; }
}
```

---

## Tooltips

Native `title` tooltips behave unpredictably on touch devices — some browsers swallow them entirely, others fire them on long-press but leave them stuck on the next tap. The project uses CSS `data-tooltip` tooltips everywhere (see [ui-components.md § Tooltips](ui-components.md#tooltips)), and for pills inside scrollable containers (like the GCB) the `use:tooltip` action, which renders a body-level fixed-position element so it's never clipped.

On mobile these CSS tooltips appear briefly on `:focus-visible` (tap-and-hold), which is the closest practical equivalent to hover on a touch device. Move-dialog footers surface the same information inline so that no mobile user has to rely on tooltips to complete a roll.

---

## Testing Mobile Changes

- Playwright e2e: `apps/web/tests/e2e/navigation.spec.ts` covers the swipe-tab behaviour (swipe-left, swipe-right, both end-clamps, vertical drag, tap).
- Manual: Chrome DevTools device emulation at **390 × 844** (iPhone 14) is the primary target. Also verify Surface Duo (540 × 720 single-screen) to catch tab-label overflow.
- When touching split-panel or swipe code, re-test both orientations — portrait and landscape — because the mobile height measurement depends on `window.innerHeight` and reflows on rotation.
