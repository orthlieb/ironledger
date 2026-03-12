/**
 * Character service — CRUD for character data.
 *
 * All operations go through withUserContext() so PostgreSQL RLS enforces
 * that users can only touch their own characters — even if a bug in the
 * route layer passes the wrong userId.
 */

import { eq, and } from 'drizzle-orm';
import { withUserContext } from '../db/index.js';
import { characters, historyEntries, type Character } from '../db/schema.js';

// ---------------------------------------------------------------------------
// Domain errors
// ---------------------------------------------------------------------------

export class CharacterError extends Error {
  constructor(
    message: string,
    public readonly code:       string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'CharacterError';
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// The shape of the character data blob stored in JSONB.
// Keep this loose (Record) — the game format can evolve without a migration.
export type CharacterData = Record<string, unknown>;

export interface CharacterSummary {
  id:        string;
  name:      string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CharacterFull extends CharacterSummary {
  data: CharacterData;
}

// ---------------------------------------------------------------------------
// list — all characters for the authenticated user (full data included)
// ---------------------------------------------------------------------------

export async function list(userId: string): Promise<CharacterFull[]> {
  const rows = await withUserContext(userId, async (tx) => {
    return tx
      .select()
      .from(characters)
      .orderBy(characters.updatedAt);
  });

  return rows.map((c) => ({
    id:        c.id,
    name:      c.name,
    data:      c.data as CharacterData,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));
}

// ---------------------------------------------------------------------------
// get — single character by ID
// ---------------------------------------------------------------------------

export async function get(
  userId:      string,
  characterId: string,
): Promise<CharacterFull> {
  const [character] = await withUserContext(userId, async (tx) => {
    return tx
      .select()
      .from(characters)
      .where(
        and(
          eq(characters.userId, userId),      // RLS also enforces this
          eq(characters.id, characterId),
        ),
      )
      .limit(1);
  });

  if (!character) {
    throw new CharacterError('Character not found', 'NOT_FOUND', 404);
  }

  return {
    id:        character.id,
    name:      character.name,
    data:      character.data as CharacterData,
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

export async function create(
  userId: string,
  name:   string,
  data:   CharacterData = {},
): Promise<CharacterFull> {
  const [character] = await withUserContext(userId, async (tx) => {
    return tx
      .insert(characters)
      .values({ userId, name, data })
      .returning();
  });

  if (!character) {
    throw new CharacterError('Failed to create character', 'CREATE_FAILED', 500);
  }

  return {
    id:        character.id,
    name:      character.name,
    data:      character.data as CharacterData,
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// update — full replace of the data blob (optimistic, last-write-wins)
// ---------------------------------------------------------------------------

export async function update(
  userId:      string,
  characterId: string,
  patch: {
    name?: string;
    data?: CharacterData;
  },
): Promise<CharacterFull> {
  if (!patch.name && !patch.data) {
    throw new CharacterError('Nothing to update', 'EMPTY_PATCH', 400);
  }

  const [updated] = await withUserContext(userId, async (tx) => {
    return tx
      .update(characters)
      .set({
        ...(patch.name ? { name: patch.name } : {}),
        ...(patch.data ? { data: patch.data } : {}),
        // updatedAt is handled by the DB trigger
      })
      .where(
        and(
          eq(characters.userId, userId),
          eq(characters.id, characterId),
        ),
      )
      .returning();
  });

  if (!updated) {
    throw new CharacterError('Character not found', 'NOT_FOUND', 404);
  }

  return {
    id:        updated.id,
    name:      updated.name,
    data:      updated.data as CharacterData,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

export async function remove(
  userId:      string,
  characterId: string,
): Promise<void> {
  const result = await withUserContext(userId, async (tx) => {
    return tx
      .delete(characters)
      .where(
        and(
          eq(characters.userId, userId),
          eq(characters.id, characterId),
        ),
      )
      .returning({ id: characters.id });
  });

  if (result.length === 0) {
    throw new CharacterError('Character not found', 'NOT_FOUND', 404);
  }
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export async function getHistory(
  userId:      string,
  characterId: string,
  limit = 200,
): Promise<{ id: string; entryHtml: string; occurredAt: Date }[]> {
  return withUserContext(userId, async (tx) => {
    return tx
      .select({
        id:         historyEntries.id,
        entryHtml:  historyEntries.entryHtml,
        occurredAt: historyEntries.occurredAt,
      })
      .from(historyEntries)
      .where(
        and(
          eq(historyEntries.userId, userId),
          eq(historyEntries.characterId, characterId),
        ),
      )
      .orderBy(historyEntries.occurredAt)
      .limit(limit);
  });
}

export async function appendHistory(
  userId:      string,
  characterId: string,
  entryHtml:   string,
  occurredAt:  Date = new Date(),
): Promise<void> {
  await withUserContext(userId, async (tx) => {
    await tx.insert(historyEntries).values({
      userId,
      characterId,
      entryHtml,
      occurredAt,
    });
  });
}

export async function clearHistory(
  userId:      string,
  characterId: string,
): Promise<void> {
  await withUserContext(userId, async (tx) => {
    await tx
      .delete(historyEntries)
      .where(
        and(
          eq(historyEntries.userId, userId),
          eq(historyEntries.characterId, characterId),
        ),
      );
  });
}
