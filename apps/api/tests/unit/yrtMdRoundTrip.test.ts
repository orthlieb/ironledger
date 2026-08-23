/**
 * Safety contract for the vault-Markdown ↔ JSON inversion (scripts/yrt-md.mjs).
 *
 * The vault is the canonical source: YRT game data is authored as Markdown in
 * yrt-vault and rendered to the JSON the app consumes by gen-yrt-json.mjs. This
 * test proves the mapping is LOSSLESS — for every committed entity, converting
 * it to the authoring Markdown and back reconstructs a deep-equal object. As
 * long as this is green, moving canon into the vault cannot silently drop or
 * mangle a field the app relies on.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// @ts-expect-error — plain ESM helper module, no types
import { foeToMarkdown, markdownToFoe } from '../../../../scripts/yrt-md.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const readJson = (p: string) => JSON.parse(readFileSync(path.join(REPO, p), 'utf-8'));

describe('YRT vault-Markdown round-trip (lossless)', () => {
  const foes = readJson('extensions/yrt/foes/foes.json').foes as Array<Record<string, unknown>>;

  it('has foes to check', () => {
    expect(foes.length).toBeGreaterThan(0);
  });

  it.each(foes.map((f) => [f.name as string, f]))(
    'foe %s survives JSON → Markdown → JSON unchanged',
    (_name, foe) => {
      expect(markdownToFoe(foeToMarkdown(foe))).toEqual(foe);
    },
  );

  it('all foes round-trip (aggregate)', () => {
    const back = foes.map((f) => markdownToFoe(foeToMarkdown(f)));
    expect(back).toEqual(foes);
  });
});
