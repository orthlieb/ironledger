/**
 * The ranges the action bus holds a character's resources to
 * (docs/data-schema.md → Resource Links), and a change held to them: a log
 * link's "+2 health" at 4 health lands on 5, not 6.
 */
import { describe, it, expect } from 'vitest';
import { changeResource, resourceRange } from '../../src/lib/character.js';
import { DEFAULT_CHARACTER, type CharacterData } from '../../src/lib/types.js';

const char = (over: Partial<CharacterData> = {}): CharacterData => ({
	...DEFAULT_CHARACTER,
	...over,
});

describe('resourceRange', () => {
	it.each([
		['health', 0, 5],
		['spirit', 0, 5],
		['supply', 0, 5],
		['xp', 0, 30],
		['bonds', 0, 40],
		['failures', 0, 40],
		['mana', 0, 10],
		['momentum', -6, 10],
	])('%s runs %i to %i', (key, min, max) => {
		expect(resourceRange(key, char())).toEqual({ min, max });
	});

	it("momentum's top falls with each debility", () => {
		expect(resourceRange('momentum', char({ wounded: true, shaken: true }))).toEqual({
			min: -6,
			max: 8,
		});
	});

	it('is null for a key that is not a resource', () => {
		expect(resourceRange('edge', char())).toBeNull();
		expect(resourceRange('initiative', char())).toBeNull();
	});
});

describe('changeResource', () => {
	it('stops at the top of the range, and says the top cut it short', () => {
		expect(changeResource('health', 4, 2, char())).toEqual({ next: 5, max: 5, capped: true });
		expect(changeResource('spirit', 4, 2, char())).toEqual({ next: 5, max: 5, capped: true });
		expect(changeResource('supply', 4, 2, char())).toEqual({ next: 5, max: 5, capped: true });
		expect(changeResource('xp', 29, 2, char())).toEqual({ next: 30, max: 30, capped: true });
	});

	it('swallows a change whole at the top', () => {
		expect(changeResource('health', 5, 1, char())).toEqual({ next: 5, max: 5, capped: true });
	});

	it('is not capped when the change fits', () => {
		expect(changeResource('health', 3, 2, char())).toEqual({ next: 5, max: 5, capped: false });
		expect(changeResource('health', 4, -1, char())).toEqual({ next: 3, max: 5, capped: false });
	});

	it('stops at the bottom without calling it capped (the floor cascades say what happens)', () => {
		expect(changeResource('health', 1, -3, char())).toEqual({ next: 0, max: 5, capped: false });
		expect(changeResource('momentum', -5, -3, char())).toEqual({
			next: -6,
			max: 10,
			capped: false,
		});
	});

	it('brings a value saved past the top back to it', () => {
		expect(changeResource('health', 7, 1, char())).toEqual({ next: 5, max: 5, capped: true });
		expect(changeResource('health', 7, -1, char())).toEqual({ next: 5, max: 5, capped: true });
		expect(changeResource('health', 7, -3, char())).toEqual({ next: 4, max: 5, capped: false });
	});

	it("holds momentum to a debilitated character's lower top", () => {
		expect(changeResource('momentum', 8, 2, char({ wounded: true }))).toEqual({
			next: 9,
			max: 9,
			capped: true,
		});
	});

	it('is null for a key that is not a resource', () => {
		expect(changeResource('edge', 2, 1, char())).toBeNull();
	});
});
