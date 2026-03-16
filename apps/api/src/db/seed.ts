/**
 * Dev seed script — creates (or resets) two verified accounts:
 *
 *   1. admin@ironledger.local / adminpassword123!  (role: admin)
 *   2. dev@ironledger.local   / devpassword123!    (role: user)
 *
 * Both are inserted with emailVerifiedAt already set so you can log in
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
// Seed accounts
// ---------------------------------------------------------------------------

const accounts = [
  { email: 'admin@ironledger.local', password: 'adminpassword123!', role: 'admin' as const },
  { email: 'dev@ironledger.local',   password: 'devpassword123!',   role: 'user'  as const },
];

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
  for (const acct of accounts) {
    const passwordHash = await argon2.hash(acct.password);

    await db
      .insert(schema.users)
      .values({
        email:           acct.email,
        passwordHash,
        emailVerifiedAt: new Date(),   // pre-verified — skips email flow
        isActive:        true,
        role:            acct.role,
      })
      .onConflictDoUpdate({
        target: schema.users.email,
        set: {
          passwordHash,
          emailVerifiedAt: new Date(),
          isActive:        true,
          role:            acct.role,
        },
      });

    console.log(`✅  Seeded ${acct.role}: ${acct.email} / ${acct.password}`);
  }

  console.log(`\n    Login at: http://localhost:5173/login`);
} catch (err) {
  console.error('❌  Seed failed:', err);
  process.exit(1);
} finally {
  await client.end();
}
