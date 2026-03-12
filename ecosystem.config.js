/**
 * PM2 ecosystem config — production process management.
 *
 * Start with:   pm2 start ecosystem.config.js
 * Reload with:  pm2 reload ironledger --update-env
 * Monitor with: pm2 monit
 * Logs with:    pm2 logs ironledger
 *
 * Do NOT commit ecosystem.config.local.js — that file holds per-machine
 * overrides (e.g. different env_file paths) and is in .gitignore.
 */

module.exports = {
  apps: [
    // ── Fastify API ──────────────────────────────────────────────────────────
    {
      name:         'ironledger-api',
      script:       'apps/api/dist/main.js',
      cwd:          '/home/ironledger/app',
      env_file:     '/home/ironledger/.env',

      // 2 cluster workers for zero-downtime reloads on a 2-vCPU VPS
      instances:    2,
      exec_mode:    'cluster',

      autorestart:  true,
      max_restarts: 10,
      min_uptime:   '10s',
      restart_delay: 1000,
      kill_timeout:   10000,
      listen_timeout: 8000,

      out_file:     '/home/ironledger/logs/api-out.log',
      error_file:   '/home/ironledger/logs/api-error.log',
      merge_logs:   true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      log_type:     'json',

      env: {
        NODE_ENV: 'production',
        PORT:     '3000',
      },
    },

    // ── SvelteKit Web ────────────────────────────────────────────────────────
    {
      name:         'ironledger-web',
      // adapter-node outputs a Node.js server at apps/web/build/index.js
      script:       'apps/web/build/index.js',
      cwd:          '/home/ironledger/app',
      env_file:     '/home/ironledger/.env',

      // Single instance is fine — SvelteKit is mostly SSR + proxying
      instances:    1,
      exec_mode:    'fork',

      autorestart:  true,
      max_restarts: 10,
      min_uptime:   '10s',
      restart_delay: 1000,
      kill_timeout:   10000,
      listen_timeout: 8000,

      out_file:     '/home/ironledger/logs/web-out.log',
      error_file:   '/home/ironledger/logs/web-error.log',
      merge_logs:   true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      log_type:     'json',

      env: {
        NODE_ENV:          'production',
        PORT:              '3001',   // Nginx proxies 443 → 3001
        INTERNAL_API_URL:  'http://localhost:3000',
      },
    },
  ],
};
