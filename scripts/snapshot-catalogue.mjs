/**
 * Behaviour-preservation snapshot for the catalogue.
 *
 * Loads the merged catalogue exactly two ways and prints an order-independent
 * hash of each served entry (items sorted by a stable key, then hashed). Run it
 * before and after the manifest refactor; the hashes must match — that proves
 * the same items are served (array order is irrelevant to the app, which keys
 * everything by id/source).
 *
 *   node scripts/snapshot-catalogue.mjs current   # replicates the OLD loader
 *   node scripts/snapshot-catalogue.mjs manifest  # uses the NEW generated manifest
 */
import { readFile, readdir } from 'fs/promises';
import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../apps/api/data');
const mode = process.argv[2] ?? 'current';

const loadJson = async (p) => JSON.parse(await readFile(path.join(DATA, p), 'utf-8'));

/** Stable, order-independent hash: sort items by `keyFn`, stringify, md5. */
function hashItems(items, keyFn) {
  const sorted = [...items].sort((a, b) =>
    keyFn(a) < keyFn(b) ? -1 : keyFn(a) > keyFn(b) ? 1 : 0,
  );
  return createHash('md5').update(JSON.stringify(sorted)).digest('hex').slice(0, 16);
}

async function loadCurrent() {
  // --- assets (3 explicit files) ---
  const [ai, ad, ay] = await Promise.all([
    loadJson('assets/assets_ironsworn.json'),
    loadJson('assets/assets_delve.json'),
    loadJson('assets/assets_yrt.json'),
  ]);
  const assets = [...ai.assets, ...ad.assets, ...ay.assets];
  const rarities = [...(ai.rarities ?? []), ...(ad.rarities ?? []), ...(ay.rarities ?? [])];

  // --- moves (10 explicit files) ---
  const moveFiles = [
    'adventure',
    'combat',
    'delve',
    'failure',
    'fate',
    'quest',
    'rarity',
    'relationship',
    'suffer',
    'yrt',
  ];
  const moveData = await Promise.all(moveFiles.map((f) => loadJson(`moves/${f}.json`)));
  const moves = moveData.flatMap((f) => f.moves);

  // --- oracles (glob) ---
  const oracleFiles = (await readdir(path.join(DATA, 'oracles'))).filter((f) =>
    f.endsWith('.json'),
  );
  const oracles = await Promise.all(oracleFiles.map((f) => loadJson(`oracles/${f}`)));

  // --- foes (3 explicit + override glob) ---
  const [fi, fd, fy] = await Promise.all([
    loadJson('foes/foes_ironsworn.json'),
    loadJson('foes/foes_delve.json'),
    loadJson('foes/foes_yrt.json'),
  ]);
  const foes = [...fi.foes, ...fd.foes, ...fy.foes];
  const overrideFiles = (await readdir(path.join(DATA, 'foes'))).filter(
    (f) => f.startsWith('foes_overrides_') && f.endsWith('.json'),
  );
  const overrides = await Promise.all(overrideFiles.map((f) => loadJson(`foes/${f}`)));

  // --- delve tables (5 explicit) ---
  const delve = {
    themeFeatures: await loadJson('delve/delve-theme-features.json'),
    themeDangers: await loadJson('delve/delve-theme-dangers.json'),
    domainFeatures: await loadJson('delve/delve-domain-features.json'),
    domainDangers: await loadJson('delve/delve-domain-dangers.json'),
    commonDangers: await loadJson('delve/delve-common-dangers.json'),
  };

  return { assets, rarities, moves, oracles, foes, overrides, delve };
}

async function loadFromManifest() {
  const REPO = path.resolve(__dirname, '..');
  const manifest = await loadJson('extensions.manifest.json');
  const exts = [...manifest.extensions].sort((a, b) => a.order - b.order);
  // Resolve a provides path against its extension's repo-relative root.
  const loadRel = (root, rel) => readFile(path.join(REPO, root, rel), 'utf-8').then(JSON.parse);
  // [{root, rel}] pairs for a content type across all extensions, in order.
  const filesOf = (type) =>
    exts.flatMap((e) => (e.provides?.[type] ?? []).map((rel) => ({ root: e.root, rel })));
  const loadAll = (type) => Promise.all(filesOf(type).map(({ root, rel }) => loadRel(root, rel)));

  const assetData = await loadAll('assets');
  const assets = assetData.flatMap((f) => f.assets);
  const rarities = assetData.flatMap((f) => f.rarities ?? []);

  const moveData = await loadAll('moves');
  const moves = moveData.flatMap((f) => f.moves);

  const oracles = await loadAll('oracles');

  const foeData = await loadAll('foes');
  const foes = foeData.flatMap((f) => f.foes);
  const overrides = await loadAll('foeOverrides');

  // delve keyed object: delve-theme-features.json -> themeFeatures
  const camel = (f) =>
    path
      .basename(f, '.json')
      .replace(/^delve-/, '')
      .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const delve = {};
  for (const { root, rel } of filesOf('delveTables')) delve[camel(rel)] = await loadRel(root, rel);

  return { assets, rarities, moves, oracles, foes, overrides, delve };
}

const c = mode === 'manifest' ? await loadFromManifest() : await loadCurrent();

const report = {
  assets: hashItems(c.assets, (a) => a.id),
  rarities: hashItems(c.rarities, (r) => r.id),
  moves: hashItems(c.moves, (m) => m.id),
  oracles: hashItems(c.oracles, (o) => o.key ?? o.id ?? JSON.stringify(o)),
  foes: hashItems(c.foes, (f) => f.id),
  overrides: hashItems(c.overrides, (o) => o.source),
  // delve is a keyed object accessed by name — hash key-order-independently.
  delve: createHash('md5')
    .update(JSON.stringify(Object.entries(c.delve).sort((a, b) => (a[0] < b[0] ? -1 : 1))))
    .digest('hex')
    .slice(0, 16),
  counts: {
    assets: c.assets.length,
    rarities: c.rarities.length,
    moves: c.moves.length,
    oracles: c.oracles.length,
    foes: c.foes.length,
    overrides: c.overrides.length,
  },
};
console.log(JSON.stringify(report, null, 2));
