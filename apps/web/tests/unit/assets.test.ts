/**
 * Unit tests for the snapshot/diff XP machinery, asset display-name resolution,
 * global counter reconciliation, and the global-counter catalogue validator.
 *
 * These are the new edge-case-rich functions added when AssetCard was
 * converted from per-toggle XP charges to a single consolidated entry on
 * commit. They're all pure functions in $lib/character.ts and
 * $lib/assetStore.svelte.ts, deliberately exported so they can be tested
 * without spinning up Svelte runes or the DOM.
 */
import { describe, it, expect, vi } from 'vitest';
import {
	computeAssetXpDiff,
	assetDisplayName,
	reconcileGlobalValues,
} from '../../src/lib/character.js';
import { buildGlobalCounterRegistry } from '../../src/lib/globalCounters.js';
import type { AssetDefinition } from '../../src/lib/types.js';

// ---------------------------------------------------------------------------
// computeAssetXpDiff — Ironsworn RAW: enables cost XP, disables don't refund
// ---------------------------------------------------------------------------

describe('computeAssetXpDiff', () => {
	const noRarities = (_id: string) => 0;

	it('returns just purchaseCost when nothing changed (idempotent edit)', () => {
		expect(computeAssetXpDiff({
			snapshotAbilities: [true, false, false],
			draftAbilities:    [true, false, false],
			rarityXpCost:      noRarities,
			purchaseCost:      0,
		})).toBe(0);
	});

	it('returns purchaseCost on a fresh add with default-only abilities', () => {
		expect(computeAssetXpDiff({
			snapshotAbilities: [true, false, false],
			draftAbilities:    [true, false, false],
			rarityXpCost:      noRarities,
			purchaseCost:      3,
		})).toBe(3);
	});

	it('charges 2 XP per newly-enabled ability', () => {
		expect(computeAssetXpDiff({
			snapshotAbilities: [true, false, false],
			draftAbilities:    [true, true, true],
			rarityXpCost:      noRarities,
			purchaseCost:      0,
		})).toBe(4);
	});

	it('toggle-on-then-off within the same session is free', () => {
		// User flipped ability 2 on, then back off. Final state matches snapshot.
		expect(computeAssetXpDiff({
			snapshotAbilities: [true, false, false],
			draftAbilities:    [true, false, false],
			rarityXpCost:      noRarities,
			purchaseCost:      0,
		})).toBe(0);
	});

	it('disabling alone costs nothing (no refund per Ironsworn RAW)', () => {
		expect(computeAssetXpDiff({
			snapshotAbilities: [true, true, true],
			draftAbilities:    [true, false, false],
			rarityXpCost:      noRarities,
			purchaseCost:      0,
		})).toBe(0);
	});

	it('swap (disable A, enable B) charges only for the new enable', () => {
		// Snapshot had #2 on; user turns #2 off and #3 on. #2's XP is sunk;
		// #3 is a fresh purchase.
		expect(computeAssetXpDiff({
			snapshotAbilities: [true, true, false],
			draftAbilities:    [true, false, true],
			rarityXpCost:      noRarities,
			purchaseCost:      0,
		})).toBe(2);
	});

	it('charges the full rarity xpCost when a rarity is selected', () => {
		expect(computeAssetXpDiff({
			snapshotAbilities: [true, false, false],
			draftAbilities:    [true, false, false],
			snapshotRarityId:  undefined,
			draftRarityId:     'rarity/prime',
			rarityXpCost:      (id) => id === 'rarity/prime' ? 3 : 0,
			purchaseCost:      0,
		})).toBe(3);
	});

	it('charges full xpCost when rarity changes (old rarity sunk)', () => {
		expect(computeAssetXpDiff({
			snapshotAbilities: [true, false, false],
			draftAbilities:    [true, false, false],
			snapshotRarityId:  'rarity/prime',
			draftRarityId:     'rarity/legend',
			rarityXpCost:      (id) => id === 'rarity/legend' ? 5 : 3,
			purchaseCost:      0,
		})).toBe(5);
	});

	it('clearing a rarity costs nothing (no refund)', () => {
		expect(computeAssetXpDiff({
			snapshotAbilities: [true, false, false],
			draftAbilities:    [true, false, false],
			snapshotRarityId:  'rarity/prime',
			draftRarityId:     undefined,
			rarityXpCost:      () => 3,
			purchaseCost:      0,
		})).toBe(0);
	});

	it('sums abilities + rarity + purchase cost together', () => {
		// Add mode: purchase 3, enable one extra ability +2, pick rarity +3 = 8.
		expect(computeAssetXpDiff({
			snapshotAbilities: [true, false, false],
			draftAbilities:    [true, true, false],
			snapshotRarityId:  undefined,
			draftRarityId:     'rarity/prime',
			rarityXpCost:      () => 3,
			purchaseCost:      3,
		})).toBe(8);
	});
});

// ---------------------------------------------------------------------------
// assetDisplayName — italic-when-custom rendering on the assets chit
// ---------------------------------------------------------------------------

describe('assetDisplayName', () => {
	it('falls back to the assetId when the definition is missing', () => {
		const out = assetDisplayName({ assetId: 'companion/hound' }, undefined);
		expect(out).toEqual({ text: 'companion/hound', custom: false });
	});

	it('returns the definition name when no string custom field exists', () => {
		const out = assetDisplayName(
			{ assetId: 'path/hunter', customValues: {} },
			{ name: 'Hunter', customFields: [{ id: 'foo', type: 'counter' }] },
		);
		expect(out).toEqual({ text: 'Hunter', custom: false });
	});

	it('returns the definition name when the string field is empty', () => {
		const out = assetDisplayName(
			{ assetId: 'companion/hound', customValues: { 'companion-name': '' } },
			{ name: 'Hound', customFields: [{ id: 'companion-name', type: 'string' }] },
		);
		expect(out).toEqual({ text: 'Hound', custom: false });
	});

	it('returns the definition name when the string field is whitespace-only', () => {
		const out = assetDisplayName(
			{ assetId: 'companion/hound', customValues: { 'companion-name': '   ' } },
			{ name: 'Hound', customFields: [{ id: 'companion-name', type: 'string' }] },
		);
		expect(out).toEqual({ text: 'Hound', custom: false });
	});

	it('returns the user-supplied custom name flagged as custom', () => {
		const out = assetDisplayName(
			{ assetId: 'companion/hound', customValues: { 'companion-name': 'Wolfgang' } },
			{ name: 'Hound', customFields: [{ id: 'companion-name', type: 'string' }] },
		);
		expect(out).toEqual({ text: 'Wolfgang', custom: true });
	});

	it('uses the FIRST string field when multiple are declared', () => {
		// e.g. path/devotant has gods-name AND stat; convention: first wins.
		const out = assetDisplayName(
			{ assetId: 'path/devotant', customValues: { 'gods-name': 'Loki', stat: 'wits' } },
			{ name: 'Devotant', customFields: [
				{ id: 'gods-name', type: 'string' },
				{ id: 'stat',      type: 'string' },
			]},
		);
		expect(out).toEqual({ text: 'Loki', custom: true });
	});
});

// ---------------------------------------------------------------------------
// reconcileGlobalValues — import-time validation against catalogue
// ---------------------------------------------------------------------------

describe('reconcileGlobalValues', () => {
	const manaOnly = new Map([
		['mana', { maxValue: 10 }],
	]);

	it('returns {} for undefined input', () => {
		expect(reconcileGlobalValues(undefined, manaOnly)).toEqual({});
	});

	it('passes values through unchanged when the catalogue is empty', () => {
		// catalogue not loaded — never wipe saved data
		expect(reconcileGlobalValues({ mana: '5', oldKey: '7' }, new Map()))
			.toEqual({ mana: '5', oldKey: '7' });
	});

	it('drops counter ids the catalogue does not know', () => {
		expect(reconcileGlobalValues({ mana: '5', extinct: '99' }, manaOnly))
			.toEqual({ mana: '5' });
	});

	it('clamps values above the canonical max', () => {
		expect(reconcileGlobalValues({ mana: '50' }, manaOnly))
			.toEqual({ mana: '10' });
	});

	it('clamps negative values to 0', () => {
		expect(reconcileGlobalValues({ mana: '-3' }, manaOnly))
			.toEqual({ mana: '0' });
	});

	it('floors fractional values', () => {
		expect(reconcileGlobalValues({ mana: '4.7' }, manaOnly))
			.toEqual({ mana: '4' });
	});

	it('drops non-numeric strings', () => {
		expect(reconcileGlobalValues({ mana: 'wizard' }, manaOnly))
			.toEqual({});
	});

	it('preserves values inside the [0, max] range', () => {
		expect(reconcileGlobalValues({ mana: '0' }, manaOnly)).toEqual({ mana: '0' });
		expect(reconcileGlobalValues({ mana: '7' }, manaOnly)).toEqual({ mana: '7' });
		expect(reconcileGlobalValues({ mana: '10' }, manaOnly)).toEqual({ mana: '10' });
	});

	it('does not clamp array-typed maxValue (depends on per-asset abilities)', () => {
		const arrayMax = new Map([['ticks', { maxValue: [3, 6, 9] }]]);
		expect(reconcileGlobalValues({ ticks: '12' }, arrayMax))
			.toEqual({ ticks: '12' });
	});

	it('handles a missing maxValue (counter with no cap)', () => {
		const uncapped = new Map([['mana', {}]]);
		expect(reconcileGlobalValues({ mana: '99' }, uncapped))
			.toEqual({ mana: '99' });
	});
});

// ---------------------------------------------------------------------------
// buildGlobalCounterRegistry — catalogue-drift validator
// ---------------------------------------------------------------------------

function asset(id: string, fields: AssetDefinition['customFields']): AssetDefinition {
	return {
		id,
		name:      `Asset ${id}`,
		category:  'Ritual',
		abilities: [{ enabled: true, text: 'starter' }],
		customFields: fields,
	};
}

describe('buildGlobalCounterRegistry', () => {
	it('returns an empty map for an empty catalogue', () => {
		const reg = buildGlobalCounterRegistry([]);
		expect(reg.size).toBe(0);
	});

	it('ignores non-global counter fields', () => {
		const reg = buildGlobalCounterRegistry([
			asset('a/1', [{ id: 'wealth', type: 'counter', label: 'Wealth', maxValue: 5 }]),
		]);
		expect(reg.has('wealth')).toBe(false);
	});

	it('registers the first global declaration', () => {
		const def = { id: 'mana', type: 'counter' as const, label: 'Mana', maxValue: 10, default: 0, icon: 'mana', global: true };
		const reg = buildGlobalCounterRegistry([asset('a/1', [def])]);
		expect(reg.get('mana')).toBe(def);
	});

	it('first declaration wins when assets agree on canonical properties', () => {
		const onMismatch = vi.fn();
		const f1 = { id: 'mana', type: 'counter' as const, label: 'Mana',     maxValue: 10, default: 0, icon: 'mana', global: true };
		const f2 = { id: 'mana', type: 'counter' as const, label: 'Mana Pool', maxValue: 10, default: 0, icon: 'mana', global: true };
		const reg = buildGlobalCounterRegistry(
			[asset('a/1', [f1]), asset('a/2', [f2])],
			onMismatch,
		);
		expect(reg.get('mana')).toBe(f1);
		expect(onMismatch).not.toHaveBeenCalled(); // label may differ
	});

	it('reports a mismatch when maxValue differs', () => {
		const onMismatch = vi.fn();
		buildGlobalCounterRegistry([
			asset('a/1', [{ id: 'mana', type: 'counter', label: 'Mana', maxValue: 10, default: 0, icon: 'mana', global: true }]),
			asset('a/2', [{ id: 'mana', type: 'counter', label: 'Mana', maxValue:  8, default: 0, icon: 'mana', global: true }]),
		], onMismatch);
		expect(onMismatch).toHaveBeenCalledOnce();
		expect(onMismatch.mock.calls[0][0]).toMatch(/mana/);
		expect(onMismatch.mock.calls[0][0]).toMatch(/10/);
		expect(onMismatch.mock.calls[0][0]).toMatch(/8/);
	});

	it('reports a mismatch when default differs', () => {
		const onMismatch = vi.fn();
		buildGlobalCounterRegistry([
			asset('a/1', [{ id: 'mana', type: 'counter', label: 'Mana', maxValue: 10, default: 0, icon: 'mana', global: true }]),
			asset('a/2', [{ id: 'mana', type: 'counter', label: 'Mana', maxValue: 10, default: 5, icon: 'mana', global: true }]),
		], onMismatch);
		expect(onMismatch).toHaveBeenCalledOnce();
	});

	it('reports a mismatch when icon differs', () => {
		const onMismatch = vi.fn();
		buildGlobalCounterRegistry([
			asset('a/1', [{ id: 'mana', type: 'counter', label: 'Mana', maxValue: 10, default: 0, icon: 'mana',  global: true }]),
			asset('a/2', [{ id: 'mana', type: 'counter', label: 'Mana', maxValue: 10, default: 0, icon: 'skull', global: true }]),
		], onMismatch);
		expect(onMismatch).toHaveBeenCalledOnce();
	});

	it('reports each mismatch separately when more than one asset diverges', () => {
		const onMismatch = vi.fn();
		buildGlobalCounterRegistry([
			asset('a/1', [{ id: 'mana', type: 'counter', label: 'Mana', maxValue: 10, default: 0, icon: 'mana', global: true }]),
			asset('a/2', [{ id: 'mana', type: 'counter', label: 'Mana', maxValue:  8, default: 0, icon: 'mana', global: true }]),
			asset('a/3', [{ id: 'mana', type: 'counter', label: 'Mana', maxValue:  7, default: 0, icon: 'mana', global: true }]),
		], onMismatch);
		expect(onMismatch).toHaveBeenCalledTimes(2);
	});

	it('compares array-typed maxValue structurally', () => {
		const onMismatch = vi.fn();
		buildGlobalCounterRegistry([
			asset('a/1', [{ id: 'rage', type: 'counter', label: 'Rage', maxValue: [3, 6, 9], default: 0, icon: 'sword', global: true }]),
			asset('a/2', [{ id: 'rage', type: 'counter', label: 'Rage', maxValue: [3, 6, 9], default: 0, icon: 'sword', global: true }]),
		], onMismatch);
		expect(onMismatch).not.toHaveBeenCalled();

		const onMismatch2 = vi.fn();
		buildGlobalCounterRegistry([
			asset('a/1', [{ id: 'rage', type: 'counter', label: 'Rage', maxValue: [3, 6, 9], default: 0, icon: 'sword', global: true }]),
			asset('a/2', [{ id: 'rage', type: 'counter', label: 'Rage', maxValue: [3, 7, 9], default: 0, icon: 'sword', global: true }]),
		], onMismatch2);
		expect(onMismatch2).toHaveBeenCalledOnce();
	});

	it('does not call onMismatch for non-conflicting assets', () => {
		const onMismatch = vi.fn();
		buildGlobalCounterRegistry([
			asset('a/1', [{ id: 'mana',  type: 'counter', label: 'Mana',  maxValue: 10, default: 0, icon: 'mana',  global: true }]),
			asset('a/2', [{ id: 'light', type: 'counter', label: 'Light', maxValue:  6, default: 0, icon: 'sun',   global: true }]),
			asset('a/3', [{ id: 'mana',  type: 'counter', label: 'Mana',  maxValue: 10, default: 0, icon: 'mana',  global: true }]),
		], onMismatch);
		expect(onMismatch).not.toHaveBeenCalled();
	});
});
