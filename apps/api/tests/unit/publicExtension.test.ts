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
import { toPublicExtension } from '../../src/routes/catalogue.js';

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
    expect(iconOf(byId.base?.oracleCategories, 'Location')).toBe('location-dot');
    expect(iconOf(byId.base?.oracleCategories, 'Character')).toBe('Characters');
    expect(iconOf(byId.base?.moveCategories, 'Fate')).toBe('scissors-thread');
    expect(iconOf(byId.base?.moveCategories, 'Failure')).toBe('face-head-bandage');
    expect(iconOf(byId.base?.moveCategories, 'Quest')).toBe('compass-rose');
    expect(iconOf(byId.lodestar?.moveCategories, 'Scene')).toBe('hourglass-clock-solid-full');
  });

  it('stays metadata-only — no file lists leak into the public payload', () => {
    for (const e of publicList as Array<Record<string, unknown>>) {
      expect(e.provides).toBeUndefined();
      expect(e.root).toBeUndefined();
    }
  });
});
