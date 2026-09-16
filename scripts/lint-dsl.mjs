// =============================================================================
// lint-dsl.mjs — validate the markdown + interactive-link DSL in authored content
//
// Two guards over authored content (base + every extension):
//
// 1. DSL validation — every `[label](scheme:path?query)` link and `[text]{.class}`
//    span in moves / assets / oracle values must resolve: known scheme, existing
//    target (move id / oracle key), well-formed args, known span class.
//
// 2. No raw HTML or JS in content. A blanket sweep walks EVERY string in EVERY
//    content kind (moves, assets, oracles, foes, delve — including overrides,
//    rarities, foe drives/tactics, delve tables) and fails on any HTML tag;
//    markup must be markdown or the DSL. Extension SVG icons (inlined + {@html})
//    are scanned for <script>/on*=/javascript:/entities. An item flagged
//    `html: true` opts its subtree out of the HTML sweep (legacy escape hatch).
//
// Fails (exit 1) with `file → item → token → reason`.
//
// Run on predev/prebuild + CI:  node scripts/lint-dsl.mjs
// =============================================================================

import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Vocabulary (the app's link handlers accept exactly these) ────────────────
const SCHEMES = new Set([
  'move',
  'resource',
  'progress',
  'countdown',
  'debility',
  'initiative',
  'oracle',
  'reset',
  'harm',
  'vanquish',
  'menace',
  'roll',
]);
const RESOURCES = new Set(['momentum', 'health', 'spirit', 'supply', 'bonds', 'xp', 'failures']);
const TRACKS = new Set([
  'combat',
  'delve',
  'journey',
  'scene',
  'bonds',
  'failures',
  'quest',
  'expedition',
]);
const DEBILITIES = new Set([
  'corrupted',
  'cursed',
  'maimed',
  'shaken',
  'tormented',
  'unprepared',
  'wounded',
]);
const INITIATIVE = new Set(['character', 'foe']);
const HARM_RES = new Set(['health', 'spirit']);
const SPAN_CLASSES = new Set(['log-only', 'dialog-only']);

const LINK = /\[([^\]]+)\]\(([a-z]+):([^)]*)\)/g; // [label](scheme:rest)
const SPAN = /\[([^\]]+)\]\{\.([\w-]+)\}/g; // [text]{.class}
const HTML_TAG = /<[a-z][\w-]*(\s[^>]*)?>/i;
// Executable content that must never appear in an extension SVG icon — icons are
// inlined via `?raw` and rendered with {@html}, so a script or handler runs.
const SVG_JS = /<script\b|<foreignObject\b|\son\w+\s*=|javascript:|<!ENTITY/i;

/** Visit every string leaf in a JSON value, reporting a dotted path. An object
 *  flagged `html: true` opts its whole subtree out (the raw-HTML escape hatch). */
function walkStrings(node, visit, at = '') {
  if (typeof node === 'string') return visit(node, at || '(root)');
  if (Array.isArray(node)) return node.forEach((v, i) => walkStrings(v, visit, `${at}[${i}]`));
  if (node && typeof node === 'object') {
    if (node.html === true) return;
    for (const [k, v] of Object.entries(node)) walkStrings(v, visit, at ? `${at}.${k}` : k);
  }
}

// ── File loading ─────────────────────────────────────────────────────────────
async function listJson(dir) {
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f));
}
async function dirsFor(kind) {
  const dirs = [path.join(ROOT, `apps/api/data/${kind}`)];
  const ext = path.join(ROOT, 'extensions');
  if (existsSync(ext)) for (const e of await readdir(ext)) dirs.push(path.join(ext, e, kind));
  return dirs;
}
async function loadAll(kind) {
  const out = [];
  for (const dir of await dirsFor(kind))
    for (const f of await listJson(dir)) {
      out.push({ file: path.relative(ROOT, f), data: JSON.parse(await readFile(f, 'utf8')) });
    }
  return out;
}

// ── Parse a DSL href `path?query` (scheme already split off) ─────────────────
function parseRest(rest) {
  const q = rest.indexOf('?');
  const p = q < 0 ? rest : rest.slice(0, q);
  const args = {};
  if (q >= 0)
    for (const pair of rest.slice(q + 1).split('&')) {
      const eq = pair.indexOf('=');
      if (eq >= 0) args[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  return { path: p, args };
}
const isNum = (v) => v != null && /^[+-]?\d+$/.test(v);

// ── Validate one link token; return an error string or null ──────────────────
function checkLink(scheme, rest, moveIds, oracleKeys) {
  if (!SCHEMES.has(scheme)) return `unknown scheme "${scheme}:"`;
  const { path: p, args } = parseRest(rest);
  switch (scheme) {
    case 'move':
      if (!moveIds.has(`move/${p}`)) return `unknown move "${p}"`;
      if (args.harm != null && !isNum(args.harm)) return `move harm must be numeric`;
      return null;
    case 'oracle':
      return oracleKeys.has(p) ? null : `unknown oracle "${p}"`;
    case 'roll':
      if (p !== 'self' && !oracleKeys.has(p)) return `unknown roll target "${p}"`;
      if (args.times != null && !isNum(args.times)) return `roll times must be numeric`;
      if ((args.rollFrom != null || args.rollTo != null) && args.times != null)
        return `roll: use times OR rollFrom/rollTo, not both`;
      for (const k of ['rollFrom', 'rollTo'])
        if (args[k] != null && !isNum(args[k])) return `roll ${k} must be numeric`;
      return null;
    case 'resource':
      if (!RESOURCES.has(p)) return `unknown resource "${p}"`;
      if (!isNum(args.value)) return `resource needs a numeric ?value`;
      return null;
    case 'progress':
      if (!TRACKS.has(p)) return `unknown progress track "${p}"`;
      if (!isNum(args.value)) return `progress needs a numeric ?value`;
      return null;
    case 'countdown':
      if (!TRACKS.has(p)) return `unknown countdown track "${p}"`;
      if (!isNum(args.value)) return `countdown needs a numeric ?value`;
      return null;
    case 'debility':
      if (!DEBILITIES.has(p)) return `unknown debility "${p}"`;
      if (!isNum(args.value)) return `debility needs a numeric ?value`;
      return null;
    case 'reset':
      return TRACKS.has(p) ? null : `unknown reset track "${p}"`;
    case 'initiative':
      return INITIATIVE.has(p) ? null : `unknown initiative "${p}"`;
    case 'harm':
      return HARM_RES.has(p) ? null : `unknown harm resource "${p}"`;
    case 'menace':
      return isNum(p) ? null : `menace value must be numeric`;
    case 'vanquish':
      return p ? `vanquish takes no argument` : null;
    default:
      return `unhandled scheme "${scheme}"`;
  }
}

// ── Scan one text blob; push {token, reason} errors ──────────────────────────
function scanText(text, moveIds, oracleKeys, { strayHtml }, errs) {
  if (typeof text !== 'string' || !text) return;
  for (const m of text.matchAll(LINK)) {
    const reason = checkLink(m[2], m[3], moveIds, oracleKeys);
    if (reason) errs.push({ token: m[0], reason });
  }
  for (const m of text.matchAll(SPAN)) {
    if (!SPAN_CLASSES.has(m[2]))
      errs.push({ token: m[0], reason: `unknown span class ".${m[2]}"` });
  }
  if (strayHtml && HTML_TAG.test(text)) {
    errs.push({ token: text.match(HTML_TAG)[0], reason: `stray HTML in markdown content` });
  }
}

async function main() {
  const moves = await loadAll('moves');
  const assets = await loadAll('assets');
  const oracles = await loadAll('oracles');

  const moveIds = new Set();
  for (const { data } of moves) for (const m of data.moves ?? []) if (m.id) moveIds.add(m.id);
  const oracleKeys = new Set();
  for (const { data } of oracles) if (data.key) oracleKeys.add(data.key);

  const failures = []; // { file, item, token, reason }
  const record = (file, item, errs) => errs.forEach((e) => failures.push({ file, item, ...e }));

  // Moves — every item except the raw-HTML escape hatch (`html: true`).
  for (const { file, data } of moves)
    for (const m of data.moves ?? []) {
      if (m.html) continue;
      const errs = [];
      for (const field of ['trigger', 'triggerPreamble', 'strong', 'weak', 'miss', 'notes'])
        scanText(m[field], moveIds, oracleKeys, { strayHtml: false }, errs);
      for (const row of m.table ?? [])
        scanText(row.value, moveIds, oracleKeys, { strayHtml: false }, errs);
      record(file, m.id, errs);
    }

  // Assets — every item except the raw-HTML escape hatch (`html: true`).
  for (const { file, data } of assets)
    for (const a of data.assets ?? []) {
      if (a.html) continue;
      const errs = [];
      scanText(a.preamble, moveIds, oracleKeys, { strayHtml: false }, errs);
      scanText(a.description, moveIds, oracleKeys, { strayHtml: false }, errs);
      for (const ab of a.abilities ?? [])
        scanText(ab.text, moveIds, oracleKeys, { strayHtml: false }, errs);
      record(file, a.id, errs);
    }

  // Oracles — validate any DSL token in a value (scheme + target checks).
  for (const { file, data } of oracles)
    for (const e of data.data ?? []) {
      const errs = [];
      for (const v of Object.values(e))
        scanText(v, moveIds, oracleKeys, { strayHtml: false }, errs);
      record(file, data.key, errs);
    }

  // Blanket guard — NO raw HTML anywhere in content data. Every content kind,
  // every nested string (so overrides, rarities, foe drives/tactics, delve
  // tables are all covered). Markup is markdown or the `[label](scheme:args)`
  // DSL — never HTML. `html: true` items still opt out (handled in walkStrings).
  for (const kind of ['moves', 'assets', 'oracles', 'foes', 'delve'])
    for (const { file, data } of await loadAll(kind))
      walkStrings(data, (s, where) => {
        const tag = s.match(HTML_TAG);
        if (tag)
          failures.push({ file, item: where, token: tag[0], reason: 'raw HTML in content data' });
      });

  // SVG icon guard — icons are inlined (`?raw`) and rendered with {@html}, so a
  // <script>, on*= handler, javascript: URI, or entity would execute. Never.
  const extRoot = path.join(ROOT, 'extensions');
  if (existsSync(extRoot))
    for (const ext of await readdir(extRoot)) {
      const iconDir = path.join(extRoot, ext, 'icons');
      if (!existsSync(iconDir)) continue;
      for (const f of await readdir(iconDir)) {
        if (!f.endsWith('.svg')) continue;
        const svg = await readFile(path.join(iconDir, f), 'utf8');
        const hit = svg.match(SVG_JS);
        if (hit)
          failures.push({
            file: path.relative(ROOT, path.join(iconDir, f)),
            item: 'icon',
            token: hit[0],
            reason: 'executable content (script/handler) in SVG icon',
          });
      }
    }

  if (failures.length === 0) {
    console.log('✓ lint-dsl: no problems in flagged content.');
    return;
  }
  console.error(`✗ lint-dsl: ${failures.length} problem(s):\n`);
  for (const f of failures)
    console.error(`  ${f.file} → ${f.item}\n    ${f.token}\n    → ${f.reason}\n`);
  process.exit(1);
}

main().catch((err) => {
  console.error('lint-dsl crashed:', err);
  process.exit(2);
});
