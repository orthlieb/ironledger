/**
 * Unit tests for the starting-stat arrays module — the picker data set
 * (`STATS`, `BASE_ARRAY`, `LODESTAR_ARRAYS`), the `availableStatArrays`
 * gate, and the `rollStats` Fisher-Yates shuffle.
 *
 * `rollStats` accepts an injectable `rng` so we can drive the shuffle
 * deterministically; the tests use that to pin down the exact
 * shuffled-position → stat mapping, and to prove the shuffle preserves
 * the multiset (nothing is silently dropped or invented).
 */
import { describe, it, expect } from 'vitest';
import {
	STATS,
	BASE_ARRAY,
	LODESTAR_ARRAYS,
	availableStatArrays,
	rollStats,
	type StatArray,
} from '../../src/lib/rules/statArrays.js';

describe('STATS', () => {
	it('has the five Ironsworn stats in canonical order', () => {
		expect(STATS).toEqual(['edge', 'heart', 'iron', 'shadow', 'wits']);
	});
});

describe('BASE_ARRAY / LODESTAR_ARRAYS', () => {
	it('BASE_ARRAY is the standard 3/2/2/1/1 distribution', () => {
		expect(BASE_ARRAY.values).toEqual([3, 2, 2, 1, 1]);
		expect(BASE_ARRAY.id).toBe('standard');
	});

	it('LODESTAR_ARRAYS ships all three tone options with the RAW values', () => {
		expect(LODESTAR_ARRAYS.map((a) => a.id)).toEqual(['challenging', 'perilous', 'grim']);
		expect(LODESTAR_ARRAYS.find((a) => a.id === 'challenging')?.values).toEqual([4, 3, 3, 2, 2]);
		expect(LODESTAR_ARRAYS.find((a) => a.id === 'perilous')?.values).toEqual([3, 2, 2, 1, 1]);
		expect(LODESTAR_ARRAYS.find((a) => a.id === 'grim')?.values).toEqual([3, 2, 1, 1, 0]);
	});

	it('every array carries a non-empty label and hint', () => {
		for (const a of [BASE_ARRAY, ...LODESTAR_ARRAYS]) {
			expect(a.label.length).toBeGreaterThan(0);
			expect(a.hint.length).toBeGreaterThan(0);
		}
	});

	it('marks exactly one array as the default in each ruleset — Perilous under Lodestar, Standard under base', () => {
		// The StatAllocator uses this flag to pre-select the RAW default
		// rather than whichever entry happens to lead the display order.
		expect(LODESTAR_ARRAYS.filter((a) => a.default).map((a) => a.id)).toEqual(['perilous']);
		expect(BASE_ARRAY.default).toBe(true);
	});
});

describe('availableStatArrays', () => {
	it('Lodestar off → just BASE_ARRAY, single choice for the picker', () => {
		const arrays = availableStatArrays(false);
		expect(arrays).toHaveLength(1);
		expect(arrays[0]).toBe(BASE_ARRAY);
	});

	it('Lodestar on → its three tone-tuned arrays (base collapses out)', () => {
		const arrays = availableStatArrays(true);
		expect(arrays).toBe(LODESTAR_ARRAYS);
	});
});

describe('rollStats', () => {
	// A deterministic RNG that yields the given sequence, wrapping if needed.
	// Fisher-Yates makes 4 rng() calls for a 5-element list (i = 4, 3, 2, 1);
	// picking each rng()·(i+1) so `j = i` at each step means "no swap": the
	// shuffled list ends up identical to the input.
	function rngFrom(seq: number[]): () => number {
		let i = 0;
		return () => seq[i++ % seq.length];
	}

	it('assigns shuffled positions onto edge/heart/iron/shadow/wits in STATS order', () => {
		// rng always returns 0.999 → Math.floor(0.999 * (i+1)) === i for every i,
		// so the loop keeps swapping index i with itself → identity.
		const stats = rollStats(BASE_ARRAY, rngFrom([0.999]));
		expect(stats).toEqual({ edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 });
	});

	it('reverses the list when rng always picks index 0', () => {
		// rng → 0 → Math.floor(0 * (i+1)) === 0 for every step, so index i
		// swaps with 0 each iteration → the final order is a specific
		// permutation, which we lock down explicitly.
		const stats = rollStats(BASE_ARRAY, rngFrom([0]));
		// Trace: [3,2,2,1,1] → swap(4,0) → [1,2,2,1,3] → swap(3,0) → [1,2,2,1,3]
		//   → swap(2,0) → [2,2,1,1,3] → swap(1,0) → [2,2,1,1,3]
		expect(stats).toEqual({ edge: 2, heart: 2, iron: 1, shadow: 1, wits: 3 });
	});

	it('preserves the input multiset — no value is dropped or invented', () => {
		// Any random-looking sequence: the returned distribution must be a
		// permutation of the source values, whatever order it lands in.
		const stats = rollStats(BASE_ARRAY, rngFrom([0.13, 0.71, 0.42, 0.94]));
		const values = Object.values(stats).sort((a, b) => a - b);
		expect(values).toEqual([1, 1, 2, 2, 3]);
	});

	it('never mutates the input array or its values', () => {
		const snapshot: StatArray = {
			id: 'standard',
			label: 'Standard',
			hint: 'test',
			values: [3, 2, 2, 1, 1],
		};
		rollStats(snapshot, rngFrom([0.1, 0.2, 0.3, 0.4]));
		expect(snapshot.values).toEqual([3, 2, 2, 1, 1]);
	});

	it('defaults rng to Math.random when omitted (smoke: valid multiset for each Lodestar array)', () => {
		for (const array of LODESTAR_ARRAYS) {
			const stats = rollStats(array);
			const got = Object.values(stats).sort((a, b) => a - b);
			const want = [...array.values].sort((a, b) => a - b);
			expect(got).toEqual(want);
		}
	});
});
