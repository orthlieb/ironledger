# Repo notes for Claude

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
.dialog        { max-height: 82vh; overflow: hidden; }
.dialog-body   { max-height: calc(82vh - 6rem); overflow-y: auto; }
```
The `- 6rem` accounts for header + footer (~3rem each). This is what
`.ca-asset-dialog` (CharactersArea) and `.confirm-dialog` (AssetPicker) use.

### Checklist when adding a new `<dialog>`
- [ ] No `dvh` anywhere on the dialog or its descendants.
- [ ] Centring uses `top/left + transform`, not `inset: 0; margin: auto`.
- [ ] Either an explicit `height:`, **or** no `display: flex` on the dialog
      and `max-height` lives on the scrollable child.
- [ ] Smoke-test on a real iOS Safari (or DevTools iPhone emulation) before
      claiming the dialog works on mobile.
