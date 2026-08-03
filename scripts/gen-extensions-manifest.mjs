/**
 * Build-time extensions manifest generator.
 *
 * Emits apps/api/data/extensions.manifest.json — the single source of truth for
 * which content files the catalogue loader reads, replacing hard-coded filename
 * lists. Each extension entry carries a repo-relative `root` and `provides`
 * paths relative to that root.
 *
 * Two content layouts are supported during the migration:
 *   • Self-contained (Phase 3+): extensions/<id>/{moves,oracles,foes,assets}/…
 *     — everything the extension owns lives in its folder (root = extensions/<id>).
 *   • Legacy (base, delve): content still in apps/api/data/, type-organised and
 *     tagged by filename / category / source (root = apps/api/data).
 *
 * An extension is "self-contained" iff extensions/<id>/ has any content
 * subfolder; otherwise it's read from apps/api/data by source id.
 *
 *   node scripts/gen-extensions-manifest.mjs         # write the manifest
 *   node scripts/gen-extensions-manifest.mjs --check # fail if out of date (CI)
 *
 * Deterministic output (no timestamps) so regeneration is a no-op in git.
 */
import { readFile, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const EXT_ROOT = path.join(REPO, 'extensions');
const DATA = path.join(REPO, 'apps/api/data'); // legacy base/delve content
const DATA_REL = 'apps/api/data';
const OUT = path.join(DATA, 'extensions.manifest.json');

/** Filename source token → extension id (assets_ironsworn → base). */
const ALIAS = { ironsworn: 'base', delve: 'delve', yrt: 'yrt' };
const CONTENT_DIRS = ['moves', 'oracles', 'foes', 'assets'];

const readJson = async (p) => JSON.parse(await readFile(p, 'utf-8'));
const listJson = async (dir) =>
  existsSync(dir) ? (await readdir(dir)).filter((f) => f.endsWith('.json')).sort() : [];

const emptyProvides = () => ({
  assets: [],
  moves: [],
  oracles: [],
  foes: [],
  foeOverrides: [],
  delveTables: [],
});

/** Provides for a self-contained extension dir (extensions/<id>/…). */
async function selfContainedProvides(root) {
  const p = emptyProvides();
  for (const f of await listJson(path.join(root, 'moves'))) p.moves.push(`moves/${f}`);
  for (const f of await listJson(path.join(root, 'oracles'))) p.oracles.push(`oracles/${f}`);
  for (const f of await listJson(path.join(root, 'assets'))) p.assets.push(`assets/${f}`);
  for (const f of await listJson(path.join(root, 'foes'))) {
    if (f === 'overrides.json') p.foeOverrides.push(`foes/${f}`);
    else p.foes.push(`foes/${f}`);
  }
  return p;
}

/** Provides for the legacy base/delve content in apps/api/data, by source id. */
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
  for (const f of await listJson(path.join(DATA, 'delve')))
    put('delve', 'delveTables', `delve/${f}`);

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
      root,
      provides: Object.fromEntries(
        Object.entries(provides)
          .filter(([, v]) => v.length)
          .map(([k, v]) => [k, v.sort()]),
      ),
    });
  }
  entries.sort((a, b) => a.order - b.order);

  return {
    $comment:
      'GENERATED by scripts/gen-extensions-manifest.mjs — do not edit by hand. `root` is repo-relative; `provides` paths are relative to it.',
    extensions: entries,
  };
}

const manifest = await build();
const json = JSON.stringify(manifest, null, 2) + '\n';

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = await readFile(OUT, 'utf-8');
  } catch {
    /* missing → out of date */
  }
  if (current !== json) {
    console.error(
      'extensions.manifest.json is out of date — run: node scripts/gen-extensions-manifest.mjs',
    );
    process.exit(1);
  }
  console.log('extensions.manifest.json is up to date.');
} else {
  await writeFile(OUT, json);
  console.log(`wrote ${path.relative(REPO, OUT)} (${manifest.extensions.length} extensions)`);
}
