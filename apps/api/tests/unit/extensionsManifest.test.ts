/**
 * Integrity tests for data/extensions.manifest.json and the content it points
 * at. Guards the Phase-1 extensions refactor: the manifest is the single source
 * of truth for the catalogue, so a data file added/removed without regenerating
 * the manifest, or a manifest entry pointing at a missing file, must fail here.
 *
 * No server, DB, or network — pure filesystem + JSON.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../../data');
const REPO = path.resolve(__dirname, '../../../..');

type Provides = Partial<Record<string, string[]>>;
interface Ext {
  id: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
  order: number;
  root: string;
  provides?: Provides;
}
interface Manifest {
  extensions: Ext[];
}

/** Resolve a provides path against its extension's repo-relative root. */
const resolve = (root: string, rel: string) => path.join(REPO, root, rel);
const manifest = JSON.parse(
  readFileSync(path.join(DATA, 'extensions.manifest.json'), 'utf-8'),
) as Manifest;
const exts = [...manifest.extensions].sort((a, b) => a.order - b.order);
/** {root, rel} for a content type across all extensions. */
const filesFor = (type: string) =>
  exts.flatMap((e) => (e.provides?.[type] ?? []).map((rel) => ({ root: e.root, rel })));
const load = (root: string, rel: string) => JSON.parse(readFileSync(resolve(root, rel), 'utf-8'));

describe('extensions.manifest.json', () => {
  it('registers base, delve and yrt in order', () => {
    expect(exts.map((e) => e.id)).toEqual(['base', 'delve', 'yrt']);
    expect(exts.map((e) => e.order)).toEqual([0, 10, 20]);
  });

  it('yrt is self-contained under extensions/yrt; base/delve stay in apps/api/data', () => {
    const root = Object.fromEntries(exts.map((e) => [e.id, e.root]));
    expect(root.base).toBe('apps/api/data');
    expect(root.delve).toBe('apps/api/data');
    expect(root.yrt).toBe('extensions/yrt');
  });

  it('every provided content file exists on disk', () => {
    const missing = exts
      .flatMap((e) =>
        e.provides
          ? Object.values(e.provides)
              .flat()
              .map((rel) => resolve(e.root, rel))
          : [],
      )
      .filter((abs) => !existsSync(abs));
    expect(missing).toEqual([]);
  });

  it('reproduces the expected merged catalogue counts', () => {
    const load1 = ({ root, rel }: { root: string; rel: string }) => load(root, rel);
    const assetData = filesFor('assets').map(load1) as Array<{
      assets: unknown[];
      rarities?: unknown[];
    }>;
    const moveData = filesFor('moves').map(load1) as Array<{ moves: unknown[] }>;
    const oracleData = filesFor('oracles').map(load1);
    const foeData = filesFor('foes').map(load1) as Array<{ foes: unknown[] }>;
    const overrides = filesFor('foeOverrides').map(load1);
    const delve = filesFor('delveTables');

    expect(assetData.flatMap((f) => f.assets)).toHaveLength(90);
    expect(assetData.flatMap((f) => f.rarities ?? [])).toHaveLength(63);
    expect(moveData.flatMap((f) => f.moves)).toHaveLength(49);
    expect(oracleData).toHaveLength(70);
    expect(foeData.flatMap((f) => f.foes)).toHaveLength(82);
    expect(overrides).toHaveLength(1);
    expect(delve).toHaveLength(5);
  });

  it('assigns each content file to exactly one extension (no overlap)', () => {
    // Compare resolved absolute paths — the same rel under different roots is fine.
    const all = exts.flatMap((e) =>
      Object.values(e.provides ?? {})
        .flat()
        .map((rel) => resolve(e.root, rel)),
    );
    expect(new Set(all).size).toBe(all.length);
  });
});
