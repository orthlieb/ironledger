// =============================================================================
// Iron Ledger — Oracle Store (Svelte 5 module-level $state)
//
// Provides:
//   • loadOracles()              — fetch + cache oracle catalogue
//   • getOracles()               — sorted list of OracleFile (reactive)
//   • getOracleGroups()          — distinct group names in display order
//   • findOracle(key)            — lookup by key
//   • rollFromRangeTable(table)  — core d100 algorithm (ported from oracles-pure.js)
//   • rangeLabelForEntry(t, i)   — range string "1–25" or "26"
//   • buildTableHtml(key, table) — HTML table for the detail view
//   • rollOracle(key, oracles)   — high-level dispatcher → { roll, html, title }
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OracleEntry {
	topRange: number;
	value:    unknown;
}

export interface OracleFile {
	key:          string;
	title:        string;
	group:        string;
	selectLabel:  string;
	description?: string;
	data:         OracleEntry[];
}

export interface OracleRollResult {
	roll:  number;
	html:  string;
	title: string;
}

// ---------------------------------------------------------------------------
// Module-level state (shared across all component instances)
// ---------------------------------------------------------------------------

let _oracles: OracleFile[]            = $state([]);
let _orderMap: Record<string, number> = $state({});
let _loading                          = $state(false);
let _loaded                           = false;

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch oracle catalogue from /api/catalogue/oracles and cache it for the session.
 * Idempotent — safe to call multiple times; only fetches once.
 */
export async function loadOracles(): Promise<void> {
	if (_loaded || _loading) return;
	_loading = true;
	try {
		const res = await fetch('/api/catalogue/oracles');
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
				// It's a real oracle file
				files.push(obj as unknown as OracleFile);
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
		_loaded  = true;
	} catch (err) {
		console.error('[oracleStore] Failed to load oracles:', err);
	} finally {
		_loading = false;
	}
}

// ---------------------------------------------------------------------------
// Accessors (reactive — reads tracked by $derived)
// ---------------------------------------------------------------------------

/** All loaded oracle files, sorted by oracle-order.json weight. */
export function getOracles(): OracleFile[] {
	return _oracles;
}

/** Distinct group names in the order they first appear. */
export function getOracleGroups(): string[] {
	const seen = new Set<string>();
	const out:  string[] = [];
	for (const o of _oracles) {
		if (!seen.has(o.group)) { seen.add(o.group); out.push(o.group); }
	}
	return out;
}

/** Look up a single oracle by key. */
export function findOracle(key: string): OracleFile | undefined {
	return _oracles.find((o) => o.key === key);
}

// ---------------------------------------------------------------------------
// Pure rolling helpers  (ported from oracles-pure.js)
// ---------------------------------------------------------------------------

/** Roll d100 and look up the result in a range table. */
export function rollFromRangeTable(table: OracleEntry[]): { roll: number; value: unknown } {
	const roll   = Math.floor(Math.random() * 100) + 1;
	let   picked = table[table.length - 1];
	for (const entry of table) {
		if (roll <= entry.topRange) { picked = entry; break; }
	}
	return { roll, value: picked.value };
}

/** Build a display label for one table row: "1–25" or "26". */
export function rangeLabelForEntry(table: OracleEntry[], index: number): string {
	const low  = index === 0 ? 1 : (table[index - 1].topRange + 1);
	const high = table[index].topRange;
	return low === high ? `${low}` : `${low}–${high}`;
}

/** Build an HTML table string for the detail view. */
export function buildTableHtml(key: string, table: OracleEntry[]): string {
	if (!table || table.length === 0) return '<div>No table data.</div>';

	// ── Special layouts ──────────────────────────────────────────────────────

	if (key === 'yrtTouched') {
		let html = '<table class="oracle-table"><thead><tr>'
			+ '<th>d100</th><th>Class</th><th>Social Rank</th><th>Description</th>'
			+ '</tr></thead><tbody>';
		table.forEach((entry, idx) => {
			const v = entry.value as { socialRank: number; className: string; description: string };
			html += `<tr><td>${rangeLabelForEntry(table, idx)}</td>`
				+ `<td>${v.className}</td><td>${v.socialRank}</td><td>${v.description}</td></tr>`;
		});
		return html + '</tbody></table>';
	}

	if (key === 'settlementName') {
		let html = '<table class="oracle-table"><thead><tr>'
			+ '<th>d100</th><th>Category</th><th>d100</th><th>Name</th><th>d100</th><th>Name</th>'
			+ '</tr></thead><tbody>';
		table.forEach((entry, idx) => {
			const rangeStr = rangeLabelForEntry(table, idx);
			const v   = entry.value as { description: string; subtable: OracleEntry[] };
			const sub = v.subtable;
			const half = Math.ceil(sub.length / 2);
			for (let i = 0; i < half; i++) {
				const left  = sub[i];
				const right = sub[i + half];
				const lRange = rangeLabelForEntry(sub, i);
				const rRange = right ? rangeLabelForEntry(sub, i + half) : '';
				if (i === 0) {
					html += `<tr>`
						+ `<td rowspan="${half}" class="oracle-cat-range">${rangeStr}</td>`
						+ `<td rowspan="${half}" class="oracle-cat-desc">${v.description}</td>`
						+ `<td>${lRange}</td><td>${left.value as string}</td>`
						+ `<td>${rRange}</td><td>${right ? (right.value as string) : ''}</td>`
						+ `</tr>`;
				} else {
					html += `<tr><td>${lRange}</td><td>${left.value as string}</td>`
						+ `<td>${rRange}</td><td>${right ? (right.value as string) : ''}</td></tr>`;
				}
			}
		});
		return html + '</tbody></table>';
	}

	if (key === 'settlementNameQuick') {
		const third = Math.ceil(table.length / 3);
		let html = '<table class="oracle-table"><thead><tr>'
			+ '<th>d100</th><th>Prefix</th><th>Suffix</th>'
			+ '<th>d100</th><th>Prefix</th><th>Suffix</th>'
			+ '<th>d100</th><th>Prefix</th><th>Suffix</th>'
			+ '</tr></thead><tbody>';
		for (let i = 0; i < third; i++) {
			html += '<tr>';
			for (let col = 0; col < 3; col++) {
				const entry = table[i + third * col];
				if (entry) {
					const v = entry.value as { prefix: string; suffix: string };
					html += `<td>${rangeLabelForEntry(table, i + third * col)}</td>`
						+ `<td>${v.prefix}-</td><td>-${v.suffix}</td>`;
				} else {
					html += '<td></td><td></td><td></td>';
				}
			}
			html += '</tr>';
		}
		return html + '</tbody></table>';
	}

	if (key === 'namesOther') {
		let html = '<table class="oracle-table"><thead><tr>'
			+ '<th>d100</th><th>Giants</th><th>Varou</th><th>Trolls</th>'
			+ '</tr></thead><tbody>';
		table.forEach((entry, idx) => {
			const v = entry.value as { giants: string; varou: string; trolls: string };
			html += `<tr><td>${rangeLabelForEntry(table, idx)}</td>`
				+ `<td>${v.giants}</td><td>${v.varou}</td><td>${v.trolls}</td></tr>`;
		});
		return html + '</tbody></table>';
	}

	if (key === 'freeportDenizen') {
		let html = '<table class="oracle-table"><thead><tr>'
			+ '<th>d100</th><th>Type</th><th>Notes</th><th>Salary</th><th>Count</th>'
			+ '</tr></thead><tbody>';
		table.forEach((entry, idx) => {
			const v = entry.value as { type: string; notes: string; salary: string; count: number };
			html += `<tr><td>${rangeLabelForEntry(table, idx)}</td>`
				+ `<td>${v.type}</td><td>${v.notes}</td><td>${v.salary}</td><td>${v.count}</td></tr>`;
		});
		return html + '</tbody></table>';
	}

	// ── Default: simple or multi-column layouts ──────────────────────────────

	if (table.length > 60) {
		const third = Math.ceil(table.length / 3);
		let html = '<table class="oracle-table"><thead><tr>'
			+ '<th>d100</th><th>Result</th>'
			+ '<th>d100</th><th>Result</th>'
			+ '<th>d100</th><th>Result</th>'
			+ '</tr></thead><tbody>';
		for (let i = 0; i < third; i++) {
			html += '<tr>';
			for (let col = 0; col < 3; col++) {
				const idx   = i + third * col;
				const entry = table[idx];
				html += entry
					? `<td>${rangeLabelForEntry(table, idx)}</td><td>${entry.value as string}</td>`
					: '<td></td><td></td>';
			}
			html += '</tr>';
		}
		return html + '</tbody></table>';
	}

	if (table.length > 40) {
		const half = Math.ceil(table.length / 2);
		let html = '<table class="oracle-table"><thead><tr>'
			+ '<th>d100</th><th>Result</th>'
			+ '<th>d100</th><th>Result</th>'
			+ '</tr></thead><tbody>';
		for (let i = 0; i < half; i++) {
			const left  = table[i];
			const right = table[i + half];
			html += `<tr><td>${rangeLabelForEntry(table, i)}</td><td>${left.value as string}</td>`
				+ `<td>${right ? rangeLabelForEntry(table, i + half) : ''}</td>`
				+ `<td>${right ? (right.value as string) : ''}</td></tr>`;
		}
		return html + '</tbody></table>';
	}

	let html = '<table class="oracle-table"><thead><tr>'
		+ '<th>d100</th><th>Result</th>'
		+ '</tr></thead><tbody>';
	table.forEach((entry, idx) => {
		html += `<tr><td>${rangeLabelForEntry(table, idx)}</td><td>${entry.value as string}</td></tr>`;
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
export function rollOracle(key: string, allOracles: OracleFile[]): OracleRollResult {
	const oracle = allOracles.find((o) => o.key === key);
	if (!oracle) {
		return {
			roll:  0,
			html:  '<div class="roll-line">Error: unknown oracle key.</div>',
			title: key,
		};
	}

	const title = oracle.title;
	const table = oracle.data;

	// ── yrtTouched — compound multi-roll ───────────────────────────────────
	if (key === 'yrtTouched') {
		const classRes = rollFromRangeTable(table);
		const cv = classRes.value as { socialRank: number; className: string; description: string };

		const animalOracle  = allOracles.find((o) => o.key === 'yrtAnimal');
		const countOracle   = allOracles.find((o) => o.key === 'touchedCount');
		const featOracle    = allOracles.find((o) => o.key === 'touchedFeatures');

		const animalRes = animalOracle  ? rollFromRangeTable(animalOracle.data)  : { roll: 0, value: '—' };
		const countRes  = countOracle   ? rollFromRangeTable(countOracle.data)   : { roll: 0, value: 1   };
		const count     = countRes.value as number;

		// Roll unique features (re-roll duplicates)
		const features: string[] = [];
		const seen = new Set<string>();
		let safety = 0;
		if (featOracle) {
			while (features.length < count && safety++ < 1000) {
				const r = rollFromRangeTable(featOracle.data);
				const f = r.value as string;
				if (!seen.has(f)) { seen.add(f); features.push(f); }
			}
		}

		const featureItems = features.map((f) => `<li>${f}</li>`).join('');
		const html =
			`<div class="roll-line">Class roll: d100 → ${classRes.roll}</div>` +
			`<div><strong>${cv.className}</strong> (Social rank ${cv.socialRank}) — ${cv.description}</div>` +
			`<div class="roll-line">Animal roll: d100 → ${animalRes.roll}</div>` +
			`<div>Animal aspect: <strong>${animalRes.value as string}</strong></div>` +
			`<div class="roll-line">Feature count roll: d100 → ${countRes.roll} → ${count} feature${count !== 1 ? 's' : ''}</div>` +
			(features.length > 0 ? `<ul>${featureItems}</ul>` : '');

		return { roll: classRes.roll, html, title };
	}

	// ── freeportDenizen ─────────────────────────────────────────────────────
	if (key === 'freeportDenizen') {
		const res = rollFromRangeTable(table);
		const v   = res.value as { type: string; notes: string; salary: string; count: number };
		const html =
			`<div class="roll-line">Roll: d100 → ${res.roll}</div>` +
			`<div><strong>${v.type}</strong></div>` +
			`<div>${v.notes}</div>` +
			`<div>Typical annual salary: ${v.salary} (Population: ${v.count})</div>`;
		return { roll: res.roll, html, title };
	}

	// ── settlementName — two-step subtable ──────────────────────────────────
	if (key === 'settlementName') {
		const catRes = rollFromRangeTable(table);
		const cat    = catRes.value as { description: string; subtable: OracleEntry[] };
		const subRes = rollFromRangeTable(cat.subtable);
		const html =
			`<div class="roll-line">Category roll: d100 → ${catRes.roll}</div>` +
			`<div><em>${cat.description}</em></div>` +
			`<div class="roll-line">Name roll: d100 → ${subRes.roll}</div>` +
			`<div>Name: <strong>${subRes.value as string}</strong></div>`;
		return { roll: catRes.roll, html, title };
	}

	// ── settlementNameQuick — two independent rolls ──────────────────────────
	if (key === 'settlementNameQuick') {
		const prefixRes = rollFromRangeTable(table);
		const suffixRes = rollFromRangeTable(table);
		const pv   = prefixRes.value as { prefix: string; suffix: string };
		const sv   = suffixRes.value as { prefix: string; suffix: string };
		const name = pv.prefix + sv.suffix;
		const html =
			`<div class="roll-line">Prefix roll: d100 → ${prefixRes.roll} | Suffix roll: d100 → ${suffixRes.roll}</div>` +
			`<div>Settlement name: <strong>${name}</strong></div>`;
		return { roll: prefixRes.roll, html, title };
	}

	// ── namesOther — three parallel name fields ──────────────────────────────
	if (key === 'namesOther') {
		const res = rollFromRangeTable(table);
		const v   = res.value as { giants: string; varou: string; trolls: string };
		const html =
			`<div class="roll-line">Roll: d100 → ${res.roll}</div>` +
			`<div>Giants: ${v.giants} | Varou: ${v.varou} | Trolls: ${v.trolls}</div>`;
		return { roll: res.roll, html, title };
	}

	// ── Default — single roll, string value ─────────────────────────────────
	const res  = rollFromRangeTable(table);
	const html =
		`<div class="roll-line">Roll: d100 → ${res.roll}</div>` +
		`<div>Result: <strong>${typeof res.value === 'string' ? res.value : JSON.stringify(res.value)}</strong></div>`;
	return { roll: res.roll, html, title };
}
