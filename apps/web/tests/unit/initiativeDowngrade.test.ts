/**
 * initiativeDowngrade.test.ts
 *
 * The Lodestar flexible End the Fight downgrades a progress roll by one hit
 * level when the character lacks initiative. Locks in the rule so a future
 * refactor of the roll path can't silently change it.
 */
import { describe, it, expect } from 'vitest';
import { applyInitiativeDowngrade } from '../../src/lib/initiativeDowngrade.js';

const STRONG = [true, true] as const; // both dice hit
const WEAK = [true, false] as const; // one hit
const MISS = [false, false] as const; // neither

const level = (r: { hits1: boolean; hits2: boolean }) => (r.hits1 ? 1 : 0) + (r.hits2 ? 1 : 0);

describe('applyInitiativeDowngrade', () => {
	it('is a no-op when the move does not opt in', () => {
		for (const [h1, h2] of [STRONG, WEAK, MISS]) {
			const r = applyInitiativeDowngrade(h1, h2, { enabled: false, initiative: 0 });
			expect([r.hits1, r.hits2]).toEqual([h1, h2]);
			expect(r.downgraded).toBe(false);
		}
	});

	it('is a no-op when the character HAS initiative (=1)', () => {
		const r = applyInitiativeDowngrade(...STRONG, { enabled: true, initiative: 1 });
		expect(level(r)).toBe(2); // stays strong
		expect(r.downgraded).toBe(false);
	});

	it('downgrades strong→weak with no initiative (0) or foe initiative (2)', () => {
		for (const init of [0, 2]) {
			const r = applyInitiativeDowngrade(...STRONG, { enabled: true, initiative: init });
			expect(level(r)).toBe(1); // weak
			expect(r.downgraded).toBe(true);
		}
	});

	it('downgrades weak→miss with no initiative', () => {
		const r = applyInitiativeDowngrade(...WEAK, { enabled: true, initiative: 0 });
		expect(level(r)).toBe(0); // miss
		expect(r.downgraded).toBe(true);
	});

	it('leaves a miss as a miss (nothing below miss to downgrade to)', () => {
		const r = applyInitiativeDowngrade(...MISS, { enabled: true, initiative: 0 });
		expect(level(r)).toBe(0);
		expect(r.downgraded).toBe(false);
	});
});
