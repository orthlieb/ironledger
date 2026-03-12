/**
 * Integration test setup.
 *
 * Runs once before all integration tests. Connects to a real PostgreSQL
 * database (the test DB, separate from dev/production), applies migrations,
 * and tears down after the suite.
 *
 * Required environment (set in .env.test or CI environment variables):
 *   DATABASE_URL       = postgres://app_user:test@localhost:5432/ironledger_test
 *   DATABASE_ADMIN_URL = postgres://app_admin:test@localhost:5432/ironledger_test
 *   REDIS_URL          = redis://localhost:6379
 *
 * The test database is wiped and re-migrated before each full test run.
 * Individual tests are responsible for cleaning up the rows they insert,
 * or wrapping their work in a transaction they roll back.
 */

import { beforeAll, afterAll } from 'vitest';
import postgres                from 'postgres';
import { drizzle }             from 'drizzle-orm/postgres-js';
import { migrate }             from 'drizzle-orm/postgres-js/migrator';
import path                    from 'path';
import { fileURLToPath }       from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Set test env before any app module is imported
process.env['NODE_ENV']         = 'test';
process.env['APP_URL']          = 'http://localhost:3000';
process.env['REDIS_URL']        = 'redis://localhost:6379';
process.env['EMAIL_FROM']       = 'test@example.com';
process.env['HCAPTCHA_SECRET']  = '0x0000000000000000000000000000000000000000';
process.env['EMAIL_PROVIDER']   = 'resend';
process.env['RESEND_API_KEY']   = 're_test';
process.env['REFRESH_TOKEN_TTL_DAYS'] = '30';
process.env['JWT_EXPIRES_IN']   = '900';
// JWT keys are generated in the test helper below

import { generateKeyPairSync } from 'crypto';
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
process.env['JWT_PRIVATE_KEY'] = privateKey.replace(/\n/g, '\\n');
process.env['JWT_PUBLIC_KEY']  = publicKey.replace(/\n/g, '\\n');

// ---------------------------------------------------------------------------
// Database lifecycle
// ---------------------------------------------------------------------------

let adminPool: ReturnType<typeof postgres>;

beforeAll(async () => {
  const adminUrl = process.env['DATABASE_ADMIN_URL'];
  if (!adminUrl) {
    throw new Error(
      'DATABASE_ADMIN_URL is required for integration tests.\n' +
      'Set it in .env.test or your CI environment.',
    );
  }

  adminPool = postgres(adminUrl, { max: 1 });
  const db  = drizzle(adminPool);

  // Drop all tables and re-run migrations for a clean slate
  await db.execute(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO app_admin;
    GRANT ALL ON SCHEMA public TO app_user;
  `);

  await migrate(db, {
    migrationsFolder: path.join(__dirname, '../../src/db/migrations'),
  });

  console.log('✔ Test database ready');
}, 30000);

afterAll(async () => {
  await adminPool?.end();
});
