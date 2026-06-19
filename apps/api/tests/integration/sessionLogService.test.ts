/**
 * Integration tests for sessionLogService.ts.
 *
 * Real DB. The service uses raw SQL with the user_id RLS context — tests
 * verify the happy path of each operation plus the rolling 1000-entry cap
 * trigger logic. The cap test stops at 1001 entries (one over the cap) so
 * we keep test runtime sane.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq, count } from 'drizzle-orm';
import { adminDb } from '../../src/db/index.js';
import { users, sessionLogEntries } from '../../src/db/schema.js';

if (!adminDb) throw new Error('adminDb is required');

vi.mock('../../src/lib/hibp.js', () => ({
  assertPasswordNotPwned: vi.fn().mockResolvedValue(undefined),
  getPwnedCount: vi.fn().mockResolvedValue(0),
  PwnedPasswordError: class PwnedPasswordError extends Error {},
}));

const log = await import('../../src/services/sessionLogService.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_EMAIL = 'log-svc-user@example.com';
const OTHER_EMAIL = 'log-svc-other@example.com';

async function seedUser(email: string): Promise<string> {
  await adminDb!.delete(users).where(eq(users.email, email));
  const [row] = await adminDb!
    .insert(users)
    .values({
      email,
      displayName: 'L',
      passwordHash: 'unused',
      emailVerifiedAt: new Date(),
      role: 'user',
      isActive: true,
    })
    .returning({ id: users.id });
  return row.id;
}

function entry(id: string, ts: string, extras: Record<string, unknown> = {}) {
  return {
    id,
    title: `Entry ${id}`,
    html: `<p>${id}</p>`,
    ts,
    ...extras,
  };
}

let userId: string;
let otherUserId: string;

beforeEach(async () => {
  userId = await seedUser(USER_EMAIL);
  otherUserId = await seedUser(OTHER_EMAIL);
});

// ---------------------------------------------------------------------------
// appendEntry + getLog
// ---------------------------------------------------------------------------

describe('appendEntry / getLog', () => {
  it('inserts an entry and getLog returns it', async () => {
    await log.appendEntry(userId, entry('e1', '2026-01-01T00:00:00Z', { note: 'first' }));
    const rows = await log.getLog(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('e1');
    expect(rows[0].note).toBe('first');
  });

  it('getLog returns entries newest-first', async () => {
    await log.appendEntry(userId, entry('e1', '2026-01-01T00:00:00Z'));
    await log.appendEntry(userId, entry('e2', '2026-01-02T00:00:00Z'));
    await log.appendEntry(userId, entry('e3', '2026-01-03T00:00:00Z'));

    const rows = await log.getLog(userId);
    expect(rows.map((r) => r.id)).toEqual(['e3', 'e2', 'e1']);
  });

  it('appendEntry is idempotent on duplicate entry_id (ON CONFLICT DO NOTHING)', async () => {
    await log.appendEntry(userId, entry('dup', '2026-01-01T00:00:00Z', { note: 'first' }));
    await log.appendEntry(userId, entry('dup', '2026-01-01T00:00:00Z', { note: 'second' }));

    const rows = await log.getLog(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe('first'); // original is kept
  });

  it('getLog honours the limit argument', async () => {
    for (let i = 1; i <= 5; i++) {
      await log.appendEntry(userId, entry(`e${i}`, `2026-01-0${i}T00:00:00Z`));
    }
    const rows = await log.getLog(userId, 2);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.id)).toEqual(['e5', 'e4']);
  });

  it('getLog with `before` returns only entries older than the cursor', async () => {
    await log.appendEntry(userId, entry('e1', '2026-01-01T00:00:00Z'));
    await log.appendEntry(userId, entry('e2', '2026-01-02T00:00:00Z'));
    await log.appendEntry(userId, entry('e3', '2026-01-03T00:00:00Z'));

    const rows = await log.getLog(userId, 100, '2026-01-03T00:00:00Z');
    expect(rows.map((r) => r.id)).toEqual(['e2', 'e1']);
  });

  it('isolates per-user (RLS): user A cannot see user B\'s entries', async () => {
    await log.appendEntry(userId, entry('mine', '2026-01-01T00:00:00Z'));
    await log.appendEntry(otherUserId, entry('theirs', '2026-01-01T00:00:00Z'));

    const mine = await log.getLog(userId);
    expect(mine.map((r) => r.id)).toEqual(['mine']);

    const theirs = await log.getLog(otherUserId);
    expect(theirs.map((r) => r.id)).toEqual(['theirs']);
  });
});

// ---------------------------------------------------------------------------
// updateEntry
// ---------------------------------------------------------------------------

describe('updateEntry', () => {
  it('merges the patch into the existing entry JSONB', async () => {
    await log.appendEntry(
      userId,
      entry('e1', '2026-01-01T00:00:00Z', { note: 'original' }),
    );
    await log.updateEntry(userId, 'e1', { note: 'edited', source: 'manual' });

    const [r] = await log.getLog(userId);
    expect(r.note).toBe('edited');
    expect(r.source).toBe('manual');
    expect(r.title).toBe('Entry e1'); // unchanged
  });

  it('is a no-op when the entry_id is unknown', async () => {
    await log.updateEntry(userId, 'does-not-exist', { note: 'x' });
    expect(await log.getLog(userId)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deleteEntry / clearLog
// ---------------------------------------------------------------------------

describe('deleteEntry', () => {
  it('removes a single entry', async () => {
    await log.appendEntry(userId, entry('keep', '2026-01-01T00:00:00Z'));
    await log.appendEntry(userId, entry('drop', '2026-01-02T00:00:00Z'));

    await log.deleteEntry(userId, 'drop');

    const rows = await log.getLog(userId);
    expect(rows.map((r) => r.id)).toEqual(['keep']);
  });

  it('is a no-op when the entry does not exist', async () => {
    await log.appendEntry(userId, entry('e1', '2026-01-01T00:00:00Z'));
    await log.deleteEntry(userId, 'never-existed');
    expect(await log.getLog(userId)).toHaveLength(1);
  });
});

describe('clearLog', () => {
  it('removes every entry for the user', async () => {
    await log.appendEntry(userId, entry('e1', '2026-01-01T00:00:00Z'));
    await log.appendEntry(userId, entry('e2', '2026-01-02T00:00:00Z'));

    await log.clearLog(userId);
    expect(await log.getLog(userId)).toEqual([]);
  });

  it('only affects the calling user\'s rows', async () => {
    await log.appendEntry(userId, entry('mine', '2026-01-01T00:00:00Z'));
    await log.appendEntry(otherUserId, entry('theirs', '2026-01-01T00:00:00Z'));

    await log.clearLog(userId);

    expect(await log.getLog(userId)).toEqual([]);
    expect(await log.getLog(otherUserId)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Rolling cap
// ---------------------------------------------------------------------------

describe('rolling cap', () => {
  it('caps the per-user log at 1000 entries — the oldest is dropped when the 1001st is added', async () => {
    // Seed exactly 1000 entries via the admin pool to bypass RLS and keep
    // the test fast — appending 1000 through the service is slow because
    // each append runs the cap-enforcing DELETE.
    const baseTs = Date.parse('2026-01-01T00:00:00Z');
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      userId,
      entryId: `seed-${i.toString().padStart(4, '0')}`,
      entry: { id: `seed-${i.toString().padStart(4, '0')}`, title: 't', html: 'h', ts: new Date(baseTs + i * 60_000).toISOString() },
      occurredAt: new Date(baseTs + i * 60_000),
    }));
    await adminDb!.insert(sessionLogEntries).values(rows);

    const [{ c: countBefore }] = await adminDb!
      .select({ c: count() })
      .from(sessionLogEntries)
      .where(eq(sessionLogEntries.userId, userId));
    expect(Number(countBefore)).toBe(1000);

    // Append the 1001st entry — far in the future so it's the newest.
    await log.appendEntry(
      userId,
      entry('newest', new Date(baseTs + 9999 * 60_000).toISOString()),
    );

    const [{ c: countAfter }] = await adminDb!
      .select({ c: count() })
      .from(sessionLogEntries)
      .where(eq(sessionLogEntries.userId, userId));
    expect(Number(countAfter)).toBe(1000);

    // The newest must still be there.
    const top = await log.getLog(userId, 1);
    expect(top[0].id).toBe('newest');

    // And the very oldest (seed-0000) must have been dropped.
    const oldest = await adminDb!
      .select()
      .from(sessionLogEntries)
      .where(eq(sessionLogEntries.entryId, 'seed-0000'));
    expect(oldest).toHaveLength(0);
  });
});
