import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  inet,
  jsonb,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// users
// Core identity table. One row per registered account.
// ---------------------------------------------------------------------------
export const users = pgTable('users', {
  id:                uuid('id').primaryKey().defaultRandom(),
  email:             text('email').notNull().unique(),
  emailVerifiedAt:   timestamp('email_verified_at', { withTimezone: true }),
  passwordHash:      text('password_hash').notNull(),
  isActive:          boolean('is_active').notNull().default(true),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt:       timestamp('last_login_at', { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// refresh_tokens
// Stateful refresh tokens. Stored hashed — the raw token lives only on the
// client (in an HttpOnly cookie). One row per active session/device.
// Revoked tokens are kept briefly for theft detection, then pruned by a cron.
// ---------------------------------------------------------------------------
export const refreshTokens = pgTable('refresh_tokens', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash:   text('token_hash').notNull().unique(),
  familyId:    uuid('family_id').notNull(),   // groups tokens in a rotation chain
  expiresAt:   timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt:   timestamp('revoked_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  userAgent:   text('user_agent'),
  ipAddress:   inet('ip_address'),
}, (t) => [
  index('refresh_tokens_user_id_idx').on(t.userId),
  index('refresh_tokens_family_id_idx').on(t.familyId),
]);

// ---------------------------------------------------------------------------
// auth_tokens
// Short-lived, single-use tokens for email verification and password reset.
// The raw token is sent in the email link; only the hash is stored here.
// ---------------------------------------------------------------------------
export const authTokens = pgTable('auth_tokens', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  purpose:   text('purpose').notNull(),   // 'verify_email' | 'reset_password'
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt:    timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('auth_tokens_user_id_idx').on(t.userId),
]);

// ---------------------------------------------------------------------------
// characters
// One row per character. The full character state lives in `data` as JSONB.
// This mirrors the existing localStorage format exactly, making migration
// from the static app straightforward.
// ---------------------------------------------------------------------------
export const characters = pgTable('characters', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  data:      jsonb('data').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('characters_user_id_idx').on(t.userId),
]);

// ---------------------------------------------------------------------------
// user_data
// One row per user. Stores global (non-character) game state as JSONB:
//   • encounters — active foe encounters (mirrors localStorage['oracle-combats'])
//   • expeditions — active journey/site expeditions (future)
//
// Upserted on every write; the row is created automatically on first access.
// ---------------------------------------------------------------------------
export const userData = pgTable('user_data', {
  userId:      uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  encounters:  jsonb('encounters').notNull().default([]),
  expeditions: jsonb('expeditions').notNull().default([]),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserData    = typeof userData.$inferSelect;
export type NewUserData = typeof userData.$inferInsert;

// ---------------------------------------------------------------------------
// history_entries
// Append-only log of every game event (rolls, resource changes, etc.).
// Stored as HTML — the same format the existing app writes to localStorage.
// Never updated or deleted by the app; only the user can clear their own log.
// ---------------------------------------------------------------------------
export const historyEntries = pgTable('history_entries', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  characterId: uuid('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  entryHtml:   text('entry_html').notNull(),
  occurredAt:  timestamp('occurred_at', { withTimezone: true }).notNull(),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('history_entries_character_id_idx').on(t.characterId),
  index('history_entries_occurred_at_idx').on(t.occurredAt),
]);

// ---------------------------------------------------------------------------
// security_events
// Immutable audit log. Written on login attempts, password resets,
// token theft detection, and rate limit violations. Never deleted.
// user_id is nullable because some events happen before authentication
// (e.g. a failed login attempt for an unknown email address).
// ---------------------------------------------------------------------------
export const securityEvents = pgTable('security_events', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id'),   // intentionally no FK — user may not exist
  eventType: text('event_type').notNull(),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  metadata:  jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('security_events_user_id_idx').on(t.userId),
  index('security_events_event_type_idx').on(t.eventType),
  index('security_events_created_at_idx').on(t.createdAt),
]);

// ---------------------------------------------------------------------------
// TypeScript types inferred from the schema
// Import these wherever you need typed row objects.
// ---------------------------------------------------------------------------
export type User             = typeof users.$inferSelect;
export type NewUser          = typeof users.$inferInsert;
export type RefreshToken     = typeof refreshTokens.$inferSelect;
export type AuthToken        = typeof authTokens.$inferSelect;
export type Character        = typeof characters.$inferSelect;
export type NewCharacter     = typeof characters.$inferInsert;
export type HistoryEntry     = typeof historyEntries.$inferSelect;
export type NewHistoryEntry  = typeof historyEntries.$inferInsert;
export type SecurityEvent    = typeof securityEvents.$inferSelect;
