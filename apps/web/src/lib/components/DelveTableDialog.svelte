<script lang="ts">
	/**
	 * DelveTableDialog — modal dialog showing a combined theme+domain
	 * feature/danger oracle table with a Roll button.
	 *
	 * Usage:
	 *   <DelveTableDialog bind:this={ref} />
	 *   ref.open('Features: Ancient + Barrow', combinedTable);
	 */

	import type { OracleEntry } from '$lib/oracleStore.svelte.js';
	import { rangeLabelForEntry, rollFromRangeTable } from '$lib/oracleStore.svelte.js';
	import { appendLog, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import { animateDice, DIE_BLACK, DIE_WHITE } from '$lib/dice.js';

	// ---------------------------------------------------------------------------
	// Internal state
	// ---------------------------------------------------------------------------
	let dialogEl  = $state<HTMLDialogElement | null>(null);
	let title     = $state('');
	let table     = $state<OracleEntry[]>([]);
	let rolling   = $state(false);
	let rolledIdx = $state(-1);

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------
	export function open(t: string, tbl: OracleEntry[]) {
		title     = t;
		table     = tbl;
		rolledIdx = -1;
		dialogEl?.showModal();
	}

	export function close() {
		dialogEl?.close();
	}

	// ---------------------------------------------------------------------------
	// Roll
	// ---------------------------------------------------------------------------
	async function doRoll() {
		if (rolling || table.length === 0) return;
		rolling = true;

		const result = rollFromRangeTable(table);

		// Find the index of the rolled entry
		const idx = table.findIndex((e) => result.roll <= e.topRange);
		rolledIdx = idx;

		// d100 animation: split into tens + ones
		const tensV = Math.floor(result.roll % 100 / 10) || 10;
		const onesV = result.roll % 10 || 10;

		close();
		await animateDice([
			{ sides: 10, value: tensV, color: DIE_BLACK },
			{ sides: 10, value: onesV, color: DIE_WHITE },
		]);

		const valueStr = typeof result.value === 'string' ? result.value : JSON.stringify(result.value);
		appendLog(SESSION_LOG_ID, title,
			`<div class="roll-line">Roll: d100 → ${result.roll}</div>` +
			`<div>Result: <strong>${valueStr}</strong></div>`);

		rolling = false;
	}

	// ---------------------------------------------------------------------------
	// Table HTML builder
	// ---------------------------------------------------------------------------
	function buildHtml(): string {
		if (!table || table.length === 0) return '<div>No table data.</div>';
		let html = '<table class="oracle-table"><thead><tr>'
			+ '<th>d100</th><th>Result</th>'
			+ '</tr></thead><tbody>';
		table.forEach((entry, idx) => {
			const cls = idx === rolledIdx ? ' class="dt-rolled-row"' : '';
			html += `<tr${cls}><td>${rangeLabelForEntry(table, idx)}</td>`
				+ `<td>${entry.value as string}</td></tr>`;
		});
		return html + '</tbody></table>';
	}

	const tableHtml = $derived(buildHtml());
</script>

<dialog
	bind:this={dialogEl}
	class="dt-dialog"
	oncancel={close}
>
	<!-- Header -->
	<div class="dt-header">
		<span class="dt-title">{title}</span>
		<button class="dt-close" onclick={close} aria-label="Close">✕</button>
	</div>

	<!-- Body: table -->
	<div class="dt-body">
		<div class="dt-table-wrap">
			{@html tableHtml}
		</div>
	</div>

	<!-- Footer: Roll button -->
	<div class="dt-footer">
		<button
			class="btn btn-primary dt-roll-btn"
			onclick={doRoll}
			disabled={rolling}
		>{rolling ? 'Rolling…' : 'Roll'}</button>
	</div>
</dialog>

<style>
	/* ── Dialog shell ────────────────────────────────────────────────────── */
	.dt-dialog {
		border:        none;
		padding:       0;
		border-radius: 10px;
		position:      fixed;
		top:           8vh;
		left:          50%;
		transform:     translateX(-50%);
		width:         min(540px, calc(100vw - 2rem));
		max-height:    min(600px, calc(100dvh - 10vh));
		background:    var(--bg-card);
		color:         var(--text);
		box-shadow:    0 16px 48px #00000070, 0 0 0 1px var(--border-mid);
		outline:       none;
		overflow:      hidden;
	}
	.dt-dialog[open] {
		display:        flex;
		flex-direction: column;
	}
	.dt-dialog::backdrop {
		background:      #00000060;
		backdrop-filter: blur(1px);
	}

	/* ── Header ─────────────────────────────────────────────────────────── */
	.dt-header {
		display:       flex;
		align-items:   center;
		gap:           8px;
		padding:       10px 14px;
		border-bottom: 1px solid var(--border);
		background:    var(--bg-control);
		border-radius: 10px 10px 0 0;
		flex-shrink:   0;
	}
	.dt-title {
		font-family:    var(--font-display);
		font-size:      0.78rem;
		font-weight:    700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color:          var(--text-accent);
		flex:           1;
	}
	.dt-close {
		background:    transparent;
		border:        none;
		color:         var(--text-dimmer);
		cursor:        pointer;
		font-size:     0.9rem;
		padding:       2px 5px;
		border-radius: 3px;
		line-height:   1;
		font-family:   inherit;
		flex-shrink:   0;
	}
	.dt-close:hover { color: var(--text); }

	/* ── Body ───────────────────────────────────────────────────────────── */
	.dt-body {
		flex:       1;
		overflow-y: auto;
		padding:    10px 14px;
		min-height: 0;
	}

	.dt-table-wrap {
		overflow-x: auto;
	}
	.dt-table-wrap :global(.oracle-table) {
		width:           100%;
		border-collapse: collapse;
		font-family:     var(--font-ui);
		font-size:       0.7rem;
	}
	.dt-table-wrap :global(.oracle-table th) {
		background:     var(--bg-control);
		color:          var(--text-dimmer);
		font-weight:    700;
		font-size:      0.62rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding:        4px 8px;
		border-bottom:  2px solid var(--border);
		white-space:    nowrap;
		text-align:     left;
	}
	.dt-table-wrap :global(.oracle-table td) {
		padding:        4px 8px;
		border-bottom:  1px solid var(--border);
		color:          var(--text);
		vertical-align: top;
	}
	.dt-table-wrap :global(.oracle-table tr:last-child td) {
		border-bottom: none;
	}
	.dt-table-wrap :global(.oracle-table tr:hover td) {
		background: var(--bg-hover);
	}
	.dt-table-wrap :global(.oracle-table td:first-child) {
		font-variant-numeric: tabular-nums;
		color:                var(--text-dimmer);
		white-space:          nowrap;
		min-width:            3rem;
	}
	/* Highlight the rolled row */
	.dt-table-wrap :global(.dt-rolled-row td) {
		background: color-mix(in srgb, var(--text-accent) 15%, transparent);
	}

	/* ── Footer ─────────────────────────────────────────────────────────── */
	.dt-footer {
		border-top:      1px solid var(--border);
		padding:         10px 14px;
		flex-shrink:     0;
		display:         flex;
		justify-content: flex-end;
	}
	.dt-roll-btn {
		padding:         8px 20px;
		font-size:       0.8rem;
		justify-content: center;
	}
</style>
