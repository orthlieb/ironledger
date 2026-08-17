// =============================================================================
// lint-dsl.mjs — validate the markdown + interactive-link DSL in authored content
//
// Scans every `[label](scheme:path?query)` link and `[text]{.class}` span in
//   • markdown-flagged moves  (markdown: true)  — trigger/outcomes/notes/table
//   • markdown-flagged assets (markdown: true)  — abilities/preamble/description
//   • oracle values           (any DSL token)   — roll: + action links
// and fails (exit 1) on: unknown scheme, non-existent target (move id / oracle
// key), missing/malformed args, unknown span class, or stray HTML left in a
// flagged move/asset. Reports `file → item → token → reason`.
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
const TRACKS = new Set(['combat', 'delve', 'journey', 'bonds', 'failures', 'quest', 'expedition']);
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
const SPAN_CLASSES = new Set(['log-only']);

const LINK = /\[([^\]]+)\]\(([a-z]+):([^)]*)\)/g; // [label](scheme:rest)
const SPAN = /\[([^\]]+)\]\{\.([\w-]+)\}/g; // [text]{.class}
const HTML_TAG = /<[a-z][\w-]*(\s[^>]*)?>/i;

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

  // Moves — only markdown-flagged items; scan every prose field.
  for (const { file, data } of moves)
    for (const m of data.moves ?? []) {
      if (!m.markdown) continue;
      const errs = [];
      for (const field of ['trigger', 'triggerPreamble', 'strong', 'weak', 'miss', 'notes'])
        scanText(m[field], moveIds, oracleKeys, { strayHtml: true }, errs);
      for (const row of m.table ?? [])
        scanText(row.value, moveIds, oracleKeys, { strayHtml: true }, errs);
      record(file, m.id, errs);
    }

  // Assets — only markdown-flagged items.
  for (const { file, data } of assets)
    for (const a of data.assets ?? []) {
      if (!a.markdown) continue;
      const errs = [];
      scanText(a.preamble, moveIds, oracleKeys, { strayHtml: true }, errs);
      scanText(a.description, moveIds, oracleKeys, { strayHtml: true }, errs);
      for (const ab of a.abilities ?? [])
        scanText(ab.text, moveIds, oracleKeys, { strayHtml: true }, errs);
      record(file, a.id, errs);
    }

  // Oracles — validate any DSL token in a value (mixed transition; no strayHtml).
  for (const { file, data } of oracles)
    for (const e of data.data ?? []) {
      const errs = [];
      for (const v of Object.values(e))
        scanText(v, moveIds, oracleKeys, { strayHtml: false }, errs);
      record(file, data.key, errs);
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
