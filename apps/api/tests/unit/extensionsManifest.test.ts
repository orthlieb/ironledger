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
  dev?: boolean;
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
/** Production-shipped extensions (dev-only ones are stripped from prod builds). */
const core = exts.filter((e) => !e.dev);
/** {root, rel} for a content type across the core (non-dev) extensions. */
const filesFor = (type: string) =>
  core.flatMap((e) => (e.provides?.[type] ?? []).map((rel) => ({ root: e.root, rel })));
const load = (root: string, rel: string) => JSON.parse(readFileSync(resolve(root, rel), 'utf-8'));

describe('extensions.manifest.json', () => {
  it('registers base, delve, yrt, lodestar as the core, in order', () => {
    expect(core.map((e) => e.id)).toEqual(['base', 'delve', 'yrt', 'lodestar']);
    expect(core.map((e) => e.order)).toEqual([0, 10, 20, 30]);
  });

  it('sample is a dev-only reference extension (stripped from production builds)', () => {
    expect(exts.find((e) => e.id === 'sample')?.dev).toBe(true);
  });

  it('yrt + lodestar are self-contained under extensions/; base/delve stay in apps/api/data', () => {
    const root = Object.fromEntries(exts.map((e) => [e.id, e.root]));
    expect(root.base).toBe('apps/api/data');
    expect(root.delve).toBe('apps/api/data');
    expect(root.yrt).toBe('extensions/yrt');
    expect(root.lodestar).toBe('extensions/lodestar');
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
    const foeOverrides = filesFor('foeOverrides').map(load1);
    const moveOverrides = filesFor('moveOverrides').map(load1) as Array<{
      overrides: Record<string, unknown>;
    }>;
    const delve = filesFor('delveTables');

    expect(assetData.flatMap((f) => f.assets)).toHaveLength(90);
    expect(assetData.flatMap((f) => f.rarities ?? [])).toHaveLength(63);
    // 49 base/delve/yrt moves + 2 lodestar (Follow a Path, alternate End the Fight).
    expect(moveData.flatMap((f) => f.moves)).toHaveLength(51);
    expect(oracleData).toHaveLength(90);
    expect(foeData.flatMap((f) => f.foes)).toHaveLength(82);
    expect(foeOverrides).toHaveLength(1);
    // Lodestar hides base End the Fight via a move override ("hide + add"):
    // with Lodestar enabled the Ironsworn move is removed, not merely disabled.
    expect(moveOverrides).toHaveLength(1);
    expect(moveOverrides[0].overrides['move/end-the-fight']).toEqual({ present: false });
    expect(delve).toHaveLength(5);
  });

  it('every roll-table ref resolves to a catalogue entity, and ranges cover 1–100', () => {
    // Across ALL extensions (incl. dev-only fixtures like sample).
    const allFilesFor = (type: string) =>
      exts.flatMap((e) => (e.provides?.[type] ?? []).map((rel) => ({ root: e.root, rel })));
    const idsFrom = (type: string, key: 'foes' | 'assets') =>
      new Set<string>(
        allFilesFor(type).flatMap(({ root, rel }) => {
          const data = load(root, rel) as Record<string, Array<{ id: string }>>;
          return (data[key] ?? []).map((x) => x.id);
        }),
      );
    const foeIds = idsFrom('foes', 'foes');
    const assetIds = idsFrom('assets', 'assets');

    const tables = allFilesFor('rollTables').map(
      ({ root, rel }) =>
        load(root, rel) as {
          id: string;
          kind: 'foe' | 'asset';
          entries: Array<{ low: number; high: number; ref: string }>;
        },
    );
    expect(tables.length).toBeGreaterThan(0); // at least the sample fixture

    // Lodestar's Encounter Index: a foe resolver-oracle with a full d100 (58
    // rows). Explicit so a dropped/renamed table is caught (the generic checks
    // below would still pass with it simply absent).
    const encounter = tables.find((t) => t.id === 'lodestarEncounterIndex');
    expect(encounter, 'lodestar Encounter Index roll-table present').toBeDefined();
    expect(encounter!.kind).toBe('foe');
    expect(encounter!.entries).toHaveLength(58);

    // Lodestar's Prelude Event: an asset resolver-oracle with a full d100 (70
    // rows across Path / Combat Talent / Companion / Ritual), each carrying a
    // prelude narrative.
    const prelude = tables.find((t) => t.id === 'lodestarPreludeEvent');
    expect(prelude, 'lodestar Prelude Event roll-table present').toBeDefined();
    expect(prelude!.kind).toBe('asset');
    expect(prelude!.entries).toHaveLength(70);
    expect(prelude!.entries.every((e) => !!(e as { text?: string }).text)).toBe(true);

    const unresolved: string[] = [];
    for (const t of tables) {
      const ids = t.kind === 'foe' ? foeIds : assetIds;
      for (const e of t.entries) if (!ids.has(e.ref)) unresolved.push(`${t.id}: ${e.ref}`);

      // Ranges must ascend, not overlap, and cover 1–100 with no gaps.
      const sorted = [...t.entries].sort((a, b) => a.low - b.low);
      let cursor = 1;
      for (const e of sorted) {
        expect(e.low, `${t.id} gap/overlap before ${e.low}`).toBe(cursor);
        expect(e.high).toBeGreaterThanOrEqual(e.low);
        cursor = e.high + 1;
      }
      expect(cursor, `${t.id} must cover through 100`).toBe(101);
    }
    expect(unresolved).toEqual([]);
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
