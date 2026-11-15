import { describe, it, expect } from 'vitest';
import { planPackRestore, readPackChoices } from '../../src/lib/packChoices.js';

describe('readPackChoices', () => {
	it('keeps well-formed rows, as they were', () => {
		expect(
			readPackChoices([
				{ id: 'delve', name: 'Delve', enabled: true },
				{ id: 'yrt', name: 'Yrt', enabled: false },
			]),
		).toEqual([
			{ id: 'delve', name: 'Delve', enabled: true },
			{ id: 'yrt', name: 'Yrt', enabled: false },
		]);
	});

	it('drops what the account could never take, base, and repeats', () => {
		expect(
			readPackChoices([
				{ id: 'base', name: 'Core', enabled: true },
				{ id: 'Bad Id', name: 'x', enabled: true },
				{ id: '__proto__', name: 'x', enabled: true },
				{ id: 'delve', enabled: 'yes' },
				{ name: 'no id', enabled: true },
				null,
				'delve',
				{ id: 'lodestar', name: 'Lodestar', enabled: true },
				{ id: 'lodestar', name: 'Again', enabled: false },
			]),
		).toEqual([{ id: 'lodestar', name: 'Lodestar', enabled: true }]);
	});

	it('names a pack by its id when the backup gives no name', () => {
		expect(readPackChoices([{ id: 'lost-pack', name: '  ', enabled: true }])).toEqual([
			{ id: 'lost-pack', name: 'lost-pack', enabled: true },
		]);
		expect(readPackChoices([{ id: 'lost-pack', enabled: true }])[0]?.name).toBe('lost-pack');
	});

	it('reads nothing from a backup without the list', () => {
		expect(readPackChoices(undefined)).toEqual([]);
		expect(readPackChoices({ delve: true })).toEqual([]);
	});
});

describe('planPackRestore', () => {
	const incoming = [
		{ id: 'delve', name: 'Delve', enabled: true },
		{ id: 'yrt', name: 'Yrt', enabled: false },
		{ id: 'lost-pack', name: 'Lost Pack', enabled: true },
	];

	it('switches on what was on and is here, and names what was on and is not', () => {
		expect(planPackRestore(incoming, ['base', 'delve', 'yrt'])).toEqual({
			switchOn: ['delve'],
			missing: [{ id: 'lost-pack', name: 'Lost Pack', enabled: true }],
		});
	});

	it('never asks to switch one off, nor names a missing one that was off', () => {
		const plan = planPackRestore([{ id: 'gone', name: 'Gone', enabled: false }], ['delve']);
		expect(plan).toEqual({ switchOn: [], missing: [] });
	});
});
