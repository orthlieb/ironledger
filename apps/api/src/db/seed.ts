/**
 * Dev seed script — creates (or resets) a verified user account.
 *
 * Usage:
 *   npm run seed                                    # uses defaults
 *   npm run seed -- admin@example.com MyPassword1!  # custom email + password
 *
 * The user is inserted with emailVerifiedAt already set so you can log in
 * immediately without going through the email flow. Safe to re-run —
 * existing records are updated (upsert on email).
 *
 * Run only in development. The script refuses to run in NODE_ENV=production.
 */

import argon2 from 'argon2';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { config } from '../config.js';
import * as schema from './schema.js';

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

if (config.NODE_ENV === 'production') {
  console.error('❌  Refusing to run seed in production.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const email    = process.argv[2] ?? 'dev@ironledger.local';
const password = process.argv[3] ?? 'devpassword123!';

if (password.length < 12) {
  console.error('❌  Password must be at least 12 characters.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Connect (admin bypasses RLS)
// ---------------------------------------------------------------------------

const connectionUrl = config.DATABASE_ADMIN_URL ?? config.DATABASE_URL;
const client = postgres(connectionUrl, { max: 1 });
const db     = drizzle(client, { schema });

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

try {
  const passwordHash = await argon2.hash(password);

  await db
    .insert(schema.users)
    .values({
      email,
      passwordHash,
      emailVerifiedAt: new Date(),   // pre-verified — skips email flow
      isActive:        true,
    })
    .onConflictDoUpdate({
      target: schema.users.email,
      set: {
        passwordHash,
        emailVerifiedAt: new Date(),
        isActive:        true,
      },
    });

  console.log(`✅  Seeded user: ${email}`);
  console.log(`    Password:    ${password}`);
  console.log(`    Login at:    http://localhost:5173/login`);
} catch (err) {
  console.error('❌  Seed failed:', err);
  process.exit(1);
} finally {
  await client.end();
}
