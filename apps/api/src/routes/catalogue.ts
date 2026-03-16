/**
 * Catalogue routes — serves the static game data (assets, moves, oracles).
 *
 * These are read-only and publicly accessible — no auth required.
 * The data is loaded once at startup and cached in memory for the lifetime
 * of the process. Heavy caching headers tell Nginx and the browser to cache
 * aggressively too; the ETag changes only when the data files change
 * (i.e. when a new version is deployed).
 *
 * Game data lives in apps/api/data/ and is bundled with this project.
 * Override the path with CATALOGUE_PATH in .env if needed.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default: bundled data directory at apps/api/data/.
// __dirname = apps/api/src/routes/  →  ../.. = apps/api/
// Same relative depth from dist/routes/ after build.
// Override with CATALOGUE_PATH in .env for custom layouts.
const DATA_ROOT = process.env['CATALOGUE_PATH']
  ?? path.resolve(__dirname, '../../data');

// ---------------------------------------------------------------------------
// Load data files once at startup
// ---------------------------------------------------------------------------

interface CatalogueEntry {
  data: unknown;
  etag: string;
}

async function loadJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

function makeEtag(data: unknown): string {
  return createHash('md5')
    .update(JSON.stringify(data))
    .digest('hex')
    .slice(0, 16);
}

async function loadCatalogue(): Promise<{
  assets:  CatalogueEntry;
  moves:   CatalogueEntry;
  oracles: CatalogueEntry;
  foes:    CatalogueEntry;
  delve:   CatalogueEntry;
}> {
  // Load and merge all asset files
  const [assetsIs, assetsDelve, assetsYrt] = await Promise.all([
    loadJson(path.join(DATA_ROOT, 'assets/assets_ironsworn.json')),
    loadJson(path.join(DATA_ROOT, 'assets/assets_delve.json')),
    loadJson(path.join(DATA_ROOT, 'assets/assets_yrt.json')),
  ]) as Array<{ assets: unknown[]; rarities?: unknown[] }>;

  const allAssets = {
    assets:   [...assetsIs.assets,   ...assetsDelve.assets,   ...assetsYrt.assets],
    rarities: [...(assetsIs.rarities   ?? []), ...(assetsDelve.rarities  ?? []), ...(assetsYrt.rarities  ?? [])],
  };

  // Load all move files
  const moveFiles = ['adventure', 'combat', 'delve', 'failure', 'fate',
                     'quest', 'rarity', 'relationship', 'suffer', 'yrt'];
  const moveData = await Promise.all(
    moveFiles.map((f) => loadJson(path.join(DATA_ROOT, `moves/${f}.json`))),
  ) as Array<{ category: string; moves: unknown[] }>;
  const allMoves = { moves: moveData.flatMap((f) => f.moves) };

  // Load all oracle files
  const oraclePaths = await import('fs').then(({ readdirSync }) =>
    readdirSync(path.join(DATA_ROOT, 'oracles'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.join(DATA_ROOT, 'oracles', f)),
  );
  const oracleData = await Promise.all(oraclePaths.map(loadJson));
  const allOracles = { oracles: oracleData };

  // Load and merge all foe files
  const [foesIs, foesDelve, foesYrt] = await Promise.all([
    loadJson(path.join(DATA_ROOT, 'foes/foes_ironsworn.json')),
    loadJson(path.join(DATA_ROOT, 'foes/foes_delve.json')),
    loadJson(path.join(DATA_ROOT, 'foes/foes_yrt.json')),
  ]) as Array<{ foes: unknown[] }>;

  const allFoes = {
    foes: [...foesIs.foes, ...foesDelve.foes, ...foesYrt.foes],
  };

  // Load delve oracle tables (theme/domain features + dangers)
  const [themeFeatures, themeDangers, domainFeatures, domainDangers] = await Promise.all([
    loadJson(path.join(DATA_ROOT, 'delve/delve-theme-features.json')),
    loadJson(path.join(DATA_ROOT, 'delve/delve-theme-dangers.json')),
    loadJson(path.join(DATA_ROOT, 'delve/delve-domain-features.json')),
    loadJson(path.join(DATA_ROOT, 'delve/delve-domain-dangers.json')),
  ]);

  const allDelve = { themeFeatures, themeDangers, domainFeatures, domainDangers };

  return {
    assets:  { data: allAssets,  etag: makeEtag(allAssets)  },
    moves:   { data: allMoves,   etag: makeEtag(allMoves)   },
    oracles: { data: allOracles, etag: makeEtag(allOracles) },
    foes:    { data: allFoes,    etag: makeEtag(allFoes)    },
    delve:   { data: allDelve,   etag: makeEtag(allDelve)   },
  };
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function catalogueRoutes(server: FastifyInstance): Promise<void> {
  // Load once when the plugin registers
  const catalogue = await loadCatalogue();

  function sendCatalogueItem(
    entry: CatalogueEntry,
    req:   FastifyRequest,
    reply: FastifyReply,
  ): void {
    // Return 304 Not Modified if the client already has this version
    if (req.headers['if-none-match'] === entry.etag) {
      reply.status(304).send();
      return;
    }

    reply
      .header('ETag',          entry.etag)
      .header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
      .status(200)
      .send(entry.data);
  }

  server.get('/assets',  (req, reply) => sendCatalogueItem(catalogue.assets,  req, reply));
  server.get('/moves',   (req, reply) => sendCatalogueItem(catalogue.moves,   req, reply));
  server.get('/oracles', (req, reply) => sendCatalogueItem(catalogue.oracles, req, reply));
  server.get('/foes',    (req, reply) => sendCatalogueItem(catalogue.foes,    req, reply));
  server.get('/delve',   (req, reply) => sendCatalogueItem(catalogue.delve,   req, reply));
}
