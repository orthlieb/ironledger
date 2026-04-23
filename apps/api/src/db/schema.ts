import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  inet,
  jsonb,
  integer,
  bigint,
  customType,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/** Drizzle customType for Postgres BYTEA ↔ Node Buffer. */
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() { return 'bytea'; },
});

// ---------------------------------------------------------------------------
// users
// Core identity table. One row per registered account.
// ---------------------------------------------------------------------------
export const users = pgTable('users', {
  id:                uuid('id').primaryKey().defaultRandom(),
  email:             text('email').notNull().unique(),
  displayName:       text('display_name').notNull(),   // service-layer default: email when blank
  emailVerifiedAt:   timestamp('email_verified_at', { withTimezone: true }),
  passwordHash:      text('password_hash').notNull(),
  isActive:          boolean('is_active').notNull().default(true),
  role:              text('role').notNull().default('user'),   // 'user' | 'admin'
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
//   • encounters    — active foe encounters
//   • expeditions   — active journey/site expeditions
//   • communities   — region/settlement cards
//   • npcs          — standalone NPC cards
//
// Upserted on every write; the row is created automatically on first access.
// ---------------------------------------------------------------------------
export const userData = pgTable('user_data', {
  userId:       uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  encounters:   jsonb('encounters').notNull().default([]),
  expeditions:  jsonb('expeditions').notNull().default([]),
  communities:  jsonb('communities').notNull().default([]),
  npcs:         jsonb('npcs').notNull().default([]),
  sessionState: jsonb('session_state').notNull().default({}),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserData    = typeof userData.$inferSelect;
export type NewUserData = typeof userData.$inferInsert;

// ---------------------------------------------------------------------------
// session_log_entries
// One row per session log entry. The full LogEntry object is stored as JSONB
// so the shape can evolve without migrations. occurred_at is a real column
// for ORDER BY / cursor pagination. A rolling cap of 1000 entries is enforced
// in sessionLogService on every INSERT.
// ---------------------------------------------------------------------------
export const sessionLogEntries = pgTable('session_log_entries', {
  id:         uuid('id').primaryKey().defaultRandom(),
  userId:     uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entryId:    text('entry_id').notNull(),
  entry:      jsonb('entry').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('session_log_entries_user_entry_idx').on(t.userId, t.entryId),
  index('session_log_entries_user_occurred_idx').on(t.userId, t.occurredAt),
]);

export type SessionLogEntry    = typeof sessionLogEntries.$inferSelect;
export type NewSessionLogEntry = typeof sessionLogEntries.$inferInsert;

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
// ---------------------------------------------------------------------------
// user_invites
// Admin-issued single-use invitations. Consumed/revoked rows are retained
// for audit. See docs/admin.md for the flow.
// ---------------------------------------------------------------------------
export const userInvites = pgTable('user_invites', {
  id:              uuid('id').primaryKey().defaultRandom(),
  email:           text('email').notNull(),
  displayName:     text('display_name'),
  role:            text('role').notNull().default('user'),
  tokenHash:       text('token_hash').notNull().unique(),
  invitedBy:       uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  expiresAt:       timestamp('expires_at',      { withTimezone: true }).notNull(),
  acceptedAt:      timestamp('accepted_at',     { withTimezone: true }),
  acceptedUserId:  uuid('accepted_user_id').references(() => users.id, { onDelete: 'set null' }),
  revokedAt:       timestamp('revoked_at',      { withTimezone: true }),
  createdAt:       timestamp('created_at',      { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('user_invites_email_idx').on(t.email),
  index('user_invites_expires_at_idx').on(t.expiresAt),
]);

export type UserInvite    = typeof userInvites.$inferSelect;
export type NewUserInvite = typeof userInvites.$inferInsert;

export type User             = typeof users.$inferSelect;
export type NewUser          = typeof users.$inferInsert;
export type RefreshToken     = typeof refreshTokens.$inferSelect;
export type AuthToken        = typeof authTokens.$inferSelect;
export type Character        = typeof characters.$inferSelect;
export type NewCharacter     = typeof characters.$inferInsert;
export type HistoryEntry     = typeof historyEntries.$inferSelect;
export type NewHistoryEntry  = typeof historyEntries.$inferInsert;
export type SecurityEvent    = typeof securityEvents.$inferSelect;

