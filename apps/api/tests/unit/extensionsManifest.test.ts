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
    // 49 base/delve/yrt moves + 6 lodestar (Follow a Path, alternate End the Fight,
    // and four Scene moves: Begin the Scene, Face Danger, Secure an Advantage,
    // Finish the Scene) = 55.
    expect(moveData.flatMap((f) => f.moves)).toHaveLength(55);
    // 25 base + 23 delve + 12 yrt + 24 lodestar = 84 (sample is dev-only, stripped
    // from `core`). Combat set (base Combat: Tactic, delve Combat: Event / Event
    // Method / Event Target, lodestar Combat: Battleground) + Story: Region (lodestar)
    // & yrtStoryRegion + Story: Clue + Magic: Mystic Effect + Scale: Magnitude
    // + Scale: Rank + Encounter: Ironlands + Character: Prelude Event (the former
    // Encounter Index & Prelude Event roll-tables, reborn as flat oracles) brought
    // lodestar to 24. (yrt dropped its Settlement Condition oracle, 13 → 12.)
    // delve's 10 Threat tables (category + 9 advance) were consolidated into one
    // two-step `threat` oracle, 32 → 23.
    expect(oracleData).toHaveLength(84);
    expect(foeData.flatMap((f) => f.foes)).toHaveLength(82);
    expect(foeOverrides).toHaveLength(1);
    // Lodestar hides base End the Fight via a move override ("hide + add"):
    // with Lodestar enabled the Ironsworn move is removed, not merely disabled.
    expect(moveOverrides).toHaveLength(1);
    expect(moveOverrides[0].overrides['move/end-the-fight']).toEqual({ present: false });
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
  // Effective hides = pure `suppressesOracles` ∪ the base keys the extension
  // supersedes (a supersession implies a suppression — asking for the base
  // key returns the replacement, so the base is auto-hidden from the picker).
  const suppressFor = (id: string) =>
    new Set([
      ...(ext(id).suppressesOracles ?? []),
      ...Object.keys(ext(id).supersedesOracles ?? {}),
    ]);
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
    expect(oracleKeysFor('delve')).toHaveLength(23);
    expect(oracleKeysFor('yrt')).toHaveLength(12);
    expect(oracleKeysFor('lodestar')).toHaveLength(24);
  });

  // base always on; each row toggles delve / yrt / lodestar. Counts net out
  // both `suppressesOracles` (pure hides) and `supersedesOracles` (implicit
  // hide of the base key being rewritten). YRT hides {region, storyRegion,
  // settlementType, location} via supersedesOracles;
  // Lodestar hides {featureAspect, featureFocus, charDisposition} via
  // suppressesOracles and {location, coastalWatersLocation} via supersedes;
  // union across enabled extensions.
  it.each([
    [false, false, false, 24],
    [false, false, true, 46],
    [false, true, false, 34],
    [false, true, true, 55],
    [true, false, false, 47],
    [true, false, true, 66],
    [true, true, false, 57],
    [true, true, true, 75],
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
