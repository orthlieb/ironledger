/**
 * Unit tests for resolveCharacterConcept — the pure concept → oracle
 * resolver that gates the NewNPC dialog checkboxes and NPC card fields
 * on which extensions are currently enabled.
 *
 * The full state space is small (three extension toggles × six concepts),
 * so we exercise every actionable combination. All six oracles are
 * stubbed with the minimum shape the resolver needs (key + source); the
 * suppression set and `isSourceEnabled` predicate are hand-built to
 * mirror what the live extension registry would produce.
 *
 * The wrapper `resolveCharacterOracle` in oracleStore.svelte.ts just
 * plumbs reactive state into this pure function, so covering every
 * combination here is equivalent to covering the wrapper — but without
 * needing the Svelte runtime.
 */
import { describe, it, expect } from 'vitest';
import {
	resolveCharacterConcept,
	type CharacterOracleCandidate,
} from '../../src/lib/characterConcept.js';

const oracle = (key: string, source: string): CharacterOracleCandidate => ({ key, source });

const ORACLES: CharacterOracleCandidate[] = [
	oracle('characterRole', 'base'),
	oracle('characterGoal', 'base'),
	oracle('characterDescriptor', 'base'),
	oracle('charActivity', 'delve'),
	oracle('charDisposition', 'delve'),
	oracle('lodestarCharacterDisposition', 'lodestar'),
	oracle('characterFirstLook', 'lodestar'),
];

/** Build the (suppressed, enabledFn) inputs the way the live app would
 *  when the named extensions are on. When Lodestar is on, it suppresses
 *  Delve's charDisposition (mirrors Lodestar's real manifest). */
function ctx({ delve, lodestar }: { delve: boolean; lodestar: boolean }) {
	const suppressed = new Set<string>();
	if (lodestar) suppressed.add('charDisposition');
	const enabled = (source: string) =>
		source === 'base' || (source === 'delve' && delve) || (source === 'lodestar' && lodestar);
	return { suppressed, enabled };
}

const resolve = (
	concept: Parameters<typeof resolveCharacterConcept>[0],
	toggles: { delve: boolean; lodestar: boolean },
) => {
	const { suppressed, enabled } = ctx(toggles);
	return resolveCharacterConcept(concept, ORACLES, suppressed, enabled);
};

describe('resolveCharacterConcept', () => {
	describe('Delve on + Lodestar on (default)', () => {
		const on = { delve: true, lodestar: true };
		it('resolves disposition to the Lodestar oracle (supersession wins)', () => {
			expect(resolve('disposition', on)?.key).toBe('lodestarCharacterDisposition');
		});
		it('resolves firstLook to the Lodestar oracle', () => {
			expect(resolve('firstLook', on)?.key).toBe('characterFirstLook');
		});
		it('resolves activity to the Delve oracle', () => {
			expect(resolve('activity', on)?.key).toBe('charActivity');
		});
		it('resolves the three base concepts', () => {
			expect(resolve('role', on)?.key).toBe('characterRole');
			expect(resolve('goal', on)?.key).toBe('characterGoal');
			expect(resolve('revealedDetails', on)?.key).toBe('characterDescriptor');
		});
	});

	describe('Delve on + Lodestar off', () => {
		const on = { delve: true, lodestar: false };
		it('falls back to Delve charDisposition (no longer suppressed)', () => {
			expect(resolve('disposition', on)?.key).toBe('charDisposition');
		});
		it('resolves firstLook to null (Lodestar-only oracle, extension disabled)', () => {
			expect(resolve('firstLook', on)).toBeNull();
		});
		it('still resolves activity to Delve', () => {
			expect(resolve('activity', on)?.key).toBe('charActivity');
		});
	});

	describe('Delve off + Lodestar on', () => {
		const on = { delve: false, lodestar: true };
		it('resolves disposition to the Lodestar oracle (Delve backup irrelevant)', () => {
			expect(resolve('disposition', on)?.key).toBe('lodestarCharacterDisposition');
		});
		it('resolves firstLook to Lodestar', () => {
			expect(resolve('firstLook', on)?.key).toBe('characterFirstLook');
		});
		it('resolves activity to null (Delve-only oracle, extension disabled)', () => {
			expect(resolve('activity', on)).toBeNull();
		});
	});

	describe('Delve off + Lodestar off', () => {
		const on = { delve: false, lodestar: false };
		it('resolves disposition to null (both backing oracles disabled)', () => {
			expect(resolve('disposition', on)).toBeNull();
		});
		it('resolves firstLook to null', () => {
			expect(resolve('firstLook', on)).toBeNull();
		});
		it('resolves activity to null', () => {
			expect(resolve('activity', on)).toBeNull();
		});
		it('the three base concepts still resolve — base is never gated', () => {
			expect(resolve('role', on)?.key).toBe('characterRole');
			expect(resolve('goal', on)?.key).toBe('characterGoal');
			expect(resolve('revealedDetails', on)?.key).toBe('characterDescriptor');
		});
	});

	it('returns null when the backing oracle key is not in the loaded list', () => {
		expect(
			resolveCharacterConcept(
				'firstLook',
				[oracle('characterRole', 'base')], // no first-look oracle loaded
				new Set(),
				() => true,
			),
		).toBeNull();
	});
});
