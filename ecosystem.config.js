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
 *
 * Env loading: we pass --env-file-if-exists to Node directly via node_args
 * rather than relying on PM2's env_file: directive. PM2 v6's env_file is
 * silently ignored on some installs (the workers boot with no .env vars,
 * the inline `env:` block alone, and a long-lived daemon's inherited env);
 * Node 20.6+'s built-in flag loads the file at process start regardless of
 * how PM2 was invoked. The app's main entrypoint also calls
 * process.loadEnvFile() defensively so behaviour is identical even if
 * node_args drops off.
 */

const ENV_FILE = '/home/ironledger/app/.env';

module.exports = {
  apps: [
    // ── Fastify API ──────────────────────────────────────────────────────────
    {
      name:         'ironledger-api',
      script:       'apps/api/dist/main.js',
      cwd:          '/home/ironledger/app',
      node_args:    [`--env-file-if-exists=${ENV_FILE}`],

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
      node_args:    [`--env-file-if-exists=${ENV_FILE}`],

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
