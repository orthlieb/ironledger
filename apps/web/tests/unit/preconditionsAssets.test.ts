import { describe, it, expect, vi } from 'vitest';
import type { CharacterData } from '../../src/lib/types.js';

// The catalogue and the character fields are Svelte state; these stand in.
vi.mock('../../src/lib/assetStore.svelte.js', () => {
	const assets = [
		{ id: 'combat/archer', name: 'Archer', category: 'Combat Talent' },
		{ id: 'companion/hawk', name: 'Hawk', category: 'Companion' },
	];
	return { findAsset: (id: string) => assets.find((a) => a.id === id) };
});
vi.mock('../../src/lib/characterFields.svelte.js', () => ({
	findCharacterField: () => undefined,
	fieldNumber: () => 0,
	fieldRequirement: () => '',
	fieldValue: () => '',
	isText: () => false,
}));

const { checkPrecondition, firstPreconditionFailure } =
	await import('../../src/lib/preconditions.js');

/** A character owning the given assets, and nothing else that matters here. */
const owning = (...ids: string[]) =>
	({ assets: ids.map((assetId) => ({ assetId })) }) as unknown as CharacterData;

describe('an asset precondition, by the asset’s id', () => {
	it('passes when the character owns it (eq 1) and fails when not, naming it', () => {
		expect(checkPrecondition({ key: 'combat/archer', eq: 1 }, owning('combat/archer'))).toBeNull();
		expect(checkPrecondition({ key: 'combat/archer', eq: 1 }, owning('companion/hawk'))).toBe(
			'Requires the "Archer" asset',
		);
	});

	it('passes when the character lacks it (eq 0) and fails when not', () => {
		expect(checkPrecondition({ key: 'companion/hawk', eq: 0 }, owning('combat/archer'))).toBeNull();
		expect(checkPrecondition({ key: 'companion/hawk', eq: 0 }, owning('companion/hawk'))).toBe(
			'Must not have the "Hawk" asset',
		);
	});

	it('no longer matches an asset by its display name', () => {
		expect(checkPrecondition({ key: 'Archer', eq: 1 }, owning('combat/archer'))).toBe(
			'Requires the "Archer" asset',
		);
		expect(checkPrecondition({ key: 'Archer', eq: 0 }, owning('combat/archer'))).toBeNull();
	});

	it('names an asset it can’t find by the id it was given', () => {
		expect(checkPrecondition({ key: 'ritual/gone', eq: 1 }, owning())).toBe(
			'Requires the "ritual/gone" asset',
		);
	});

	it('works alongside hasAnyAsset, which is unchanged', () => {
		const pres = [
			{ key: 'hasAnyAsset', ids: ['combat/archer', 'companion/hawk'] },
			{ key: 'companion/hawk', eq: 0 },
		];
		expect(firstPreconditionFailure(pres, owning('combat/archer'))).toBeNull();
		expect(firstPreconditionFailure(pres, owning())).toBe('Requires Archer or Hawk');
		expect(firstPreconditionFailure(pres, owning('companion/hawk'))).toBe(
			'Must not have the "Hawk" asset',
		);
	});
});
