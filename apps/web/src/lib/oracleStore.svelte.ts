// =============================================================================
// Iron Ledger — Oracle Store (Svelte 5 module-level $state)
//
// Provides:
//   • loadOracles()              — fetch + cache oracle catalogue
//   • getOracles()               — sorted list of OracleFile (reactive)
//   • getOracleSources()         — distinct source tags in display order
//   • getVisibleOracles()        — oracles filtered by enabled expansions
//   • getVisibleOracleSources()  — visible sources after filtering
//   • findOracle(key)            — lookup by key (never filtered)
//   • rollFromRangeTable(table)  — core d100 algorithm (ported from oracles-pure.js)
//   • rangeLabelForEntry(t, i)   — range string "1–25" or "26"
//   • buildTableHtml(key, table) — HTML table for the detail view
//   • rollOracle(key, oracles)   — high-level dispatcher → { roll, html, title }
// =============================================================================

import type { CatalogueSource } from '$lib/types.js';
import {
	isSourceEnabled,
	loadExtensions,
	suppressedOracleKeys,
} from '$lib/expansionStore.svelte.js';
import { ROLL_DSL, hasRollTemplate, linkifyTemplate, fillTemplate, type RollFn } from './dsl.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OracleEntry {
	topRange: number;
	/** Primary result. Optional for flat multi-column oracles that carry named
	 *  columns instead of a single value (e.g. freeportDenizen → type/notes/
	 *  salary/count). */
	value?: unknown;
	/** Secondary classification (e.g. YRT Region → Settled / Boundary / Remote). */
	type?: string;
	/** Flavor / detail text (e.g. Delve Site Theme → "This place holds the
	 *  secrets of a bygone age"; Combat: Battleground examples). */
	description?: string;
	/** Flat multi-column oracles carry one field per column `key`. */
	[key: string]: unknown;
}

/** One selectable column of a `tableType: 'columnSelect'` oracle (e.g. Delve
 *  Depths stats, or Settlement Type's land tiers). Each data row carries a
 *  `topRange` under each column's `key`; the picker chooses which column the
 *  roll resolves against. */
export interface OracleColumn {
	key: string;
	label: string;
}

export interface OracleFile {
	key: string;
	title: string;
	source: CatalogueSource;
	/** Thematic grouping used by the Ask/Oracles category filter — distinct from
	 *  `source` (the owning expansion). E.g. "Location", "Character", "Threat".
	 *  Falls back to "Other" when absent. */
	category?: string;
	selectLabel: string;
	description?: string;
	/** Guidance shown *below* the table (vs `description`, shown above). Used for
	 *  the Lodestar settlement suite's "Envisioning Settlements" wrap-up. Split on
	 *  blank lines into paragraphs when rendered. */
	postamble?: string;
	tableType?: string;
	/** For `tableType: 'compound'` — how the rolled result renders:
	 *  `"dossier"` = per-field breakdown (Monstrosity), `"phrase"` = one composed
	 *  string (Site Name). Explicit; replaces the old ": "/`[…](roll:…)` heuristic. */
	compound?: 'phrase' | 'dossier';
	/** Column definitions. For `columnSelect` / `matrix` these are the pickable
	 *  columns; for a flat table they name/label the display columns (in order
	 *  after D100). When absent on a flat oracle, columns are derived from the
	 *  row keys (value → "Result", type → "Type", description → "Description"). */
	columns?: OracleColumn[];
	/** Flat oracles only: which column keys to echo on a roll, each as
	 *  `Label: value` on its own line. Defaults to `["value"]` (+ a label-less
	 *  `description` echo, the legacy behaviour) when absent. */
	roll?: string[];
	/** For `tableType: 'twoStep'` — column headings for the two rolls. Each data
	 *  row's `value` is `{ label, subtable }`: roll the outer table for a `label`,
	 *  then roll that row's `subtable` for the final result. Defaults:
	 *  outer "Category", inner "Result". */
	outerLabel?: string;
	innerLabel?: string;
	data: OracleEntry[];
}

export interface OracleRollResult {
	roll: number;
	html: string;
	title: string;
	/** Plain-text result value, suitable for auto-filling a text field. */
	value: string;
}

// ---------------------------------------------------------------------------
// Module-level state (shared across all component instances)
// ---------------------------------------------------------------------------

let _oracles: OracleFile[] = $state([]);
let _orderMap: Record<string, number> = $state({});
let _loading = $state(false);
let _loaded = false;

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Fallback source for oracle keys served by an API older than the source-tagging
 * migration. Used only when an oracle file omits the explicit `source` field.
 * Keep in sync with the JSON `source` values under apps/api/data/oracles/.
 */
const ORACLE_KEY_SOURCE_FALLBACK: Record<string, CatalogueSource> = {
	// YRT
	yrtAnimal: 'yrt',
	yrtRegion: 'yrt',
	yrtTouched: 'yrt',
	yrtCityTownLocation: 'yrt',
	touchedFeatures: 'yrt',
	manaBacklash: 'yrt',
	freeportDenizen: 'yrt',
	// Delve
	charDisposition: 'delve',
	combatEvent: 'delve',
	featureAspect: 'delve',
	featureFocus: 'delve',
	monstrosityAbilities: 'delve',
	monstrosityCharacteristics: 'delve',
	monstrosityPrimaryForm: 'delve',
	monstrositySize: 'delve',
	siteName: 'delve',
	siteNatureDomain: 'delve',
	siteNatureTheme: 'delve',
	threatBurgeoningConflict: 'delve',
	threatCategory: 'delve',
	threatCursedSite: 'delve',
	threatEnvironmentalCalamity: 'delve',
	threatMalignantPlague: 'delve',
	threatPowerHungryMystic: 'delve',
	threatRampagingCreature: 'delve',
	threatRavagingHorde: 'delve',
	threatSchemingLeader: 'delve',
	threatZealousCult: 'delve',
	trap: 'delve',
};

/** Resolve an oracle's source — explicit `source` field first, key fallback otherwise. */
function resolveSource(o: OracleFile): CatalogueSource {
	if (o.source) return o.source;
	return ORACLE_KEY_SOURCE_FALLBACK[o.key] ?? 'base';
}

/**
 * Populate the oracle store from a pre-fetched list (splits fetching from
 * state population in `loadOracles`). Public so unit tests can seed the
 * store deterministically without a network round-trip; production code
 * flows through `loadOracles`. Backfills missing `source` via the
 * ORACLE_KEY_SOURCE_FALLBACK map, sorts by the provided order map, and
 * marks the store loaded.
 */
export function registerOracles(list: OracleFile[], orderMap: Record<string, number> = {}): void {
	const files = list.map((f) => ({ ...f, source: f.source ?? resolveSource(f) }));
	_orderMap = orderMap;
	files.sort((a, b) => {
		const wa = _orderMap[a.key] ?? 999;
		const wb = _orderMap[b.key] ?? 999;
		return wa !== wb ? wa - wb : a.key.localeCompare(b.key);
	});
	_oracles = files;
	_loaded = true;
}

/**
 * Fetch oracle catalogue from /api/catalogue/oracles and cache it for the session.
 * Idempotent — safe to call multiple times; only fetches once.
 */
export async function loadOracles(): Promise<void> {
	if (_loaded || _loading) return;
	_loading = true;
	try {
		// Fetch oracles + extensions in parallel — the extension registry
		// carries the suppression list (Lodestar hides Delve's Feature Aspect
		// + Focus, etc.), so `_oracles` must not be published until the
		// registry is loaded, or reactive consumers of `getVisibleOracles()`
		// will render one frame showing suppressed oracles before the
		// registry lands. Both fetches happen in parallel — no serialization
		// cost — but the store's public state waits for both.
		const [res] = await Promise.all([fetch('/api/catalogue/oracles'), loadExtensions()]);
		if (!res.ok) throw new Error(`Oracle fetch failed: ${res.status}`);

		const json = (await res.json()) as { oracles: unknown[] };

		// The oracles array contains all 49 oracle JSON files AND oracle-order.json.
		// oracle-order.json has shape { key: number, ... } — no `data` array.
		// Filter it out, then extract the order map from it.
		let orderMap: Record<string, number> = {};
		const files: OracleFile[] = [];

		for (const item of json.oracles) {
			const obj = item as Record<string, unknown>;
			if (Array.isArray(obj['data'])) {
				files.push(obj as unknown as OracleFile);
			} else if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
				// Likely oracle-order.json — use it as the sort order map
				orderMap = obj as Record<string, number>;
			}
		}

		registerOracles(files, orderMap);
	} catch (err) {
		console.error('[oracleStore] Failed to load oracles:', err);
	} finally {
		_loading = false;
	}
}

// ---------------------------------------------------------------------------
// Accessors (reactive — reads tracked by $derived)
// ---------------------------------------------------------------------------

/** All loaded oracle files, sorted by oracle-order.json weight (unfiltered — for render-time resolution). */
export function getOracles(): OracleFile[] {
	return _oracles;
}

/** Distinct sources in the order they first appear. */
export function getOracleSources(): CatalogueSource[] {
	const seen = new Set<CatalogueSource>();
	const out: CatalogueSource[] = [];
	for (const o of _oracles) {
		if (!seen.has(o.source)) {
			seen.add(o.source);
			out.push(o.source);
		}
	}
	return out;
}

/** Oracles whose source is currently enabled AND that aren't suppressed by another
 *  enabled extension. Used by pickers; `findOracle` stays unfiltered so log
 *  click-throughs still resolve for oracles the user has since hidden. */
export function getVisibleOracles(): OracleFile[] {
	const suppressed = suppressedOracleKeys();
	return _oracles.filter((o) => isSourceEnabled(o.source) && !suppressed.has(o.key));
}

/** Visible sources after expansion filtering. */
export function getVisibleOracleSources(): CatalogueSource[] {
	return getOracleSources().filter((s) => isSourceEnabled(s));
}

/** Look up a single oracle by key. Never filtered — log entries and direct opens must always resolve. */
export function findOracle(key: string): OracleFile | undefined {
	return _oracles.find((o) => o.key === key);
}

// ---------------------------------------------------------------------------
// Character concept → visible oracle resolver
//
// The concept preference map + the resolver logic live in the pure
// characterConcept.ts module so unit tests can exercise every
// extension-toggle combination without standing up the reactive Svelte
// store. This wrapper just plumbs the live reactive state (_oracles,
// suppressedOracleKeys(), isSourceEnabled) into that resolver; reads
// propagate through $derived so pickers re-run on toggle changes.
// ---------------------------------------------------------------------------

export type { CharacterConcept } from '$lib/characterConcept.js';
import {
	resolveCharacterConcept,
	type CharacterConcept as _CharacterConcept,
} from '$lib/characterConcept.js';

export function resolveCharacterOracle(concept: _CharacterConcept): OracleFile | null {
	return resolveCharacterConcept(concept, _oracles, suppressedOracleKeys(), isSourceEnabled);
}

// ---------------------------------------------------------------------------
// Pure rolling helpers  (ported from oracles-pure.js)
// ---------------------------------------------------------------------------

/** Roll d100 and look up the result in a range table. */
export function rollFromRangeTable(table: OracleEntry[]): { roll: number; value: unknown } {
	const roll = Math.floor(Math.random() * 100) + 1;
	let picked = table[table.length - 1];
	for (const entry of table) {
		if (roll <= entry.topRange) {
			picked = entry;
			break;
		}
	}
	return { roll, value: picked.value };
}

/** Build a display label for one table row: "1–25" or "26". */
export function rangeLabelForEntry(table: OracleEntry[], index: number): string {
	const low = index === 0 ? 1 : table[index - 1].topRange + 1;
	const high = table[index].topRange;
	return low === high ? `${low}` : `${low}–${high}`;
}

/** A `RollFn` for `fillTemplate` — rolls a referenced oracle in the catalogue,
 *  returning just its d100 + text value. Injected so the pure `fillTemplate`
 *  (in dsl.ts) needn't import the runes-based store. */
const makeRollFn =
	(allOracles: OracleFile[]): RollFn =>
	(key, depth) => {
		const r = rollOracle(key, allOracles, { _depth: depth });
		return { roll: r.roll, value: r.value };
	};

/** Build an HTML table string for the detail view. */
export function buildTableHtml(
	key: string,
	table: OracleEntry[],
	options?: {
		activeStat?: string;
		columns?: OracleColumn[];
		outerLabel?: string;
		innerLabel?: string;
		tableType?: string;
		/** Narrow viewport (≤640px): render wide layouts single-column so they fit
		 *  a phone without horizontal scroll. Currently drives the two-step table. */
		narrow?: boolean;
	},
): string {
	if (!table || table.length === 0) return '<div>No table data.</div>';

	// ── Compound (tableType: "compound") — format string(s) whose `[oracleKey]`
	// blanks are filled by rolling the referenced oracle. Render each blank as
	// its target oracle's title. Single format → the string alone; multiple → a
	// d100 | Format table (the rolled format table). ─────────────────────────
	if (options?.tableType === 'compound') {
		if (table.length === 1) {
			return `<div class="oracle-compound-single">${linkifyTemplate(table[0].value as string)}</div>`;
		}
		let html =
			'<table class="oracle-table"><thead><tr><th>d100</th><th>Format</th></tr></thead><tbody>';
		table.forEach((entry, idx) => {
			html +=
				`<tr><td class="oracle-range">${rangeLabelForEntry(table, idx)}</td>` +
				`<td>${linkifyTemplate(entry.value as string)}</td></tr>`;
		});
		return html + '</tbody></table>';
	}

	// ── Special layouts ──────────────────────────────────────────────────────

	// Matrix table (Scale: Magnitude): shared d100 ranges down the side, one
	// value column per `columns` entry (active column highlighted). Distinct
	// from columnSelect, which has per-column ranges and a shared Result value.
	if (options?.tableType === 'matrix' && options.columns?.length) {
		const cols = options.columns;
		const activeIdx = options.activeStat ? cols.findIndex((c) => c.key === options.activeStat) : -1;
		// `od-pick-col` on every value column lets the detail view collapse to just
		// D100 + the active column on narrow screens (shared with columnSelect —
		// any column-picker oracle collapses to its chosen column).
		const cc = (i: number) => ` class="od-pick-col${activeIdx === i ? ' col-active' : ''}"`;
		let html =
			'<table class="oracle-table"><thead><tr><th class="oracle-range">d100</th>' +
			cols.map((c, i) => `<th${cc(i)}>${c.label}</th>`).join('') +
			'</tr></thead><tbody>';
		let prev = 0;
		for (const entry of table) {
			const r = entry as unknown as Record<string, number | string>;
			const hi = r['topRange'] as number;
			const lo = prev + 1;
			prev = hi;
			const range = lo === hi ? `${hi}` : `${lo}–${hi}`;
			html +=
				`<tr><td class="oracle-range">${range}</td>` +
				cols.map((c, i) => `<td${cc(i)}>${r[c.key] as string}</td>`).join('') +
				'</tr>';
		}
		return html + '</tbody></table>';
	}

	// Generic column-select table (Delve the Depths stat columns, Settlement
	// Type land tiers, etc.): one range column per `columns` entry + a Result
	// column, with the active column highlighted.
	if (options?.tableType === 'columnSelect' && options.columns?.length) {
		const cols = options.columns;
		const activeIdx = options.activeStat ? cols.findIndex((c) => c.key === options.activeStat) : -1;
		// `od-pick-col` marks the per-column range cells (not the shared Result) so
		// narrow screens collapse to the active column + Result.
		const cc = (i: number) =>
			` class="oracle-range od-pick-col${activeIdx === i ? ' col-active' : ''}"`;
		let html =
			'<table class="oracle-table"><thead><tr>' +
			cols.map((c, i) => `<th${cc(i)}>${c.label}</th>`).join('') +
			'<th>Result</th></tr></thead><tbody>';
		const prev = cols.map(() => 0);
		for (const entry of table) {
			const r = entry as unknown as Record<string, number | string>;
			const cells = cols
				.map((c, i) => {
					const hi = r[c.key] as number;
					const lo = prev[i] + 1;
					prev[i] = hi;
					return `<td${cc(i)}>${lo === hi ? hi : `${lo}–${hi}`}</td>`;
				})
				.join('');
			html += `<tr>${cells}<td>${r['value'] as string}</td></tr>`;
		}
		return html + '</tbody></table>';
	}

	if (key === 'yrtTouched') {
		let html =
			'<table class="oracle-table"><thead><tr>' +
			'<th>d100</th><th>Class</th><th>Rank</th><th>Animal Features</th><th>Description</th>' +
			'</tr></thead><tbody>';
		table.forEach((entry, idx) => {
			const v = entry.value as {
				socialRank: number;
				className: string;
				description: string;
				featureCount: number | { min: number; max: number } | null;
			};
			let featureLabel: string;
			if (v.featureCount === 0) featureLabel = '0';
			else if (v.featureCount === 1) featureLabel = '1';
			else if (v.featureCount === null) featureLabel = 'Narrative';
			else {
				const fc = v.featureCount as { min: number; max: number };
				featureLabel = `${fc.min}–${fc.max} (d6%3+${fc.min})`;
			}
			html +=
				`<tr><td class="oracle-range">${rangeLabelForEntry(table, idx)}</td>` +
				`<td>${v.className}</td><td>${v.socialRank}</td><td>${featureLabel}</td><td>${v.description}</td></tr>`;
		});
		return html + '</tbody></table>';
	}

	// Two-step subtable table (tableType: "twoStep"): d100 | <outer> | d100 |
	// <inner> | d100 | <inner>. Detected by data shape — each outer row's value
	// is { label, subtable }. Labels come from the oracle's outer/innerLabel.
	if (table.some((e) => Array.isArray((e.value as { subtable?: unknown } | null)?.subtable))) {
		const outer = options?.outerLabel ?? 'Category';
		const inner = options?.innerLabel ?? 'Result';

		// Narrow (phone): the two side-by-side inner halves overflow, so render the
		// inner subtable as ONE stacked column — d100 | outer | d100 | inner. Taller,
		// but fits the dialog width (the dialog scrolls vertically anyway).
		if (options?.narrow) {
			let html =
				'<table class="oracle-table"><thead><tr>' +
				`<th>d100</th><th>${outer}</th><th>d100</th><th>${inner}</th>` +
				'</tr></thead><tbody>';
			table.forEach((entry, idx) => {
				const rangeStr = rangeLabelForEntry(table, idx);
				const v = entry.value as { label: string; subtable: OracleEntry[] };
				const sub = v.subtable;
				sub.forEach((s, i) => {
					const nameCells =
						`<td class="oracle-range">${rangeLabelForEntry(sub, i)}</td>` +
						`<td>${s.value as string}</td>`;
					html +=
						i === 0
							? `<tr><td rowspan="${sub.length}" class="oracle-cat-range">${rangeStr}</td>` +
								`<td rowspan="${sub.length}" class="oracle-cat-desc">${v.label}</td>${nameCells}</tr>`
							: `<tr>${nameCells}</tr>`;
				});
			});
			return html + '</tbody></table>';
		}

		// Wide: d100 | outer | d100 | inner | d100 | inner (inner split into two
		// side-by-side halves to keep the table short).
		let html =
			'<table class="oracle-table"><thead><tr>' +
			`<th>d100</th><th>${outer}</th><th>d100</th><th>${inner}</th><th>d100</th><th>${inner}</th>` +
			'</tr></thead><tbody>';
		table.forEach((entry, idx) => {
			const rangeStr = rangeLabelForEntry(table, idx);
			const v = entry.value as { label: string; subtable: OracleEntry[] };
			const sub = v.subtable;
			const half = Math.ceil(sub.length / 2);
			for (let i = 0; i < half; i++) {
				const left = sub[i];
				const right = sub[i + half];
				const lRange = rangeLabelForEntry(sub, i);
				const rRange = right ? rangeLabelForEntry(sub, i + half) : '';
				const nameCells =
					`<td class="oracle-range">${lRange}</td><td>${left.value as string}</td>` +
					`<td class="oracle-range">${rRange}</td><td>${right ? (right.value as string) : ''}</td>`;
				html +=
					i === 0
						? `<tr><td rowspan="${half}" class="oracle-cat-range">${rangeStr}</td>` +
							`<td rowspan="${half}" class="oracle-cat-desc">${v.label}</td>${nameCells}</tr>`
						: `<tr>${nameCells}</tr>`;
			}
		});
		return html + '</tbody></table>';
	}

	// Prefix/suffix table (tableType: "prefixSuffix"): each row's value is
	// { prefix, suffix }; a roll combines a prefix from one d100 and a suffix
	// from another (see rollOracle). The reference table chunks the entries into
	// side-by-side column groups (d100 | Prefix | Suffix) to stay short. Three
	// groups (9 cols) is too wide for a phone, so narrow screens use two groups
	// (6 cols); the prefix/suffix are short enough that two fit without a scroll.
	if (options?.tableType === 'prefixSuffix') {
		const groups = options?.narrow ? 2 : 3;
		const chunk = Math.ceil(table.length / groups);
		let html =
			'<table class="oracle-table"><thead><tr>' +
			'<th>d100</th><th>Prefix</th><th>Suffix</th>'.repeat(groups) +
			'</tr></thead><tbody>';
		for (let i = 0; i < chunk; i++) {
			html += '<tr>';
			for (let col = 0; col < groups; col++) {
				const entry = table[i + chunk * col];
				if (entry) {
					const v = entry.value as { prefix: string; suffix: string };
					html +=
						`<td class="oracle-range">${rangeLabelForEntry(table, i + chunk * col)}</td>` +
						`<td>${v.prefix}-</td><td>-${v.suffix}</td>`;
				} else {
					html += '<td></td><td></td><td></td>';
				}
			}
			html += '</tr>';
		}
		return html + '</tbody></table>';
	}

	// Name: Other (Giants/Varou/Trolls) and Name: Elf (Elf 1/Elf 2) are now
	// `tableType: 'matrix'` — the generic matrix branch above renders them.

	// ── Flat table (unified simple / typed / described / multi-column) ────────
	// Columns come from `options.columns` (explicit labels/order) or are derived
	// from the row keys: value → "Result", plus Type / Description when present.
	// Replaces the old freeportDenizen / typed / described special branches.
	const flatCols: OracleColumn[] = options?.columns?.length
		? options.columns
		: [
				{ key: 'value', label: 'Result' },
				...(table.some((e) => e.type != null) ? [{ key: 'type', label: 'Type' }] : []),
				...(table.some((e) => e.description != null)
					? [{ key: 'description', label: 'Description' }]
					: []),
			];
	const cell = (e: OracleEntry, k: string) => {
		const v = e[k];
		if (v == null) return '';
		const s = String(v);
		// A value with a `[label](roll:…)` blank (e.g. a "roll twice" row) renders
		// its tokens as pills; plain values pass through unchanged.
		return hasRollTemplate(s) ? linkifyTemplate(s) : s;
	};

	// A single value column keeps the space-saving multi-column layout for long
	// lists (3 columns > 60 rows, 2 columns > 40, else 1).
	if (flatCols.length === 1 && flatCols[0].key === 'value') {
		const perCol = table.length > 60 ? 3 : table.length > 40 ? 2 : 1;
		const rowsPer = Math.ceil(table.length / perCol);
		let html =
			'<table class="oracle-table"><thead><tr>' +
			Array.from({ length: perCol }, () => '<th>d100</th><th>Result</th>').join('') +
			'</tr></thead><tbody>';
		for (let i = 0; i < rowsPer; i++) {
			html += '<tr>';
			for (let c = 0; c < perCol; c++) {
				const idx = i + rowsPer * c;
				const entry = table[idx];
				html += entry
					? `<td class="oracle-range">${rangeLabelForEntry(table, idx)}</td><td>${cell(entry, 'value')}</td>`
					: '<td></td><td></td>';
			}
			html += '</tr>';
		}
		return html + '</tbody></table>';
	}

	// Multi-column flat table: D100 + one column per `flatCols` entry.
	let html =
		'<table class="oracle-table"><thead><tr><th class="oracle-range">d100</th>' +
		flatCols.map((c) => `<th>${c.label}</th>`).join('') +
		'</tr></thead><tbody>';
	table.forEach((entry, idx) => {
		html +=
			`<tr><td class="oracle-range">${rangeLabelForEntry(table, idx)}</td>` +
			flatCols.map((c) => `<td>${cell(entry, c.key)}</td>`).join('') +
			'</tr>';
	});
	return html + '</tbody></table>';
}

// ---------------------------------------------------------------------------
// High-level roll dispatcher
// ---------------------------------------------------------------------------

/**
 * Roll on an oracle identified by key.
 * Handles all special oracle types; returns { roll, html, title }.
 * `roll` is the primary d100 value (used to drive the dice animation).
 */
export function rollOracle(
	key: string,
	allOracles: OracleFile[],
	options?: { stat?: string; _depth?: number },
): OracleRollResult {
	const oracle = allOracles.find((o) => o.key === key);
	if (!oracle) {
		return {
			roll: 0,
			html: '<div class="roll-line">Error: unknown oracle key.</div>',
			title: key,
			value: '',
		};
	}

	const title = oracle.title;
	const table = oracle.data;

	// ── compound — roll a format string, then fill each `[oracleKey]` blank by
	// rolling the referenced oracle (recursively). Single-row `data` = one fixed
	// format (no format roll); multiple rows = roll to pick a format. ────────
	if (oracle.tableType === 'compound') {
		const depth = options?._depth ?? 0;
		const fmtRes = rollFromRangeTable(table);
		const template = fmtRes.value as string;
		const { filled, lines } = fillTemplate(template, key, makeRollFn(allOracles), depth);
		// A labelled dossier template (has a "Label: " before a blank) logs the
		// per-field breakdown (+ the format roll when multiple formats). A phrase
		// template (a name) logs just the composed result — the assembled string
		// is the whole point.
		// Dossier = per-field breakdown; phrase = a composed name. Prefer the
		// explicit `compound` flag; fall back to the ": " heuristic for oracles
		// not yet carrying it (legacy `[key]` compounds).
		const isDossier = oracle.compound ? oracle.compound === 'dossier' : /:\s/.test(template);
		const fmtLine =
			isDossier && table.length > 1
				? `<div class="roll-line">Format roll: d100 → ${fmtRes.roll}</div>`
				: '';
		const html = isDossier ? fmtLine + lines.join('') : `<div><strong>${filled}</strong></div>`;
		return { roll: fmtRes.roll, html, title, value: filled };
	}

	// ── twoStep — roll the outer table, then the chosen row's subtable ──────
	if (oracle.tableType === 'twoStep') {
		const outer = oracle.outerLabel ?? 'Category';
		const inner = oracle.innerLabel ?? 'Result';
		const outerRes = rollFromRangeTable(table);
		const row = outerRes.value as { label: string; subtable: OracleEntry[] };
		const innerRes = rollFromRangeTable(row.subtable);
		const word = innerRes.value as string;
		const html =
			`<div class="roll-line">${outer}: <strong>${row.label}</strong> (d100 → ${outerRes.roll})</div>` +
			`<div class="roll-line">${inner}: <strong>${word}</strong> (d100 → ${innerRes.roll})</div>`;
		return { roll: outerRes.roll, html, title, value: word };
	}

	// ── matrix — shared ranges, one value per column (Scale: Magnitude) ─────
	if (oracle.tableType === 'matrix' && oracle.columns?.length) {
		const cols = oracle.columns;
		const col = cols.find((c) => c.key === options?.stat) ?? cols[0];
		const roll = Math.floor(Math.random() * 100) + 1;
		const rows = table as unknown as Array<Record<string, number | string>>;
		const found = rows.find((r) => roll <= (r['topRange'] as number)) ?? rows[rows.length - 1];
		const value = found[col.key] as string;
		const html =
			`<div class="roll-line">Roll (${col.label}): d100 → ${roll}</div>` +
			`<div class="move-outcome">${value}</div>`;
		return { roll, html, title, value };
	}

	// ── columnSelect — roll against a chosen column (land tier, etc.) ───────
	if (oracle.tableType === 'columnSelect' && oracle.columns?.length) {
		const cols = oracle.columns;
		const col = cols.find((c) => c.key === options?.stat) ?? cols[0];
		const roll = Math.floor(Math.random() * 100) + 1;
		const rows = table as unknown as Array<Record<string, number | string>>;
		const found = rows.find((r) => roll <= (r[col.key] as number)) ?? rows[rows.length - 1];
		const value = found['value'] as string;
		const html =
			`<div class="roll-line">Roll (${col.label}): d100 → ${roll}</div>` +
			`<div class="move-outcome">${value}</div>`;
		return { roll, html, title, value };
	}

	// ── yrtTouched — compound multi-roll ───────────────────────────────────
	if (key === 'yrtTouched') {
		const classRes = rollFromRangeTable(table);
		const cv = classRes.value as {
			socialRank: number;
			className: string;
			description: string;
			featureCount: number | { min: number; max: number } | null;
		};

		// Pure — no animal aspect or features
		if (cv.featureCount === 0) {
			const html =
				`<div class="roll-line">Class roll: d100 → ${classRes.roll}</div>` +
				`<div><strong>${cv.className}</strong> (Social rank ${cv.socialRank}) — ${cv.description}</div>`;
			return { roll: classRes.roll, html, title, value: cv.className };
		}

		// All other classes need an animal aspect
		const animalOracle = allOracles.find((o) => o.key === 'yrtAnimal');
		const animalRes = animalOracle
			? rollFromRangeTable(animalOracle.data)
			: { roll: 0, value: '—' };

		// Feral — narrative, no feature rolls
		if (cv.featureCount === null) {
			const html =
				`<div class="roll-line">Class roll: d100 → ${classRes.roll}</div>` +
				`<div><strong>${cv.className}</strong> (Social rank ${cv.socialRank}) — ${cv.description}</div>` +
				`<div class="roll-line">Animal roll: d100 → ${animalRes.roll}</div>` +
				`<div>Animal aspect: <strong>${animalRes.value as string}</strong></div>` +
				`<div><em>Features are all-encompassing — determine narratively with the player.</em></div>`;
			return {
				roll: classRes.roll,
				html,
				title,
				value: `${cv.className} (${animalRes.value as string})`,
			};
		}

		// Determine feature count
		let count: number;
		let countLine: string;
		if (typeof cv.featureCount === 'number') {
			// Prime: exactly 1
			count = cv.featureCount;
			countLine = `${count} feature`;
		} else {
			// Second (1–3) or Third (4–6): roll d6%3+min
			const { min, max } = cv.featureCount;
			const d6 = Math.floor(Math.random() * 6) + 1;
			count = (d6 % 3) + min;
			countLine = `d6 (${d6}) %3+${min} → ${count} feature${count !== 1 ? 's' : ''} (range ${min}–${max})`;
		}

		// Roll unique features (re-roll duplicates)
		const featOracle = allOracles.find((o) => o.key === 'touchedFeatures');
		const features: string[] = [];
		const seen = new Set<string>();
		let safety = 0;
		if (featOracle) {
			while (features.length < count && safety++ < 1000) {
				const r = rollFromRangeTable(featOracle.data);
				const f = r.value as string;
				if (!seen.has(f)) {
					seen.add(f);
					features.push(f);
				}
			}
		}

		const featureItems = features.map((f) => `<li>${f}</li>`).join('');
		const html =
			`<div class="roll-line">Class roll: d100 → ${classRes.roll}</div>` +
			`<div><strong>${cv.className}</strong> (Social rank ${cv.socialRank}) — ${cv.description}</div>` +
			`<div class="roll-line">Animal roll: d100 → ${animalRes.roll}</div>` +
			`<div>Animal aspect: <strong>${animalRes.value as string}</strong></div>` +
			`<div class="roll-line">Feature count: ${countLine}</div>` +
			(features.length > 0 ? `<ul>${featureItems}</ul>` : '');

		return {
			roll: classRes.roll,
			html,
			title,
			value: `${cv.className} (${animalRes.value as string})`,
		};
	}

	// freeportDenizen is now a flat multi-column oracle (type/notes/salary/count
	// with a `roll` array) — the generic flat branch below handles it.

	// ── settlementName — two-step subtable ──────────────────────────────────
	// ── prefixSuffix — two independent rolls: prefix from one, suffix from ────
	//     another, concatenated into one result.
	if (oracle.tableType === 'prefixSuffix') {
		const prefixRes = rollFromRangeTable(table);
		const suffixRes = rollFromRangeTable(table);
		const pv = prefixRes.value as { prefix: string; suffix: string };
		const sv = suffixRes.value as { prefix: string; suffix: string };
		const name = pv.prefix + sv.suffix;
		const html =
			`<div class="roll-line">Prefix roll: d100 → ${prefixRes.roll} | Suffix roll: d100 → ${suffixRes.roll}</div>` +
			`<div>Result: <strong>${name}</strong></div>`;
		return { roll: prefixRes.roll, html, title, value: name };
	}

	// Name: Other and Name: Elf are `tableType: 'matrix'` — the matrix branch
	// above handles them (pick a lineage/tradition column, roll one name).

	// ── Default — single roll, string value (with value-level templates) ──────

	// `oracle` is the current file (looked up + non-null-guarded at the top).
	const rollCols = oracle.roll?.length ? oracle.roll : ['value'];
	const primaryKey = rollCols[0];
	const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
	const labelFor = (k: string): string => {
		const c = oracle.columns?.find((col) => col.key === k);
		if (c) return c.label;
		if (k === 'value') return 'Result';
		if (k === 'type') return 'Type';
		if (k === 'description') return 'Description';
		return k.charAt(0).toUpperCase() + k.slice(1);
	};

	const roll = Math.floor(Math.random() * 100) + 1;
	const res = { roll, entry: table.find((e) => roll <= e.topRange) ?? table[table.length - 1] };
	const primary = str(res.entry[primaryKey]);

	// Value-level template: a rolled value with a `[label](roll:…)` blank resolves
	// by rolling the referenced oracle(s). `roll:self` re-rolls this table (the
	// Roll Twice mechanic); it cascades and is depth-guarded inside fillTemplate.
	if (hasRollTemplate(primary)) {
		const { filled, lines } = fillTemplate(
			primary,
			key,
			makeRollFn(allOracles),
			options?._depth ?? 0,
		);
		// Literal text left after stripping the tokens (e.g. "Hybrid (…)") → show
		// the composed Result line; a bare roll-twice blank needs only the sub-rolls.
		const literal = primary.replace(ROLL_DSL, '').replace(/[\s(),./|-]/g, '');
		const html =
			`<div class="roll-line">Roll: d100 → ${res.roll}</div>` +
			lines.join('') +
			(literal ? `<div>Result: <strong>${filled}</strong></div>` : '');
		return { roll: res.roll, html, title, value: filled };
	}

	// Echo the columns named in `roll`, each as "Label: value" (first column's
	// value bold). Without an explicit `roll`, keep the legacy shape: bold Result
	// + a label-less description echo when the row carries one.
	let body: string;
	if (oracle.roll?.length) {
		body = rollCols
			.map((k, i) => {
				const v = str(res.entry[k]);
				return v ? `<div>${labelFor(k)}: ${i === 0 ? `<strong>${v}</strong>` : v}</div>` : '';
			})
			.join('');
	} else {
		const desc = str(res.entry.description);
		body =
			`<div>Result: <strong>${primary}</strong></div>` +
			(desc ? `<div class="oracle-desc">${desc}</div>` : '');
	}
	const html = `<div class="roll-line">Roll: d100 → ${res.roll}</div>` + body;
	return { roll: res.roll, html, title, value: primary };
}
