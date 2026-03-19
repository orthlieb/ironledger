<script lang="ts">
	/**
	 * OraclesDialog — browse + roll the Ironsworn/Delve/Yrt oracle tables.
	 *
	 * Two internal views:
	 *   picker — searchable, filterable tile grid of all 49 oracles
	 *   detail — full table + Roll button for one selected oracle
	 *
	 * Usage:
	 *   <OraclesDialog bind:this={ref} />
	 *   ref.open()
	 */

	import {
		loadOracles,
		getOracles,
		getOracleGroups,
		buildTableHtml,
		rollOracle,
	} from '$lib/oracleStore.svelte.js';
	import { appendLog, enrichOutcomeLinks, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import { animateDice, DIE_BLACK, DIE_WHITE } from '$lib/dice.js';
	import { getActiveDiceCtx } from '$lib/diceContext.svelte.js';

	import clearFiltersSvg from '$icons/filter-circle-xmark-solid-full.svg?raw';
	import { draggable } from '$lib/actions/draggable.js';

	// ---------------------------------------------------------------------------
	// Internal state
	// ---------------------------------------------------------------------------
	let dialogEl     = $state<HTMLDialogElement | null>(null);
	let view         = $state<'picker' | 'detail'>('picker');
	let selectedKey  = $state<string | null>(null);
	let search       = $state('');
	let activeGroups = $state(new Set<string>());
	let rolling      = $state(false);

	// ---------------------------------------------------------------------------
	// Derived
	// ---------------------------------------------------------------------------
	const oracles = $derived(getOracles());
	const groups  = $derived(getOracleGroups());

	/** Oracle selected for the detail view. */
	const selectedOracle = $derived(
		selectedKey ? oracles.find((o) => o.key === selectedKey) ?? null : null,
	);

	/** Filtered list of oracles for the picker tile grid. */
	const filteredOracles = $derived(() => {
		const q = search.trim().toLowerCase();
		return oracles.filter((o) => {
			const groupMatch = activeGroups.size === 0 || activeGroups.has(o.group);
			const textMatch  = !q
				|| o.title.toLowerCase().includes(q)
				|| (o.description?.toLowerCase().includes(q) ?? false);
			return groupMatch && textMatch;
		});
	});

	// ---------------------------------------------------------------------------
	// Group colour mapping
	// ---------------------------------------------------------------------------
	const GROUP_COLORS: Record<string, string> = {
		'Core Ironsworn': 'var(--color-wits)',
		'Delve':          'var(--color-spirit)',
		'Yrt':            'var(--color-touched)',
	};

	function groupColor(group: string): string {
		return GROUP_COLORS[group] ?? 'var(--text-accent)';
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------
	export function open(oracleKey?: string) {
		if (oracleKey) {
			selectedKey = oracleKey;
			view        = 'detail';
		} else {
			view        = 'picker';
			selectedKey = null;
		}
		search       = '';
		activeGroups = new Set();
		loadOracles();            // idempotent — fetches once per session
		dialogEl?.showModal();
	}

	export function close() {
		dialogEl?.close();
	}

	// ---------------------------------------------------------------------------
	// Roll
	// ---------------------------------------------------------------------------
	async function doRoll(key: string) {
		if (rolling) return;
		rolling = true;

		const result = rollOracle(key, oracles);

		// Split the primary roll into tens + ones for the d100 animation
		const tensV = Math.floor(result.roll % 100 / 10) || 10;
		const onesV = result.roll % 10                   || 10;

		close();
		await animateDice([
			{ sides: 10, value: tensV, color: DIE_BLACK },
			{ sides: 10, value: onesV, color: DIE_WHITE },
		]);
		// Enrich interactive links (resource/debility etc.) with entry + char IDs
		// so LogPanel click delegation can identify them.
		const entryId   = crypto.randomUUID();
		const activeCtx = getActiveDiceCtx();
		const html = activeCtx
			? enrichOutcomeLinks(result.html, entryId, activeCtx.charId)
			: result.html;
		appendLog(SESSION_LOG_ID, `Oracle: ${result.title}`, html, entryId);
		rolling = false;
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------
	function toggleGroup(group: string) {
		const next = new Set(activeGroups);
		if (next.has(group)) next.delete(group);
		else                  next.add(group);
		activeGroups = next;
	}

	function clearFilters() {
		search       = '';
		activeGroups = new Set();
	}
</script>

<!-- =========================================================================
     Dialog
     ========================================================================= -->
<dialog
	bind:this={dialogEl}
	class="oracles-dialog"
	oncancel={close}
>

{#if view === 'picker'}

	<!-- ── Picker view ────────────────────────────────────────────────────── -->

	<!-- Header -->
	<div class="od-header" use:draggable>
		<span class="od-title">Oracles</span>
		<button class="od-close" onclick={close} aria-label="Close">✕</button>
	</div>

	<!-- Controls -->
	<div class="od-controls">
		<!-- Search row -->
		<div class="od-search-row">
			<input
				class="od-search"
				type="search"
				placeholder="Search oracles…"
				bind:value={search}
				aria-label="Search oracles"
			/>
			<button
				class="od-clear-btn"
				title="Clear all filters"
				onclick={clearFilters}
				aria-label="Clear all filters"
			>{@html clearFiltersSvg}</button>
		</div>

		<!-- Group filter tags -->
		<div class="od-group-filters">
			{#each groups as group (group)}
				<button
					class="od-group-tag"
					class:od-group-tag--active={activeGroups.has(group)}
					style:--gcolor={groupColor(group)}
					onclick={() => toggleGroup(group)}
				>{group}</button>
			{/each}
		</div>
	</div>

	<!-- Tile grid -->
	<div class="od-body">
		{#if oracles.length === 0}
			<div class="od-loading">Loading oracles…</div>
		{:else}
			{@const list = filteredOracles()}
			{#if list.length === 0}
				<div class="od-empty">No oracles match.</div>
			{:else}
				<div class="od-grid">
					{#each list as oracle (oracle.key)}
						<button
							class="od-tile"
							style:--tcolor={groupColor(oracle.group)}
							onclick={() => { selectedKey = oracle.key; view = 'detail'; }}
						>
							<div class="od-tile-stripe"></div>
							<div class="od-tile-body">
								<div class="od-tile-name">{oracle.title}</div>
								{#if oracle.description}
									<div class="od-tile-desc">{oracle.description}</div>
								{/if}
							</div>
						</button>
					{/each}
				</div>
			{/if}
		{/if}
	</div>

{:else if view === 'detail' && selectedOracle}

	<!-- ── Detail view ───────────────────────────────────────────────────── -->

	<!-- Header -->
	<div class="od-header od-header--detail" use:draggable>
		<button class="od-back-btn" onclick={() => (view = 'picker')}>← Back</button>
		<span class="od-title od-title--detail">{selectedOracle.title}</span>
		<div class="od-detail-actions">
			<button class="od-close" onclick={close} aria-label="Close">✕</button>
		</div>
	</div>

	<!-- Detail body -->
	<div class="od-body od-body--detail">
		{#if selectedOracle.description}
			<p class="od-detail-desc">{selectedOracle.description}</p>
		{/if}

		<div class="od-table-wrap">
			{@html buildTableHtml(selectedOracle.key, selectedOracle.data)}
		</div>
	</div>

	<!-- Roll footer -->
	<div class="od-footer">
		<button
			class="btn btn-primary od-roll-btn"
			onclick={() => doRoll(selectedOracle!.key)}
			disabled={rolling}
		>{rolling ? 'Rolling…' : 'Roll'}</button>
	</div>

{/if}

</dialog>

<style>
	/* ── Dialog shell ────────────────────────────────────────────────────── */
	.oracles-dialog {
		border:        none;
		padding:       0;
		border-radius: 10px;
		position:      fixed;
		/* Anchor to a fixed top — prevents the dialog "dancing" when the tile
		   grid shrinks as filters are applied. true vertical centering
		   (top:50% / translateY(-50%)) shifts the box as height changes. */
		top:           8vh;
		left:          50%;
		transform:     translateX(-50%);
		width:         min(640px, calc(100vw - 2rem));
		max-height:    min(700px, calc(100dvh - 10vh));
		background:    var(--bg-card);
		color:         var(--text);
		box-shadow:    0 16px 48px #00000070, 0 0 0 1px var(--border-mid);
		outline:       none;
		overflow:      hidden;
	}
	/* Flex layout only when the dialog is actually open — prevents display:flex
	   from overriding the browser's display:none on a closed <dialog>. */
	.oracles-dialog[open] {
		display:        flex;
		flex-direction: column;
	}
	.oracles-dialog::backdrop {
		background:      #00000060;
		backdrop-filter: blur(1px);
	}

	/* ── Header ─────────────────────────────────────────────────────────── */
	.od-header {
		display:         flex;
		align-items:     center;
		gap:             8px;
		padding:         10px 14px;
		border-bottom:   1px solid var(--border);
		background:      var(--bg-control);
		border-radius:   10px 10px 0 0;
		flex-shrink:     0;
	}
	.od-header--detail {
		flex-wrap: nowrap;
	}
	.od-title {
		font-family:    var(--font-display);
		font-size:      0.78rem;
		font-weight:    700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color:          var(--text-accent);
		flex:           1;
	}
	.od-title--detail {
		font-size:     0.72rem;
		overflow:      hidden;
		text-overflow: ellipsis;
		white-space:   nowrap;
	}
	.od-close {
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
	.od-close:hover { color: var(--text); }

	.od-back-btn {
		font-family:   var(--font-ui);
		font-size:     0.7rem;
		font-weight:   600;
		color:         var(--text-dimmer);
		background:    transparent;
		border:        1px solid var(--border);
		border-radius: 4px;
		padding:       3px 8px;
		cursor:        pointer;
		flex-shrink:   0;
		white-space:   nowrap;
	}
	.od-back-btn:hover { color: var(--text); border-color: var(--border-mid); }

	.od-detail-actions {
		display:     flex;
		align-items: center;
		flex-shrink: 0;
	}

	/* ── Controls (search + group tags) ─────────────────────────────────── */
	.od-controls {
		padding:       8px 14px 6px;
		border-bottom: 1px solid var(--border);
		flex-shrink:   0;
		display:       flex;
		flex-direction: column;
		gap:           6px;
	}

	.od-search-row {
		display:     flex;
		align-items: center;
		gap:         6px;
	}
	.od-search {
		flex:          1;
		font-family:   var(--font-ui);
		font-size:     0.78rem;
		color:         var(--text);
		background:    var(--bg-inset);
		border:        1px solid var(--border);
		border-radius: 4px;
		padding:       5px 8px;
		min-width:     0;
	}
	.od-search:focus {
		outline: none;
		border-color: var(--focus-ring);
		box-shadow: 0 0 0 2px var(--accent-glow);
	}

	.od-clear-btn {
		background:    transparent;
		border:        none;
		color:         var(--text-dimmer);
		cursor:        pointer;
		padding:       3px 5px;
		border-radius: 3px;
		display:       flex;
		align-items:   center;
		flex-shrink:   0;
	}
	.od-clear-btn:hover { color: var(--text); }
	.od-clear-btn :global(svg) {
		width:  18px;
		height: 18px;
		fill:   currentColor;
	}

	.od-group-filters {
		display:   flex;
		flex-wrap: wrap;
		gap:       4px;
	}
	.od-group-tag {
		font-family:    var(--font-ui);
		font-size:      0.65rem;
		font-weight:    600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color:          var(--gcolor, var(--text-dimmer));
		background:     transparent;
		border:         1px solid color-mix(in srgb, var(--gcolor, var(--border)) 40%, transparent);
		border-radius:  3px;
		padding:        2px 8px;
		cursor:         pointer;
		white-space:    nowrap;
		transition:     background 0.12s, color 0.12s;
	}
	.od-group-tag:hover {
		background: color-mix(in srgb, var(--gcolor, var(--border)) 12%, transparent);
	}
	.od-group-tag--active {
		background: color-mix(in srgb, var(--gcolor, var(--border)) 18%, transparent);
		border-color: var(--gcolor, var(--border));
	}

	/* ── Scrollable body ─────────────────────────────────────────────────── */
	.od-body {
		flex:       1;
		overflow-y: auto;
		padding:    10px 14px;
		min-height: 0;
	}
	.od-body--detail {
		display:        flex;
		flex-direction: column;
		gap:            10px;
	}

	.od-loading,
	.od-empty {
		font-family: var(--font-ui);
		font-size:   0.78rem;
		color:       var(--text-dimmer);
		text-align:  center;
		padding:     2rem 1rem;
	}

	/* ── Tile grid ───────────────────────────────────────────────────────── */
	.od-grid {
		display:               grid;
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap:                   8px;
	}
	.od-tile {
		display:        flex;
		flex-direction: row;
		align-items:    stretch;
		text-align:     left;
		background:     var(--bg-control);
		border:         1px solid var(--border);
		border-radius:  6px;
		overflow:       hidden;
		cursor:         pointer;
		padding:        0;
		color:          var(--text);
		font-family:    var(--font-ui);
		transition:     background 0.12s, border-color 0.12s;
	}
	.od-tile:hover {
		background:   var(--bg-hover);
		border-color: var(--tcolor, var(--border-mid));
	}
	.od-tile-stripe {
		width:      4px;
		flex-shrink: 0;
		background:  var(--tcolor, var(--text-accent));
	}
	.od-tile-body {
		padding:    6px 8px;
		flex:       1;
		min-width:  0;
	}
	.od-tile-name {
		font-size:   0.7rem;
		font-weight: 700;
		line-height: 1.3;
		color:       var(--text);
	}
	.od-tile-desc {
		font-size:    0.6rem;
		line-height:  1.4;
		color:        var(--text-dimmer);
		margin-top:   3px;
		/* 2-line clamp */
		display:           -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp:        2;
		-webkit-box-orient: vertical;
		overflow:           hidden;
	}

	/* ── Detail view ─────────────────────────────────────────────────────── */
	.od-detail-desc {
		font-family: var(--font-ui);
		font-size:   0.75rem;
		font-style:  italic;
		color:       var(--text-muted);
		line-height: 1.55;
		margin:      0;
		padding-bottom: 4px;
		border-bottom: 1px solid var(--border);
	}

	.od-table-wrap {
		overflow-x: auto;
	}
	.od-table-wrap :global(.oracle-table) {
		width:           100%;
		border-collapse: collapse;
		font-family:     var(--font-ui);
		font-size:       0.7rem;
	}
	.od-table-wrap :global(.oracle-table th) {
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
	.od-table-wrap :global(.oracle-table td) {
		padding:       4px 8px;
		border-bottom: 1px solid var(--border);
		color:         var(--text);
		vertical-align: top;
	}
	.od-table-wrap :global(.oracle-table tr:last-child td) {
		border-bottom: none;
	}
	.od-table-wrap :global(.oracle-table tr:hover td) {
		background: var(--bg-hover);
	}
	/* Range column — monospaced, no wrap */
	.od-table-wrap :global(.oracle-table td:first-child) {
		font-variant-numeric: tabular-nums;
		color:                var(--text-dimmer);
		white-space:          nowrap;
		min-width:            3rem;
	}
	/* settlementName category cells */
	.od-table-wrap :global(.oracle-cat-range),
	.od-table-wrap :global(.oracle-cat-desc) {
		background: color-mix(in srgb, var(--text-accent) 5%, transparent);
		font-style: italic;
		color:      var(--text-muted) !important;
	}

	/* ── Roll footer ─────────────────────────────────────────────────────── */
	.od-footer {
		border-top:  1px solid var(--border);
		padding:     10px 14px;
		flex-shrink: 0;
		display:     flex;
		justify-content: flex-end;
	}
	.od-roll-btn {
		padding:          8px 20px;
		font-size:        0.8rem;
		justify-content:  center;  /* prevent text left-drift in inline-flex */
	}
</style>
