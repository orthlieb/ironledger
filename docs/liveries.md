# Liveries — drop-in theme packs

A **livery** pairs a display (heading) font with an optional chrome palette. It
is the "skin" the user picks in **Settings → Appearance → Livery**. The three
built-in looks — **Gravestone** (Cinzel/steel), **Grimoire** (Simonetta/amber),
and **Futhark** (runes/verdigris) — plus the **Codex** sample are all defined
as data. Adding a new one is a drop-in: create a folder, run one command.

Liveries are orthogonal to the light/dark **theme** (`data-theme`) and to
gameplay colours (stats, resources, danger/success). A livery only restyles the
_chrome_ — page/card/control backgrounds, borders, body text, and the accent —
and the heading font. Every livery works in both light and dark theme.

## Anatomy

```
liveries/
  cinzel/livery.json      ← Gravestone (default)
  simonetta/livery.json   ← Grimoire
  futhark/livery.json     ← Futhark
  codex/livery.json       ← sample — copy this as your template
```

One folder per livery; the folder name is the livery **id** and must match the
`id` field. That id becomes the `data-font='<id>'` attribute the CSS keys on.

## The `livery.json` schema

```jsonc
{
  "id": "codex", // must equal the folder name; a safe CSS ident [a-z][a-z0-9-]*
  "label": "Codex", // shown in the Settings dropdown
  "default": false, // exactly one livery across the whole set is true
  "description": "…", // one sentence; shown in docs / tooling
  "preview": null, // optional sample string shown in the dropdown, e.g. "ᚠᚢᚦᚨᚱᚲ"

  "font": {
    "stack": "'Iowan Old Style', Palatino, Georgia, serif", // full CSS font-family
    "googleFamily": null, // "Family:axis@vals" if a web font is needed (see below), else null
    "weight": 400, // --font-display-weight
    "variant": "normal", // --font-display-variant
    "transform": "none", // --font-display-transform: none|uppercase|lowercase|capitalize
    "scale": 1.08, // --font-display-scale (heading size multiplier)
  },

  "transliterate": null, // null, or a known transformer id (currently only "elder-futhark")

  "palette": null, // null → inherit the base forge-amber chrome, OR { dark, light } below
}
```

### The palette

`palette` is either `null` (inherit the base theme's chrome — what **Grimoire**
does) or an object with a `dark` and a `light` half. Each half must define
**exactly** these 14 tokens (any hex colour, `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa`):

| Group    | Tokens                                                 |
| -------- | ------------------------------------------------------ |
| Surfaces | `bg-page` `bg-card` `bg-inset` `bg-control` `bg-hover` |
| Lines    | `border` `border-mid`                                  |
| Text     | `text` `text-muted` `text-dimmer`                      |
| Accent   | `text-accent` `focus-ring` `accent-glow` `accent-dim`  |

Keep `accent-glow`/`accent-dim` as your accent colour with a low-alpha suffix
(e.g. accent `#cf8a44` → `#cf8a4420` / `#cf8a4412`), matching the base theme.

The token keys are the same custom properties the base theme sets in
`apps/web/src/app.css`; a livery palette just overrides them under a
higher-specificity `html[data-font='<id>'][data-theme]` selector, so **only the
chrome changes** — stats, resources, and semantic colours pass through
untouched.

## How the build wires it up

Two committed, generator-owned artifacts are produced from the JSON:

```
npm run gen:liveries        # scripts/gen-liveries-manifest.mjs
```

- **`apps/web/src/lib/liveries.manifest.json`** — runtime metadata (id, label,
  default, description, preview, transliterate, googleFamily). Read by
  `fontStore.svelte.ts` (active-livery state + `headingText()` transliteration)
  and `SettingsDialog.svelte` (the dropdown).
- **`apps/web/src/lib/liveries.generated.css`** — the per-livery
  `[data-font='<id>']` typography block (including `--font-display`, so the
  render-blocking stylesheet owns the font stack — no FOUC, no JS to set it)
  plus the optional dark/light palette blocks. Imported by `+layout.svelte`.

Switching liveries at runtime is just flipping the `data-font` attribute
(`setFontDisplay()` in `fontStore`); the generated CSS supplies everything the
attribute maps to. The pre-paint inline script in `app.html` sets `data-font`
from `localStorage` before first paint, and `+layout` re-applies the validated
id on mount (so a corrupted saved id falls back to the default cleanly).

Both artifacts are **Prettier-ignored** — the generator owns their exact bytes.
They regenerate automatically on `npm run build`/`check` for `apps/web`
(via its `prebuild`/`precheck`), and CI guards them:

```
npm run lint:liveries       # validate every livery.json (shape, palette, single default)
npm run gen:liveries:check   # fail if the committed artifacts are stale
```

## Add a livery in four steps

1. **Copy the sample:** `cp -r liveries/codex liveries/<your-id>`.
2. **Edit `liveries/<your-id>/livery.json`** — set `id` to the folder name,
   pick a font `stack`, and either set `palette: null` or fill both `dark` and
   `light` halves.
3. **Regenerate:** `npm run gen:liveries` (or just build/check `apps/web`).
4. **Verify:** it appears in Settings → Appearance → Livery. Toggle light/dark
   to check both palettes.

That's it — no edit to `fontStore`, `SettingsDialog`, `app.css`, or the
manifest by hand.

## Web fonts (only if you need one)

The built-in liveries load their web fonts (Cinzel, Simonetta) from the Google
Fonts `<link>` in `apps/web/src/app.html`. **Codex** and **Futhark** use
system-font stacks and need no web font at all — the easiest kind of livery.

If your livery introduces a **new** web font, two things are needed:

1. Set `font.googleFamily` (e.g. `"Cormorant:wght@400;600"`) in the JSON — this
   documents the requirement and lets the generator warn if it's missing.
2. Add that family to the `family=…` list in the `app.html` Google Fonts
   `<link>`. `gen:liveries` prints a `⚠` warning naming any `googleFamily` it
   can't find there; the app still runs (titles fall back through the stack),
   but the intended font won't load until you add it.

Only the Google Fonts host is allowed by the app's CSP; a self-hosted font
would need a `@font-face` (add it to `app.css`) and no `googleFamily`.

## Transliteration

A livery can transform heading text through `headingText()` by naming a
transformer in `transliterate`. Today the only one is `"elder-futhark"` (used
by **Futhark**, which maps Latin names to runes). To add another, register it
in the `TRANSLITERATORS` map in `fontStore.svelte.ts` first — the linter rejects
an unknown transformer id.
