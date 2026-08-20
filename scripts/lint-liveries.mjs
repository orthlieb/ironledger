// =============================================================================
// lint-liveries.mjs — validate the drop-in livery definitions
//
// A "livery" is a heading-font + chrome-palette pairing selectable in
// Settings → Appearance. Each one is a self-contained folder:
//
//   liveries/<slug>/livery.json
//
// This linter reads every one, validates its shape, and fails (exit 1) on:
//   • id not matching its folder slug / not a safe CSS ident
//   • missing or malformed font block
//   • a palette that doesn't carry exactly the required token set, or whose
//     dark/light halves disagree, or that holds a non-colour value
//   • an unknown `transliterate` transformer
//   • zero, or more than one, livery flagged `default: true`
//
// It exports `loadLiveries()` so the manifest generator validates with the
// same rules instead of duplicating them.
//
//   node scripts/lint-liveries.mjs        # validate, print a summary
// =============================================================================

import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LIVERIES_DIR = path.join(ROOT, 'liveries');

// The exact chrome tokens a palette overrides. Kept in lock-step with the
// base theme blocks in apps/web/src/app.css — a palette must define all of
// these (for both `dark` and `light`) or none of them (palette: null, which
// falls through to the base forge-amber theme).
export const TOKEN_KEYS = [
  'bg-page',
  'bg-card',
  'bg-inset',
  'bg-control',
  'bg-hover',
  'border',
  'border-mid',
  'text',
  'text-muted',
  'text-dimmer',
  'text-accent',
  'focus-ring',
  'accent-glow',
  'accent-dim',
];

// Named text transformers `headingText()` can apply. A livery may reference
// one by id, or `null` for the identity (no transliteration).
export const KNOWN_TRANSLITERATORS = new Set(['elder-futhark']);

// Valid 3D-dice texture keys. Mirrors DICE_TEXTURE_OPTIONS in
// apps/web/src/lib/dice.ts (the dice-box library's own texture names) — keep
// the two in sync. A livery `dice` block is optional; when present its texture
// must be one of these.
export const DICE_TEXTURES = new Set([
  'none',
  'cloudy',
  'marble',
  'fire',
  'ice',
  'water',
  'paper',
  'speckles',
  'glitter',
  'stars',
  'stainedglass',
  'wood',
  'metal',
  'skulls',
  'astral',
  'dragon',
  'lizard',
  'leopard',
  'tiger',
  'cheetah',
]);

const CSS_IDENT = /^[a-z][a-z0-9-]*$/;
const HEX_COLOR = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const TRANSFORMS = new Set(['none', 'uppercase', 'lowercase', 'capitalize']);

/** Validate one parsed livery object. Returns an array of error strings. */
export function validateLivery(lv, slug) {
  const errs = [];
  const at = (msg) => errs.push(`${slug} → ${msg}`);

  if (typeof lv !== 'object' || lv === null) {
    return [`${slug} → livery.json is not an object`];
  }

  if (lv.id !== slug) at(`id "${lv.id}" must equal its folder name "${slug}"`);
  if (!CSS_IDENT.test(String(lv.id ?? ''))) {
    at(`id "${lv.id}" must be a safe CSS ident (lowercase, [a-z0-9-], leading letter)`);
  }
  if (typeof lv.label !== 'string' || !lv.label.trim()) at('label must be a non-empty string');
  if (typeof lv.description !== 'string' || !lv.description.trim()) {
    at('description must be a non-empty string');
  }
  if (typeof lv.default !== 'boolean') at('default must be a boolean');
  if (lv.preview != null && typeof lv.preview !== 'string') at('preview must be a string or null');

  // ── font ──────────────────────────────────────────────────────────────────
  const f = lv.font;
  if (typeof f !== 'object' || f === null) {
    at('font must be an object');
  } else {
    if (typeof f.stack !== 'string' || !f.stack.trim()) at('font.stack must be a non-empty string');
    if (f.googleFamily != null && typeof f.googleFamily !== 'string') {
      at('font.googleFamily must be a string or null');
    }
    if (typeof f.weight !== 'number' || f.weight < 1 || f.weight > 1000) {
      at('font.weight must be a number 1–1000');
    }
    if (typeof f.variant !== 'string') at('font.variant must be a string');
    if (!TRANSFORMS.has(f.transform)) {
      at(`font.transform "${f.transform}" must be one of ${[...TRANSFORMS].join(', ')}`);
    }
    if (typeof f.scale !== 'number' || !(f.scale > 0)) at('font.scale must be a positive number');
  }

  // ── transliterate ───────────────────────────────────────────────────────────
  if (lv.transliterate != null && !KNOWN_TRANSLITERATORS.has(lv.transliterate)) {
    at(
      `transliterate "${lv.transliterate}" is not a known transformer ` +
        `(${[...KNOWN_TRANSLITERATORS].join(', ')}) — add it to headingText() first`,
    );
  }

  // ── dice (optional; null/absent = factory blue/red, no texture) ─────────────
  if (lv.dice != null) {
    const d = lv.dice;
    if (typeof d !== 'object') {
      at('dice must be an object or null');
    } else {
      for (const k of ['action', 'challenge', 'tens', 'ones']) {
        if (!HEX_COLOR.test(String(d[k]))) {
          at(`dice.${k} "${d[k]}" is not a hex colour (#rgb/#rgba/#rrggbb/#rrggbbaa)`);
        }
      }
      if (!DICE_TEXTURES.has(d.texture)) {
        at(`dice.texture "${d.texture}" is not a known texture (${[...DICE_TEXTURES].join(', ')})`);
      }
    }
  }

  // ── palette (null = inherit the base forge-amber theme) ─────────────────────
  if (lv.palette != null) {
    for (const mode of ['dark', 'light']) {
      const p = lv.palette[mode];
      if (typeof p !== 'object' || p === null) {
        at(`palette.${mode} must be an object (or set palette to null to inherit the base theme)`);
        continue;
      }
      const keys = Object.keys(p);
      const missing = TOKEN_KEYS.filter((k) => !(k in p));
      const extra = keys.filter((k) => !TOKEN_KEYS.includes(k));
      if (missing.length) at(`palette.${mode} is missing tokens: ${missing.join(', ')}`);
      if (extra.length) at(`palette.${mode} has unknown tokens: ${extra.join(', ')}`);
      for (const k of TOKEN_KEYS) {
        if (k in p && !HEX_COLOR.test(String(p[k]))) {
          at(`palette.${mode}.${k} "${p[k]}" is not a hex colour (#rgb/#rgba/#rrggbb/#rrggbbaa)`);
        }
      }
    }
  }

  return errs;
}

/**
 * Read + validate every livery folder. Throws (with a multi-line message)
 * on any validation failure. Returns the liveries sorted default-first,
 * then alphabetically by id — a deterministic order for the manifest.
 */
export async function loadLiveries() {
  if (!existsSync(LIVERIES_DIR))
    throw new Error(`liveries/ directory not found at ${LIVERIES_DIR}`);

  const entries = await readdir(LIVERIES_DIR, { withFileTypes: true });
  const slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  if (!slugs.length) throw new Error('liveries/ contains no livery folders');

  const liveries = [];
  const errors = [];
  for (const slug of slugs.sort()) {
    const file = path.join(LIVERIES_DIR, slug, 'livery.json');
    if (!existsSync(file)) {
      errors.push(`${slug} → missing livery.json`);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(await readFile(file, 'utf8'));
    } catch (e) {
      errors.push(`${slug} → livery.json is not valid JSON: ${e.message}`);
      continue;
    }
    const errs = validateLivery(parsed, slug);
    if (errs.length) errors.push(...errs);
    else liveries.push(parsed);
  }

  const defaults = liveries.filter((l) => l.default);
  if (defaults.length !== 1) {
    errors.push(
      `exactly one livery must set "default": true — found ${defaults.length}` +
        (defaults.length ? ` (${defaults.map((d) => d.id).join(', ')})` : ''),
    );
  }

  if (errors.length) {
    throw new Error(`Invalid livery definitions:\n  - ${errors.join('\n  - ')}`);
  }

  liveries.sort((a, b) => Number(b.default) - Number(a.default) || a.id.localeCompare(b.id));
  return liveries;
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const liveries = await loadLiveries();
    const names = liveries.map((l) => `${l.id}${l.default ? ' (default)' : ''}`).join(', ');
    console.log(`✓ ${liveries.length} liveries valid: ${names}`);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}
