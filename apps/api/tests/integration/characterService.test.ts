/**
 * Integration tests for characterService.ts.
 *
 * Touches the real DB through both adminDb (for setup — seeding users) and
 * the regular app_user pool via the service itself (subject to RLS). The
 * tests verify both the happy path of each CRUD operation and the RLS
 * isolation guarantee: a query made with user A's context must never see
 * user B's rows.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { adminDb } from '../../src/db/index.js';
import { users, characters, historyEntries } from '../../src/db/schema.js';

if (!adminDb) throw new Error('adminDb is required');

vi.mock('../../src/lib/hibp.js', () => ({
  assertPasswordNotPwned: vi.fn().mockResolvedValue(undefined),
  getPwnedCount: vi.fn().mockResolvedValue(0),
  PwnedPasswordError: class PwnedPasswordError extends Error {},
}));

// We mock the config so MAX_CHARACTERS_PER_USER is low enough to hit in
// a test without inserting 20 rows. The rest of the real config is preserved.
const realConfig = await import('../../src/config.js');
vi.doMock('../../src/config.js', () => ({
  config: { ...realConfig.config, MAX_CHARACTERS_PER_USER: 3 },
}));

const character = await import('../../src/services/characterService.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_EMAIL = 'char-svc-user@example.com';
const OTHER_EMAIL = 'char-svc-other@example.com';

async function seedUser(email: string): Promise<string> {
  await adminDb!.delete(users).where(eq(users.email, email));
  const [row] = await adminDb!
    .insert(users)
    .values({
      email,
      displayName: 'C',
      passwordHash: 'unused',
      emailVerifiedAt: new Date(),
      role: 'user',
      isActive: true,
    })
    .returning({ id: users.id });
  return row.id;
}

let userId: string;
let otherUserId: string;

beforeEach(async () => {
  userId = await seedUser(USER_EMAIL);
  otherUserId = await seedUser(OTHER_EMAIL);
});

// ---------------------------------------------------------------------------
// list / get
// ---------------------------------------------------------------------------

describe('list', () => {
  it('returns an empty array when the user has no characters', async () => {
    expect(await character.list(userId)).toEqual([]);
  });

  it('returns the full data blob for each character, ordered by updatedAt', async () => {
    await character.create(userId, 'First', { hp: 5 });
    await character.create(userId, 'Second', { hp: 8 });

    const list = await character.list(userId);
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('First');
    expect(list[0].data).toEqual({ hp: 5 });
    expect(list[1].name).toBe('Second');
    expect(list[1].data).toEqual({ hp: 8 });
  });

  it('only returns characters belonging to the caller (RLS isolation)', async () => {
    await character.create(userId, 'Mine', {});
    await character.create(otherUserId, 'Yours', {});

    const mine = await character.list(userId);
    expect(mine).toHaveLength(1);
    expect(mine[0].name).toBe('Mine');
  });
});

describe('get', () => {
  it('returns the requested character with its data blob', async () => {
    const created = await character.create(userId, 'Solo', { tribute: 1 });
    const fetched = await character.get(userId, created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.name).toBe('Solo');
    expect(fetched.data).toEqual({ tribute: 1 });
  });

  it('throws NOT_FOUND when the id does not exist', async () => {
    const err = await character
      .get(userId, '00000000-0000-0000-0000-000000000000')
      .catch((e: unknown) => e as Error & { code?: string; statusCode?: number });
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
  });

  it('throws NOT_FOUND when the character belongs to another user (RLS)', async () => {
    const theirs = await character.create(otherUserId, 'Stranger', {});
    const err = await character
      .get(userId, theirs.id)
      .catch((e: unknown) => e as Error & { code?: string });
    expect(err.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe('create', () => {
  it('inserts and returns the new row with timestamps', async () => {
    const before = Date.now();
    const created = await character.create(userId, 'Brand New', { stats: { iron: 3 } });

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.name).toBe('Brand New');
    expect(created.data).toEqual({ stats: { iron: 3 } });
    expect(created.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(created.updatedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('defaults the data blob to {} when omitted', async () => {
    const created = await character.create(userId, 'Empty');
    expect(created.data).toEqual({});
  });

  it('throws LIMIT_REACHED (422) when the per-user cap is hit', async () => {
    await character.create(userId, 'One');
    await character.create(userId, 'Two');
    await character.create(userId, 'Three');
    const err = await character
      .create(userId, 'Four')
      .catch((e: unknown) => e as Error & { code?: string; statusCode?: number });
    expect(err.code).toBe('LIMIT_REACHED');
    expect(err.statusCode).toBe(422);
    expect(err.message).toMatch(/max 3/);
  });

  it('counts characters per-user (RLS): other user filling up does not block you', async () => {
    await character.create(otherUserId, 'O1');
    await character.create(otherUserId, 'O2');
    await character.create(otherUserId, 'O3');

    const mine = await character.create(userId, 'Mine');
    expect(mine.name).toBe('Mine');
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('update', () => {
  it('patches only the name when data is omitted', async () => {
    const created = await character.create(userId, 'Old', { hp: 5 });
    const updated = await character.update(userId, created.id, { name: 'New' });
    expect(updated.name).toBe('New');
    expect(updated.data).toEqual({ hp: 5 });
  });

  it('patches only the data when name is omitted', async () => {
    const created = await character.create(userId, 'Keep', { hp: 5 });
    const updated = await character.update(userId, created.id, { data: { hp: 9 } });
    expect(updated.name).toBe('Keep');
    expect(updated.data).toEqual({ hp: 9 });
  });

  it('throws EMPTY_PATCH (400) when called with no fields', async () => {
    const created = await character.create(userId, 'X');
    const err = await character
      .update(userId, created.id, {})
      .catch((e: unknown) => e as Error & { code?: string; statusCode?: number });
    expect(err.code).toBe('EMPTY_PATCH');
    expect(err.statusCode).toBe(400);
  });

  it('throws NOT_FOUND when the id is unknown', async () => {
    const err = await character
      .update(userId, '00000000-0000-0000-0000-000000000000', { name: 'Z' })
      .catch((e: unknown) => e as Error & { code?: string });
    expect(err.code).toBe('NOT_FOUND');
  });

  it("cannot update another user's character (RLS treats it as not found)", async () => {
    const theirs = await character.create(otherUserId, 'Theirs');
    const err = await character
      .update(userId, theirs.id, { name: 'Hijacked' })
      .catch((e: unknown) => e as Error & { code?: string });
    expect(err.code).toBe('NOT_FOUND');

    // And verify the row was not modified.
    const [row] = await adminDb!.select().from(characters).where(eq(characters.id, theirs.id));
    expect(row.name).toBe('Theirs');
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe('remove', () => {
  it('deletes the row and subsequent get throws NOT_FOUND', async () => {
    const created = await character.create(userId, 'Doomed');
    await character.remove(userId, created.id);
    const err = await character
      .get(userId, created.id)
      .catch((e: unknown) => e as Error & { code?: string });
    expect(err.code).toBe('NOT_FOUND');
  });

  it('throws NOT_FOUND for an unknown id', async () => {
    const err = await character
      .remove(userId, '00000000-0000-0000-0000-000000000000')
      .catch((e: unknown) => e as Error & { code?: string });
    expect(err.code).toBe('NOT_FOUND');
  });

  it("refuses to delete another user's character (RLS)", async () => {
    const theirs = await character.create(otherUserId, 'Safe');
    const err = await character
      .remove(userId, theirs.id)
      .catch((e: unknown) => e as Error & { code?: string });
    expect(err.code).toBe('NOT_FOUND');

    // Row should still exist.
    const rows = await adminDb!.select().from(characters).where(eq(characters.id, theirs.id));
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

describe('history', () => {
  it('appendHistory adds rows and getHistory returns them ordered by occurredAt', async () => {
    const c = await character.create(userId, 'Hist');
    const t0 = new Date('2026-01-01T00:00:00Z');
    const t1 = new Date('2026-01-02T00:00:00Z');
    const t2 = new Date('2026-01-03T00:00:00Z');

    await character.appendHistory(userId, c.id, '<p>two</p>', t1);
    await character.appendHistory(userId, c.id, '<p>three</p>', t2);
    await character.appendHistory(userId, c.id, '<p>one</p>', t0);

    const rows = await character.getHistory(userId, c.id);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.entryHtml)).toEqual(['<p>one</p>', '<p>two</p>', '<p>three</p>']);
  });

  it('appendHistory defaults occurredAt to now() when omitted', async () => {
    const c = await character.create(userId, 'Now');
    const before = Date.now();
    await character.appendHistory(userId, c.id, '<p>x</p>');
    const rows = await character.getHistory(userId, c.id);
    expect(rows[0].occurredAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(rows[0].occurredAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('getHistory honours the limit argument', async () => {
    const c = await character.create(userId, 'Limit');
    for (let i = 0; i < 5; i++) {
      await character.appendHistory(
        userId,
        c.id,
        `<p>${i}</p>`,
        new Date(`2026-01-0${i + 1}T00:00:00Z`),
      );
    }
    const rows = await character.getHistory(userId, c.id, 2);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.entryHtml)).toEqual(['<p>0</p>', '<p>1</p>']);
  });

  it('clearHistory removes all entries for the character (and only that character)', async () => {
    const a = await character.create(userId, 'A');
    const b = await character.create(userId, 'B');

    await character.appendHistory(userId, a.id, '<p>a1</p>');
    await character.appendHistory(userId, a.id, '<p>a2</p>');
    await character.appendHistory(userId, b.id, '<p>b1</p>');

    await character.clearHistory(userId, a.id);

    expect(await character.getHistory(userId, a.id)).toHaveLength(0);
    expect(await character.getHistory(userId, b.id)).toHaveLength(1);
  });

  it('only returns history rows for the calling user (RLS)', async () => {
    const mine = await character.create(userId, 'Mine');
    const theirs = await character.create(otherUserId, 'Theirs');

    await character.appendHistory(userId, mine.id, '<p>mine</p>');
    await character.appendHistory(otherUserId, theirs.id, '<p>theirs</p>');

    const myHist = await character.getHistory(userId, mine.id);
    expect(myHist).toHaveLength(1);
    expect(myHist[0].entryHtml).toBe('<p>mine</p>');

    // And accessing theirs from my context returns nothing.
    const cross = await character.getHistory(userId, theirs.id);
    expect(cross).toHaveLength(0);

    // Sanity: the row really exists when read with the admin pool.
    const all = await adminDb!
      .select()
      .from(historyEntries)
      .where(eq(historyEntries.characterId, theirs.id));
    expect(all).toHaveLength(1);
  });
});
