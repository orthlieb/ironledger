// =============================================================================
// gen-yrt-json.mjs — the FORWARD path: vault Markdown → ironledger JSON.
//
// The YRT vault (yrt-vault/Game/) is the canonical source for foes; this reads
// the authoring Markdown and renders extensions/yrt/foes/foes.json — the file
// the app consumes. Run it locally after editing foes in Obsidian, then commit
// the regenerated JSON. It is NOT wired into CI: CI has no access to the private
// vault, and foes.json is validated there by the app schema + tests as usual.
//
//   node scripts/gen-yrt-json.mjs            # regenerate foes.json from the vault
//   node scripts/gen-yrt-json.mjs --check    # fail if foes.json differs from vault
//
// Foes are emitted sorted by id for deterministic output independent of
// filesystem order.
// =============================================================================

import { readFile, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { deepStrictEqual } from 'assert';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { markdownToFoe } from './yrt-md.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = process.env.YRT_VAULT || path.join(os.homedir(), 'dev/yrt-vault');
const FOES_DIR = path.join(VAULT, 'Game', 'foes');
const OUT = path.join(ROOT, 'extensions/yrt/foes/foes.json');
const check = process.argv.includes('--check');

/** Read every foe .md in the vault and assemble the foes.json payload. */
export async function buildFoes() {
  if (!existsSync(FOES_DIR)) {
    throw new Error(
      `YRT vault not found at ${FOES_DIR}. Set YRT_VAULT or clone the vault; ` +
        `this generator needs the canonical Markdown source.`,
    );
  }
  const files = (await readdir(FOES_DIR)).filter((f) => f.endsWith('.md'));
  const foes = await Promise.all(
    files.map(async (f) => markdownToFoe(await readFile(path.join(FOES_DIR, f), 'utf8'))),
  );
  foes.sort((a, b) => a.id.localeCompare(b.id));
  return { foes, source: 'yrt' };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const payload = await buildFoes();
  const body = JSON.stringify(payload, null, 2) + '\n';
  if (check) {
    // Semantic comparison (parse both, deep-equal) — robust to whitespace,
    // key order, and prettier formatting; proves the committed foes.json holds
    // exactly the content the vault would generate.
    const cur = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : null;
    try {
      deepStrictEqual(cur, payload);
    } catch {
      console.error(
        `✗ extensions/yrt/foes/foes.json is out of sync with the vault.\n` +
          `  Run \`npm run gen:yrt-json\` and commit.`,
      );
      process.exit(1);
    }
    console.log('✓ foes.json matches the vault');
  } else {
    await writeFile(OUT, body);
    console.log(`✓ wrote ${payload.foes.length} foes → extensions/yrt/foes/foes.json (from vault)`);
  }
}
