// =============================================================================
// migrate-yrt-to-md.mjs — ONE-TIME seeding of the YRT vault from ironledger JSON.
//
// Writes one Markdown file per foe into <vault>/Game/foes/, from the current
// extensions/yrt/foes/foes.json, using the lossless converter in yrt-md.mjs.
// After this runs, the vault is the canonical source and foes.json is generated
// from it by gen-yrt-json.mjs. This script is not part of the ongoing flow —
// it exists to bootstrap the vault and to re-seed if you ever start over.
//
//   node scripts/migrate-yrt-to-md.mjs                # → $YRT_VAULT/Game/foes
//   node scripts/migrate-yrt-to-md.mjs --out /tmp/x   # → /tmp/x/foes (dry testing)
// =============================================================================

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { foeToMarkdown } from './yrt-md.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = process.env.YRT_VAULT || path.join(os.homedir(), 'dev/yrt-vault');

const outArg = process.argv.indexOf('--out');
const OUT =
  outArg !== -1 ? path.resolve(process.argv[outArg + 1]) : path.join(VAULT, 'Game', 'foes');

const slug = (id) => id.split('/').pop();

const { foes } = JSON.parse(
  await readFile(path.join(ROOT, 'extensions/yrt/foes/foes.json'), 'utf8'),
);
await mkdir(OUT, { recursive: true });
await Promise.all(foes.map((f) => writeFile(path.join(OUT, `${slug(f.id)}.md`), foeToMarkdown(f))));
console.log(`✓ seeded ${foes.length} foe Markdown files → ${OUT}`);
