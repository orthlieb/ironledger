/**
 * Admin service — business logic for admin-only operations.
 *
 * All queries use adminDb (bypasses RLS) since the admin needs
 * cross-user visibility. Guards at the route layer ensure only
 * authenticated admins can call these functions.
 */

import { eq, sql, count, desc, or, ilike } from 'drizzle-orm';
import { adminDb } from '../db/index.js';
import { users, characters, userData, securityEvents } from '../db/schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminUser {
  id:              string;
  email:           string;
  role:            string;
  isActive:        boolean;
  createdAt:       string;
  lastLoginAt:     string | null;
  characterCount:  number;
  encounterCount:  number;
  expeditionCount: number;
}

export interface AdminStats {
  totalUsers:       number;
  activeUsers7d:    number;
  activeUsers30d:   number;
  totalCharacters:  number;
  totalEncounters:  number;
  totalExpeditions: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireAdminDb() {
  if (!adminDb) throw Object.assign(new Error('Admin DB not configured'), { code: 'CONFIG_ERROR', statusCode: 500 });
  return adminDb;
}

/** Write an immutable audit trail entry to security_events. */
async function logEvent(
  adminId: string,
  eventType: string,
  metadata: Record<string, unknown>,
  ip?: string,
): Promise<void> {
  const db = requireAdminDb();
  await db.insert(securityEvents).values({
    userId:    adminId,
    eventType,
    ipAddress: ip ?? null,
    metadata,
  });
}

// ---------------------------------------------------------------------------
// List users
// ---------------------------------------------------------------------------

export async function listUsers(): Promise<AdminUser[]> {
  const db = requireAdminDb();

  // Parallel queries: users, character counts, user_data (encounters/expeditions)
  const [rows, charRows, udRows] = await Promise.all([
    db
      .select({
        id:          users.id,
        email:       users.email,
        role:        users.role,
        isActive:    users.isActive,
        createdAt:   users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .orderBy(users.createdAt),

    db
      .select({
        userId: characters.userId,
        count:  count(),
      })
      .from(characters)
      .groupBy(characters.userId),

    db
      .select({
        userId:      userData.userId,
        encounters:  userData.encounters,
        expeditions: userData.expeditions,
      })
      .from(userData),
  ]);

  const charMap = new Map(charRows.map((r) => [r.userId, r.count]));
  const udMap   = new Map(udRows.map((r) => [r.userId, r]));

  return rows.map((r) => {
    const ud = udMap.get(r.id);
    const encounters = Array.isArray(ud?.encounters) ? ud.encounters : [];
    const expeditions = Array.isArray(ud?.expeditions) ? ud.expeditions : [];

    return {
      id:              r.id,
      email:           r.email,
      role:            r.role,
      isActive:        r.isActive,
      createdAt:       r.createdAt.toISOString(),
      lastLoginAt:     r.lastLoginAt?.toISOString() ?? null,
      characterCount:  charMap.get(r.id) ?? 0,
      encounterCount:  encounters.length,
      expeditionCount: expeditions.length,
    };
  });
}

// ---------------------------------------------------------------------------
// Get system stats
// ---------------------------------------------------------------------------

export async function getStats(): Promise<AdminStats> {
  const db = requireAdminDb();

  const now = new Date();
  const d7  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Run all counts in parallel
  const [userStats, charCount, udRows] = await Promise.all([
    db.select({
      total:     count(),
      active7d:  sql<number>`count(*) filter (where ${users.lastLoginAt} >= ${d7.toISOString()})::int`,
      active30d: sql<number>`count(*) filter (where ${users.lastLoginAt} >= ${d30.toISOString()})::int`,
    }).from(users),

    db.select({ total: count() }).from(characters),

    db.select({
      encounters:  userData.encounters,
      expeditions: userData.expeditions,
    }).from(userData),
  ]);

  let totalEncounters = 0;
  let totalExpeditions = 0;
  for (const r of udRows) {
    if (Array.isArray(r.encounters))  totalEncounters  += r.encounters.length;
    if (Array.isArray(r.expeditions)) totalExpeditions += r.expeditions.length;
  }

  return {
    totalUsers:       userStats[0]?.total ?? 0,
    activeUsers7d:    userStats[0]?.active7d ?? 0,
    activeUsers30d:   userStats[0]?.active30d ?? 0,
    totalCharacters:  charCount[0]?.total ?? 0,
    totalEncounters,
    totalExpeditions,
  };
}

// ---------------------------------------------------------------------------
// Delete user (cascading — ON DELETE CASCADE handles all child tables)
// ---------------------------------------------------------------------------

export async function deleteUser(
  userId: string,
  adminId: string,
  ip?: string,
): Promise<void> {
  const db = requireAdminDb();

  // Fetch the target email before deleting (for audit trail — user row gone after delete)
  const [target] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!target) {
    throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND', statusCode: 404 });
  }

  await db.delete(users).where(eq(users.id, userId));

  // Audit log — fire-and-forget (don't fail the request if logging fails)
  void logEvent(adminId, 'admin_delete_user', {
    targetUserId: userId,
    targetEmail:  target.email,
  }, ip).catch(console.error);
}

// ---------------------------------------------------------------------------
// Set user role (promote/demote)
// ---------------------------------------------------------------------------

export async function setUserRole(
  userId: string,
  role: string,
  adminId: string,
  ip?: string,
): Promise<void> {
  const db = requireAdminDb();

  if (role !== 'user' && role !== 'admin') {
    throw Object.assign(new Error('Invalid role'), { code: 'INVALID_ROLE', statusCode: 400 });
  }

  // Fetch previous role for the audit trail
  const [target] = await db
    .select({ email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!target) {
    throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND', statusCode: 404 });
  }

  await db
    .update(users)
    .set({ role })
    .where(eq(users.id, userId));

  // Audit log
  void logEvent(adminId, 'admin_set_role', {
    targetUserId: userId,
    targetEmail:  target.email,
    previousRole: target.role,
    newRole:      role,
  }, ip).catch(console.error);
}

// ---------------------------------------------------------------------------
// Audit log — read security_events for admin dashboard
// ---------------------------------------------------------------------------

export interface AuditEvent {
  id:         string;
  adminId:    string | null;
  adminEmail: string | null;
  eventType:  string;
  ipAddress:  string | null;
  metadata:   Record<string, unknown> | null;
  createdAt:  string;
}

export async function getAuditLog(limit = 100, search?: string): Promise<AuditEvent[]> {
  const db = requireAdminDb();

  let query = db
    .select({
      id:         securityEvents.id,
      adminId:    securityEvents.userId,
      adminEmail: users.email,
      eventType:  securityEvents.eventType,
      ipAddress:  securityEvents.ipAddress,
      metadata:   securityEvents.metadata,
      createdAt:  securityEvents.createdAt,
    })
    .from(securityEvents)
    .leftJoin(users, eq(securityEvents.userId, users.id))
    .orderBy(desc(securityEvents.createdAt))
    .limit(limit)
    .$dynamic();

  if (search) {
    const pattern = `%${search}%`;
    query = query.where(
      or(
        ilike(users.email, pattern),
        sql`${securityEvents.metadata}->>'targetEmail' ILIKE ${pattern}`,
        sql`${securityEvents.metadata}->>'email' ILIKE ${pattern}`,
        sql`${securityEvents.metadata}->>'userEmail' ILIKE ${pattern}`,
      ),
    );
  }

  const rows = await query;

  return rows.map((r) => ({
    id:         r.id,
    adminId:    r.adminId,
    adminEmail: r.adminEmail ?? null,
    eventType:  r.eventType,
    ipAddress:  r.ipAddress,
    metadata:   r.metadata as Record<string, unknown> | null,
    createdAt:  r.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Clear audit log
// ---------------------------------------------------------------------------

export async function clearAuditLog(adminId: string, ip?: string): Promise<void> {
  const db = requireAdminDb();
  await db.delete(securityEvents);
  // Log the clear action itself (so it's never truly empty after a clear)
  await logEvent(adminId, 'admin_clear_audit', {}, ip);
}
