# Iron Ledger — Dice Rolling

This document describes how dice rolling works in Iron Ledger, including the available roll types, result formats, 3D animation, and session log output.

---

## Roll Types

### Quick Rolls

Single-die rolls with no modifier. Used for raw randomness (oracle lookups, random tables, etc.).

| Button | Dice          | Session Log Title |
| ------ | ------------- | ----------------- |
| d6     | 1d6 (1–6)     | `d6`              |
| d10    | 1d10 (1–10)   | `d10`             |
| 2d10   | 2d10          | `2d10`            |
| d100   | 1d100 (1–100) | `d100`            |

**Log HTML format:**

```html
<div class="roll-line"><span class="roll-die-label">d6</span> → <strong>4</strong></div>
```

The d100 is animated as two d10s (tens digit in dark, ones digit in light by default; both colours are configurable — see "Die colours & texture" below) to match the physical dice convention.

---

### Action Roll

The core Ironsworn resolution mechanic: **1d6 + stat + adds vs 2d10**.

- **Action die** — 1d6
- **Stat** — one of the five character stats (edge, heart, iron, shadow, wits)
- **Adds** — situational bonus/penalty (−5 to +5), set manually in the dialog
- **Challenge dice** — 2d10

**Outcome:**

| Condition         | Result            |
| ----------------- | ----------------- |
| Total > both d10s | Strong Hit        |
| Total > one d10   | Weak Hit          |
| Total ≤ both d10s | Miss              |
| Both d10s equal   | + "with a match!" |

**Momentum cancellation:** If the character's momentum is negative and its absolute value equals the action die result, the action die is negated to 0 (per Ironsworn rules).

**Log HTML format (normal):**

```html
<div class="roll-line">1d6 [3] + heart[2] + adds[+1] = <strong>6</strong> vs 2d10 [7] [9]</div>
<div class="roll-outcome-weak"><strong>Weak Hit</strong></div>
```

**Log HTML format (momentum cancel):**

```html
<div class="roll-cancel">Momentum cancel! Momentum is -2, action die 2 → 0.</div>
<div class="roll-line">1d6 [<s>2</s>&thinsp;0] + heart[2] = <strong>2</strong> vs 2d10 [6] [8]</div>
<div class="roll-outcome-miss"><strong>Miss</strong></div>
```

**Log HTML format (match):**

```html
<div class="roll-outcome-strong">
  <strong>Strong Hit</strong>
  <span class="roll-match">with a match!</span>
</div>
<div class="roll-match-note">
  A positive twist: beyond the clear success, something unexpected and good happens. Envision it, or
  Ask the Oracle.
</div>
```

**Matched-dice note:** In Ironsworn a match only carries special meaning on a
**strong hit** or a **miss** — it signals a twist. `matchNoteHtml()`
(`$lib/rollMatch.ts`) appends an explanatory `.roll-match-note` line after the
outcome:

- **Strong hit + match** → a positive twist (unexpected opportunity / broader effect).
- **Miss + match** → a dangerous turn (serious complication / new threat).
- **Weak hit + match** → no note (no special rule in core Ironsworn).

The helper is shared by all four roll sites (DiceRollerDialog, MovesDialog's
action and progress rolls, and LogPanel's burn-momentum re-roll) so the text is
defined once. Unit test: `tests/unit/rollMatch.test.ts`.

**Session log title:** `Action (Heart)` (or whichever stat was chosen).

---

## CSS Classes for Roll Results

These classes are defined globally in `app.css` so they work both in the DiceRollerDialog result area and in LogPanel's `{@html entry.html}` rendering.

| Class                  | Use                               |
| ---------------------- | --------------------------------- |
| `.roll-line`           | Container for a dice formula line |
| `.roll-die-label`      | Die notation label (e.g. "d6")    |
| `.roll-cancel`         | Momentum cancellation notice      |
| `.roll-outcome-strong` | Strong Hit text (green)           |
| `.roll-outcome-weak`   | Weak Hit text (amber)             |
| `.roll-outcome-miss`   | Miss text (red)                   |
| `.roll-match`          | "with a match!" tag (accent)      |
| `.roll-match-note`     | Matched-dice twist note (muted)   |

---

## 3D Dice Animation

### Library

[`@3d-dice/dice-box-threejs`](https://www.npmjs.com/package/@3d-dice/dice-box-threejs) v0.0.12
Loaded lazily from CDN on first roll: `https://cdn.jsdelivr.net/npm/@3d-dice/dice-box-threejs@0.0.12/`

3D assets (meshes, textures) are served from the same CDN.

### Overlay

A full-screen `<div id="il-dice-overlay">` is created lazily by `dice.ts` and appended to `<body>`. It has:

```css
position: fixed;
inset: 0;
z-index: 9999;
pointer-events: none;
```

The `pointer-events: none` lets users interact with the page behind the dice.

### Die colours & texture

Dice appearance is configurable in **Settings → Dice** and skinnable per livery
(see [liveries.md](liveries.md) → "Dice"). Each of the four die roles carries its
own background colour, and all dice share one texture:

| Die       | Setting label  | Factory default        |
| --------- | -------------- | ---------------------- |
| d6        | Action die     | Blue (`#5383EC`)       |
| d10       | Challenge dice | Red (`#DD0000`)        |
| d100 tens | D100 tens die  | Near-black (`#222222`) |
| d100 ones | D100 ones die  | White (`#ffffff`)      |
| _all_     | Texture        | None (smooth)          |

Each value resolves **user override (Settings) → active livery's `dice` block →
factory default** (in `dice.ts`), so dice follow the selected livery until the
user picks their own, which then sticks across livery switches. The numeral
colour on each die is chosen automatically from the background's luminance
(`contrastText`) so a custom or light colour stays legible. The d100 tens/ones
dice pass the `DIE_BLACK` / `DIE_WHITE` singletons as role markers, which
`animateDice` remaps to the configurable tens/ones themes.

### Notation

The library uses `1d{sides}@{value}` notation to force a specific face, e.g. `1d6@3` shows a 3 on the d6. Iron Ledger always pre-calculates roll values in JavaScript and passes them to the animation engine — the animation never determines the outcome.

### Linger Time

Dice stay visible for **600 ms** (`DICE_LINGER_MS`) after they land before the overlay is hidden.

### Failure Mode

Animation failures (CDN unavailable, WebGL not supported) are caught silently. The roll value is always determined before the animation starts, so the log entry and result display are unaffected.

---

## Source Files

| File                                                  | Purpose                                                                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/dice.ts`                            | Roll engine (`rollDie`, `rollD100`, `animateDice`, `preloadDice`) + appearance getters/setters (colours, texture) |
| `apps/web/src/lib/components/DiceRollerDialog.svelte` | Modal UI — quick rolls + action roll                                                                              |
| `apps/web/src/lib/components/SettingsDialog.svelte`   | Settings → Dice: 3D toggle, sound, texture, per-die colour pickers                                                |
| `apps/web/src/lib/icons/dice-d6-solid.svg`            | Dice button icon in character sheet header                                                                        |
| `apps/web/src/app.css`                                | Global `.roll-*` CSS classes                                                                                      |

---

## Future Roll Types (not yet implemented)

These roll types exist in the old app and could be added:

- **Progress Roll** — progress track value vs 2d10 (no action die)
- **Oracle Roll** — d100 lookup against named range tables
- **Challenge Roll** — 1d6 + adds vs 2d10 (no stat, used for standalone challenges)

See `docs/data-schema.md` for information on vow progress tracks.
