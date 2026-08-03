/**
 * Build-time extensions manifest generator (Phase 1).
 *
 * Emits apps/api/data/extensions.manifest.json — the single source of truth for
 * which content files the catalogue loader reads, replacing the hard-coded
 * filename lists in apps/api/src/routes/catalogue.ts.
 *
 * Phase 1 keeps all content in apps/api/data/ (nothing moves). The generator
 * reads the per-extension metadata from extensions/<id>/extension.json, scans
 * the current data dir, and assigns every content file to an extension by
 * filename / source tag. It asserts full, non-overlapping coverage — the seed
 * of the build lint (spec §10). In Phase 3 the scan root swaps to extensions/*
 * and the manifest paths become extension-relative; the loader is unchanged.
 *
 *   node scripts/gen-extensions-manifest.mjs         # write the manifest
 *   node scripts/gen-extensions-manifest.mjs --check # fail if out of date (CI)
 *
 * Deterministic output (no timestamps) so regeneration is a no-op in git.
 */
import { readFile, writeFile, readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const EXT_ROOT = path.join(REPO, 'extensions');
const DATA = path.join(REPO, 'apps/api/data'); // Phase 1: content lives here
const OUT = path.join(DATA, 'extensions.manifest.json');

/** Filename source token → extension id (assets_ironsworn → base). */
const ALIAS = { ironsworn: 'base', delve: 'delve', yrt: 'yrt' };

const readJson = async (p) => JSON.parse(await readFile(p, 'utf-8'));
const jsonFiles = async (dir) =>
  (await readdir(path.join(DATA, dir))).filter((f) => f.endsWith('.json')).sort();

async function build() {
  // --- extension metadata -------------------------------------------------
  const ids = (await readdir(EXT_ROOT, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const meta = {};
  for (const id of ids) {
    const m = await readJson(path.join(EXT_ROOT, id, 'extension.json'));
    if (m.id !== id) throw new Error(`extension.json id "${m.id}" ≠ folder "${id}"`);
    meta[id] = m;
  }

  // provides accumulator per extension
  const provides = Object.fromEntries(
    ids.map((id) => [
      id,
      { assets: [], moves: [], oracles: [], foes: [], foeOverrides: [], delveTables: [] },
    ]),
  );
  const assign = (id, type, rel) => {
    if (!provides[id]) throw new Error(`content assigned to unknown extension "${id}": ${rel}`);
    provides[id][type].push(rel);
  };

  // Non-catalogue JSON files that live in content dirs but the loader never
  // serves (e.g. the legacy assets/asset-move-refs.json, already merged into
  // the asset data). Recorded and warned about — not an error.
  const orphans = [];

  // --- assign every content file to exactly one extension -----------------
  // assets/assets_<src>.json  (other *.json in assets/ are orphans)
  for (const f of await jsonFiles('assets')) {
    const src = f.match(/^assets_(.+)\.json$/)?.[1];
    const id = src && ALIAS[src];
    if (!id) {
      orphans.push(`assets/${f}`);
      continue;
    }
    assign(id, 'assets', `assets/${f}`);
  }
  // moves/*.json — classify by the file's top-level category
  for (const f of await jsonFiles('moves')) {
    const cat = (await readJson(path.join(DATA, 'moves', f))).category;
    const id = cat === 'Delve' ? 'delve' : cat === 'Yrt' ? 'yrt' : 'base';
    assign(id, 'moves', `moves/${f}`);
  }
  // oracles/*.json — classify by each table's source tag (default base)
  for (const f of await jsonFiles('oracles')) {
    const src = (await readJson(path.join(DATA, 'oracles', f))).source ?? 'base';
    assign(src, 'oracles', `oracles/${f}`);
  }
  // foes/foes_<src>.json and foes/foes_overrides_<src>.json
  for (const f of await jsonFiles('foes')) {
    const ov = f.match(/^foes_overrides_(.+)\.json$/);
    if (ov) {
      const id = ALIAS[ov[1]];
      if (!id) throw new Error(`unrecognised foe-override file: ${f}`);
      assign(id, 'foeOverrides', `foes/${f}`);
      continue;
    }
    const src = f.match(/^foes_(.+)\.json$/)?.[1];
    const id = ALIAS[src];
    if (!id) throw new Error(`unrecognised foe file: ${f}`);
    assign(id, 'foes', `foes/${f}`);
  }
  // delve/*.json — the Delve theme/domain tables
  for (const f of await jsonFiles('delve')) assign('delve', 'delveTables', `delve/${f}`);

  // --- coverage check (seed of the build lint) ----------------------------
  // Every recognised catalogue file is assigned by construction above; here
  // we surface any *unrecognised* files (orphans) as a warning so they don't
  // silently rot. In the full lint (spec §10) this becomes configurable.
  if (orphans.length)
    console.warn(`⚠ ignored ${orphans.length} non-catalogue file(s):\n  ${orphans.join('\n  ')}`);

  // --- emit ---------------------------------------------------------------
  const extensions = ids
    .map((id) => ({
      id,
      name: meta[id].name,
      description: meta[id].description,
      defaultEnabled: meta[id].defaultEnabled,
      order: meta[id].order,
      provides: Object.fromEntries(
        Object.entries(provides[id])
          .filter(([, v]) => v.length)
          .map(([k, v]) => [k, v.sort()]),
      ),
    }))
    .sort((a, b) => a.order - b.order);

  return {
    $comment:
      'GENERATED by scripts/gen-extensions-manifest.mjs — do not edit by hand. Phase 1: provides paths are relative to apps/api/data/.',
    extensions,
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
