// =============================================================================
// gen-liveries-manifest.mjs — build-time livery manifest + CSS generator
//
// Enumerates every liveries/<slug>/livery.json (validated by lint-liveries.mjs)
// and emits three committed, generator-owned artifacts:
//
//   apps/web/src/lib/liveries.manifest.json  — runtime metadata the app reads:
//       default id + [{ id, label, default, description, preview,
//       transliterate, googleFamily }]. Consumed by fontStore + SettingsDialog.
//
//   apps/web/src/lib/liveries.generated.css  — the per-livery `[data-font]`
//       typography block (incl. `--font-display`, so the render-blocking
//       stylesheet owns the font stack — no FOUC, no JS to set it) plus the
//       optional dark/light chrome-palette blocks. Imported by +layout.svelte.
//
//   liveries/<id>/preview.html               — a self-contained swatch page
//       showing both themes' palettes, dice, and the display font (loaded
//       from Google Fonts when the livery declares one). Open the file in
//       a browser for a design-review view without running the app.
//
// Deterministic output (no timestamps) so regeneration is a no-op in git.
//
//   node scripts/gen-liveries-manifest.mjs         # write all artifacts
//   node scripts/gen-liveries-manifest.mjs --check # fail if any is stale (CI)
// =============================================================================

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadLiveries, LIVERIES_DIR, TOKEN_KEYS } from './lint-liveries.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(ROOT, 'apps/web/src/lib');
const MANIFEST_OUT = path.join(LIB, 'liveries.manifest.json');
const CSS_OUT = path.join(LIB, 'liveries.generated.css');
const APP_HTML = path.join(ROOT, 'apps/web/src/app.html');

const check = process.argv.includes('--check');

// Full base-app chrome palette a `palette: null` livery inherits (forge-amber
// on ink/parchment). Every token is the value app.css sets under :root /
// [data-theme='light']; keep in sync when that file moves. Consumed by the
// preview.html renderer so a null-palette livery still shows both themes.
const BASE_PALETTE = {
  dark: {
    'bg-page': '#0b0906',
    'bg-card': '#131008',
    'bg-inset': '#0d0b07',
    'bg-control': '#1a1610',
    'bg-hover': '#221d14',
    border: '#3d3425',
    'border-mid': '#574a32',
    text: '#ddd0aa',
    'text-muted': '#9a886a',
    'text-dimmer': '#6e5e42',
    'text-accent': '#e8a030',
    'focus-ring': '#e8a030',
    'accent-glow': '#e8a03020',
    'accent-dim': '#e8a03012',
  },
  light: {
    'bg-page': '#f4ede0',
    'bg-card': '#ede6d6',
    'bg-inset': '#f9f4ea',
    'bg-control': '#f0e9d8',
    'bg-hover': '#e8dfcc',
    border: '#c8b89a',
    'border-mid': '#b0a080',
    text: '#1c1710',
    'text-muted': '#5a4e38',
    'text-dimmer': '#8a7860',
    'text-accent': '#8a4e08',
    'focus-ring': '#8a4e08',
    'accent-glow': '#8a4e0820',
    'accent-dim': '#8a4e0812',
  },
};

// ── Manifest (runtime metadata) ────────────────────────────────────────────────
// Base-app chrome tokens used as the preview fallback when a livery has
// `palette: null` (inherits the base forge-amber chrome). Keep in sync with
// the `:root` / `[data-theme='light']` blocks in apps/web/src/app.css.
const BASE_PREVIEW = {
  dark: { bg: '#0b0906', fg: '#e8a030' },
  light: { bg: '#f4ede0', fg: '#8a4e08' },
};
function previewColors(livery) {
  const p = livery.palette;
  if (!p) return BASE_PREVIEW;
  return {
    dark: { bg: p.dark['bg-page'], fg: p.dark['text-accent'] },
    light: { bg: p.light['bg-page'], fg: p.light['text-accent'] },
  };
}

// Read an optional `liveries/<id>/brand.svg` and return its trimmed contents,
// or null when absent. The file is inlined verbatim into the manifest so the
// client can render it as a currentColor glyph (nav brand + favicon) without
// a runtime fetch. Same normalisation checklist as $lib/icons/ SVGs applies —
// enforced by convention; the gen step only trims whitespace.
async function readBrandSvg(id) {
  const p = path.join(LIVERIES_DIR, id, 'brand.svg');
  if (!existsSync(p)) return null;
  const raw = (await readFile(p, 'utf8')).trim();
  if (!raw.startsWith('<svg')) {
    console.warn(`⚠ livery "${id}" brand.svg does not start with <svg — skipped`);
    return null;
  }
  return raw;
}

async function attachBrandSvgs(liveries) {
  await Promise.all(
    liveries.map(async (l) => {
      l.brandSvg = await readBrandSvg(l.id);
    }),
  );
}

function buildManifest(liveries) {
  const brandById = Object.fromEntries(liveries.map((l) => [l.id, l.brandSvg ?? null]));
  const obj = {
    _generated: 'scripts/gen-liveries-manifest.mjs — edit liveries/<id>/livery.json, not this file',
    default: liveries.find((l) => l.default).id,
    liveries: liveries.map((l) => ({
      id: l.id,
      label: l.label,
      default: l.default,
      description: l.description,
      preview: l.preview ?? null,
      transliterate: l.transliterate ?? null,
      googleFamily: l.font.googleFamily ?? null,
      dice: l.dice ?? null,
      // Compact per-livery swatch pair (bg-page + text-accent, per theme) so
      // SettingsDialog's livery picker can render a dark+light preview tile
      // per option without carrying the whole palette client-side.
      previewColors: previewColors(l),
      // Optional per-livery brand icon (nav mark + favicon). When absent the
      // app falls back to the default sharp-axe SVG. Source of truth is
      // liveries/<id>/brand.svg — inlined verbatim so the client renders it
      // as a currentColor glyph without a runtime fetch.
      ...(brandById[l.id] ? { brandSvg: brandById[l.id] } : {}),
    })),
  };
  return JSON.stringify(obj, null, 2) + '\n';
}

// ── CSS (typography + chrome palette, keyed on [data-font]) ─────────────────────
// `indent` prefixes every line so a block can be nested inside @media.
function paletteBlock(selector, tokens, indent = '') {
  const lines = TOKEN_KEYS.map((k) => `${indent}\t--${k}: ${tokens[k]};`).join('\n');
  return `${indent}${selector} {\n${lines}\n${indent}}`;
}

function liveryCss(l) {
  const f = l.font;
  const out = [];
  out.push(`/* ${l.label} (${l.id})${l.default ? ' — default' : ''} */`);
  out.push(
    `[data-font='${l.id}'] {\n` +
      `\t--font-display: ${f.stack};\n` +
      `\t--font-display-weight: ${f.weight};\n` +
      `\t--font-display-variant: ${f.variant};\n` +
      `\t--font-display-transform: ${f.transform};\n` +
      `\t--font-display-scale: ${f.scale};\n` +
      `}`,
  );
  if (l.palette) {
    // Compound `html[data-font][data-theme]` selectors have specificity
    // (0,2,1) — one step above the base theme blocks (0,1,1) — so these win
    // regardless of source order. Mirrors the hand-written blocks that used
    // to live in app.css.
    out.push(paletteBlock(`html[data-font='${l.id}']:not([data-theme='light'])`, l.palette.dark));
    out.push(
      `@media (prefers-color-scheme: light) {\n` +
        paletteBlock(`html[data-font='${l.id}']:not([data-theme='dark'])`, l.palette.light, '\t') +
        `\n}`,
    );
    out.push(paletteBlock(`html[data-font='${l.id}'][data-theme='light']`, l.palette.light));
  }
  return out.join('\n');
}

function buildCss(liveries) {
  const header = [
    '/* =============================================================================',
    '   GENERATED by scripts/gen-liveries-manifest.mjs — do not edit by hand.',
    '   Source of truth: liveries/<id>/livery.json. Run `npm run gen:liveries`.',
    '',
    '   Per-livery typography + chrome palette, keyed on the [data-font] attribute',
    '   set (pre-paint) by the inline script in app.html and (at runtime) by',
    '   setFontDisplay() in fontStore. A livery with palette:null emits only the',
    '   typography block and inherits the base forge-amber chrome from app.css.',
    '   ============================================================================= */',
    '',
  ].join('\n');
  return header + liveries.map(liveryCss).join('\n\n') + '\n';
}

// ── preview.html (per-livery swatch page) ───────────────────────────────────────

function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

// A single palette swatch row (chip + name + hex).
function swatch(name, hex) {
  return (
    `\t\t\t\t<div class="sw">\n` +
    `\t\t\t\t\t<div class="chip" style="background: ${hex}"></div>\n` +
    `\t\t\t\t\t<div><span class="name">${name}</span><span class="hex">${hex}</span></div>\n` +
    `\t\t\t\t</div>`
  );
}

// One theme (dark or light) — demo strip, dice row, palette grid. Colours are
// inlined as static hex so the file renders identically without CSS-vars or
// the app running. `brandSvg` is optional — when passed, the demo strip
// renders the livery's brand icon to the left of the "Iron Ledger" wordmark
// (mirrors the actual nav bar); falls back to the shared axe on liveries
// that ship no brand.svg so the strip always shows the icon slot.
function themeBlock(mode, pal, dice, fontFamily, brandSvg, label) {
  const rows = TOKEN_KEYS.map((k) => swatch(k, pal[k])).join('\n');
  const rules = [
    `background: ${pal['bg-page']}`,
    `color: ${pal.text}`,
    `--card: ${pal['bg-card']}`,
    `--border: ${pal.border}`,
    `--accent: ${pal['text-accent']}`,
    `--muted: ${pal['text-muted']}`,
  ].join('; ');
  // Dice tiles are labelled with the die each colour drives (d6 action /
  // d10 challenge / d100 tens + ones). The label uses the regular UI font,
  // not the livery display font — the die name is metadata, not chrome.
  const diceRow = dice
    ? `\t\t\t<div class="dice">\n` +
      `\t\t\t\t<div class="die" style="background: ${dice.action}; color: ${dice.ones}">d6</div>\n` +
      `\t\t\t\t<div class="die" style="background: ${dice.challenge}; color: ${dice.ones}">d10</div>\n` +
      `\t\t\t\t<div class="die" style="background: ${dice.tens}; color: ${dice.ones}">d100 (10s)</div>\n` +
      `\t\t\t\t<div class="die" style="background: ${dice.ones}; color: ${dice.tens}">d100 (1s)</div>\n` +
      `\t\t\t</div>\n`
    : '';
  const fontRule = fontFamily ? `font-family: ${esc(fontFamily)}, serif;` : '';
  const iconSpan = brandSvg
    ? `\t\t\t\t<span class="demo-icon" style="color: ${pal['text-accent']};">${brandSvg.replace(/\n\s*/g, '')}</span>\n`
    : '';
  return (
    `\t\t<section class="theme ${mode}" style="${rules}">\n` +
    `\t\t\t<h2 style="color: ${pal['text-accent']}; ${fontRule}">${esc(label)}</h2>\n` +
    `\t\t\t<div class="demo" style="background: ${pal['bg-card']}; border: 1px solid ${pal.border};">\n` +
    iconSpan +
    `\t\t\t\t<span class="demo-title" style="color: ${pal['text-accent']}; ${fontRule}">Iron Ledger</span>\n` +
    `\t\t\t\t<span class="pill" style="background: ${pal['accent-glow']}; color: ${pal['text-accent']}; border: 1px solid ${pal['text-accent']};">Journey</span>\n` +
    `\t\t\t\t<span style="color: ${pal['text-muted']}; margin-left: auto; font-size: 0.75rem;">muted</span>\n` +
    `\t\t\t</div>\n` +
    diceRow +
    `\t\t\t<div class="grid">\n${rows}\n\t\t\t</div>\n` +
    `\t\t</section>`
  );
}

function previewHtml(livery) {
  const pal = livery.palette ?? BASE_PALETTE;
  // Extract the primary Google family name (before any `:wght@…` axis spec)
  // so we can both hint <link> loading and use it as the demo font-family.
  const gf = livery.font.googleFamily ?? '';
  const familyRaw = gf ? gf.split(':')[0] : '';
  const familyForCss = familyRaw ? `'${familyRaw}'` : '';
  const familyForLink = gf ? gf.replace(/ /g, '+') : '';
  const fontLink = familyForLink
    ? `\t\t<link rel="preconnect" href="https://fonts.googleapis.com" />\n` +
      `\t\t<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />\n` +
      `\t\t<link href="https://fonts.googleapis.com/css2?family=${familyForLink}&family=Roboto:wght@400;600&display=swap" rel="stylesheet" />\n`
    : `\t\t<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;600&display=swap" rel="stylesheet" />\n`;
  const dark = themeBlock('dark', pal.dark, livery.dice, familyForCss, livery.brandSvg, 'Dark');
  const light = themeBlock('light', pal.light, livery.dice, familyForCss, livery.brandSvg, 'Light');
  const note = livery.palette
    ? ''
    : `\t\t<p class="note">This livery has <code>palette: null</code> — it inherits the base forge-amber chrome, shown here as its dark + light halves.</p>\n`;
  return (
    `<!DOCTYPE html>\n` +
    `<html lang="en">\n` +
    `\t<head>\n` +
    `\t\t<meta charset="utf-8" />\n` +
    `\t\t<title>${esc(livery.label)} (${esc(livery.id)}) — livery preview</title>\n` +
    `\t\t<meta name="viewport" content="width=device-width, initial-scale=1" />\n` +
    fontLink +
    `\t\t<style>\n` +
    `\t\t\t:root { color-scheme: light dark; font-family: 'Roboto', system-ui, sans-serif; }\n` +
    `\t\t\tbody { margin: 0; padding: 24px; background: #202024; color: #e6e6e8; display: grid; gap: 24px; grid-template-columns: 1fr 1fr; max-width: 1200px; }\n` +
    `\t\t\t@media (max-width: 720px) { body { grid-template-columns: 1fr; } }\n` +
    `\t\t\th1 { grid-column: 1 / -1; font-size: 2rem; margin: 0; ${familyForCss ? `font-family: ${familyForCss}, serif; ` : ''}font-weight: 400; letter-spacing: 0.02em; }\n` +
    `\t\t\t.hint { grid-column: 1 / -1; margin: -12px 0 0; color: #a0a3a8; font-size: 0.9rem; }\n` +
    `\t\t\t.note { grid-column: 1 / -1; margin: 0; color: #a0a3a8; font-size: 0.8rem; }\n` +
    `\t\t\t.note code { background: #333; padding: 1px 4px; border-radius: 3px; }\n` +
    `\t\t\t.theme { border-radius: 12px; padding: 20px; box-shadow: 0 4px 18px rgba(0,0,0,0.35); }\n` +
    `\t\t\t.theme h2 { font-size: 1.2rem; margin: 0 0 12px; letter-spacing: 0.02em; font-weight: 400; }\n` +
    `\t\t\t.demo { border-radius: 8px; padding: 12px 14px; display: flex; align-items: center; gap: 10px; font-size: 0.9rem; }\n` +
    `\t\t\t.demo-icon { display: inline-flex; width: 22px; height: 22px; flex: 0 0 22px; }\n` +
    `\t\t\t.demo-icon svg { width: 100%; height: 100%; fill: currentColor; }\n` +
    `\t\t\t.demo-title { font-size: 1.4rem; font-weight: 400; letter-spacing: 0.02em; }\n` +
    `\t\t\t.pill { display: inline-flex; padding: 3px 10px; border-radius: 999px; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }\n` +
    `\t\t\t.dice { display: flex; gap: 8px; margin-top: 12px; }\n` +
    `\t\t\t.die { width: 78px; height: 44px; border-radius: 6px; display: grid; place-items: center; font-family: 'Roboto', system-ui, sans-serif; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.02em; }\n` +
    `\t\t\t.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; margin-top: 16px; }\n` +
    `\t\t\t.sw { display: flex; align-items: center; gap: 10px; font-size: 0.75rem; line-height: 1.15; }\n` +
    `\t\t\t.chip { flex: 0 0 32px; height: 32px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.2); }\n` +
    `\t\t\t.theme.dark .chip { border-color: rgba(255,255,255,0.12); }\n` +
    `\t\t\t.name { font-weight: 600; }\n` +
    `\t\t\t.hex { display: block; font-family: ui-monospace, SFMono-Regular, monospace; opacity: 0.7; font-size: 0.72rem; }\n` +
    `\t\t</style>\n` +
    `\t</head>\n` +
    `\t<body>\n` +
    `\t\t<h1>${esc(livery.label)} <span style="opacity: 0.6; font-weight: 400;">(${esc(livery.id)})</span></h1>\n` +
    `\t\t<p class="hint">${esc(livery.description)}</p>\n` +
    note +
    dark +
    `\n` +
    light +
    `\n` +
    `\t</body>\n` +
    `</html>\n`
  );
}

// ── app.html Google-Fonts drift (soft warning) ──────────────────────────────────
async function warnFontDrift(liveries) {
  if (!existsSync(APP_HTML)) return;
  const html = await readFile(APP_HTML, 'utf8');
  for (const l of liveries) {
    const fam = l.font.googleFamily;
    if (!fam) continue;
    // family= token before the first colon, e.g. "Cinzel:wght@…" → "Cinzel".
    // Google Fonts URLs encode spaces as `+` (e.g. `family=Mystery+Quest`),
    // so normalise the needle the same way before the includes() check —
    // otherwise every multi-word family name warns spuriously.
    const family = fam.split(':')[0].replace(/ /g, '+');
    if (!html.includes(`family=${family}`)) {
      console.warn(
        `⚠ livery "${l.id}" declares googleFamily "${fam}" but app.html's font ` +
          `<link> has no family=${family} — add it, or titles fall back to the stack.`,
      );
    }
  }
}

// ── main ────────────────────────────────────────────────────────────────────────
async function readIf(file) {
  return existsSync(file) ? readFile(file, 'utf8') : null;
}

const liveries = await loadLiveries();
await attachBrandSvgs(liveries);
const manifest = buildManifest(liveries);
const css = buildCss(liveries);
// Per-livery preview.html — each livery gets a design-review swatch page
// sitting next to its own livery.json.
const previews = liveries.map((l) => ({
  id: l.id,
  out: path.join(LIVERIES_DIR, l.id, 'preview.html'),
  contents: previewHtml(l),
}));

if (check) {
  const [curManifest, curCss] = await Promise.all([readIf(MANIFEST_OUT), readIf(CSS_OUT)]);
  const stale = [];
  if (curManifest !== manifest) stale.push('apps/web/src/lib/liveries.manifest.json');
  if (curCss !== css) stale.push('apps/web/src/lib/liveries.generated.css');
  for (const p of previews) {
    const cur = await readIf(p.out);
    if (cur !== p.contents) {
      stale.push(path.relative(ROOT, p.out));
    }
  }
  if (stale.length) {
    console.error(
      `✗ livery artifacts are stale:\n  - ${stale.join('\n  - ')}\n` +
        `  Run \`npm run gen:liveries\` and commit the result.`,
    );
    process.exit(1);
  }
  console.log(
    `✓ livery artifacts up to date (${liveries.length} liveries; ${previews.length} previews)`,
  );
} else {
  await Promise.all([
    writeFile(MANIFEST_OUT, manifest),
    writeFile(CSS_OUT, css),
    ...previews.map((p) => writeFile(p.out, p.contents)),
  ]);
  await warnFontDrift(liveries);
  console.log(
    `✓ wrote liveries.manifest.json + liveries.generated.css + ${previews.length} preview.html ` +
      `(${liveries.length} liveries: ${liveries.map((l) => l.id).join(', ')})`,
  );
}
