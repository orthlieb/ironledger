// =============================================================================
// Iron Ledger — Export selection shape
//
// The structured choice the comprehensive Export dialog (ExportDialog.svelte)
// emits and the home route (handleExportSelection) consumes. Each list holds
// the ids to include ([] = none); connections are three booleans by sub-type;
// `log` picks the log scope; `format` the output kind.
// =============================================================================

export type ExportSelection = {
	/** Character ids to include ([] = none). */
	characters: string[];
	/** Expedition ids to include ([] = none). */
	expeditions: string[];
	/** Connections, split by sub-type. */
	communities: boolean;
	npcs: boolean;
	places: boolean;
	/** Map ids to include ([] = none). */
	maps: string[];
	/** Whether to include the session log. */
	log: boolean;
	/** Output format: zip bundle (re-importable) or markdown snapshot. */
	format: 'zip' | 'md';
};
