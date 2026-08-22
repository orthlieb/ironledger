/**
 * Correctness guards for the generated YRT reference (extensions/yrt/reference/*.md,
 * from scripts/gen-yrt-reference.mjs).
 *
 * The `gen:yrt-ref:check` CI gate proves the committed files match a fresh
 * generation (no drift) — so asserting invariants on the committed files here is
 * equivalent to asserting them on the generator's output, but catches the class
 * of regression `--check` can't: a broken generator whose broken output was
 * dutifully regenerated and committed (so `--check` passes). Pure filesystem.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const REF = path.join(REPO, 'extensions/yrt/reference');
const NAMES = ['bestiary.md', 'moves.md', 'assets.md', 'oracles.md'];
const read = (f: string) => readFileSync(path.join(REF, f), 'utf-8');

describe('YRT generated reference', () => {
  it('has all four non-empty reference files', () => {
    for (const n of NAMES) expect(read(n).length, n).toBeGreaterThan(50);
  });

  it('never emits [object Object] — structured oracle values must render', () => {
    for (const n of NAMES) expect(read(n), n).not.toContain('[object Object]');
  });

  it('strips app-internal DSL links to plain labels (no [x](scheme:…) except http)', () => {
    const dsl = /\]\((?!https?:)[a-z]+:/;
    for (const n of NAMES) expect(dsl.test(read(n)), `${n} has an unstripped DSL link`).toBe(false);
  });

  it('covers every foe and carries the promoted editorial extras', () => {
    const foes = JSON.parse(readFileSync(path.join(REPO, 'extensions/yrt/foes/foes.json'), 'utf-8'))
      .foes as Array<{ name: string }>;
    const bestiary = read('bestiary.md');
    for (const f of foes) expect(bestiary, `bestiary missing "${f.name}"`).toContain(f.name);
    // extras.yrt.natureNote → "(…)"; extras.yrt.rework → "Reworked from: …"
    expect(bestiary, 'natureNote not rendered').toContain('Anomaly (wild-mana construct)');
    expect(bestiary, 'rework not rendered').toContain('Reworked from: Bog Rot (Delve)');
  });
});
