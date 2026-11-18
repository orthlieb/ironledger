import { describe, it, expect, vi } from 'vitest';
import type { CharacterData } from '../../src/lib/types.js';

// The catalogue and the character fields are Svelte state; these stand in.
vi.mock('../../src/lib/assetStore.svelte.js', () => {
	const assets = [
		{ id: 'combat/archer', name: 'Archer', category: 'Combat Talent' },
		{
			id: 'companion/hawk',
			name: 'Hawk',
			category: 'Companion',
			customFields: [{ id: 'health', type: 'counter', label: 'Health', maxValue: 3, default: 3 }],
		},
	];
	const mana = {
		id: 'mana',
		type: 'counter',
		label: 'Mana',
		maxValue: 10,
		default: 0,
		global: true,
	};
	return {
		findAsset: (id: string) => assets.find((a) => a.id === id),
		getGlobalCounterDef: (id: string) => (id === 'mana' ? mana : undefined),
	};
});
vi.mock('../../src/lib/characterFields.svelte.js', async () => {
	const core = await import('../../src/lib/characterFieldsCore.js');
	const touched = {
		id: 'touched',
		label: 'Touched',
		type: 'dropdown',
		default: 'pure',
		source: 'yrt',
		options: ['Pure', 'Prime', 'Second', 'Third', 'Feral'].map((l) => ({
			id: l.toLowerCase(),
			label: l,
		})),
	};
	return { ...core, findCharacterField: (id: string) => (id === 'touched' ? touched : undefined) };
});

const { firstPreconditionFailure, movePreconditionFailure } =
	await import('../../src/lib/preconditions.js');

/** A character owning the given assets, with everything else at rest. */
const owning = (...ids: string[]) =>
	({
		assets: ids.map((assetId) => ({ assetId })),
		vows: [],
		momentum: 2,
		health: 5,
		supply: 3,
		bonds: 9,
		failures: 0,
		fields: {},
		globalValues: {},
	}) as unknown as CharacterData;

describe('an asset condition, by the asset’s id', () => {
	it('holds when the character owns it, and fails when not, naming it', () => {
		expect(firstPreconditionFailure('combat/archer', owning('combat/archer'))).toBeNull();
		expect(firstPreconditionFailure('combat/archer', owning('companion/hawk'))).toBe(
			'Requires the "Archer" asset',
		);
	});

	it('with !, holds when the character lacks it', () => {
		expect(firstPreconditionFailure('!companion/hawk', owning('combat/archer'))).toBeNull();
		expect(firstPreconditionFailure('!companion/hawk', owning('companion/hawk'))).toBe(
			'Must not have the "Hawk" asset',
		);
	});

	it('names an asset it can’t find by the id it was given', () => {
		expect(firstPreconditionFailure('ritual/gone', owning())).toBe(
			'Requires the "ritual/gone" asset',
		);
	});

	it('takes any of several with |, and combines with &', () => {
		const pre = '(combat/archer | companion/hawk) & !companion/hawk';
		expect(firstPreconditionFailure(pre, owning('combat/archer'))).toBeNull();
		expect(firstPreconditionFailure(pre, owning())).toBe('Requires Archer or Hawk');
		expect(firstPreconditionFailure(pre, owning('companion/hawk'))).toBe(
			'Must not have the "Hawk" asset',
		);
	});
});

describe('context, initiative and the character’s values', () => {
	it('says which context is missing, or mustn’t be there', () => {
		const pre = 'character & foe';
		expect(
			firstPreconditionFailure(pre, owning(), { hasCharacter: true, hasFoe: true }),
		).toBeNull();
		expect(firstPreconditionFailure(pre, owning(), { hasCharacter: true })).toBe('No foe selected');
		expect(firstPreconditionFailure('!foe', owning(), { hasFoe: true })).toBe(
			'Requires no active foe',
		);
		expect(firstPreconditionFailure('!(foe | site)', owning(), { hasSite: true })).toBe(
			'Requires no active site',
		);
	});

	it('reads initiative as none, me or foe', () => {
		const ctx = { initiative: 2 };
		expect(firstPreconditionFailure('initiative == foe', owning(), ctx)).toBeNull();
		expect(firstPreconditionFailure('initiative == me', owning(), ctx)).toBe(
			'Requires character initiative',
		);
		expect(firstPreconditionFailure('initiative == none', owning(), ctx)).toBe(
			'Combat already in progress',
		);
	});

	it('compares numbers, saying what they are now', () => {
		expect(firstPreconditionFailure('supply >= 1', owning())).toBeNull();
		expect(firstPreconditionFailure('momentum > 4', owning())).toBe(
			'Requires Momentum > 4 (current: 2)',
		);
		expect(firstPreconditionFailure('vowCount >= 1', owning())).toBe(
			'Requires Vows ≥ 1 (current: 0)',
		);
	});

	it('reads bonds and failures as tracks: ticks, or boxes with b', () => {
		expect(firstPreconditionFailure('bonds >= 2b', owning())).toBeNull();
		expect(firstPreconditionFailure('bonds >= 3b', owning())).toBe(
			'Requires Bonds ≥ 3 boxes (current: 2 boxes)',
		);
		expect(firstPreconditionFailure('bonds >= 9', owning())).toBeNull();
	});

	it('reads a debility as true/false', () => {
		const wounded = { ...owning(), wounded: true } as unknown as CharacterData;
		expect(firstPreconditionFailure('wounded', wounded)).toBeNull();
		expect(firstPreconditionFailure('!wounded', wounded)).toBe('Must not be Wounded');
		expect(firstPreconditionFailure('shaken', wounded)).toBe('Must be Shaken');
	});
});

describe('content-pack fields', () => {
	it('compares a list by its options’ order, naming the option', () => {
		const prime = { ...owning(), fields: { touched: 'prime' } } as unknown as CharacterData;
		expect(firstPreconditionFailure('touched >= prime', prime)).toBeNull();
		expect(firstPreconditionFailure('touched >= prime', owning())).toBe(
			'Requires Touched: Prime or higher',
		);
		expect(firstPreconditionFailure('!touched >= prime', prime)).toBe(
			'Requires Touched: Pure or lower',
		);
	});

	it('reads a global counter (mana) from the character', () => {
		const three = { ...owning(), globalValues: { mana: '3' } } as unknown as CharacterData;
		expect(firstPreconditionFailure('mana >= 2', three)).toBeNull();
		expect(firstPreconditionFailure('mana >= 2', owning())).toBe('Requires Mana ≥ 2 (current: 0)');
	});

	it('reads an asset’s own field through self, or the asset’s id', () => {
		const hurt = {
			...owning(),
			assets: [{ assetId: 'companion/hawk', customValues: { health: '0' } }],
		} as unknown as CharacterData;
		const self = { self: hurt.assets[0] };
		expect(firstPreconditionFailure('self.health >= 1', hurt, self)).toBe(
			'Requires Hawk Health ≥ 1 (current: 0)',
		);
		expect(firstPreconditionFailure('companion/hawk.health >= 1', hurt)).toBe(
			'Requires Hawk Health ≥ 1 (current: 0)',
		);
		// Not yet owned (the picker): the asset's defaults.
		expect(
			firstPreconditionFailure('self.health >= 1', owning(), {
				self: { assetId: 'companion/hawk' },
			}),
		).toBeNull();
	});
});

describe('movePreconditionFailure', () => {
	it('needs a character for a move with any condition', () => {
		expect(movePreconditionFailure('character', null)).toBe('No character selected');
		expect(movePreconditionFailure(undefined, null)).toBeNull();
	});
});
