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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OracleEntry {
	topRange: number;
	value: unknown;
	/** Optional secondary classification rendered as a "Type" column in the
	 *  detail table (e.g. YRT Region → Settled / Boundary / Remote). Display-only. */
	type?: string;
	/** Optional flavor text rendered as a "Description" column in the detail
	 *  table and echoed into the log on a roll (e.g. Delve Site Theme/Domain:
	 *  "This place holds the secrets of a bygone age"). Display-only. */
	description?: string;
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
	/** For `tableType: 'columnSelect'` — the roll columns shown as a picker. */
	columns?: OracleColumn[];
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
	siteNameFormat: 'delve',
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
				// It's a real oracle file. Backfill source if absent (defends against
				// API serving cached data from before the source-tagging migration).
				const f = obj as unknown as OracleFile;
				if (!f.source) f.source = resolveSource(f);
				files.push(f);
			} else if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
				// Likely oracle-order.json — use it as the sort order map
				orderMap = obj as Record<string, number>;
			}
		}

		_orderMap = orderMap;
		// Sort by oracle-order.json weight, then alphabetically as fallback
		files.sort((a, b) => {
			const wa = _orderMap[a.key] ?? 999;
			const wb = _orderMap[b.key] ?? 999;
			return wa !== wb ? wa - wb : a.key.localeCompare(b.key);
		});
		_oracles = files;
		_loaded = true;
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

/** Build an HTML table string for the detail view. */
export function buildTableHtml(
	key: string,
	table: OracleEntry[],
	options?: { activeStat?: string; columns?: OracleColumn[] },
): string {
	if (!table || table.length === 0) return '<div>No table data.</div>';

	// ── Special layouts ──────────────────────────────────────────────────────

	// Generic column-select table (Settlement Type land tiers, etc.): one range
	// column per `columns` entry + a Result column, with the active column
	// highlighted. Delve Depths keeps its own hardcoded branch below.
	if (options?.columns?.length) {
		const cols = options.columns;
		const activeIdx = options.activeStat ? cols.findIndex((c) => c.key === options.activeStat) : -1;
		const cc = (i: number) => ` class="oracle-range${activeIdx === i ? ' col-active' : ''}"`;
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

	if (key === 'delveDepths') {
		const statColMap: Record<string, number> = { edge: 0, shadow: 1, wits: 2 };
		const activeCol = options?.activeStat ? (statColMap[options.activeStat] ?? -1) : -1;
		const cc = (i: number) => ` class="oracle-range${activeCol === i ? ' col-active' : ''}"`;

		type DRow = { edge: number; shadow: number; wits: number; value: string };
		let html =
			'<table class="oracle-table"><thead><tr>' +
			`<th${cc(0)}>Edge</th><th${cc(1)}>Shadow</th><th${cc(2)}>Wits</th><th>Result</th>` +
			'</tr></thead><tbody>';
		let prevEdge = 0,
			prevShadow = 0,
			prevWits = 0;
		table.forEach((entry) => {
			const r = entry as unknown as DRow;
			const edgeLabel = prevEdge + 1 === r.edge ? `${r.edge}` : `${prevEdge + 1}–${r.edge}`;
			const shadowLabel =
				prevShadow + 1 === r.shadow ? `${r.shadow}` : `${prevShadow + 1}–${r.shadow}`;
			const witsLabel = prevWits + 1 === r.wits ? `${r.wits}` : `${prevWits + 1}–${r.wits}`;
			html += `<tr><td${cc(0)}>${edgeLabel}</td><td${cc(1)}>${shadowLabel}</td><td${cc(2)}>${witsLabel}</td><td>${r.value}</td></tr>`;
			prevEdge = r.edge;
			prevShadow = r.shadow;
			prevWits = r.wits;
		});
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

	if (key === 'settlementName') {
		let html =
			'<table class="oracle-table"><thead><tr>' +
			'<th>d100</th><th>Category</th><th>d100</th><th>Name</th><th>d100</th><th>Name</th>' +
			'</tr></thead><tbody>';
		table.forEach((entry, idx) => {
			const rangeStr = rangeLabelForEntry(table, idx);
			const v = entry.value as { description: string; subtable: OracleEntry[] };
			const sub = v.subtable;
			const half = Math.ceil(sub.length / 2);
			for (let i = 0; i < half; i++) {
				const left = sub[i];
				const right = sub[i + half];
				const lRange = rangeLabelForEntry(sub, i);
				const rRange = right ? rangeLabelForEntry(sub, i + half) : '';
				if (i === 0) {
					html +=
						`<tr>` +
						`<td rowspan="${half}" class="oracle-cat-range">${rangeStr}</td>` +
						`<td rowspan="${half}" class="oracle-cat-desc">${v.description}</td>` +
						`<td class="oracle-range">${lRange}</td><td>${left.value as string}</td>` +
						`<td class="oracle-range">${rRange}</td><td>${right ? (right.value as string) : ''}</td>` +
						`</tr>`;
				} else {
					html +=
						`<tr><td class="oracle-range">${lRange}</td><td>${left.value as string}</td>` +
						`<td class="oracle-range">${rRange}</td><td>${right ? (right.value as string) : ''}</td></tr>`;
				}
			}
		});
		return html + '</tbody></table>';
	}

	// siteNamePlace — two-step: Domain (d100) → a place-word from that domain's
	// subtable (rendered in two Name columns, like settlementName).
	if (key === 'siteNamePlace') {
		let html =
			'<table class="oracle-table"><thead><tr>' +
			'<th>d100</th><th>Domain</th><th>d100</th><th>Place</th><th>d100</th><th>Place</th>' +
			'</tr></thead><tbody>';
		table.forEach((entry, idx) => {
			const rangeStr = rangeLabelForEntry(table, idx);
			const v = entry.value as { domain: string; subtable: OracleEntry[] };
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
							`<td rowspan="${half}" class="oracle-cat-desc">${v.domain}</td>${nameCells}</tr>`
						: `<tr>${nameCells}</tr>`;
			}
		});
		return html + '</tbody></table>';
	}

	if (key === 'settlementNameQuick') {
		const third = Math.ceil(table.length / 3);
		let html =
			'<table class="oracle-table"><thead><tr>' +
			'<th>d100</th><th>Prefix</th><th>Suffix</th>' +
			'<th>d100</th><th>Prefix</th><th>Suffix</th>' +
			'<th>d100</th><th>Prefix</th><th>Suffix</th>' +
			'</tr></thead><tbody>';
		for (let i = 0; i < third; i++) {
			html += '<tr>';
			for (let col = 0; col < 3; col++) {
				const entry = table[i + third * col];
				if (entry) {
					const v = entry.value as { prefix: string; suffix: string };
					html +=
						`<td class="oracle-range">${rangeLabelForEntry(table, i + third * col)}</td>` +
						`<td>${v.prefix}-</td><td>-${v.suffix}</td>`;
				} else {
					html += '<td></td><td></td><td></td>';
				}
			}
			html += '</tr>';
		}
		return html + '</tbody></table>';
	}

	if (key === 'namesOther') {
		let html =
			'<table class="oracle-table"><thead><tr>' +
			'<th>d100</th><th>Giants</th><th>Varou</th><th>Trolls</th>' +
			'</tr></thead><tbody>';
		table.forEach((entry, idx) => {
			const v = entry.value as { giants: string; varou: string; trolls: string };
			html +=
				`<tr><td class="oracle-range">${rangeLabelForEntry(table, idx)}</td>` +
				`<td>${v.giants}</td><td>${v.varou}</td><td>${v.trolls}</td></tr>`;
		});
		return html + '</tbody></table>';
	}

	if (key === 'freeportDenizen') {
		let html =
			'<table class="oracle-table"><thead><tr>' +
			'<th>d100</th><th>Type</th><th>Notes</th><th>Salary</th><th>Count</th>' +
			'</tr></thead><tbody>';
		table.forEach((entry, idx) => {
			const v = entry.value as { type: string; notes: string; salary: string; count: number };
			html +=
				`<tr><td class="oracle-range">${rangeLabelForEntry(table, idx)}</td>` +
				`<td>${v.type}</td><td>${v.notes}</td><td>${v.salary}</td><td>${v.count}</td></tr>`;
		});
		return html + '</tbody></table>';
	}

	// Typed table (e.g. YRT Region): D100 | Result | Type. Any oracle whose
	// entries carry a `type` gets the extra column (single-column layout).
	if (table.some((e) => e.type)) {
		let html =
			'<table class="oracle-table"><thead><tr>' +
			'<th>d100</th><th>Result</th><th>Type</th>' +
			'</tr></thead><tbody>';
		table.forEach((entry, idx) => {
			html +=
				`<tr><td class="oracle-range">${rangeLabelForEntry(table, idx)}</td>` +
				`<td>${entry.value as string}</td><td>${entry.type ?? ''}</td></tr>`;
		});
		return html + '</tbody></table>';
	}

	// Described table (e.g. Delve Site Theme/Domain): D100 | Result | Description.
	// Any oracle whose entries carry a `description` gets the extra column.
	if (table.some((e) => e.description)) {
		let html =
			'<table class="oracle-table"><thead><tr>' +
			'<th>d100</th><th>Result</th><th>Description</th>' +
			'</tr></thead><tbody>';
		table.forEach((entry, idx) => {
			html +=
				`<tr><td class="oracle-range">${rangeLabelForEntry(table, idx)}</td>` +
				`<td>${entry.value as string}</td><td>${entry.description ?? ''}</td></tr>`;
		});
		return html + '</tbody></table>';
	}

	// ── Default: simple or multi-column layouts ──────────────────────────────

	if (table.length > 60) {
		const third = Math.ceil(table.length / 3);
		let html =
			'<table class="oracle-table"><thead><tr>' +
			'<th>d100</th><th>Result</th>' +
			'<th>d100</th><th>Result</th>' +
			'<th>d100</th><th>Result</th>' +
			'</tr></thead><tbody>';
		for (let i = 0; i < third; i++) {
			html += '<tr>';
			for (let col = 0; col < 3; col++) {
				const idx = i + third * col;
				const entry = table[idx];
				html += entry
					? `<td class="oracle-range">${rangeLabelForEntry(table, idx)}</td><td>${entry.value as string}</td>`
					: '<td></td><td></td>';
			}
			html += '</tr>';
		}
		return html + '</tbody></table>';
	}

	if (table.length > 40) {
		const half = Math.ceil(table.length / 2);
		let html =
			'<table class="oracle-table"><thead><tr>' +
			'<th>d100</th><th>Result</th>' +
			'<th>d100</th><th>Result</th>' +
			'</tr></thead><tbody>';
		for (let i = 0; i < half; i++) {
			const left = table[i];
			const right = table[i + half];
			html +=
				`<tr><td class="oracle-range">${rangeLabelForEntry(table, i)}</td><td>${left.value as string}</td>` +
				`<td class="oracle-range">${right ? rangeLabelForEntry(table, i + half) : ''}</td>` +
				`<td>${right ? (right.value as string) : ''}</td></tr>`;
		}
		return html + '</tbody></table>';
	}

	let html =
		'<table class="oracle-table"><thead><tr>' +
		'<th>d100</th><th>Result</th>' +
		'</tr></thead><tbody>';
	table.forEach((entry, idx) => {
		html += `<tr><td class="oracle-range">${rangeLabelForEntry(table, idx)}</td><td>${entry.value as string}</td></tr>`;
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
	options?: { stat?: string },
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

	// ── delveDepths — roll against a specific stat column ──────────────────
	if (key === 'delveDepths') {
		const stat = options?.stat ?? 'edge';
		const roll = Math.floor(Math.random() * 100) + 1;
		const statLabel = stat.charAt(0).toUpperCase() + stat.slice(1);
		type DRow = { edge: number; shadow: number; wits: number; value: string };
		const rows = table as unknown as DRow[];
		const found =
			rows.find((r) => roll <= (r[stat as keyof DRow] as number)) ?? rows[rows.length - 1];
		const html =
			`<div class="roll-line">Roll (${statLabel}): d100 → ${roll}</div>` +
			`<div class="move-outcome">${found.value}</div>`;
		return { roll, html, title, value: found.value };
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

	// ── freeportDenizen ─────────────────────────────────────────────────────
	if (key === 'freeportDenizen') {
		const res = rollFromRangeTable(table);
		const v = res.value as { type: string; notes: string; salary: string; count: number };
		const html =
			`<div class="roll-line">Roll: d100 → ${res.roll}</div>` +
			`<div><strong>${v.type}</strong></div>` +
			`<div>${v.notes}</div>` +
			`<div>Typical annual salary: ${v.salary} (Population: ${v.count})</div>`;
		return { roll: res.roll, html, title, value: v.type };
	}

	// ── settlementName — two-step subtable ──────────────────────────────────
	if (key === 'settlementName') {
		const catRes = rollFromRangeTable(table);
		const cat = catRes.value as { description: string; subtable: OracleEntry[] };
		const subRes = rollFromRangeTable(cat.subtable);
		const html =
			`<div class="roll-line">Category roll: d100 → ${catRes.roll}</div>` +
			`<div><em>${cat.description}</em></div>` +
			`<div class="roll-line">Name roll: d100 → ${subRes.roll}</div>` +
			`<div>Name: <strong>${subRes.value as string}</strong></div>`;
		return { roll: catRes.roll, html, title, value: subRes.value as string };
	}

	// ── settlementNameQuick — two independent rolls ──────────────────────────
	if (key === 'settlementNameQuick') {
		const prefixRes = rollFromRangeTable(table);
		const suffixRes = rollFromRangeTable(table);
		const pv = prefixRes.value as { prefix: string; suffix: string };
		const sv = suffixRes.value as { prefix: string; suffix: string };
		const name = pv.prefix + sv.suffix;
		const html =
			`<div class="roll-line">Prefix roll: d100 → ${prefixRes.roll} | Suffix roll: d100 → ${suffixRes.roll}</div>` +
			`<div>Settlement name: <strong>${name}</strong></div>`;
		return { roll: prefixRes.roll, html, title, value: name };
	}

	// ── namesOther — three parallel name fields ──────────────────────────────
	if (key === 'namesOther') {
		const res = rollFromRangeTable(table);
		const v = res.value as { giants: string; varou: string; trolls: string };
		const html =
			`<div class="roll-line">Roll: d100 → ${res.roll}</div>` +
			`<div>Giants: ${v.giants} | Varou: ${v.varou} | Trolls: ${v.trolls}</div>`;
		return { roll: res.roll, html, title, value: v.giants };
	}

	// ── siteNamePlace — roll the domain, then a place-word from its subtable ──
	if (key === 'siteNamePlace') {
		const domRes = rollFromRangeTable(table);
		const dom = domRes.value as { domain: string; subtable: OracleEntry[] };
		const subRes = rollFromRangeTable(dom.subtable);
		const word = subRes.value as string;
		const html =
			`<div class="roll-line">Domain roll: d100 → ${domRes.roll}</div>` +
			`<div><em>${dom.domain}</em></div>` +
			`<div class="roll-line">Place roll: d100 → ${subRes.roll}</div>` +
			`<div>Place: <strong>${word}</strong></div>`;
		return { roll: domRes.roll, html, title, value: word };
	}

	// ── Default — single roll, string value (with Roll Twice support) ──────

	/** Roll once; if "Roll Twice" appears, keep re-rolling until a real result (max 10). */
	function rollNonDouble(): { roll: number; value: string } {
		for (let i = 0; i < 10; i++) {
			const r = rollFromRangeTable(table);
			const v = typeof r.value === 'string' ? r.value : JSON.stringify(r.value);
			if (!/roll twice/i.test(v)) return { roll: r.roll, value: v };
		}
		const r = rollFromRangeTable(table);
		return { roll: r.roll, value: typeof r.value === 'string' ? r.value : JSON.stringify(r.value) };
	}

	const res = rollFromRangeTable(table);
	const val = typeof res.value === 'string' ? res.value : JSON.stringify(res.value);

	if (/roll twice/i.test(val)) {
		const a = rollNonDouble();
		const b = rollNonDouble();
		const combined = `${a.value} / ${b.value}`;
		const html =
			`<div class="roll-line">Roll: d100 → ${res.roll} (Roll Twice!)</div>` +
			`<div class="roll-line">Roll 1: d100 → ${a.roll}</div>` +
			`<div>Result 1: <strong>${a.value}</strong></div>` +
			`<div class="roll-line">Roll 2: d100 → ${b.roll}</div>` +
			`<div>Result 2: <strong>${b.value}</strong></div>`;
		return { roll: res.roll, html, title, value: combined };
	}

	// If the rolled entry carries a Description (Delve Site Theme/Domain),
	// echo it into the log beneath the result.
	const pickedEntry = table.find((e) => res.roll <= e.topRange) ?? table[table.length - 1];
	const desc = typeof pickedEntry?.description === 'string' ? pickedEntry.description : '';
	const html =
		`<div class="roll-line">Roll: d100 → ${res.roll}</div>` +
		`<div>Result: <strong>${val}</strong></div>` +
		(desc ? `<div class="oracle-desc">${desc}</div>` : '');
	return { roll: res.roll, html, title, value: val };
}
