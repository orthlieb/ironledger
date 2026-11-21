/**
 * Build-time extensions manifest generator.
 *
 * Emits apps/api/data/extensions.manifest.json — the single source of truth for
 * which content files the catalogue loader reads, replacing hard-coded filename
 * lists. Each extension entry carries a repo-relative `root` and `provides`
 * paths relative to that root.
 *
 * Two content layouts are supported during the migration:
 *   • Self-contained (Phase 3+): extensions/<id>/{moves,oracles,foes,assets,cultures}/…
 *     — everything the extension owns lives in its folder (root = extensions/<id>).
 *   • Legacy (base only): core content still in apps/api/data/, type-organised
 *     and tagged by filename / category / source (root = apps/api/data). Delve,
 *     Lodestar and YRT are all self-contained under extensions/<id>/.
 *
 * An extension is "self-contained" iff extensions/<id>/ has any content
 * subfolder; otherwise it's read from apps/api/data by source id (only base
 * is legacy now).
 *
 *   node scripts/gen-extensions-manifest.mjs         # write the manifest
 *   node scripts/gen-extensions-manifest.mjs --check # fail if out of date (CI)
 *
 * Deterministic output (no timestamps) so regeneration is a no-op in git.
 */
import { readFile, writeFile, readdir, copyFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// From source, not the built package: this runs before packages/shared is
// built (CI's manifest check, the API's prebuild).
import { parseCondition, conditionTests } from '../packages/shared/src/condition.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const EXT_ROOT = path.join(REPO, 'extensions');
const DATA = path.join(REPO, 'apps/api/data'); // legacy base (core) content
const DATA_REL = 'apps/api/data';
const OUT = path.join(DATA, 'extensions.manifest.json');
// Foe images are served as static files at /foes/<name>; nginx/adapter serve
// them from the built static dir, so extension foe images must physically land
// here. Source of truth stays in extensions/<id>/foes/images/; we copy them in
// at build and gitignore the copies (the .gitignore below is the committed
// record of which files are extension-owned).
const STATIC_FOES = path.join(REPO, 'apps/web/static/foes');

/** Filename source token → extension id (assets_ironsworn → base). */
const ALIAS = { ironsworn: 'base', delve: 'delve', yrt: 'yrt' };
const CONTENT_DIRS = ['moves', 'oracles', 'foes', 'assets', 'delve', 'cultures'];

const readJson = async (p) => JSON.parse(await readFile(p, 'utf-8'));

/** Names a condition reads (docs/command-language.md → Conditions), as
 *  apps/web/src/lib/preconditions.ts answers them. A field can't take one as
 *  its id, nor a keyword. Keep in step with preconditions.ts. */
const CONTEXT_NAMES = new Set(['character', 'foe', 'journey', 'site', 'scene']);
const NUMBER_NAMES = new Set([
  'momentum',
  'health',
  'spirit',
  'supply',
  'xp',
  'edge',
  'heart',
  'iron',
  'shadow',
  'wits',
  'vowCount',
  'assetCount',
  'companionCount',
  'rarityCount',
]);
const TRACK_NAMES = new Set(['bonds', 'failures']);
const DEBILITY_NAMES = new Set([
  'wounded',
  'shaken',
  'unprepared',
  'encumbered',
  'maimed',
  'corrupted',
  'cursed',
  'tormented',
]);
const INITIATIVE = ['none', 'me', 'foe'];
const RESERVED_NAMES = new Set([
  ...CONTEXT_NAMES,
  ...NUMBER_NAMES,
  ...TRACK_NAMES,
  ...DEBILITY_NAMES,
  'initiative',
  'self',
  'vow',
  'companion',
  'companions',
  'allies',
  'everyone',
  'me',
  'party',
  'harm',
]);

/** What a name in a condition reads, for checking a comparison against it:
 *  `{ kind, options? }` where options are a list's option ids and labels. */
function fieldKind(f) {
  // A custom value has no place in the options' order: only "chosen?".
  if (f.custom) return { kind: 'chosen' };
  if (f.type === 'counter') return { kind: 'number' };
  if (f.type === 'switch') return { kind: 'bool' };
  if (f.type === 'dropdown' || f.type === 'radio')
    return {
      kind: 'list',
      options: (f.options ?? []).flatMap((o) => [String(o.id), String(o.label).toLowerCase()]),
      choices: (f.options ?? []).map((o) => o.id).join(', '),
    };
  return { kind: 'text' };
}

/**
 * Check one condition expression (docs/command-language.md → Conditions);
 * throws on the first problem, with its position in the string. `resolve`
 * says what a test's name reads, or returns null for an unknown name.
 */
function checkCondition(src, at, resolve) {
  if (typeof src !== 'string')
    throw new Error(`${at}: a condition is an expression string, e.g. "character & foe"`);
  const r = parseCondition(src);
  if (!r.ok) throw new Error(`${at}: condition "${src}": ${r.error} (at ${r.at})`);
  for (const t of conditionTests(r.node)) {
    const name = t.owner ? `${t.owner}.${t.name}` : t.name;
    const here = `${at}: condition "${src}", "${name}" (at ${t.at})`;
    const what = resolve(t, here);
    if (!t.op) continue;
    const lv = t.level;
    switch (what.kind) {
      case 'context':
      case 'asset':
      case 'bool':
      case 'text':
        throw new Error(`${here} can't be compared: name it alone, or with ! for "not"`);
      case 'chosen':
        throw new Error(
          `${here} takes custom values, which have no order: test only whether one is chosen (name it alone, or with !)`,
        );
      case 'initiative':
        if (lv.kind !== 'word' || !INITIATIVE.includes(lv.word))
          throw new Error(`${here}: initiative compares with none, me or foe`);
        if (t.op !== '==' && t.op !== '!=') throw new Error(`${here}: initiative takes == or !=`);
        break;
      case 'number':
        if (lv.kind !== 'number' || lv.unit)
          throw new Error(`${here} is a number: compare it with a plain number`);
        break;
      case 'track':
        if (lv.kind !== 'number')
          throw new Error(`${here} is a track: compare it with a number (b boxes, t ticks)`);
        break;
      case 'list':
        if (lv.kind !== 'word' || !what.options.includes(lv.word.toLowerCase()))
          throw new Error(
            `${here} is a list: compare it with one of its options (${what.choices})`,
          );
        break;
    }
  }
}

/**
 * Check every `preconditions` expression in an extension's moves, move
 * overrides and assets (docs/command-language.md → Conditions); throws on
 * the first problem. A name is a context keyword, initiative, a stat, a
 * track, a debility, a count, a character field, a global counter, or an
 * asset's id, with `self.<field>` and `<asset id>.<field>` for an asset's
 * own fields. An asset is never named by its display name: a name can read
 * differently from one language, or one content pack's rename, to another,
 * so preconditions.ts matches ids only.
 */
function validatePreconditions(where, data, fields, assets) {
  const byName = new Map([...assets.values()].map((a) => [a.name, a.id]));
  /** An asset's own field, by the asset (or `self`'s) definition; one that
   *  refers to a global field reads that. */
  const assetField = (asset, t, here) => {
    const cf = (asset?.customFields ?? []).find((f) => (f.field ?? f.id) === t.name);
    if (!cf) throw new Error(`${here}: ${asset?.id ?? t.owner} has no field "${t.name}"`);
    return fieldKind(cf.field ? fields.get(cf.field) : cf);
  };
  const check = (src, at, self) =>
    checkCondition(src, at, (t, here) => {
      if (t.owner) {
        if (t.owner === 'self') {
          if (!self) throw new Error(`${here}: self is an asset's own; this isn't an asset`);
          return assetField(self, t, here);
        }
        if (!assets.has(t.owner)) throw new Error(`${here}: "${t.owner}" isn't an asset id`);
        return assetField(assets.get(t.owner), t, here);
      }
      const key = t.name;
      if (CONTEXT_NAMES.has(key)) return { kind: 'context' };
      if (key === 'initiative') return { kind: 'initiative' };
      if (NUMBER_NAMES.has(key)) return { kind: 'number' };
      if (TRACK_NAMES.has(key)) return { kind: 'track' };
      if (DEBILITY_NAMES.has(key)) return { kind: 'bool' };
      const field = fields.get(key);
      if (field) return fieldKind(field);
      if (assets.has(key)) return { kind: 'asset' };
      if (byName.has(key))
        throw new Error(`${here} names an asset by its name; use its id, "${byName.get(key)}"`);
      throw new Error(`${here} is neither a built-in name, a declared field, nor an asset id`);
    });
  const walk = (node, at) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, at));
    if (!node || typeof node !== 'object') return;
    const here = typeof node.id === 'string' ? `${where}: ${node.id}` : at;
    // An asset (its id is in the catalogue) is `self` to its own conditions.
    const self = typeof node.id === 'string' && assets.get(node.id) === node ? node : null;
    for (const [k, v] of Object.entries(node)) {
      if (k === 'preconditions') check(v, here, self);
      else walk(v, here);
    }
  };
  walk(data, where);
}

/** The character field types: the same as an asset's custom fields. */
const FIELD_TYPES = ['dropdown', 'radio', 'string', 'counter', 'switch', 'markdown'];

/** Whose a declared field's value is. An asset's own fields are `asset`. */
const SCOPES = ['party', 'character', 'global'];

/** An option id from its label: lower case, each run of other characters a
 *  `-` ("Oray Hills" → "oray-hills"). Same rule as the web's optionId(). */
const optionId = (label) =>
  String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Check each extension's `fields` and `fieldsHeading`
 * (docs/character-fields.md, docs/command-language.md → Declaring fields);
 * throws on the first problem. `oracles` maps an oracle key to its owning
 * extension and file contents; `core` holds base's fields, which any
 * extension's fields may depend on, since base is always on. Returns this
 * extension's fields by id.
 */
function validateCharacterFields(id, m, oracles, core = new Map()) {
  const where = `extensions/${id}/extension.json`;
  if (m.characterFields !== undefined || m.characterFieldsHeading !== undefined)
    throw new Error(
      `${where}: characterFields and characterFieldsHeading are now fields and fieldsHeading`,
    );
  const h = m.fieldsHeading;
  if (h !== undefined && h !== false && !(typeof h === 'string' && h.trim()))
    throw new Error(`${where}: fieldsHeading must be false or a non-empty string`);
  const fields = m.fields;
  if (fields === undefined) return new Map();
  if (!Array.isArray(fields)) throw new Error(`${where}: fields must be an array`);
  /** An oracle this extension may use: its own, or base's. */
  const oracle = (key, what) => {
    const o = oracles.get(key);
    if (!o || (o.owner !== id && o.owner !== 'base'))
      throw new Error(
        `${where}: ${what} names oracle "${key}", which neither ${id} nor base provides`,
      );
    return o.data;
  };
  const declared = new Map();
  for (const f of fields) {
    if (!f || typeof f !== 'object') throw new Error(`${where}: each field is an object`);
    const at = `${where}: field "${f.id}"`;
    if (typeof f.id !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(f.id))
      throw new Error(`${where}: field id "${f.id}" must be camelCase`);
    // Whose the value is: party (every character), character, or global
    // (one per character, shared by the assets that refer to it).
    if (f.scope !== undefined && !SCOPES.includes(f.scope))
      throw new Error(`${at}: scope must be one of ${SCOPES.map((x) => `"${x}"`).join(', ')}`);
    if (f.writable !== undefined && typeof f.writable !== 'boolean')
      throw new Error(`${at}: writable must be true or false`);
    if (f.custom !== undefined && (f.custom !== true || f.type !== 'dropdown'))
      throw new Error(`${at}: custom is true or left out, and only on a dropdown`);
    if (f.scope === 'global') {
      // Shown on the assets that refer to it, not the Details tab.
      if (f.type !== 'counter' && f.type !== 'switch')
        throw new Error(`${at}: a global field is a counter or a switch`);
      for (const k of ['roll', 'if', 'placeholder'])
        if (f[k] !== undefined) throw new Error(`${at}: a global field has no ${k}`);
    } else {
      for (const k of ['shortLabel', 'icon'])
        if (f[k] !== undefined) throw new Error(`${at}: only a global field has a ${k}`);
    }
    if (RESERVED_NAMES.has(f.id))
      throw new Error(`${at}: the id is a built-in name or keyword in conditions`);
    if (declared.has(f.id)) throw new Error(`${at}: declared twice`);
    if (typeof f.label !== 'string' || !f.label.trim())
      throw new Error(`${at}: label must be a non-empty string`);
    // The asset custom field types (docs/data-schema.md, Custom Fields).
    if (!FIELD_TYPES.includes(f.type))
      throw new Error(`${at}: type must be one of ${FIELD_TYPES.map((t) => `"${t}"`).join(', ')}`);
    if (typeof f.default !== 'string') throw new Error(`${at}: default must be a string`);
    const choice = f.type === 'dropdown' || f.type === 'radio';
    /** A choice's option ids, for checking conditions that compare with them. */
    let optionIds = null;
    if (!choice && (f.options !== undefined || f.optionsFrom !== undefined))
      throw new Error(`${at}: only a dropdown or radio has options`);
    if (f.maxValue !== undefined && f.type !== 'counter')
      throw new Error(`${at}: only a counter has a maxValue`);
    if (f.type === 'counter') {
      if (!Number.isInteger(f.maxValue) || f.maxValue < 1)
        throw new Error(`${at}: a counter needs a whole maxValue of 1 or more`);
      const n = Number(f.default);
      if (f.default === '' || !Number.isInteger(n) || n < 0 || n > f.maxValue)
        throw new Error(`${at}: a counter's default must be a whole number from 0 to maxValue`);
    } else if (f.type === 'switch') {
      if (f.default !== '0' && f.default !== '1')
        throw new Error(`${at}: a switch's default must be "0" or "1"`);
      if (f.roll !== undefined) throw new Error(`${at}: a switch can't roll`);
    } else if (choice) {
      if ((f.options === undefined) === (f.optionsFrom === undefined))
        throw new Error(`${at}: give options or optionsFrom, not both or neither`);
      let ids;
      if (f.options !== undefined) {
        if (!Array.isArray(f.options)) throw new Error(`${at}: options must be an array`);
        for (const o of f.options)
          if (typeof o?.id !== 'string' || !o.id || typeof o?.label !== 'string' || !o.label)
            throw new Error(`${at}: each option needs a non-empty id and label`);
        ids = f.options.map((o) => o.id);
      } else {
        const prop = f.optionsFrom?.label ?? 'value';
        const rows = oracle(f.optionsFrom?.oracle, 'optionsFrom').data ?? [];
        ids = rows.map((r) => optionId(typeof r[prop] === 'string' ? r[prop] : ''));
        if (ids.some((i) => !i))
          throw new Error(`${at}: a row of "${f.optionsFrom.oracle}" has no "${prop}" to label it`);
      }
      if (ids.length < 2) throw new Error(`${at}: needs at least two options`);
      if (new Set(ids).size !== ids.length) throw new Error(`${at}: repeats an option id`);
      if (f.default !== '' && !ids.includes(f.default))
        throw new Error(`${at}: default "${f.default}" is neither an option id nor ""`);
      optionIds = ids;
    }
    /** A field a condition can read (not text), declared above this one, in
     *  this extension or base. */
    const above = (key, what) => {
      const d = declared.get(key) ?? core.get(key);
      if (!d)
        throw new Error(
          `${at}: ${what} names "${key}", which isn't declared above it in ${id} or in base`,
        );
      if (d.type === 'string' || d.type === 'markdown')
        throw new Error(`${at}: ${what} names "${key}", a text field`);
      return d;
    };
    if (f.if !== undefined)
      checkCondition(f.if, `${at}: if`, (t, here) => {
        if (t.owner) throw new Error(`${here}: a field's if reads other fields, by id`);
        return fieldKind(above(t.name, 'if'));
      });
    if (f.roll !== undefined) {
      const rolled = oracle(f.roll?.oracle, 'roll');
      if (f.roll.column !== undefined) {
        const by = above(f.roll.column?.field, 'roll.column');
        if (by.type !== 'dropdown' && by.type !== 'radio')
          throw new Error(`${at}: roll.column names "${by.id}", which isn't a dropdown or radio`);
        if (typeof f.roll.column.from !== 'string' || !f.roll.column.from)
          throw new Error(`${at}: roll.column.from must name a property`);
        if (rolled.tableType !== 'columnSelect')
          throw new Error(`${at}: roll.column needs a columnSelect oracle`);
      }
    }
    // An optionsFrom field's options are its oracle's rows: keep their ids, so
    // a condition that compares with one can be checked.
    declared.set(
      f.id,
      optionIds && !f.options ? { ...f, options: optionIds.map((i) => ({ id: i, label: i })) } : f,
    );
  }
  return declared;
}
const listJson = async (dir) =>
  existsSync(dir) ? (await readdir(dir)).filter((f) => f.endsWith('.json')).sort() : [];

const emptyProvides = () => ({
  assets: [],
  moves: [],
  moveOverrides: [],
  oracles: [],
  foes: [],
  foeOverrides: [],
  delveTables: [],
  // Settlement-builder cultures (one JSON per culture) — see
  // apps/web/src/lib/settlement-kit/ and docs/campaign-map.md.
  cultures: [],
});

/** Provides for a self-contained extension dir (extensions/<id>/…). */
async function selfContainedProvides(root) {
  const p = emptyProvides();
  for (const f of await listJson(path.join(root, 'moves'))) {
    // moves/overrides.json patches base moves (hide/replace), like foes/overrides.json.
    if (f === 'overrides.json') p.moveOverrides.push(`moves/${f}`);
    else p.moves.push(`moves/${f}`);
  }
  for (const f of await listJson(path.join(root, 'oracles'))) p.oracles.push(`oracles/${f}`);
  for (const f of await listJson(path.join(root, 'assets'))) p.assets.push(`assets/${f}`);
  for (const f of await listJson(path.join(root, 'foes'))) {
    if (f === 'overrides.json') p.foeOverrides.push(`foes/${f}`);
    else p.foes.push(`foes/${f}`);
  }
  for (const f of await listJson(path.join(root, 'delve'))) p.delveTables.push(`delve/${f}`);
  for (const f of await listJson(path.join(root, 'cultures'))) p.cultures.push(`cultures/${f}`);
  return p;
}

/** Provides for the legacy base (core) content in apps/api/data, by source id. */
async function legacyProvides(ids) {
  const byId = Object.fromEntries(ids.map((id) => [id, emptyProvides()]));
  const orphans = [];
  const put = (id, type, rel) => {
    if (byId[id]) byId[id][type].push(rel);
  };

  for (const f of await listJson(path.join(DATA, 'assets'))) {
    const id = ALIAS[f.match(/^assets_(.+)\.json$/)?.[1]];
    if (id) put(id, 'assets', `assets/${f}`);
    else orphans.push(`assets/${f}`);
  }
  for (const f of await listJson(path.join(DATA, 'moves'))) {
    const cat = (await readJson(path.join(DATA, 'moves', f))).category;
    put(cat === 'Delve' ? 'delve' : cat === 'Yrt' ? 'yrt' : 'base', 'moves', `moves/${f}`);
  }
  for (const f of await listJson(path.join(DATA, 'oracles'))) {
    const src = (await readJson(path.join(DATA, 'oracles', f))).source ?? 'base';
    put(src, 'oracles', `oracles/${f}`);
  }
  for (const f of await listJson(path.join(DATA, 'foes'))) {
    const ov = f.match(/^foes_overrides_(.+)\.json$/);
    if (ov) put(ALIAS[ov[1]], 'foeOverrides', `foes/${f}`);
    else {
      const id = ALIAS[f.match(/^foes_(.+)\.json$/)?.[1]];
      if (id) put(id, 'foes', `foes/${f}`);
      else orphans.push(`foes/${f}`);
    }
  }
  for (const f of await listJson(path.join(DATA, 'cultures'))) {
    const src = (await readJson(path.join(DATA, 'cultures', f))).source ?? 'base';
    put(src, 'cultures', `cultures/${f}`);
  }
  return { byId, orphans };
}

async function build() {
  const ids = (await readdir(EXT_ROOT, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const meta = {};
  for (const id of ids) {
    const m = await readJson(path.join(EXT_ROOT, id, 'extension.json'));
    if (m.id !== id) throw new Error(`extension.json id "${m.id}" ≠ folder "${id}"`);
    // Validate the optional infoLink field (one wiki / doc pointer that lands
    // in the Hamburger → Info submenu while this extension is enabled).
    if (m.infoLink !== undefined) {
      if (typeof m.infoLink !== 'object' || m.infoLink === null || Array.isArray(m.infoLink)) {
        throw new Error(`extensions/${id}/extension.json: infoLink must be an object`);
      }
      if (typeof m.infoLink.label !== 'string' || !m.infoLink.label.trim()) {
        throw new Error(
          `extensions/${id}/extension.json: infoLink.label must be a non-empty string`,
        );
      }
      if (typeof m.infoLink.url !== 'string' || !/^https?:\/\//.test(m.infoLink.url)) {
        throw new Error(`extensions/${id}/extension.json: infoLink.url must be an http(s) URL`);
      }
    }
    meta[id] = m;
  }

  // Which extensions are self-contained (have content in their own folder)?
  const selfContained = new Set();
  for (const id of ids)
    if (CONTENT_DIRS.some((d) => existsSync(path.join(EXT_ROOT, id, d)))) selfContained.add(id);

  // Legacy content (apps/api/data) is assigned to the non-self-contained ids.
  const legacyIds = ids.filter((id) => !selfContained.has(id));
  const { byId: legacy, orphans } = await legacyProvides(legacyIds);
  if (orphans.length)
    console.warn(`⚠ ignored ${orphans.length} non-catalogue file(s):\n  ${orphans.join('\n  ')}`);

  const entries = [];
  for (const id of ids) {
    const root = selfContained.has(id) ? `extensions/${id}` : DATA_REL;
    const provides = selfContained.has(id)
      ? await selfContainedProvides(path.join(EXT_ROOT, id))
      : legacy[id];
    entries.push({
      id,
      name: meta[id].name,
      description: meta[id].description,
      defaultEnabled: meta[id].defaultEnabled,
      order: meta[id].order,
      // Dev-only extensions ship in dev/test but are stripped from production
      // builds (see the write step below).
      ...(meta[id].dev ? { dev: true } : {}),
      // Oracle keys this extension hides from the picker when enabled. Used by
      // supersession pairs (e.g. Lodestar's Core: Descriptor/Focus supersede
      // Delve's Feature Aspect/Focus).
      ...(meta[id].suppressesOracles?.length
        ? { suppressesOracles: [...meta[id].suppressesOracles].sort() }
        : {}),
      // Base-oracle-key → replacement-key rewrites applied while this
      // extension is enabled. Client-side resolveOracleKey walks enabled
      // extensions in manifest order and returns the first replacement;
      // the base key is also implicitly suppressed from the picker.
      ...(meta[id].supersedesOracles && Object.keys(meta[id].supersedesOracles).length
        ? {
            supersedesOracles: Object.fromEntries(
              Object.entries(meta[id].supersedesOracles).sort(([a], [b]) => (a < b ? -1 : 1)),
            ),
          }
        : {}),
      // Culture-key → replacement-key rewrites applied while this extension
      // is enabled (e.g. YRT's `elves` → `verdani`). The settlement builder
      // offers the replacement instead, and markers that reference the base
      // culture draw with it.
      ...(meta[id].supersedesCultures && Object.keys(meta[id].supersedesCultures).length
        ? {
            supersedesCultures: Object.fromEntries(
              Object.entries(meta[id].supersedesCultures).sort(([a], [b]) => (a < b ? -1 : 1)),
            ),
          }
        : {}),
      // Move / oracle categories introduced by this extension — icon, tint,
      // and picker-order slot. Merged client-side across enabled extensions
      // (see extensionCategories.svelte.ts); first-declared wins on duplicate
      // key so extensions that only add moves to an existing category don't
      // redeclare it. Passed through unchanged so the manifest is the source
      // of truth (no app-side hardcoded MOVE_CAT_ICON / CATEGORY_COLORS maps).
      ...(meta[id].moveCategories?.length ? { moveCategories: meta[id].moveCategories } : {}),
      ...(meta[id].oracleCategories?.length ? { oracleCategories: meta[id].oracleCategories } : {}),
      // Optional pointer to this extension's reference wiki/documentation.
      // Consumed by the Hamburger → Info submenu (HamburgerMenu.svelte): one
      // link per enabled extension carrying an infoLink.
      ...(meta[id].infoLink ? { infoLink: meta[id].infoLink } : {}),
      // Fields this extension adds to a character, and the heading over them
      // on the sheet (docs/character-fields.md). Checked below.
      ...(meta[id].fields?.length ? { fields: meta[id].fields } : {}),
      ...(meta[id].fieldsHeading !== undefined ? { fieldsHeading: meta[id].fieldsHeading } : {}),
      root,
      provides: Object.fromEntries(
        Object.entries(provides)
          .filter(([, v]) => v.length)
          .map(([k, v]) => [k, v.sort()]),
      ),
    });
  }
  entries.sort((a, b) => a.order - b.order);

  // Character fields: each checked against the oracles its extension (or
  // base) provides; a field id is unique across all extensions.
  const oracles = new Map();
  for (const e of entries)
    for (const rel of e.provides.oracles ?? []) {
      const data = await readJson(path.join(REPO, e.root, rel));
      if (data.key) oracles.set(data.key, { owner: e.id, data });
    }
  const fieldOwner = new Map();
  const allFields = new Map();
  let core = new Map();
  for (const e of entries) {
    const declared = validateCharacterFields(e.id, meta[e.id], oracles, core);
    if (e.id === 'base') core = declared;
    for (const [fid, f] of declared) {
      if (fieldOwner.has(fid))
        throw new Error(
          `character field "${fid}" is declared by both ${fieldOwner.get(fid)} and ${e.id}`,
        );
      fieldOwner.set(fid, e.id);
      allFields.set(fid, f);
    }
  }

  // Preconditions: each key names something that exists (see
  // validatePreconditions), checked across every extension's content.
  const assets = new Map();
  for (const e of entries)
    for (const rel of e.provides.assets ?? [])
      for (const a of (await readJson(path.join(REPO, e.root, rel))).assets ?? [])
        if (typeof a?.id === 'string') assets.set(a.id, a);

  // An asset's fields: one that refers to a global field (`{ "field":
  // "mana" }`) names one declared by its own pack or base, and takes its
  // type, range and look from that declaration; `"global": true` is gone.
  for (const e of entries)
    for (const rel of e.provides.assets ?? [])
      for (const a of (await readJson(path.join(REPO, e.root, rel))).assets ?? [])
        for (const cf of a.customFields ?? []) {
          const at = `${e.root}/${rel}: ${a.id}`;
          if (cf.global !== undefined)
            throw new Error(
              `${at}: field "${cf.id}": "global" is gone; declare the field once in extension.json fields with "scope": "global" and refer to it: { "field": "${cf.id}" }`,
            );
          if (cf.writable !== undefined && typeof cf.writable !== 'boolean')
            throw new Error(`${at}: field "${cf.id ?? cf.field}": writable must be true or false`);
          if (cf.field === undefined) continue;
          const g = allFields.get(cf.field);
          if (!g || g.scope !== 'global')
            throw new Error(`${at}: { "field": "${cf.field}" } names no global field`);
          const owner = fieldOwner.get(cf.field);
          if (owner !== e.id && owner !== 'base')
            throw new Error(
              `${at}: { "field": "${cf.field}" } is declared by ${owner}; an asset refers to its own pack's or base's`,
            );
          for (const k of ['id', 'type', 'maxValue', 'default', 'icon', 'shortLabel', 'writable'])
            if (cf[k] !== undefined)
              throw new Error(
                `${at}: { "field": "${cf.field}" } takes its ${k} from the declaration`,
              );
        }
  for (const e of entries)
    for (const kind of ['moves', 'moveOverrides', 'assets'])
      for (const rel of e.provides[kind] ?? [])
        validatePreconditions(
          `${e.root}/${rel}`,
          await readJson(path.join(REPO, e.root, rel)),
          allFields,
          assets,
        );

  return {
    $comment:
      'GENERATED by scripts/gen-extensions-manifest.mjs — do not edit by hand. `root` is repo-relative; `provides` paths are relative to it.',
    extensions: entries,
  };
}

/** All extension foe images: [{abs, name}], sorted by name. */
async function extensionFoeImages() {
  const ids = (await readdir(EXT_ROOT, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const out = [];
  for (const id of ids) {
    const dir = path.join(EXT_ROOT, id, 'foes/images');
    if (!existsSync(dir)) continue;
    for (const name of (await readdir(dir)).filter((f) => /\.(webp|png|jpe?g)$/i.test(f)))
      out.push({ abs: path.join(dir, name), name });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Committed .gitignore for apps/web/static/foes — records the extension-owned
 *  (build-copied) images so git ignores the copies but tracks base images. */
function foeImageGitignore(names) {
  return (
    '# GENERATED by scripts/gen-extensions-manifest.mjs — do not edit.\n' +
    '# Extension foe images copied here at build from extensions/*/foes/images/.\n' +
    '# The .webp themselves are build artifacts; their source of truth is the\n' +
    '# extension folder. Base/Delve foe images are tracked normally.\n' +
    names.map((n) => n).join('\n') +
    (names.length ? '\n' : '')
  );
}

const manifest = await build();
// Canonical (committed) manifest includes every extension, incl. dev-only ones,
// so dev + CI (`--check`) see the same file. A production build strips dev-only
// extensions so they never ship (no toggle, no content). Their icons/foe images
// may still bundle as harmless unused artifacts.
const canonical = JSON.stringify(manifest, null, 2) + '\n';
const isProd = process.env.NODE_ENV === 'production';
const forWrite = isProd
  ? JSON.stringify(
      { ...manifest, extensions: manifest.extensions.filter((e) => !e.dev) },
      null,
      2,
    ) + '\n'
  : canonical;
const images = await extensionFoeImages();
const gitignore = foeImageGitignore(images.map((i) => i.name));
const GITIGNORE = path.join(STATIC_FOES, '.gitignore');

if (process.argv.includes('--check')) {
  const read = async (p) => {
    try {
      return await readFile(p, 'utf-8');
    } catch {
      return '';
    }
  };
  const stale = [];
  // --check always validates the canonical (all-extensions) form.
  if ((await read(OUT)) !== canonical) stale.push('extensions.manifest.json');
  if ((await read(GITIGNORE)) !== gitignore) stale.push('apps/web/static/foes/.gitignore');
  if (stale.length) {
    console.error(
      `out of date — run: node scripts/gen-extensions-manifest.mjs\n  ${stale.join('\n  ')}`,
    );
    process.exit(1);
  }
  console.log('extensions.manifest.json + foe-image .gitignore are up to date.');
} else {
  await writeFile(OUT, forWrite);
  // Copy extension foe images into the served static dir + record them.
  await mkdir(STATIC_FOES, { recursive: true });
  for (const { abs, name } of images) await copyFile(abs, path.join(STATIC_FOES, name));
  await writeFile(GITIGNORE, gitignore);
  const written = isProd
    ? manifest.extensions.filter((e) => !e.dev).length
    : manifest.extensions.length;
  console.log(
    `wrote ${path.relative(REPO, OUT)} (${written} extensions${isProd ? ', production: dev-only stripped' : ''}); ` +
      `copied ${images.length} extension foe image(s) → apps/web/static/foes/`,
  );
}
