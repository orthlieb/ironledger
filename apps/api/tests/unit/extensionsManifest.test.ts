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

type Provides = Partial<Record<string, string[]>>;
interface Ext {
  id: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
  order: number;
  provides?: Provides;
}
interface Manifest {
  extensions: Ext[];
}

const readJson = (rel: string) => JSON.parse(readFileSync(path.join(DATA, rel), 'utf-8'));
const manifest = readJson('extensions.manifest.json') as Manifest;
const exts = [...manifest.extensions].sort((a, b) => a.order - b.order);
const filesFor = (type: string) => exts.flatMap((e) => e.provides?.[type] ?? []);

describe('extensions.manifest.json', () => {
  it('registers base, delve and yrt in order', () => {
    expect(exts.map((e) => e.id)).toEqual(['base', 'delve', 'yrt']);
    expect(exts.map((e) => e.order)).toEqual([0, 10, 20]);
  });

  it('every provided content file exists on disk', () => {
    const missing = exts
      .flatMap((e) => Object.values(e.provides ?? {}).flat())
      .filter((rel) => !existsSync(path.join(DATA, rel)));
    expect(missing).toEqual([]);
  });

  it('reproduces the expected merged catalogue counts', () => {
    const assetData = filesFor('assets').map(readJson) as Array<{
      assets: unknown[];
      rarities?: unknown[];
    }>;
    const moveData = filesFor('moves').map(readJson) as Array<{ moves: unknown[] }>;
    const oracleData = filesFor('oracles').map(readJson);
    const foeData = filesFor('foes').map(readJson) as Array<{ foes: unknown[] }>;
    const overrides = filesFor('foeOverrides').map(readJson);
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
    const all = exts.flatMap((e) => Object.values(e.provides ?? {}).flat());
    expect(new Set(all).size).toBe(all.length);
  });
});
