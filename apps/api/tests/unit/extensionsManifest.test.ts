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
  suppressesOracles?: string[];
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
    // 25 base + 30 delve + 13 yrt + 20 lodestar = 88 (sample is dev-only, stripped
    // from `core`). Dropped from 91 by the site-name-place consolidation in PR #260;
    // delve stays 30 here — the `compound` refactor retired siteNameFormat but added
    // monstrosity (net zero), folding the format table into the siteName compound.
    // +5 for the Lodestar Story & Combat oracles: Story: Region (lodestar) + its YRT
    // duplicate (yrtStoryRegion), Story: Clue, Combat: Battleground, Combat: Tactic.
    expect(oracleData).toHaveLength(88);
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

/**
 * Oracle visibility by enabled extension. `base` is the always-on core; the
 * user toggles delve / yrt / lodestar. This mirrors the runtime contract in
 * apps/web `oracleStore.getVisibleOracles`: an oracle is visible when its
 * provider is enabled AND its key isn't suppressed by any enabled extension.
 * The hard-coded counts are the guard — add/remove an oracle file, or change
 * a `suppressesOracles` list, and the affected number must be updated here on
 * purpose. oracle-order.json is a display-order index (no `key`), not a
 * rollable oracle, so it's excluded from these counts.
 */
describe('oracle visibility by enabled extension', () => {
  const ext = (id: string) => core.find((e) => e.id === id)!;
  /** Keyed (rollable) oracle keys an extension provides. */
  const oracleKeysFor = (id: string): string[] =>
    (ext(id).provides?.oracles ?? [])
      .map((rel) => load(ext(id).root, rel) as { key?: string })
      .filter((o) => typeof o.key === 'string')
      .map((o) => o.key as string);
  const suppressFor = (id: string) => new Set(ext(id).suppressesOracles ?? []);
  /** Effective visible oracle keys for a set of enabled extensions. */
  const effective = (enabled: string[]): Set<string> => {
    const present = new Set<string>();
    for (const id of enabled) for (const k of oracleKeysFor(id)) present.add(k);
    for (const id of enabled) for (const k of suppressFor(id)) present.delete(k);
    return present;
  };
  const BASE = 'base';
  const withFlags = (delve: boolean, yrt: boolean, lodestar: boolean) => [
    BASE,
    ...(delve ? ['delve'] : []),
    ...(yrt ? ['yrt'] : []),
    ...(lodestar ? ['lodestar'] : []),
  ];

  it('per-extension keyed oracle counts (drift guard)', () => {
    expect(oracleKeysFor('base')).toHaveLength(24);
    expect(oracleKeysFor('delve')).toHaveLength(30);
    expect(oracleKeysFor('yrt')).toHaveLength(13);
    expect(oracleKeysFor('lodestar')).toHaveLength(20);
  });

  // base always on; each row toggles delve / yrt / lodestar. Counts net out
  // the 9 suppressions (yrt hides region/settlementCondition/settlementType +
  // supplants storyRegion; lodestar hides delve featureAspect/featureFocus/
  // charDisposition + base location/coastalWatersLocation).
  it.each([
    [false, false, false, 24],
    [false, false, true, 42],
    [false, true, false, 36],
    [false, true, true, 51],
    [true, false, false, 54],
    [true, false, true, 69],
    [true, true, false, 66],
    [true, true, true, 78],
  ])(
    'base + delve=%s yrt=%s lodestar=%s → %i visible oracles',
    (delve, yrt, lodestar, expected) => {
      expect(effective(withFlags(delve, yrt, lodestar)).size).toBe(expected);
    },
  );

  it('suppression hides/supplants the expected keys', () => {
    // yrt hides base Region (ships its own yrtRegion).
    expect(effective(['base']).has('region')).toBe(true);
    expect(effective(['base', 'yrt']).has('region')).toBe(false);
    expect(effective(['base', 'yrt']).has('yrtRegion')).toBe(true);
    // lodestar hides base Location and delve Feature Focus / Character Disposition.
    expect(effective(['base']).has('location')).toBe(true);
    expect(effective(['base', 'lodestar']).has('location')).toBe(false);
    expect(effective(['base', 'delve']).has('featureFocus')).toBe(true);
    expect(effective(['base', 'delve', 'lodestar']).has('featureFocus')).toBe(false);
    expect(effective(['base', 'delve']).has('charDisposition')).toBe(true);
    expect(effective(['base', 'delve', 'lodestar']).has('charDisposition')).toBe(false);
    // Story: Region — lodestar ships storyRegion; yrt supplants it with yrtStoryRegion.
    expect(effective(['base', 'lodestar']).has('storyRegion')).toBe(true);
    expect(effective(['base', 'yrt', 'lodestar']).has('storyRegion')).toBe(false);
    expect(effective(['base', 'yrt', 'lodestar']).has('yrtStoryRegion')).toBe(true);
  });
});
