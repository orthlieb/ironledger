// =============================================================================
// lint-dsl.mjs — validate the markdown + interactive-link DSL in authored content
//
// Two guards over authored content (base + every extension):
//
// 1. Link validation — every link in moves / assets / oracle values is a
//    command (`[label](/momentum++)`, docs/command-language.md → Log links)
//    that parses and names something: a move or oracle that exists, a value
//    its owner has, an operator that fits it. Content names things by id or
//    keyword, never by display name. Any other target (an old
//    `[label](scheme:…)` form, a bare word, a web address) is refused: it
//    would show as written. `[label](roll:…)` blanks in oracle values stay.
//    Foe and delve text is plain, so a link there is refused too. Every
//    `[text]{.class}` span names a known class.
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
import {
  parseCommand,
  parseAmount,
  BUILTIN_VALUES,
  OWNER_KEYWORDS,
  LINK_VERBS,
} from '../packages/shared/src/command.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SPAN_CLASSES = new Set(['log-only', 'dialog-only']);

const LINK = /\[([^[\]]+)\]\(([^)]*)\)/g; // [label](target)
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

// ── Parse a `roll:` href `path?query` (scheme already split off) ─────────────
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

/** A `roll:` blank in an oracle value. */
function checkRoll(rest, cat) {
  const { path: p, args } = parseRest(rest);
  if (p !== 'self' && !cat.oracleKeys.has(p)) return `unknown roll target "${p}"`;
  if (args.times != null && !isNum(args.times)) return `roll times must be numeric`;
  if ((args.rollFrom != null || args.rollTo != null) && args.times != null)
    return `roll: use times OR rollFrom/rollTo, not both`;
  for (const k of ['rollFrom', 'rollTo'])
    if (args[k] != null && !isNum(args[k])) return `roll ${k} must be numeric`;
  return null;
}

// ── The kind of a value a link names ─────────────────────────────────────────

/** A field's kind, as values.ts reads it, and its options (ids, lowered). */
function fieldKind(f) {
  const writable = f.writable !== false;
  switch (f.type) {
    case 'counter':
      return { kind: 'number', writable };
    case 'switch':
      return { kind: 'bool', writable };
    case 'dropdown':
    case 'radio':
      return {
        kind: 'list',
        writable,
        // Options from an oracle can't be known here; a custom list takes anything.
        options:
          f.custom || !f.options
            ? null
            : f.options.map((o) => [o.id, o.label.toLowerCase()]).flat(),
      };
    case 'markdown':
      return { kind: 'notes', writable: false };
    default:
      return { kind: 'text', writable };
  }
}

/** A built-in value's kind. */
function builtinKind(owner, key) {
  const v = BUILTIN_VALUES[owner]?.[key];
  if (!v) return null;
  if (v.kind === 'count') return { kind: 'number', writable: false };
  return { kind: v.kind, writable: true, options: v.options ? [...v.options] : undefined };
}

/** A character's value: built in, or a content pack's field. */
function characterKind(key, cat) {
  return (
    builtinKind('character', key) ?? (cat.fields.has(key) ? fieldKind(cat.fields.get(key)) : null)
  );
}

/** An asset's field (a reference to a global field reads that). */
function assetFieldKind(asset, key, cat) {
  const cf = (asset?.customFields ?? []).find((f) => (f.field ?? f.id) === key);
  if (!cf) return null;
  if (cf.field) return cat.fields.has(cf.field) ? fieldKind(cat.fields.get(cf.field)) : null;
  return fieldKind(cf);
}

// ── Validate one link's command; return an error string or null ─────────────
function checkCommand(cmd, cat, self) {
  const p = parseCommand(cmd);
  if (p.kind === 'error') return p.message;
  if (p.kind === 'verb') {
    if (!LINK_VERBS.includes(p.verb))
      return `a link can't run /${p.verb}: that's the command bar's`;
    if (p.verb === 'burn') return p.arg ? '/burn takes nothing after it' : null;
    if (p.verb === 'move') {
      const m = p.arg.match(/^(\S+)(?:\s+(\d+))?$/);
      if (!m) return 'write the move by its id: /move face-danger, or /move endure-harm 2';
      return cat.moveIds.has(`move/${m[1]}`) ? null : `unknown move "${m[1]}"`;
    }
    return cat.oracleKeys.has(p.arg) ? null : `unknown oracle "${p.arg}" (write its key)`;
  }
  if (p.kind !== 'value') return 'not a command';
  if (!p.op) return 'a link changes a value: add an operator (++ -- +=n -=n =v !)';
  const parts = [p.owner, p.value].filter(Boolean);
  if (parts.some((n) => n.quoted || n.qualifier || n.index != null))
    return 'content names things by id or keyword, unquoted, with no kind: or #n';
  const key = p.value.text;
  let v;
  let where = '';
  if (!p.owner) {
    if (OWNER_KEYWORDS.includes(key)) return `a link can't make a ${key} active`;
    v = characterKind(key, cat);
  } else {
    const o = p.owner.text;
    where = ` on ${o}`;
    if (o === 'character' || o === 'me') v = characterKind(key, cat);
    else if (['foe', 'journey', 'site', 'scene', 'vow'].includes(o)) v = builtinKind(o, key);
    else if (o === 'companion')
      v = cat.companions.map((a) => assetFieldKind(a, key, cat)).find(Boolean) ?? null;
    else if (o === 'allies' || o === 'everyone') {
      // Every other character (and, for everyone, the character too): a
      // character's value, but not the party's, which has one home.
      if (key === 'supply' || cat.fields.get(key)?.scope === 'party')
        return `${key} is the party's: /${key}…, with no owner`;
      v = characterKind(key, cat);
    } else if (o === 'companions') {
      // Every companion at once: a value each of them has.
      const kinds = cat.companions.map((a) => assetFieldKind(a, key, cat));
      v = kinds.every(Boolean) ? kinds[0] : null;
    } else if (o === 'self') {
      if (!self) return 'self is the asset a link belongs to: only in an asset’s text';
      v = assetFieldKind(self, key, cat);
    } else if (o.includes('/')) {
      if (!cat.assets.has(o)) return `unknown asset "${o}"`;
      v = assetFieldKind(cat.assets.get(o), key, cat);
    } else
      return `owner "${o}": name it by keyword (${OWNER_KEYWORDS.join(', ')}) or an asset's id, never a display name`;
  }
  if (!v) return `no value "${key}"${where}`;
  if (!v.writable) return `${key} is read-only`;
  const op = p.op;
  const amount = (p.operand ?? '').trim();
  switch (v.kind) {
    case 'bool':
      if (op === '++' || op === '--' || op === '!') return null;
      if (op === '=')
        return /^(\d+|true|false|yes|no|on|off)$/i.test(amount)
          ? null
          : `${key} is true/false: =1 or =0`;
      return `${key} is true/false: use ++, -- or !`;
    case 'list':
      if (op !== '=') return `${key} is a list: set it with =`;
      return !v.options || v.options.includes(amount.toLowerCase())
        ? null
        : `${key} has no option "${amount}"`;
    case 'text':
      return op === '=' ? null : `${key} is text: set it with =`;
    case 'notes':
      return `${key} is edited on the sheet`;
    default: {
      if (op === '!') return `${key} isn't true/false`;
      if (op === '++' || op === '--') return null;
      const a = parseAmount(amount, op === '=' && v.kind === 'number');
      if (a.kind === 'bad') return `"${amount}" isn't an amount`;
      if (a.kind === 'harm')
        return op === '=' ? 'harm is an amount: write it after += or -=' : null;
      if (a.unit && v.kind !== 'track') return `${key} takes no unit`;
      return null;
    }
  }
}

// ── Scan one text blob; push {token, reason} errors ──────────────────────────
function scanText(text, cat, { strayHtml, self, verbsOnly }, errs) {
  if (typeof text !== 'string' || !text) return;
  for (const m of text.matchAll(LINK)) {
    const target = m[2];
    let reason;
    if (target.startsWith('/') && verbsOnly && parseCommand(target).kind !== 'verb')
      reason =
        "asset text links moves and oracles only: what an ability gives is the player's to take";
    else if (target.startsWith('/')) reason = checkCommand(target, cat, self);
    else if (target.startsWith('roll:')) reason = checkRoll(target.slice(5), cat);
    // Anything else (an old `scheme:` form, a bare word like `vanquish`, a
    // web address) renders as the text it was written as: refuse it.
    else
      reason = `a link's target is a command, e.g. [+1 momentum](/momentum++); this one shows as written`;
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
  const assetById = new Map();
  for (const { data } of assets)
    for (const a of data.assets ?? []) if (a.id) assetById.set(a.id, a);
  // Every content pack's party, character and global fields.
  const fields = new Map();
  const extRootDir = path.join(ROOT, 'extensions');
  if (existsSync(extRootDir))
    for (const e of await readdir(extRootDir)) {
      const f = path.join(extRootDir, e, 'extension.json');
      if (!existsSync(f)) continue;
      for (const fd of JSON.parse(await readFile(f, 'utf8')).fields ?? []) fields.set(fd.id, fd);
    }
  const cat = {
    moveIds,
    oracleKeys,
    assets: assetById,
    companions: [...assetById.values()].filter((a) => a.category === 'Companion'),
    fields,
  };

  const failures = []; // { file, item, token, reason }
  const record = (file, item, errs) => errs.forEach((e) => failures.push({ file, item, ...e }));

  // Moves — every item except the raw-HTML escape hatch (`html: true`).
  for (const { file, data } of moves)
    for (const m of data.moves ?? []) {
      if (m.html) continue;
      const errs = [];
      for (const field of [
        'trigger',
        'triggerPreamble',
        'strong',
        'weak',
        'miss',
        'notes',
        'logBody',
      ])
        scanText(m[field], cat, { strayHtml: false }, errs);
      for (const row of m.table ?? []) scanText(row.value, cat, { strayHtml: false }, errs);
      // A link to the vow or companion needs the move to ask for one.
      for (const kw of ['vow', 'companion']) {
        const text = JSON.stringify(m);
        if (text.includes(`(/${kw}.`) && m.choose !== kw)
          errs.push({
            token: `/${kw}.…`,
            reason: `links to the ${kw}: the move needs "choose": "${kw}"`,
          });
      }
      if (m.choose != null && !['vow', 'companion'].includes(m.choose))
        errs.push({ token: `choose: ${m.choose}`, reason: 'choose is "vow" or "companion"' });
      record(file, m.id, errs);
    }

  // Assets — every item except the raw-HTML escape hatch (`html: true`).
  for (const { file, data } of assets)
    for (const a of data.assets ?? []) {
      if (a.html) continue;
      const errs = [];
      // An asset's text never writes to the log: it links moves and oracles,
      // and the Moves dialog lists the abilities that name the move made.
      const opts = { strayHtml: false, self: a, verbsOnly: true };
      scanText(a.preamble, cat, opts, errs);
      scanText(a.description, cat, opts, errs);
      for (const ab of a.abilities ?? []) {
        scanText(ab.text, cat, opts, errs);
        // An ability's `log` is what marking it does once, written to the
        // asset's log entry: value links are its point, checked as a
        // move's outcome links are.
        if (ab.log !== undefined) {
          if (typeof ab.log !== 'string' || !ab.log.trim())
            errs.push({ token: 'log', reason: "an ability's log is non-empty text" });
          else scanText(ab.log, cat, { strayHtml: false, self: a }, errs);
        }
        if (ab.free !== undefined && ab.free !== true)
          errs.push({ token: `free: ${ab.free}`, reason: 'free is true or left out' });
      }
      record(file, a.id, errs);
    }

  // Oracles — validate any DSL token in a value (scheme + target checks).
  for (const { file, data } of oracles)
    for (const e of data.data ?? []) {
      const errs = [];
      for (const v of Object.values(e)) {
        scanText(v, cat, { strayHtml: false }, errs);
        // The table (oracleStore → buildTableHtml) draws a value with a
        // `roll:` blank, and every value of a compound table, as blanks
        // only: a command link beside them would show as written.
        if (typeof v !== 'string') continue;
        const blanksOnly = data.tableType === 'compound' || /\]\(roll:/.test(v);
        if (blanksOnly)
          for (const m of v.matchAll(LINK))
            if (!m[2].startsWith('roll:'))
              errs.push({
                token: m[0],
                reason:
                  data.tableType === 'compound'
                    ? "a compound table's value holds roll: blanks only: the table shows a link as written"
                    : 'a value with a roll: blank holds no other link: the table shows it as written',
              });
      }
      record(file, data.key, errs);
    }

  // Foes and delve tables — plain text, no markdown links: a link would show
  // as written.
  for (const kind of ['foes', 'delve'])
    for (const { file, data } of await loadAll(kind))
      walkStrings(data, (s, where) => {
        for (const m of s.matchAll(LINK))
          failures.push({
            file,
            item: where,
            token: m[0],
            reason: `${kind === 'foes' ? 'foe' : 'delve-table'} text is plain: a link shows as written`,
          });
      });

  // Blanket guard — NO raw HTML anywhere in content data. Every content kind,
  // every nested string (so overrides, rarities, foe drives/tactics, delve
  // tables are all covered). Markup is markdown with command links — never
  // HTML. `html: true` items still opt out (handled in walkStrings).
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
