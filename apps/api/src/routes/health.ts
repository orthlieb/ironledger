/**
 * Health routes.
 *
 * GET /        → HTML status page (browser-friendly, Ironsworn-flavoured)
 * GET /health  → JSON health check (used by deploy scripts & uptime monitors)
 *   200 { status: 'ok',       db: 'ok', redis: 'ok'    }
 *   503 { status: 'degraded', db: 'error', redis: 'ok' }
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { checkDbHealth } from '../db/index.js';
import { redis } from '../server.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR  = join(__dirname, '../static');
const pkg         = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as { version: string };
const APP_VERSION = pkg.version;

function loadImage(filename: string): string {
  try {
    const data = readFileSync(join(STATIC_DIR, filename));
    return `data:image/webp;base64,${data.toString('base64')}`;
  } catch {
    return '';
  }
}

const IMG_WORKING = loadImage('server-working.webp');
const IMG_DOWN    = loadImage('server-down.webp');

// Uptime tracked from server start
const START_TIME = Date.now();

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function statusPage(dbOk: boolean, redisOk: boolean, version: string): string {
  const healthy  = dbOk && redisOk;
  const uptime   = formatUptime(Date.now() - START_TIME);
  const headline = healthy ? 'Strong Hit' : 'Miss. Pay the Price.';
  const flavour  = healthy
    ? 'Enemies are vanquished. Sagas are being sung. The mead flows.'
    : 'The casks are empty. The oracles are blinded. Strange beasts roam the land.';
  const accentOk  = '#E8A13B';   // amber gold
  const accentBad = '#ef4444';   // red
  const accent    = healthy ? accentOk : accentBad;

  const imgSrc = healthy ? IMG_WORKING : IMG_DOWN;
  const image  = imgSrc
    ? `<img src="${imgSrc}" alt="${headline}" style="width:100%;height:auto;display:block;">`
    : '';

  function indicator(ok: boolean, label: string): string {
    const color = ok ? '#34d399' : '#ef4444';
    const icon  = ok ? '✓' : '✗';
    return `
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="color:${color};font-size:1rem;font-weight:700;">${icon}</span>
      <span style="font-size:0.78rem;color:#a0a0a0;">${label}</span>
      <span style="margin-left:auto;font-size:0.72rem;font-weight:600;color:${color};">${ok ? 'OK' : 'ERROR'}</span>
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Iron Ledger API — ${headline}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0d0d0d;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .card {
      background: #161616;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      padding: 2.5rem 3rem;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 24px 64px rgba(0,0,0,0.6);
    }
    .die-wrap {
      margin: -2.5rem -3rem 1.5rem -3rem;
      overflow: hidden;
      border-radius: 12px 12px 0 0;
    }
    .headline {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: ${accent};
      margin-bottom: 0.6rem;
    }
    .app-name {
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #555;
      margin-bottom: 1.25rem;
    }
    .flavour {
      font-size: 0.82rem;
      font-style: italic;
      color: #888;
      line-height: 1.6;
      margin-bottom: 2rem;
      padding: 0 0.5rem;
    }
    .stats {
      background: #111;
      border: 1px solid #222;
      border-radius: 8px;
      padding: 1rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 10px;
      text-align: left;
      margin-bottom: 1.5rem;
    }
    .stats-divider {
      height: 1px;
      background: #222;
    }
    .meta {
      display: flex;
      justify-content: center;
      gap: 1.5rem;
      font-size: 0.68rem;
      color: #444;
      letter-spacing: 0.05em;
    }
    .meta span { color: #666; }
  </style>
</head>
<body>
  <div class="card">
    <div class="die-wrap">${image}</div>
    <div class="app-name">Iron Ledger API</div>
    <div class="headline">${headline}</div>
    <p class="flavour">${flavour}</p>
    <div class="meta">
      <div>v<span>${version}</span></div>
      ${healthy ? `<div>up <span>${uptime}</span></div>` : ''}
    </div>
  </div>
</body>
</html>`;
}

export const healthRoutes: FastifyPluginAsyncZod = async (server) => {

  // ── GET / — browser-friendly HTML status page ──────────────────────────────
  server.get('/', async (req, reply) => {
    const version = APP_VERSION;
    const [dbOk, redisOk] = await Promise.all([
      checkDbHealth(),
      redis.ping().then(() => true).catch(() => false),
    ]);
    return reply
      .status(dbOk && redisOk ? 200 : 503)
      .header('Content-Type', 'text/html; charset=utf-8')
      .send(statusPage(dbOk, redisOk, version));
  });

  // ── GET /health — JSON health check for scripts & uptime monitors ──────────
  server.get('/health', async (req, reply) => {
    const [dbOk, redisOk] = await Promise.all([
      checkDbHealth(),
      redis.ping().then(() => true).catch(() => false),
    ]);
    const healthy = dbOk && redisOk;
    return reply.status(healthy ? 200 : 503).send({
      status:    healthy ? 'ok' : 'degraded',
      db:        dbOk    ? 'ok' : 'error',
      redis:     redisOk ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      version:   APP_VERSION,
    });
  });
}
