// =============================================================================
// scripts/kill-port.mjs — cross-platform "free this TCP port, then continue".
//
// Root `npm run dev` runs this before starting the API so a stale API
// process from a previous run doesn't sit on port 3000 and force us to
// re-run with a different port. The original one-liner used `lsof` +
// `xargs kill` — Unix only, breaks on Windows PowerShell / cmd.
//
// Usage:
//   node scripts/kill-port.mjs 3000
//
// Behaviour:
//   • no listener on the port → no-op, exit 0
//   • listener found          → best-effort kill, then exit 0
//   • kill fails               → warn to stderr, still exit 0 (the launching
//                                script's dev command will surface the real
//                                EADDRINUSE if the port is still held)
//
// Deliberately never fails the parent script — the intent is "clear the way
// if possible," not "hold up dev when something exotic is happening."
// =============================================================================

import { spawnSync } from 'node:child_process';
import { platform } from 'node:process';

const port = Number(process.argv[2] ?? 3000);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`kill-port: invalid port "${process.argv[2]}"`);
  process.exit(0); // still 0 — non-fatal
}

/** Windows uses `netstat -ano | findstr LISTENING :<port>` → last column is PID. */
function pidsWindows(p) {
  const r = spawnSync('cmd.exe', ['/d', '/s', '/c', `netstat -ano | findstr LISTENING`], {
    encoding: 'utf8',
  });
  if (r.status !== 0) return [];
  const rx = new RegExp(`[.:]${p}\\s`);
  const pids = new Set();
  for (const line of r.stdout.split(/\r?\n/)) {
    if (!rx.test(line)) continue;
    const cols = line.trim().split(/\s+/);
    const pid = Number(cols[cols.length - 1]);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

/** Unix uses `lsof -ti tcp:<port> -sTCP:LISTEN` (BSD/GNU lsof both accept it). */
function pidsUnix(p) {
  const r = spawnSync('lsof', ['-ti', `tcp:${p}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout.trim()) return [];
  return r.stdout
    .split(/\s+/)
    .map((x) => Number(x))
    .filter((n) => Number.isInteger(n) && n > 0);
}

const isWin = platform === 'win32';
const pids = isWin ? pidsWindows(port) : pidsUnix(port);

if (pids.length === 0) process.exit(0); // port already free

for (const pid of pids) {
  const r = isWin
    ? spawnSync('taskkill', ['/F', '/PID', String(pid)], { stdio: 'ignore' })
    : spawnSync('kill', ['-9', String(pid)], { stdio: 'ignore' });
  if (r.status === 0) {
    console.log(`kill-port: freed port ${port} (pid ${pid})`);
  } else {
    console.warn(`kill-port: could not kill pid ${pid} on port ${port}`);
  }
}

process.exit(0);
