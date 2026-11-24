// =============================================================================
// Iron Ledger — an oracle result's short log body
//
// The name dice (New Character, New NPC) and a settlement's Settlement Trouble
// die log "Roll: d100 → N" and the result. The result is oracle text, so it
// renders as every other oracle result does (markdown, command links) rather
// than going in as written.
// =============================================================================

import { renderRichInline } from './dsl.js';
import { bindCommandLinks } from './commands/links.js';

/** The d100 and the result, rendered, its links bound to the entry `entryId`. */
export function oracleResultLogHtml(r: { roll: number; value: string }, entryId: string): string {
	return bindCommandLinks(
		`<div class="roll-line">Roll: d100 → ${r.roll}</div>` +
			`<div>Result: <strong>${renderRichInline(r.value)}</strong></div>`,
		entryId,
	);
}
