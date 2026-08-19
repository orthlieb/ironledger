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
import { readFile, writeFile, readdir, copyFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const EXT_ROOT = path.join(REPO, 'extensions');
const DATA = path.join(REPO, 'apps/api/data'); // legacy base/delve content
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
const CONTENT_DIRS = ['moves', 'oracles', 'foes', 'assets'];

const readJson = async (p) => JSON.parse(await readFile(p, 'utf-8'));
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
      // Move / oracle categories introduced by this extension — icon, tint,
      // and picker-order slot. Merged client-side across enabled extensions
      // (see extensionCategories.svelte.ts); first-declared wins on duplicate
      // key so extensions that only add moves to an existing category don't
      // redeclare it. Passed through unchanged so the manifest is the source
      // of truth (no app-side hardcoded MOVE_CAT_ICON / CATEGORY_COLORS maps).
      ...(meta[id].moveCategories?.length ? { moveCategories: meta[id].moveCategories } : {}),
      ...(meta[id].oracleCategories?.length ? { oracleCategories: meta[id].oracleCategories } : {}),
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
