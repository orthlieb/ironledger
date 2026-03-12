/**
 * Migration runner — executed during deploy, before the new app version starts.
 *
 * Run with:  npm run migrate   (from apps/api, or from monorepo root)
 *
 * Uses the DATABASE_ADMIN_URL (app_admin role) which bypasses RLS so it can
 * CREATE/ALTER tables that the app_user role cannot touch.
 *
 * Migrations live in src/db/migrations/ as plain .sql files, named:
 *   0001_initial.sql
 *   0002_add_refresh_token_family.sql
 *   ...
 *
 * Each file is run exactly once. Applied migrations are tracked in the
 * __drizzle_migrations table that Drizzle manages automatically.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { config } from '../config.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  if (!config.DATABASE_ADMIN_URL) {
    console.error('❌ DATABASE_ADMIN_URL is required to run migrations.');
    process.exit(1);
  }

  console.log('▶ Connecting to database...');
  const migrationPool = postgres(config.DATABASE_ADMIN_URL, {
    max: 1,
    onnotice: () => {},  // suppress NOTICE messages from migrations
  });

  const db = drizzle(migrationPool);

  console.log('▶ Running migrations...');
  try {
    await migrate(db, {
      migrationsFolder: path.join(__dirname, 'migrations'),
    });
    console.log('✅ Migrations complete.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await migrationPool.end();
  }
}

runMigrations();
