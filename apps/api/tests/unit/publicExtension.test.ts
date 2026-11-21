/**
 * Contract guard for the `/catalogue/extensions` public payload.
 *
 * The web app resolves every move/oracle CATEGORY ICON from the category
 * records carried on this payload (extensionCategories.svelte.ts →
 * iconRegistry.oracleCategoryIcon / moveCategoryIcon). Regression history: the
 * category icon/tint/order data was moved into the manifest, but the payload
 * mapper dropped `moveCategories`/`oracleCategories`, so the client received no
 * category records and every category silently collapsed to its generic
 * fallback icon (d100 for oracles, running-person for moves).
 *
 * These tests pin the manifest → public-payload contract: any category icon
 * declared in the manifest MUST survive into what the client receives, and the
 * payload must stay metadata-only (no file lists leaking out).
 *
 * No server, DB, or network — the mapper is a pure function over the real
 * manifest JSON.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { toPublicExtension, resolveAssetFields } from '../../src/routes/catalogue.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../../data');

interface CategoryMeta {
  key: string;
  icon?: string;
  color?: string;
  order?: number;
}
interface ManifestEntry {
  id: string;
  moveCategories?: CategoryMeta[];
  oracleCategories?: CategoryMeta[];
  suppressesOracles?: string[];
  supersedesOracles?: Record<string, string>;
  supersedesCultures?: Record<string, string>;
  infoLink?: { label: string; url: string };
  fields?: Array<{ id: string; scope?: string; writable?: boolean }>;
  fieldsHeading?: string | false;
  provides?: Record<string, string[]>;
  root?: string;
}
const manifest = JSON.parse(readFileSync(path.join(DATA, 'extensions.manifest.json'), 'utf-8')) as {
  extensions: ManifestEntry[];
};

/** Flatten every category (icon-bearing) across a set of entries into
 *  `"<id>/<kind>/<key>" → icon` so manifest and payload can be compared. */
function categoryIconMap(
  entries: Array<{
    id: string;
    moveCategories?: CategoryMeta[];
    oracleCategories?: CategoryMeta[];
  }>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const e of entries) {
    for (const c of e.moveCategories ?? []) out[`${e.id}/move/${c.key}`] = c.icon;
    for (const c of e.oracleCategories ?? []) out[`${e.id}/oracle/${c.key}`] = c.icon;
  }
  return out;
}

describe('toPublicExtension — /catalogue/extensions contract', () => {
  const publicList = manifest.extensions.map(toPublicExtension);

  it('forwards every move/oracle category icon from the manifest verbatim', () => {
    const fromManifest = categoryIconMap(manifest.extensions);
    const fromPayload = categoryIconMap(publicList);
    expect(fromPayload).toEqual(fromManifest);
  });

  it('carries at least one category icon (guards a total drop of the fields)', () => {
    const icons = Object.values(categoryIconMap(publicList)).filter(Boolean);
    expect(icons.length).toBeGreaterThan(0);
  });

  it('preserves the specific category icons the picker relies on', () => {
    const byId = Object.fromEntries(publicList.map((e) => [e.id, e]));
    const iconOf = (cats: CategoryMeta[] | undefined, key: string) =>
      cats?.find((c) => c.key === key)?.icon;

    // A spread of oracle + move categories whose distinct icons regressed to
    // the generic fallback when the payload dropped the category records.
    expect(iconOf(byId.base?.oracleCategories, 'Location')).toBe('location-dot-solid');
    expect(iconOf(byId.base?.oracleCategories, 'Character')).toBe('Characters');
    expect(iconOf(byId.base?.moveCategories, 'Fate')).toBe('scissors-thread');
    expect(iconOf(byId.base?.moveCategories, 'Failure')).toBe('face-head-bandage-solid');
    expect(iconOf(byId.base?.moveCategories, 'Quest')).toBe('compass-rose');
    expect(iconOf(byId.lodestar?.moveCategories, 'Scene')).toBe('hourglass-clock-solid');
  });

  it('forwards supersedesOracles / suppressesOracles verbatim', () => {
    // The picker hides a superseded base oracle (expansionStore.suppressedOracleKeys)
    // by reading these off the payload. Dropping supersedesOracles lets the
    // Ironlands Region leak back beside YRT's replacement (the regression this
    // guards). Compare the full manifest → payload projection of both maps.
    const project = (
      entries: Array<{
        id: string;
        suppressesOracles?: string[];
        supersedesOracles?: Record<string, string>;
      }>,
    ) =>
      Object.fromEntries(
        entries.map((e) => [
          e.id,
          { suppresses: e.suppressesOracles ?? null, supersedes: e.supersedesOracles ?? null },
        ]),
      );
    expect(project(publicList)).toEqual(project(manifest.extensions));
  });

  it('preserves the specific oracle supersessions the picker relies on', () => {
    const byId = Object.fromEntries(publicList.map((e) => [e.id, e]));
    // YRT rewrites the base Ironlands Region + Lodestar Story Region to its own.
    expect(byId.yrt?.supersedesOracles?.region).toBe('yrtRegion');
    expect(byId.yrt?.supersedesOracles?.storyRegion).toBe('yrtStoryRegion');
  });

  it('forwards supersedesCultures — YRT swaps the base Elves for its Verdani', () => {
    // The settlement builder offers the replacement culture and markers that
    // reference the base one draw with it; a dropped map would show Elves AND
    // Verdani side by side while YRT is on.
    const byId = Object.fromEntries(publicList.map((e) => [e.id, e]));
    expect(byId.yrt?.supersedesCultures).toEqual({ elves: 'verdani' });
    for (const e of manifest.extensions)
      expect(byId[e.id]?.supersedesCultures ?? null).toEqual(e.supersedesCultures ?? null);
  });

  it('stays metadata-only — no file lists leak into the public payload', () => {
    for (const e of publicList as Array<Record<string, unknown>>) {
      expect(e.provides).toBeUndefined();
      expect(e.root).toBeUndefined();
    }
  });

  it('forwards infoLink verbatim (Hamburger → Info submenu depends on it)', () => {
    // The Hamburger menu builds its Info submenu from every enabled
    // extension's `infoLink`. If the mapper drops the field the submenu
    // silently disappears — a regression that reached prod before we
    // noticed. Guard the passthrough here: every manifest infoLink must
    // survive into the public payload byte-for-byte.
    const project = (entries: Array<{ id: string; infoLink?: unknown }>) =>
      Object.fromEntries(entries.map((e) => [e.id, e.infoLink ?? null]));
    expect(project(publicList)).toEqual(project(manifest.extensions));
    // Pin the two links we ship today so a paste-error in either
    // extension.json is caught in CI rather than at browse-time.
    const byId = Object.fromEntries(publicList.map((e) => [e.id, e]));
    expect(byId.base?.infoLink?.label).toBe('Ironsworn');
    expect(byId.yrt?.infoLink?.label).toBe('YRT');
  });

  it('forwards fields and fieldsHeading verbatim', () => {
    // The sheet, New Character and the Touched assets' condition all read
    // these; a dropped field would leave a YRT character with no Touched
    // level and every Touched asset ungated.
    const project = (entries: Array<{ id: string; fields?: unknown; fieldsHeading?: unknown }>) =>
      Object.fromEntries(entries.map((e) => [e.id, [e.fields ?? null, e.fieldsHeading ?? null]]));
    expect(project(publicList)).toEqual(project(manifest.extensions));
    const byId = Object.fromEntries(publicList.map((e) => [e.id, e]));
    expect(byId.base?.fields?.map((f) => f.id)).toEqual(['origin']);
    expect(byId.yrt?.fields?.map((f) => f.id)).toEqual([
      'religion',
      'touched',
      'touchedAnimal',
      'mana',
    ]);
    expect(byId.yrt?.fields?.find((f) => f.id === 'mana')?.scope).toBe('global');
    // Who the character is stays the sheet's: links and commands can't set it.
    expect(byId.base?.fields?.find((f) => f.id === 'origin')?.writable).toBe(false);
    expect(byId.yrt?.fields?.find((f) => f.id === 'touched')?.writable).toBe(false);
    expect(byId.yrt?.fields?.find((f) => f.id === 'religion')?.writable).toBe(false);
    expect(byId.base?.fieldsHeading).toBe(false);
    expect(byId.delve?.fieldsHeading).toBe(false);
    expect(byId.lodestar?.fieldsHeading).toBe(false);
  });
});

describe('resolveAssetFields', () => {
  const globals = new Map<string, Record<string, unknown>>([
    [
      'mana',
      {
        id: 'mana',
        scope: 'global',
        type: 'counter',
        label: 'Mana',
        shortLabel: 'Mana',
        maxValue: 10,
        default: '0',
        icon: 'mana',
      },
    ],
  ]);

  it('makes a reference to a global field the whole field, placed by the asset', () => {
    const ritual = {
      id: 'ritual/x',
      customFields: [
        { field: 'mana', position: 'bottom', tooltipLabel: 'Conclave Ritual' },
        { id: 'notes', type: 'markdown', label: 'Notes' },
      ],
    };
    const out = resolveAssetFields(ritual, globals) as typeof ritual;
    expect(out.customFields[0]).toEqual({
      id: 'mana',
      type: 'counter',
      label: 'Mana',
      shortLabel: 'Mana',
      maxValue: 10,
      default: 0,
      icon: 'mana',
      position: 'bottom',
      tooltipLabel: 'Conclave Ritual',
      global: true,
    });
    expect(out.customFields[1]).toEqual(ritual.customFields[1]);
  });

  it('leaves an asset with no references as it is', () => {
    const hawk = { id: 'companion/hawk', customFields: [{ id: 'health', type: 'counter' }] };
    expect(resolveAssetFields(hawk, globals)).toBe(hawk);
  });

  it('resolves the YRT rituals’ mana from the extension’s one declaration', () => {
    const yrt = manifest.extensions.find((e) => e.id === 'yrt');
    const declared = new Map(
      (yrt?.fields ?? [])
        .filter((f) => f.scope === 'global')
        .map((f) => [f.id, f as unknown as Record<string, unknown>]),
    );
    const assets = JSON.parse(
      readFileSync(path.resolve(DATA, '../../../extensions/yrt/assets/assets.json'), 'utf-8'),
    ) as { assets: Array<{ id: string; customFields?: Array<Record<string, unknown>> }> };
    const rituals = assets.assets
      .map((a) => resolveAssetFields(a, declared) as typeof a)
      .filter((a) => a.customFields?.some((cf) => cf.id === 'mana'));
    expect(rituals.map((a) => a.id)).toEqual([
      'ritual/yrt-cantrip',
      'ritual/yrt-arcane-inspection',
      'ritual/yrt-vizion-illusion',
      'ritual/yrt-compulsion',
    ]);
    for (const a of rituals)
      expect(a.customFields?.find((cf) => cf.id === 'mana')).toMatchObject({
        global: true,
        maxValue: 10,
        default: 0,
        icon: 'mana',
      });
  });
});
