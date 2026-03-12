import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { config } from '../config.js';
import * as schema from './schema.js';

// ---------------------------------------------------------------------------
// Connection pools
//
// Two pools for two purposes:
//
//   pool     — connects as app_user, subject to RLS. Used by all API requests.
//   adminPool — connects as app_admin, bypasses RLS. Used only by the
//               migration runner (migrate.ts). Never used at request time.
//
// Max connections: PostgreSQL's default max_connections is 100. With 2 PM2
// workers each holding up to 10 connections, we use 20 total — leaving
// headroom for pg_dump, psql sessions, and future workers.
// ---------------------------------------------------------------------------

export const pool = postgres(config.DATABASE_URL, {
  max:         10,
  idle_timeout: 30,   // close idle connections after 30s
  connect_timeout: 10, // fail fast if DB is unreachable
});

export const db = drizzle(pool, { schema, logger: config.NODE_ENV === 'development' });

// Admin pool — only created if DATABASE_ADMIN_URL is set (i.e. in migration scripts)
export const adminPool = config.DATABASE_ADMIN_URL
  ? postgres(config.DATABASE_ADMIN_URL, { max: 1 })
  : null;

export const adminDb = adminPool
  ? drizzle(adminPool, { schema })
  : null;

// ---------------------------------------------------------------------------
// RLS context injection
//
// PostgreSQL Row-Level Security policies check current_setting('app.user_id')
// to decide which rows a query can see. We must set this on each connection
// before executing any query.
//
// Usage:
//   const result = await withUserContext(userId, async (tx) => {
//     return tx.select().from(characters);
//   });
//
// The callback receives a transaction-scoped db client with the user context
// already set. Queries outside this wrapper will fail the RLS check.
// ---------------------------------------------------------------------------

export async function withUserContext<T>(
  userId: string,
  fn: (tx: typeof db) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // Set the user_id for RLS policies on this connection
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

// ---------------------------------------------------------------------------
// Health check — used by the /health route and deploy script
// ---------------------------------------------------------------------------

export async function checkDbHealth(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}
