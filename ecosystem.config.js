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
    {
      name:         'ironledger',
      script:       'apps/api/dist/main.js',
      cwd:          '/home/ironledger/app',

      // Load secrets from the .env file (chmod 600, never committed to git)
      env_file:     '/home/ironledger/.env',

      // Run 2 workers in cluster mode — uses both CPU cores on a 2-vCPU VPS
      // and allows zero-downtime restarts (PM2 restarts one worker at a time)
      instances:    2,
      exec_mode:    'cluster',

      // Restart policy
      autorestart:  true,
      max_restarts: 10,         // give up after 10 crashes in a row
      min_uptime:   '10s',      // must stay alive 10s to count as successful start
      restart_delay: 1000,      // wait 1s between restart attempts

      // Graceful shutdown — wait up to 10s for in-flight requests to finish
      kill_timeout:   10000,
      listen_timeout: 8000,     // wait 8s for the app to signal it's ready

      // Log files
      out_file:     '/home/ironledger/logs/out.log',
      error_file:   '/home/ironledger/logs/error.log',
      merge_logs:   true,       // combine logs from all cluster workers
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Rotate logs when they reach 10MB, keep 7 days
      log_type:     'json',

      // Environment — supplemented by env_file
      env: {
        NODE_ENV: 'production',
        PORT:     '3000',
      },
    },
  ],
};
