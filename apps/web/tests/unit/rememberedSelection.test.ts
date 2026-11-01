/**
 * rememberedSelection.test.ts — an area re-opens the entry it had open, and
 * falls back to the first entry when that one is gone.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { initialSelection, rememberSelection } from '../../src/lib/rememberedSelection';

describe('rememberedSelection', () => {
	beforeEach(() => localStorage.clear());

	it('opens the first entry when nothing is remembered', () => {
		expect(initialSelection('characters', ['a', 'b'])).toBe('a');
	});

	it('re-opens the remembered entry, per area', () => {
		rememberSelection('characters', 'b');
		rememberSelection('foes', 'x');
		expect(initialSelection('characters', ['a', 'b'])).toBe('b');
		expect(initialSelection('foes', ['w', 'x'])).toBe('x');
		expect(initialSelection('expeditions', ['p', 'q'])).toBe('p');
	});

	it('falls back to the first entry when the remembered one is gone', () => {
		rememberSelection('characters', 'deleted');
		expect(initialSelection('characters', ['a', 'b'])).toBe('a');
	});

	it('is null for an empty list', () => {
		expect(initialSelection('connections', [])).toBeNull();
	});

	it('ignores a null selection, so a brief "nothing open" is not remembered', () => {
		rememberSelection('characters', 'b');
		rememberSelection('characters', null);
		expect(initialSelection('characters', ['a', 'b'])).toBe('b');
	});
});
