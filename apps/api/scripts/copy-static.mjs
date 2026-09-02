// =============================================================================
// apps/api build helper — copy src/static → dist/static after tsc.
//
// Runs in the API's build step as a Node script rather than a raw `cp -r`
// (which is Unix-only and breaks Windows/PowerShell builds). Uses the
// stable `fs.cp` recursive copy (Node 16.7+). Idempotent: overwrites
// existing files in dist/static.
// =============================================================================

import { cp } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(__dirname, '..');

await cp(resolve(API_ROOT, 'src/static'), resolve(API_ROOT, 'dist/static'), {
  recursive: true,
});
