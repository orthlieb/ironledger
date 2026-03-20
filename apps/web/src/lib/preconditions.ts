/**
 * Generic precondition engine — shared by both asset and move systems.
 *
 * Keys and operators match the data formats documented in
 * DATA_FORMAT.md (base) and DATA_FORMAT_YRT.md (Yrt homebrew extensions).
 *
 * Every precondition object has a `key` and at least one comparison operator.
 * Multiple operators on one object are AND'd. All preconditions in an array
 * are AND'd — the first failure reason is returned for concise UI feedback.
 */

import type { CharacterData } from './types.js';
import { findAsset } from './assetStore.svelte.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Precondition {
	key:  string;
	min?: number;
	max?: number;
	eq?:  number;
	ne?:  number;
}

/** A single difficulty factor level within an inspection ritual. */
export interface InspectionFactor {
	key:    string;
	name:   string;
	levels: string[];
}

/** A ritual asset's identity + its difficulty factors, passed via pctx. */
export interface RitualInfo {
	id:                string;
	name:              string;
	inspectionFactors: InspectionFactor[];
}

/**
 * Optional runtime context for move preconditions.
 * Defaults to all-false / 0 for asset checks (safe — asset picker has no
 * site/journey/foe selection).
 */
export interface PreconditionContext {
	hasCharacter?: boolean;
	hasSite?:      boolean;
	hasJourney?:   boolean;
	hasFoe?:       boolean;
	/** 0 = none, 1 = character has initiative, 2 = foe has initiative */
	initiative?:   number;
	/** Harm dealt by the active foe per hit (from FOE_RANKS). Used to resolve harm-links at roll time. */
	foeHarm?:      number;
	/** Ritual assets owned by the active character that have difficulty factors. */
	ritualAssets?: RitualInfo[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOUCHED_LEVEL: Record<string, number> = {
	pure: 0, prime: 1, second: 2, third: 3, feral: 4,
};

const TOUCHED_LABEL = ['Pure', 'Prime', 'Second', 'Third', 'Feral'];

const DEBILITY_KEYS = new Set([
	'wounded', 'shaken', 'unprepared', 'encumbered',
	'maimed', 'corrupted', 'cursed', 'tormented',
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns true if `value` satisfies every operator specified in `pre`. */
function passes(value: number, pre: Precondition): boolean {
	if (pre.min !== undefined && value < pre.min) return false;
	if (pre.max !== undefined && value > pre.max) return false;
	if (pre.eq  !== undefined && value !== pre.eq) return false;
	if (pre.ne  !== undefined && value === pre.ne) return false;
	return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate one precondition against character data + optional context.
 * Returns a human-readable failure string, or `null` if the check passes.
 */
export function checkPrecondition(
	pre:      Precondition,
	charData: CharacterData,
	ctx:      PreconditionContext = {},
): string | null {
	const { key } = pre;

	// ---- Context flags (primarily for moves) ----
	if (key === 'hasCharacter') {
		return passes(ctx.hasCharacter ? 1 : 0, pre) ? null : 'No character selected';
	}
	if (key === 'hasSite') {
		return passes(ctx.hasSite ? 1 : 0, pre) ? null : 'No site selected';
	}
	if (key === 'hasJourney') {
		return passes(ctx.hasJourney ? 1 : 0, pre) ? null : 'No journey selected';
	}
	if (key === 'hasFoe') {
		return passes(ctx.hasFoe ? 1 : 0, pre) ? null : 'No foe selected';
	}

	// ---- Initiative (move-only) ----
	if (key === 'initiative') {
		const v = ctx.initiative ?? 0;
		if (passes(v, pre)) return null;
		if (pre.eq === 0) return 'Combat already in progress';
		if (pre.eq === 1) return 'Requires character initiative';
		if (pre.eq === 2) return 'Requires foe initiative';
		return 'Initiative requirement not met';
	}

	// ---- Character stats ----
	const statMap: Record<string, number | undefined> = {
		momentum:   charData.momentum,
		health:     charData.health,
		spirit:     charData.spirit,
		supply:     charData.supply,
		mana:       charData.mana,
		experience: charData.xp,
		edge:       charData.edge,
		heart:      charData.heart,
		iron:       charData.iron,
		shadow:     charData.shadow,
		wits:       charData.wits,
	};
	if (key in statMap) {
		const v = statMap[key]!;
		if (passes(v, pre)) return null;
		const label = key.charAt(0).toUpperCase() + key.slice(1);
		if (pre.min !== undefined) return `Requires ${label} ≥ ${pre.min} (current: ${v})`;
		if (pre.max !== undefined) return `Requires ${label} ≤ ${pre.max} (current: ${v})`;
		if (pre.eq  !== undefined) return `Requires ${label} = ${pre.eq} (current: ${v})`;
		return `${label} requirement not met`;
	}

	// ---- Progress tracks (as boxes: ticks ÷ 4) ----
	if (key === 'bonds') {
		const boxes = Math.floor(charData.bonds / 4);
		if (passes(boxes, pre)) return null;
		if (pre.min !== undefined) return `Requires Bonds ≥ ${pre.min} boxes (current: ${boxes})`;
		return 'Bonds requirement not met';
	}
	if (key === 'failures') {
		const boxes = Math.floor(charData.failures / 4);
		if (passes(boxes, pre)) return null;
		if (pre.min !== undefined) return `Requires Failures ≥ ${pre.min} boxes (current: ${boxes})`;
		return 'Failures requirement not met';
	}

	// ---- Computed counts ----
	if (key === 'vowCount') {
		const count = charData.vows.length;
		if (passes(count, pre)) return null;
		if (pre.min !== undefined) return `Requires ≥ ${pre.min} vow${pre.min !== 1 ? 's' : ''} (current: ${count})`;
		return 'Vow count requirement not met';
	}
	if (key === 'assetCount') {
		const count = charData.assets.length;
		if (passes(count, pre)) return null;
		if (pre.min !== undefined) return `Requires ≥ ${pre.min} asset${pre.min !== 1 ? 's' : ''} (current: ${count})`;
		return 'Asset count requirement not met';
	}
	if (key === 'companionCount') {
		const count = charData.assets.filter(
			(a) => findAsset(a.assetId)?.category === 'Companion',
		).length;
		if (passes(count, pre)) return null;
		if (pre.min !== undefined) return `Requires ≥ ${pre.min} companion${pre.min !== 1 ? 's' : ''} (current: ${count})`;
		return 'Companion count requirement not met';
	}
	if (key === 'rarityCount') {
		const count = charData.assets.filter((a) => !!a.rarityId).length;
		if (passes(count, pre)) return null;
		if (pre.min !== undefined) return `Requires ≥ ${pre.min} rarity item${pre.min !== 1 ? 's' : ''} (current: ${count})`;
		return 'Rarity count requirement not met';
	}

	// ---- Debilities ----
	if (DEBILITY_KEYS.has(key)) {
		const val = (charData as unknown as Record<string, boolean>)[key] ? 1 : 0;
		if (passes(val, pre)) return null;
		const label = key.charAt(0).toUpperCase() + key.slice(1);
		if (pre.eq === 0) return `Must not be ${label}`;
		if (pre.eq === 1) return `Must be ${label}`;
		return `${label} requirement not met`;
	}

	// ---- Touched level ----
	if (key === 'touched') {
		const level = TOUCHED_LEVEL[charData.touched] ?? 0;
		if (passes(level, pre)) return null;
		if (pre.min !== undefined) {
			const needed = TOUCHED_LABEL[pre.min] ?? String(pre.min);
			return `Requires Touched: ${needed} or higher`;
		}
		if (pre.max !== undefined) {
			const max = TOUCHED_LABEL[pre.max] ?? String(pre.max);
			return `Requires Touched: ${max} or lower`;
		}
		return 'Touched requirement not met';
	}

	// ---- Asset by name (any remaining key is treated as an asset name) ----
	const hasNamed = charData.assets.some(
		(a) => findAsset(a.assetId)?.name === key,
	);
	if (passes(hasNamed ? 1 : 0, pre)) return null;
	if (pre.eq === 1) return `Requires the "${key}" asset`;
	if (pre.eq === 0) return `Must not have the "${key}" asset`;
	return `"${key}" asset requirement not met`;
}

/**
 * Check ALL preconditions (AND logic).
 * Returns the first failure reason, or `null` if all pass.
 * Returns `null` for an empty / undefined array (no restrictions).
 */
export function firstPreconditionFailure(
	preconditions: Precondition[] | undefined,
	charData:      CharacterData,
	ctx:           PreconditionContext = {},
): string | null {
	if (!preconditions || preconditions.length === 0) return null;
	for (const pre of preconditions) {
		const reason = checkPrecondition(pre, charData, ctx);
		if (reason) return reason;
	}
	return null;
}
