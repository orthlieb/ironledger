/**
 * Drift guard for the persisted map-marker shape. Zod's default object
 * parsing STRIPS unknown keys, so a field the client starts sending (like the
 * generated-settlement recipe) silently vanishes on save unless the schema
 * lists it — the same failure labelStyle / labelPosition once had.
 */
import { describe, expect, it } from 'vitest';
import { mapMarkerSchema } from '../../src/routes/maps.js';

const base = { id: 'm1', x: 1, y: 2, label: 'Elfhold', icon: 'settlement/town' };

describe('mapMarkerSchema', () => {
  it('keeps a settlement recipe', () => {
    const settlement = {
      tier: 'city',
      culture: 'nysis',
      seed: 4242,
      walls: 'stone',
      wallShape: 'square',
      harbor: true,
      ruin: { decay: 0.4, burned: true },
    };
    expect(mapMarkerSchema.parse({ ...base, settlement }).settlement).toEqual(settlement);
  });

  it('keeps a recipe on water and on stilts', () => {
    const settlement = {
      tier: 'village',
      culture: 'merrow',
      seed: 7,
      ground: 'water',
      stilts: true,
    };
    expect(mapMarkerSchema.parse({ ...base, settlement }).settlement).toEqual(settlement);
  });

  it("keeps every ground type, and rejects one it doesn't know", () => {
    for (const ground of [
      'none',
      'hex',
      'dirt',
      'grass',
      'farmland',
      'sand',
      'rock',
      'snow',
      'ice',
      'marsh',
      'lava',
      'water',
    ]) {
      const settlement = { tier: 'village', culture: 'elves', seed: 7, ground };
      expect(mapMarkerSchema.parse({ ...base, settlement }).settlement).toEqual(settlement);
    }
    expect(
      mapMarkerSchema.safeParse({
        ...base,
        settlement: { tier: 'village', culture: 'elves', seed: 7, ground: 'magma' },
      }).success,
    ).toBe(false);
  });

  it('keeps a building recipe', () => {
    const settlement = {
      tier: 'stead',
      culture: 'elves',
      seed: 12,
      building: 'round-tower',
      walls: 'hedge',
      ruin: { decay: 0.5 },
    };
    expect(mapMarkerSchema.parse({ ...base, settlement }).settlement).toEqual(settlement);
    expect(
      mapMarkerSchema.safeParse({ ...base, settlement: { ...settlement, building: '<b>' } })
        .success,
    ).toBe(false);
  });

  it('rejects a malformed recipe', () => {
    expect(
      mapMarkerSchema.safeParse({
        ...base,
        settlement: { tier: 'metropolis', culture: 'x', seed: 1 },
      }).success,
    ).toBe(false);
  });

  it('accepts the long icon keys extension categories produce', () => {
    const icon = 'yrt-settlements/ostrea-ruined-village';
    expect(icon.length).toBeGreaterThan(32);
    expect(mapMarkerSchema.parse({ ...base, icon }).icon).toBe(icon);
  });

  it('keeps a per-marker scale when it is in range', () => {
    expect(mapMarkerSchema.parse({ ...base, scale: 1.75 }).scale).toBe(1.75);
    expect(mapMarkerSchema.parse({ ...base, scale: 0.5 }).scale).toBe(0.5);
    expect(mapMarkerSchema.parse({ ...base, scale: 3 }).scale).toBe(3);
  });

  it('rejects out-of-range and non-finite scales', () => {
    for (const scale of [0.4, 3.1, Infinity, -Infinity, NaN]) {
      expect(mapMarkerSchema.safeParse({ ...base, scale }).success).toBe(false);
    }
  });
});
