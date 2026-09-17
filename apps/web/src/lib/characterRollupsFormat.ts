/**
 * characterRollupsFormat — the pure formatting + type layer shared by the
 * New NPC and New Character randomizers.
 *
 * Kept separate from `characterRollups.ts` (the store-touching roll
 * pipeline) so unit tests can exercise every branch without pulling in
 * the Svelte-rune modules (`oracleStore.svelte.ts`, `log.svelte.ts`)
 * that vitest can't compile without the SvelteKit alias plugin. The
 * two files re-export each other so callers keep importing from
 * `characterRollups`.
 */

// ── Types ──────────────────────────────────────────────────────────────────

/** A single YRT Touched roll: the class + animal aspect + N features. */
export interface TouchedRoll {
	className: 'Pure' | 'Prime' | 'Second' | 'Third' | 'Feral';
	classRoll: number;
	animal: string;
	animalRoll: number;
	/** '1–3' / '4–6' when the feature count was rolled; '' when fixed/none. */
	countRange: string;
	features: Array<{ value: string; roll: number }>;
}

/** Which fields the "Also randomize" checklist covers. */
export interface CharacterRandomizeFlags {
	firstLook: boolean;
	activity: boolean;
	disposition: boolean;
	role: boolean;
	goal: boolean;
	descriptor: boolean;
	touched: boolean;
	religion: boolean;
}

/** The result of one dispatch through `rollCharacterRandomizations`. */
export interface RandomizeResult {
	firstLook?: string;
	activity?: string;
	disposition?: string;
	role?: string;
	goal?: string;
	descriptor?: string;
	touched?: TouchedRoll;
	/** The origin region (raw label) — set even when the flag is off, as long
	 *  as `opts.origin` was supplied. */
	origin?: string;
	/** Markdown from the yrtReligion roll (e.g. "**Wildens**: …"). */
	religionMd?: string;
	/** HTML for the "Region: X, then oracle result" log entry. */
	religionLogHtml?: string;
	/** Flat [label, value] pairs — feed to `logCreateRolls`. */
	rolled: Array<[string, string]>;
}

// ── Flag defaults ──────────────────────────────────────────────────────────

/** Fresh flag set — the defaults the New NPC / New Character dialogs open
 *  with (concept oracles on, YRT-only ones off). */
export function defaultRandomizeFlags(): CharacterRandomizeFlags {
	return {
		firstLook: true,
		activity: true,
		disposition: true,
		role: true,
		goal: true,
		descriptor: true,
		touched: false,
		religion: false,
	};
}

// ── Touched formatting ─────────────────────────────────────────────────────

/** Render the Touched roll into the concise markdown template we prepend to
 *  an NPC's notes or a Character's background:
 *    <name> is **<class> with <count>** features of a/an <animal>.
 *    - feature 1
 *    - feature 2
 *  Pure has no animal (and no bullets). Feral drops the bullets for a
 *  narrative placeholder. */
export function formatTouchedMd(name: string, r: TouchedRoll): string {
	const who = name.trim() || 'They';
	if (r.className === 'Pure') {
		return `${who} is **Pure with no touched features**.`;
	}
	const article = /^[aeiouAEIOU]/.test(r.animal) ? 'an' : 'a';
	if (r.className === 'Feral') {
		return (
			`${who} is **Feral with many** features of ${article} ${r.animal}.\n` +
			`- _Enter narrative concerning this character here._`
		);
	}
	const n = r.features.length;
	const noun = n === 1 ? 'feature' : 'features';
	const bullets = r.features.map((f) => `- ${f.value}`).join('\n');
	return `${who} is **${r.className} with ${n}** ${noun} of ${article} ${r.animal}.\n` + bullets;
}

/** Log breakdown of a Touched roll: class + animal aspect, the feature-count
 *  roll (Second/Third), then one line per feature. */
export function touchedLogHtml(r: TouchedRoll): string {
	const lines = [
		`<div class="roll-line">Class: <strong>${r.className}</strong> (d100 → ${r.classRoll})</div>`,
	];
	if (r.animal)
		lines.push(
			`<div class="roll-line">Animal aspect: <strong>${r.animal}</strong> (d100 → ${r.animalRoll})</div>`,
		);
	if (r.className === 'Feral') {
		lines.push(
			`<div class="roll-line"><em>Features are all-encompassing — determine narratively.</em></div>`,
		);
	} else if (r.features.length) {
		if (r.countRange)
			lines.push(`<div class="roll-line">Features: (${r.countRange} → ${r.features.length})</div>`);
		for (const f of r.features)
			lines.push(`<div class="roll-line">— <strong>${f.value}</strong> (d100 → ${f.roll})</div>`);
	}
	return lines.join('');
}

// ── RandomizeResult → markdown block ───────────────────────────────────────

/** Format the RandomizeResult as a markdown block suitable for a character's
 *  `background` (or any prose field). Returns '' when nothing was rolled.
 *  Order mirrors the checkbox row: First Look / Activity / Disposition,
 *  then Role / Goal / Revealed Details, then Region of origin + Religion,
 *  then Touched. Two blank lines separate the sections. */
export function randomizationsAsMarkdown(r: RandomizeResult, name?: string): string {
	const chunks: string[] = [];
	const field = (label: string, v?: string) => {
		if (v) chunks.push(`**${label}:** ${v}`);
	};
	field('First Look', r.firstLook);
	field('Activity', r.activity);
	field('Disposition', r.disposition);
	field('Role', r.role);
	field('Goal', r.goal);
	field('Revealed Details', r.descriptor);
	const parts: string[] = [];
	if (chunks.length) parts.push(chunks.join('\n\n'));
	if (r.origin) {
		let block = `**Region of origin:** ${r.origin}`;
		if (r.religionMd) block += `\n\n**Religion:** ${r.religionMd}`;
		parts.push(block);
	}
	if (r.touched) parts.push(formatTouchedMd(name ?? '', r.touched));
	return parts.join('\n\n');
}
