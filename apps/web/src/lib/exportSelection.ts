// =============================================================================
// Iron Ledger — Export selection shape
//
// The structured choice the comprehensive Export dialog (ExportDialog.svelte)
// emits and the home route (handleExportSelection) consumes. Each list holds
// the ids to include ([] = none); `log` is the whole session log on/off;
// `format` the output kind.
// =============================================================================

export type ExportSelection = {
	/** Character ids to include. */
	characters: string[];
	/** Expedition ids to include. */
	expeditions: string[];
	/** Community ids to include. */
	communities: string[];
	/** NPC ids to include. */
	npcs: string[];
	/** Place ids to include. */
	places: string[];
	/** Map ids to include. */
	maps: string[];
	/** Whether to include the session log. */
	log: boolean;
	/** Output format: zip bundle (re-importable) or markdown snapshot. */
	format: 'zip' | 'md';
};
