// =============================================================================
// Iron Ledger — Delve Store (Svelte 5 module-level $state)
//
// Provides:
//   • loadDelveData()         — fetch + cache delve oracle tables
//   • getThemeFeatures(theme) — OracleEntry[] for a theme's features
//   • getThemeDangers(theme)  — OracleEntry[] for a theme's dangers
//   • getDomainFeatures(dom)  — OracleEntry[] for a domain's features
//   • getDomainDangers(dom)   — OracleEntry[] for a domain's dangers
//   • buildCombinedTable()    — merge theme + domain entries for rolling
//   • rollCombinedTable()     — d100 roll on a combined table
// =============================================================================

import type { OracleEntry } from './oracleStore.svelte.js';
import { rollFromRangeTable } from './oracleStore.svelte.js';
import type { DelveTheme, DelveDomain } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DelveData {
	themeFeatures:  Record<string, OracleEntry[]>;
	themeDangers:   Record<string, OracleEntry[]>;
	domainFeatures: Record<string, OracleEntry[]>;
	domainDangers:  Record<string, OracleEntry[]>;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let _data:    DelveData | null = $state(null);
let _loading                   = $state(false);
let _loaded                    = false;

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export async function loadDelveData(): Promise<void> {
	if (_loaded || _loading) return;
	_loading = true;
	try {
		const res = await fetch('/api/catalogue/delve');
		if (!res.ok) throw new Error(`Delve fetch failed: ${res.status}`);
		_data   = (await res.json()) as DelveData;
		_loaded = true;
	} catch (err) {
		console.error('[delveStore] Failed to load delve data:', err);
	} finally {
		_loading = false;
	}
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

export function getThemeFeatures(theme: DelveTheme): OracleEntry[] {
	return _data?.themeFeatures[theme] ?? [];
}

export function getThemeDangers(theme: DelveTheme): OracleEntry[] {
	return _data?.themeDangers[theme] ?? [];
}

export function getDomainFeatures(domain: DelveDomain): OracleEntry[] {
	return _data?.domainFeatures[domain] ?? [];
}

export function getDomainDangers(domain: DelveDomain): OracleEntry[] {
	return _data?.domainDangers[domain] ?? [];
}

// ---------------------------------------------------------------------------
// Combined table builder
// ---------------------------------------------------------------------------

/**
 * Build a combined theme + domain oracle table for rolling.
 * Theme entries come first (low topRange), domain entries follow (higher topRange).
 * The JSON files already have correct topRange values for combining.
 */
export function buildCombinedTable(
	theme:  DelveTheme,
	domain: DelveDomain,
	type:   'features' | 'dangers',
): OracleEntry[] {
	if (!_data) return [];
	const themeTable  = type === 'features'
		? (_data.themeFeatures[theme] ?? [])
		: (_data.themeDangers[theme] ?? []);
	const domainTable = type === 'features'
		? (_data.domainFeatures[domain] ?? [])
		: (_data.domainDangers[domain] ?? []);
	return [...themeTable, ...domainTable];
}

/**
 * Roll d100 on a combined theme+domain table.
 */
export function rollCombinedTable(
	theme:  DelveTheme,
	domain: DelveDomain,
	type:   'features' | 'dangers',
): { roll: number; value: unknown } {
	const table = buildCombinedTable(theme, domain, type);
	if (table.length === 0) return { roll: 0, value: '(no data)' };
	return rollFromRangeTable(table);
}

export function isDelveLoaded(): boolean {
	return _loaded;
}
