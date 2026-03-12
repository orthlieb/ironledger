/**
 * Catalogue routes — serves the static game data (assets, moves, oracles).
 *
 * These are read-only and publicly accessible — no auth required.
 * The data is loaded once at startup and cached in memory for the lifetime
 * of the process. Heavy caching headers tell Nginx and the browser to cache
 * aggressively too; the ETag changes only when the data files change
 * (i.e. when a new version is deployed).
 *
 * Data is read from the yrt project's data directory at startup.
 * The path is configurable via CATALOGUE_PATH in the environment,
 * defaulting to the sibling yrt project.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Default: look for the yrt data directory as a sibling of the repo root.
// __dirname = apps/api/src/routes/  →  ../../../../.. = parent of repo root
// Override with CATALOGUE_PATH in .env for non-standard layouts.
const DATA_ROOT = process.env['CATALOGUE_PATH']
  ?? path.resolve(__dirname, '../../../../../yrt/data');

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

  return {
    assets:  { data: allAssets,  etag: makeEtag(allAssets)  },
    moves:   { data: allMoves,   etag: makeEtag(allMoves)   },
    oracles: { data: allOracles, etag: makeEtag(allOracles) },
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
}
