/**
 * characterRollups — shared "randomize on Create" logic for the New NPC
 * and New Character dialogs.
 *
 * Both dialogs let the user pre-check a set of oracles (First Look, Activity,
 * Disposition, Role, Goal, Revealed Details, plus YRT-only Touched + Region
 * of origin + Religion) that fire once on commit and dump their results into
 * the created entity — an NPC lands them into its per-field slots, a
 * Character folds them into its `background` markdown prose because a
 * Character has no dedicated field for any of these. The set of oracles and
 * the roll shape are identical, so both dialogs consume the same primitives
 * from this module.
 *
 * The store-touching rollers live here; the pure formatting helpers, types,
 * and flag defaults live in `characterRollupsFormat` (re-exported below) so
 * unit tests can exercise every branch without needing SvelteKit's alias
 * plugin loaded. Everything here is a plain function that reads the live
 * oracle store the moment it is called — call it from a `$derived` for
 * reactivity, or from an event handler for a one-shot snapshot.
 */

import {
	findOracle,
	getOracles,
	resolveCharacterOracle,
	rollFromRangeTable,
	rollOracle,
	type CharacterConcept,
} from './oracleStore.svelte.js';
import { appendLog } from './log.svelte.js';
import {
	defaultRandomizeFlags,
	formatTouchedMd,
	randomizationsAsMarkdown,
	touchedLogHtml,
	type CharacterRandomizeFlags,
	type RandomizeResult,
	type TouchedRoll,
} from './characterRollupsFormat.js';

// Re-export the pure layer so every consumer keeps importing from one place.
export {
	defaultRandomizeFlags,
	formatTouchedMd,
	randomizationsAsMarkdown,
	touchedLogHtml,
	type CharacterRandomizeFlags,
	type RandomizeResult,
	type TouchedRoll,
};

// ── Name oracles (character + NPC — identical) ──────────────────────────────

export const NAME_ORACLES: { value: string; label: string }[] = [
	{ value: 'namesIronlander', label: 'Ironlander' },
	{ value: 'namesIronlander2', label: 'Ironlander 2' },
	{ value: 'namesElf_elf1', label: 'Elf 1' },
	{ value: 'namesElf_elf2', label: 'Elf 2' },
	{ value: 'namesOther_giants', label: 'Giants' },
	{ value: 'namesOther_varou', label: 'Varou' },
	{ value: 'namesOther_trolls', label: 'Trolls' },
];

/** Roll one of the name-oracle picker keys. Entries are `<oracleKey>` or, for
 *  matrix name oracles (`Name: Elf`, `Name: Other`), `<oracleKey>_<columnKey>`;
 *  the underscore suffix selects which column to lift from. Empty string on
 *  failure so callers can `newName = rollByNameOracleKey(…) || newName`. */
export function rollByNameOracleKey(key: string): string {
	const usc = key.indexOf('_');
	const oracleKey = usc >= 0 ? key.slice(0, usc) : key;
	const col = usc >= 0 ? key.slice(usc + 1) : undefined;
	return rollOracle(oracleKey, getOracles(), col ? { stat: col } : undefined).value ?? '';
}

// ── YRT region-of-origin ────────────────────────────────────────────────────

export interface OriginOption {
	value: string;
	label: string;
	/** The yrtReligion column label this region maps to (via the region
	 *  oracle's Country column). Empty when the region has no country. */
	country: string;
}

/** Options for the origin picker — mirrors the settlement region roll so the
 *  two stay in lock-step. Empty until the catalogue (and YRT) loads. */
export function regionOriginOptions(): OriginOption[] {
	return (findOracle('yrtRegion')?.data ?? []).map((r) => ({
		value: String(r.value ?? ''),
		label: String(r.value ?? ''),
		country: String((r as Record<string, unknown>).country ?? ''),
	}));
}

/** The yrtReligion column KEY for `origin`'s country — resolved from the
 *  region's `country` (a column label) against the religion oracle's columns.
 *  Empty when the origin is missing, unrecognised, or has no country. */
export function religionColumnForOrigin(origin: string): string {
	const country = regionOriginOptions().find((o) => o.value === origin)?.country ?? '';
	if (!country) return '';
	const cols = findOracle('yrtReligion')?.columns ?? [];
	return cols.find((c) => c.label === country)?.key ?? '';
}

/** Roll the YRT Region oracle for a random region of origin. */
export function rollRandomRegionOrigin(): string {
	const rolled = rollOracle('yrtRegion', getOracles()).value;
	return typeof rolled === 'string' ? rolled : '';
}

// ── YRT Touched (structured multi-roll) ─────────────────────────────────────

/** Roll YRT Touched: class → animal aspect → features. Returns null if the
 *  YRT oracles aren't loaded. Class 'Pure' → no animal, no features; 'Feral'
 *  → animal + narrative features (no bulleted list). */
export function rollYrtTouchedStructured(): TouchedRoll | null {
	const touched = findOracle('yrtTouched');
	if (!touched) return null;
	const clsRes = rollFromRangeTable(touched.data);
	const cls = clsRes.value as {
		className: TouchedRoll['className'];
		featureCount: number | { min: number; max: number } | null;
	};
	const r: TouchedRoll = {
		className: cls.className,
		classRoll: clsRes.roll,
		animal: '',
		animalRoll: 0,
		countRange: '',
		features: [],
	};
	if (cls.featureCount === 0) return r; // Pure — no animal, no features
	const animalOracle = findOracle('yrtAnimal');
	const aRes = animalOracle ? rollFromRangeTable(animalOracle.data) : { roll: 0, value: '' };
	r.animal = (aRes.value as string) ?? '';
	r.animalRoll = aRes.roll;
	if (cls.featureCount === null) return r; // Feral — animal, narrative features
	let count: number;
	if (typeof cls.featureCount === 'number') {
		count = cls.featureCount; // Prime — exactly 1
	} else {
		const { min } = cls.featureCount;
		// Second / Third: d6 % 3 + min → 1..3 or 4..6.
		count = (Math.floor(Math.random() * 6) % 3) + min;
		r.countRange = min === 1 ? '1–3' : '4–6';
	}
	const featOracle = findOracle('touchedFeatures');
	const seen = new Set<string>();
	let safety = 0;
	if (featOracle) {
		while (r.features.length < count && safety++ < 1000) {
			const fr = rollFromRangeTable(featOracle.data);
			const v = fr.value as string;
			if (!seen.has(v)) {
				seen.add(v);
				r.features.push({ value: v, roll: fr.roll });
			}
		}
	}
	return r;
}

// ── The randomize-on-Create pipeline itself ─────────────────────────────────

/** Roll every flagged field. `opts.origin` (a raw region name) is folded
 *  into the result when set; `opts.yrtEnabled` gates the two YRT flags
 *  (touched, religion) so a caller can pass the current isSourceEnabled('yrt')
 *  once instead of the helper reaching for the extension store itself. */
export function rollCharacterRandomizations(
	flags: CharacterRandomizeFlags,
	opts: { origin?: string; yrtEnabled?: boolean } = {},
): RandomizeResult {
	const oracles = getOracles();
	const rolled: Array<[string, string]> = [];
	const r: RandomizeResult = { rolled };

	function tryConcept(concept: CharacterConcept): string | undefined {
		const oracle = resolveCharacterOracle(concept);
		if (!oracle) return undefined;
		return rollOracle(oracle.key, oracles).value ?? '';
	}

	if (flags.firstLook) {
		const v = tryConcept('firstLook');
		if (v !== undefined) {
			r.firstLook = v;
			rolled.push(['First Look', v]);
		}
	}
	if (flags.activity) {
		const v = tryConcept('activity');
		if (v !== undefined) {
			r.activity = v;
			rolled.push(['Activity', v]);
		}
	}
	if (flags.disposition) {
		const v = tryConcept('disposition');
		if (v !== undefined) {
			r.disposition = v;
			rolled.push(['Disposition', v]);
		}
	}
	if (flags.role) {
		r.role = rollOracle('characterRole', oracles).value ?? '';
		rolled.push(['Role', r.role]);
	}
	if (flags.goal) {
		r.goal = rollOracle('characterGoal', oracles).value ?? '';
		rolled.push(['Goal', r.goal]);
	}
	if (flags.descriptor) {
		r.descriptor = rollOracle('characterDescriptor', oracles).value ?? '';
		rolled.push(['Revealed Details', r.descriptor]);
	}
	if (opts.yrtEnabled && flags.touched) {
		const tr = rollYrtTouchedStructured();
		if (tr) r.touched = tr;
	}
	if (opts.yrtEnabled && opts.origin) {
		r.origin = opts.origin;
		if (flags.religion) {
			const col = religionColumnForOrigin(opts.origin);
			if (col) {
				const rel = rollOracle('yrtReligion', oracles, { stat: col });
				r.religionMd = rel.value ?? '';
				r.religionLogHtml = `<div class="roll-line">Region: <strong>${opts.origin}</strong></div>${rel.html}`;
			}
		}
	}
	return r;
}

/** Post the composite "New X — <name>" log entry from the rolled list.
 *  Skips entries with empty values. */
export function logCreateRolls(title: string, rolled: Array<[string, string]>): void {
	const body = rolled
		.filter(([, v]) => v)
		.map(([l, v]) => `<div class="roll-line">${l}: <strong>${v}</strong></div>`)
		.join('');
	if (body) appendLog(title, body);
}
