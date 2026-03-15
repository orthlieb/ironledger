# Iron Ledger — Dice Rolling

This document describes how dice rolling works in Iron Ledger, including the available roll types, result formats, 3D animation, and session log output.

---

## Roll Types

### Quick Rolls

Single-die rolls with no modifier. Used for raw randomness (oracle lookups, random tables, etc.).

| Button | Dice        | Session Log Title |
|--------|-------------|-------------------|
| d6     | 1d6 (1–6)   | `d6`              |
| d10    | 1d10 (1–10) | `d10`             |
| 2d10   | 2d10        | `2d10`            |
| d100   | 1d100 (1–100) | `d100`          |

**Log HTML format:**
```html
<div class="roll-line">
  <span class="roll-die-label">d6</span> → <strong>4</strong>
</div>
```

The d100 is animated as two d10s (tens digit in dark, ones digit in light) to match the physical dice convention.

---

### Action Roll

The core Ironsworn resolution mechanic: **1d6 + stat + adds  vs  2d10**.

- **Action die** — 1d6
- **Stat** — one of the five character stats (edge, heart, iron, shadow, wits)
- **Adds** — situational bonus/penalty (−5 to +5), set manually in the dialog
- **Challenge dice** — 2d10

**Outcome:**

| Condition           | Result      |
|---------------------|-------------|
| Total > both d10s   | Strong Hit  |
| Total > one d10     | Weak Hit    |
| Total ≤ both d10s   | Miss        |
| Both d10s equal     | + "with a match!" |

**Momentum cancellation:** If the character's momentum is negative and its absolute value equals the action die result, the action die is negated to 0 (per Ironsworn rules).

**Log HTML format (normal):**
```html
<div class="roll-line">
  1d6 [3] + heart[2] + adds[+1] = <strong>6</strong> vs 2d10 [7] [9]
</div>
<div class="roll-outcome-weak"><strong>Weak Hit</strong></div>
```

**Log HTML format (momentum cancel):**
```html
<div class="roll-cancel">
  Momentum cancel! Momentum is -2, action die 2 → 0.
</div>
<div class="roll-line">
  1d6 [<s>2</s>&thinsp;0] + heart[2] = <strong>2</strong> vs 2d10 [6] [8]
</div>
<div class="roll-outcome-miss"><strong>Miss</strong></div>
```

**Log HTML format (match):**
```html
<div class="roll-outcome-strong">
  <strong>Strong Hit</strong>
  <span class="roll-match">with a match!</span>
</div>
```

**Session log title:** `Action (Heart)` (or whichever stat was chosen).

---

## CSS Classes for Roll Results

These classes are defined globally in `app.css` so they work both in the DiceRollerDialog result area and in LogPanel's `{@html entry.html}` rendering.

| Class                  | Use                                    |
|------------------------|----------------------------------------|
| `.roll-line`           | Container for a dice formula line      |
| `.roll-die-label`      | Die notation label (e.g. "d6")         |
| `.roll-cancel`         | Momentum cancellation notice           |
| `.roll-outcome-strong` | Strong Hit text (green)                |
| `.roll-outcome-weak`   | Weak Hit text (amber)                  |
| `.roll-outcome-miss`   | Miss text (red)                        |
| `.roll-match`          | "with a match!" tag (accent)           |

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
inset:     0;
z-index:   9999;
pointer-events: none;
```

The `pointer-events: none` lets users interact with the page behind the dice.

### Die Colour Themes

| Die          | Theme                         |
|--------------|-------------------------------|
| d6           | Blue (`#2255CC` background)   |
| d10          | Red  (`#CC2222` background)   |
| d100 tens    | Dark (`#1a1a1a` background)   |
| d100 ones    | Light (`#f0f0f0` background)  |

### Notation

The library uses `1d{sides}@{value}` notation to force a specific face, e.g. `1d6@3` shows a 3 on the d6. Iron Ledger always pre-calculates roll values in JavaScript and passes them to the animation engine — the animation never determines the outcome.

### Linger Time

Dice stay visible for **1800 ms** after they land before the overlay is hidden.

### Failure Mode

Animation failures (CDN unavailable, WebGL not supported) are caught silently. The roll value is always determined before the animation starts, so the log entry and result display are unaffected.

---

## Source Files

| File                                              | Purpose                                         |
|---------------------------------------------------|-------------------------------------------------|
| `apps/web/src/lib/dice.ts`                        | Roll engine: `rollDie`, `rollD100`, `animateDice`, `preloadDice` |
| `apps/web/src/lib/components/DiceRollerDialog.svelte` | Modal UI — quick rolls + action roll         |
| `apps/web/src/lib/icons/dice-d6-solid.svg`        | Dice button icon in character sheet header      |
| `apps/web/src/app.css`                            | Global `.roll-*` CSS classes                    |

---

## Future Roll Types (not yet implemented)

These roll types exist in the old app and could be added:

- **Progress Roll** — progress track value vs 2d10 (no action die)
- **Oracle Roll** — d100 lookup against named range tables
- **Challenge Roll** — 1d6 + adds vs 2d10 (no stat, used for standalone challenges)

See `docs/DATA_FORMAT.md` for information on vow progress tracks.
