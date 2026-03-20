/**
 * Entry point — builds the server and starts listening.
 *
 * Kept intentionally thin. All server configuration lives in server.ts
 * so that tests can call buildServer() without starting a real listener.
 */

import { buildServer, redis } from './server.js';
import { pool } from './db/index.js';

const server = await buildServer();

// ---------------------------------------------------------------------------
// Graceful shutdown
//
// On SIGTERM (sent by PM2/systemd on restart) or SIGINT (Ctrl+C in dev):
//   1. Stop accepting new connections
//   2. Wait for in-flight requests to complete (Fastify's close() does this)
//   3. Close the database pool and Redis connection cleanly
//
// This prevents dropped requests during a zero-downtime restart.
// ---------------------------------------------------------------------------

async function shutdown(signal: string) {
  server.log.info(`Received ${signal}, shutting down...`);

  try {
    await server.close();           // stops accepting, drains in-flight requests
    await pool.end();               // closes all DB connections
    await redis.quit();             // sends QUIT to Redis
    server.log.info('Shutdown complete.');
    process.exit(0);
  } catch (err) {
    server.log.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ---------------------------------------------------------------------------
// Unhandled rejections / uncaught exceptions
//
// Log the error before crashing so we have a record of what went wrong.
// PM2/systemd will restart the process automatically.
// ---------------------------------------------------------------------------

process.on('unhandledRejection', (reason) => {
  server.log.error({ reason }, 'Unhandled promise rejection');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  server.log.error({ err }, 'Uncaught exception');
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------

try {
  await server.listen({
    port: 3000,
    host: '0.0.0.0',   // listen on all interfaces — Nginx proxies to this
  });
} catch (err) {
  server.log.error(err, 'Failed to start server');
  process.exit(1);
}
