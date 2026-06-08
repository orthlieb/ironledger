/**
 * Side-effect module — loads /home/ironledger/app/.env (or the workspace
 * root .env in dev) into process.env at the earliest opportunity.
 *
 * Why this exists: PM2 v6's `env_file:` directive is silently ignored on
 * some installs, leaving workers booted with no .env vars. ecosystem.config.js
 * already passes `--env-file-if-exists` via node_args so Node loads the
 * file at process start — this module is a belt-and-braces fallback for
 * the case where node_args is dropped (custom launch script, third-party
 * process manager, manual `node dist/main.js`). Importing it before any
 * env-reading import guarantees process.env is populated.
 *
 * Idempotent — if Node already loaded the file via --env-file flag, this
 * just re-applies the same key=value pairs.
 */

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// process.loadEnvFile arrived in Node 20.6 / 21.7. Skip gracefully on older
// runtimes — operators on those won't get .env auto-load and will need to
// export env themselves (same as before this module existed).
if (typeof process.loadEnvFile === 'function') {
  // src/loadEnv.ts → ../../../.env  (workspace root, dev)
  // dist/loadEnv.js → ../../../.env (production, same depth after tsc)
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '../../..', '.env');
  if (existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
    } catch {
      // loadEnvFile only throws on parser errors; treat as a soft failure
      // so the app still boots and the Zod check in config.ts produces a
      // clean "VAR required" message instead of a stack trace.
    }
  }
}
