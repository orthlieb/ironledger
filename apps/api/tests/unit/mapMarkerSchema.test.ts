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
});
