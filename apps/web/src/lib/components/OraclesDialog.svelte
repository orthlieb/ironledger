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
		getVisibleOracles,
		getVisibleOracleSources,
		buildTableHtml,
		rollOracle,
	} from '$lib/oracleStore.svelte.js';
	import { sourceLabel } from '$lib/expansionStore.svelte.js';
	import { headingText } from '$lib/fontStore.svelte.js';
	import type { CatalogueSource, FoeDef, FoeQuantity, FoeRollRow } from '$lib/types.js';
	import type { RollTable } from '@ironledger/shared';
	import { appendLog, enrichOutcomeLinks } from '$lib/log.svelte.js';
	import { animateDice, DIE_BLACK, DIE_WHITE } from '$lib/dice.js';
	import { getActiveDiceCtx } from '$lib/diceContext.svelte.js';
	import { getVisibleRollTables, loadRollTables } from '$lib/rollTableStore.svelte.js';
	import { findFoe, loadFoes } from '$lib/foeStore.svelte.js';
	import { addEncounter } from '$lib/encounterStore.svelte.js';
	import FoeRollDialog from '$lib/components/FoeRollDialog.svelte';
	import PreludeTableDialog from '$lib/components/PreludeTableDialog.svelte';

	import clearFiltersSvg from '$icons/filter-circle-xmark-solid-full.svg?raw';
	import searchIconSvg from '$icons/magnifying-glass-solid-full.svg?raw';
	import { Dialog } from 'bits-ui';
	import DialogHeader from '$lib/components/DialogHeader.svelte';
	import { tooltip } from '$lib/actions/tooltip.js';

	// ---------------------------------------------------------------------------
	// Internal state
	// ---------------------------------------------------------------------------
	let dialogOpen = $state(false);
	let searchInputEl = $state<HTMLInputElement | null>(null);
	let view = $state<'picker' | 'detail'>('picker');
	let selectedKey = $state<string | null>(null);
	let search = $state('');
	let activeSources = $state(new Set<CatalogueSource>());
	let rolling = $state(false);
	let filtersOpen = $state(false);
	/** True when the dialog was opened directly on a specific oracle key — hides Back button. */
	let directLaunch = $state(false);
	/** Stat to highlight in the delveDepths table (e.g. 'edge', 'shadow', 'wits'). */
	let activeStat = $state<string | null>(null);
	/** Stat selected for rolling the delveDepths table — defaults to activeStat or 'edge'. */
	let selectedDelveStat = $state<string>('edge');
	/** Optional callback to auto-fill a field with the rolled plain-text value. */
	let _onFill: ((value: string) => void) | null = null;

	// ---------------------------------------------------------------------------
	// Derived
	// ---------------------------------------------------------------------------
	// Detail view / lookups always use the unfiltered list (render-time resolution
	// for log click-through from disabled expansions).
	const allOracles = $derived(getOracles());
	const visibleOracles = $derived(getVisibleOracles());
	const sources = $derived(getVisibleOracleSources());

	/** Oracle selected for the detail view. */
	const selectedOracle = $derived(
		selectedKey ? (allOracles.find((o) => o.key === selectedKey) ?? null) : null,
	);

	/** Filtered list of oracles for the picker tile grid. */
	const filteredOracles = $derived(() => {
		const q = search.trim().toLowerCase();
		return visibleOracles.filter((o) => {
			const sourceMatch = activeSources.size === 0 || activeSources.has(o.source);
			const textMatch =
				!q ||
				o.title.toLowerCase().includes(q) ||
				(o.description?.toLowerCase().includes(q) ?? false);
			return sourceMatch && textMatch;
		});
	});

	// ── Resolver oracles (foe roll-tables) ──────────────────────────────────
	// A d100 table (e.g. Lodestar's Encounter Index) that resolves to a foe
	// rather than text. These surface as tiles in the same picker grid, gated
	// to their enabled expansion + the active search/source filters; selecting
	// one hands off to the shared FoeRollDialog (roll → foe detail → Add to
	// Foes) instead of the text-oracle detail view.
	let foeRollRef = $state<{ open(): void; close(): void } | null>(null);
	let activeFoeTable = $state<RollTable | null>(null);

	/** Foe roll-tables matching the current search + source filters. */
	const foeRollTables = $derived(() => {
		const q = search.trim().toLowerCase();
		return getVisibleRollTables().filter(
			(t) =>
				t.kind === 'foe' &&
				(activeSources.size === 0 || activeSources.has(t.source)) &&
				(!q || t.name.toLowerCase().includes(q)),
		);
	});

	const foeRollTitle = $derived(activeFoeTable?.name ?? '');
	const foeRollLogLabel = $derived(activeFoeTable ? `Oracle: ${activeFoeTable.name}` : 'Oracle');
	const foeRollRows = $derived<FoeRollRow[]>(
		activeFoeTable
			? activeFoeTable.entries.map((e) => ({ low: e.low, high: e.high, ref: e.ref }))
			: [],
	);

	/** Roll-table refs are catalogue foe ids — resolve straight through. */
	function resolveFoe(ref: string): FoeDef | undefined {
		return findFoe(ref);
	}

	/** "Add to Foes" from a resolver-oracle result — same encounter shape as the
	 *  denizen roll (ExpeditionsArea.handleDenizenSelected). */
	async function addFoeFromRoll(
		foeDef: FoeDef,
		quantity: FoeQuantity,
		effectiveRank: number,
	): Promise<void> {
		await addEncounter({
			id: crypto.randomUUID(),
			foeId: foeDef.id,
			quantity,
			effectiveRank: effectiveRank as 1 | 2 | 3 | 4 | 5,
			ticks: 0,
			notes: '',
			customName: '',
			vanquished: false,
		});
	}

	/** Hand a foe roll-table off to the shared dialog: set it active, close the
	 *  oracle picker, open FoeRollDialog on top. */
	function openFoeTable(table: RollTable): void {
		activeFoeTable = table;
		close();
		foeRollRef?.open();
	}

	/** Reopen the oracle picker grid — the "← Back" target from a resolver
	 *  oracle's dialog. Preserves the current search/filters. */
	function reopenPicker(): void {
		view = 'picker';
		dialogOpen = true;
	}

	/** Asset roll-tables (Prelude Event) matching the current search + source
	 *  filters. Unlike foe tables these have no roll ceremony. */
	const assetRollTables = $derived(() => {
		const q = search.trim().toLowerCase();
		return getVisibleRollTables().filter(
			(t) =>
				t.kind === 'asset' &&
				(activeSources.size === 0 || activeSources.has(t.source)) &&
				(!q || t.name.toLowerCase().includes(q)),
		);
	});

	let preludeTableRef = $state<{ open(): void; close(): void } | null>(null);

	/** Bring up the Prelude Event table (manual roll). Rolling there hands off to
	 *  the character's asset-detail dialog (with the prelude narrative on top).
	 *  Auto-rolling without the table only happens from the asset picker's d6. */
	function openPreludeTable(): void {
		close();
		preludeTableRef?.open();
	}

	// ---------------------------------------------------------------------------
	// Source colour mapping
	// ---------------------------------------------------------------------------
	const SOURCE_COLORS: Record<string, string> = {
		base: 'var(--color-wits)',
		delve: 'var(--color-spirit)',
		yrt: 'var(--color-touched)',
	};

	function sourceColor(source: string): string {
		return SOURCE_COLORS[source] ?? 'var(--text-accent)';
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------
	export function open(oracleKey?: string, onFill?: (value: string) => void, stat?: string) {
		_onFill = onFill ?? null;
		activeStat = stat ?? null;
		selectedDelveStat = stat ?? 'edge';
		if (oracleKey) {
			selectedKey = oracleKey;
			view = 'detail';
			directLaunch = true;
		} else {
			view = 'picker';
			selectedKey = null;
			directLaunch = false;
		}
		search = '';
		activeSources = new Set();
		loadOracles(); // idempotent — fetches once per session
		// Resolver oracles (foe roll-tables) + the foe catalogue they resolve
		// against — both idempotent, both needed to render/resolve foe tiles.
		loadRollTables();
		loadFoes();
		dialogOpen = true;
	}

	export function close() {
		_onFill = null;
		activeStat = null;
		selectedDelveStat = 'edge';
		dialogOpen = false;
	}

	// ---------------------------------------------------------------------------
	// Roll
	// ---------------------------------------------------------------------------
	async function doRoll(key: string) {
		if (rolling) return;
		rolling = true;
		const fillFn = _onFill; // capture before close() clears it

		const result = rollOracle(
			key,
			allOracles,
			key === 'delveDepths' ? { stat: selectedDelveStat } : undefined,
		);

		// Split the primary roll into tens + ones for the d100 animation
		const tensV = Math.floor((result.roll % 100) / 10) || 10;
		const onesV = result.roll % 10 || 10;

		close();
		await animateDice([
			{ sides: 10, value: tensV, color: DIE_BLACK },
			{ sides: 10, value: onesV, color: DIE_WHITE },
		]);
		// Enrich interactive links (resource/debility/progress etc.) with entry + char IDs
		// so LogPanel click delegation can identify them. Always enrich — entryId is
		// needed for strikethrough even when there is no active character context.
		const entryId = crypto.randomUUID();
		const activeCtx = getActiveDiceCtx();
		const html = enrichOutcomeLinks(result.html, entryId, activeCtx?.charId ?? '');
		appendLog(`Oracle: ${result.title}`, html, entryId);
		if (fillFn && result.value) fillFn(result.value);
		rolling = false;
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------
	function toggleSource(source: CatalogueSource) {
		const next = new Set(activeSources);
		if (next.has(source)) next.delete(source);
		else next.add(source);
		activeSources = next;
	}

	function clearFilters() {
		search = '';
		activeSources = new Set();
	}
</script>

<!-- =========================================================================
     Dialog — bits-ui Dialog: portalled, escape-aware, focus-trapped.
     ========================================================================= -->
<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="oracles-overlay" />
		<Dialog.Content
			class="oracles-dialog"
			onOpenAutoFocus={(e) => {
				// In picker view, jump the caret straight to the search
				// input; detail view keeps default focus (Back/Roll button).
				// setTimeout so bits-ui's own focus-move + the {#if view === 'picker'}
				// subtree mount have both settled before we grab focus. Without
				// this the ref may still be null and focus lands on the ✕
				// button instead.
				if (view !== 'picker') return;
				e.preventDefault();
				setTimeout(() => searchInputEl?.focus(), 0);
			}}
		>
			{#if view === 'picker'}
				<!-- ── Picker view ────────────────────────────────────────────────────── -->

				<!-- Header -->
				<DialogHeader title={headingText('Oracles')} onclose={close} />

				<!-- Controls -->
				<div class="od-controls">
					<!-- Search row -->
					<div class="od-search-row">
						<div class="od-search-field">
							<span class="od-search-icon" aria-hidden="true">{@html searchIconSvg}</span>
							<input
								bind:this={searchInputEl}
								class="od-search"
								type="search"
								placeholder="Search oracles…"
								bind:value={search}
								aria-label="Search oracles"
							/>
						</div>
						<!-- Source filter toggle -->
						<button
							class="od-filter-toggle"
							class:od-filter-toggle--active={activeSources.size > 0}
							onclick={() => (filtersOpen = !filtersOpen)}
							aria-expanded={filtersOpen}
						>
							Filters{#if activeSources.size > 0}&nbsp;<span class="od-filter-badge"
									>{activeSources.size}</span
								>{/if}
							{filtersOpen ? '▲' : '▼'}
						</button>
					</div>
					{#if filtersOpen}
						<div class="od-filter-panel">
							<div class="od-filter-chips">
								{#each sources as src (src)}
									<button
										class="od-group-tag"
										class:od-group-tag--active={activeSources.has(src)}
										style:--gcolor={sourceColor(src)}
										onclick={() => toggleSource(src)}>{sourceLabel(src)}</button
									>
								{/each}
							</div>
							<button
								class="od-clear-btn"
								use:tooltip={'Clear all filters'}
								onclick={clearFilters}
								disabled={activeSources.size === 0}
								aria-label="Clear all filters">{@html clearFiltersSvg}</button
							>
						</div>
					{/if}
				</div>

				<!-- Tile grid -->
				<div class="od-body">
					{#if allOracles.length === 0}
						<div class="od-loading">Loading oracles…</div>
					{:else}
						{@const list = filteredOracles()}
						{@const foeTables = foeRollTables()}
						{@const assetTables = assetRollTables()}
						{#if list.length === 0 && foeTables.length === 0 && assetTables.length === 0}
							<div class="od-empty">No oracles match.</div>
						{:else}
							<div class="od-grid">
								{#each foeTables as t (t.id)}
									<button
										class="od-tile od-tile--roll"
										style:--tcolor={sourceColor(t.source)}
										use:tooltip={'Roll to resolve a foe encounter'}
										onclick={() => openFoeTable(t)}
									>
										<div class="od-tile-stripe"></div>
										<div class="od-tile-body">
											<div class="od-tile-name">{t.name}</div>
											<div class="od-tile-desc">Roll a foe · {sourceLabel(t.source)}</div>
										</div>
									</button>
								{/each}
								{#each assetTables as t (t.id)}
									<button
										class="od-tile od-tile--roll"
										style:--tcolor={sourceColor(t.source)}
										use:tooltip={'Bring up the Prelude Event table, then roll'}
										onclick={openPreludeTable}
									>
										<div class="od-tile-stripe"></div>
										<div class="od-tile-body">
											<div class="od-tile-name">{t.name}</div>
											<div class="od-tile-desc">Roll a prelude · {sourceLabel(t.source)}</div>
										</div>
									</button>
								{/each}
								{#each list as oracle (oracle.key)}
									<button
										class="od-tile"
										style:--tcolor={sourceColor(oracle.source)}
										onclick={() => {
											selectedKey = oracle.key;
											view = 'detail';
										}}
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
				<DialogHeader title={selectedOracle.title} detail />

				<!-- Detail body -->
				<div class="od-body od-body--detail">
					{#if selectedOracle.description}
						<p class="od-detail-desc">{selectedOracle.description}</p>
					{/if}

					{#if selectedOracle.tableType === 'delveDepths'}
						<div class="od-delve-stat-picker">
							{#each [['edge', 'Edge', 'var(--color-edge)'], ['shadow', 'Shadow', 'var(--color-shadow)'], ['wits', 'Wits', 'var(--color-wits)']] as [s, label, color] (s)}
								<button
									class="od-delve-stat-btn"
									class:od-delve-stat-btn--active={selectedDelveStat === s}
									style:--stat-color={color}
									onclick={() => {
										selectedDelveStat = s;
										activeStat = s;
									}}>{label}</button
								>
							{/each}
						</div>
					{/if}

					<div
						class="od-table-wrap"
						style:--active-col-color={activeStat
							? `var(--color-${activeStat})`
							: 'var(--text-accent)'}
					>
						{@html buildTableHtml(
							selectedOracle.key,
							selectedOracle.data,
							activeStat ? { activeStat } : undefined,
						)}
					</div>
				</div>

				<!-- Roll footer -->
				<div class="od-footer">
					{#if !directLaunch}
						<button
							class="btn back-btn"
							onclick={() => {
								view = 'picker';
								activeStat = null;
							}}
							style="margin-right: auto">Back</button
						>
					{/if}
					<button class="btn od-cancel-btn" onclick={close}>Cancel</button>
					<button
						class="btn btn-primary od-roll-btn"
						onclick={() => doRoll(selectedOracle!.key)}
						disabled={rolling}>{rolling ? 'Rolling…' : 'Roll'}</button
					>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Resolver-oracle handoff: rolling a foe roll-table (e.g. Encounter Index)
     opens this shared dialog on top of the closed picker. -->
<FoeRollDialog
	bind:this={foeRollRef}
	title={foeRollTitle}
	logLabel={foeRollLogLabel}
	rows={foeRollRows}
	resolve={resolveFoe}
	onSelect={addFoeFromRoll}
	onBack={reopenPicker}
	preface={activeFoeTable?.description}
/>

<!-- Prelude Event oracle: brings up the d100 table; rolling there hands off to
     the character's asset-detail dialog. -->
<PreludeTableDialog bind:this={preludeTableRef} onBack={reopenPicker} />

<style>
	/* bits-ui portals Content + Overlay to <body>; scope everything
	   globally. Overlay 80 / content 81 matches the modal z-index tier. */
	:global(.oracles-overlay) {
		position: fixed;
		inset: 0;
		background: #00000060;
		backdrop-filter: blur(1px);
		z-index: 80;
	}
	:global(.oracles-dialog) {
		display: flex;
		flex-direction: column;
		position: fixed;
		/* Anchor to a fixed top — prevents the dialog "dancing" when
		   the tile grid shrinks as filters are applied. Definite height
		   below because fit-content + max-height collapses the flex:1
		   body to near-zero on mobile. */
		top: 8vh;
		left: 50%;
		transform: translateX(-50%);
		width: min(640px, calc(100vw - 1rem));
		height: min(84vh, 720px);
		background: var(--bg-card);
		color: var(--text);
		border-radius: 10px;
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
		overflow: hidden;
		z-index: 81;
	}

	/* ── Header ─────────────────────────────────────────────────────────── */
	/* ── Controls (search + group tags) ─────────────────────────────────── */
	:global(.od-controls) {
		padding: 8px 14px 6px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	:global(.od-search-row) {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	:global(.od-search-field) {
		flex: 1;
		min-width: 0;
		position: relative;
		display: flex;
		align-items: center;
	}
	:global(.od-search-icon) {
		position: absolute;
		left: 8px;
		width: 13px;
		height: 13px;
		display: inline-flex;
		pointer-events: none;
		color: var(--text-dimmer);
	}
	:global(.od-search-icon svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}

	:global(.od-search) {
		flex: 1;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text);
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 5px 8px 5px 28px;
		min-width: 0;
	}
	:global(.od-search:focus) {
		outline: none;
		border-color: var(--focus-ring);
		box-shadow: 0 0 0 2px var(--accent-glow);
	}

	:global(.od-clear-btn) {
		position: absolute;
		bottom: 6px;
		right: 6px;
		background: transparent;
		border: none;
		color: var(--text-dimmer);
		cursor: pointer;
		padding: 3px 4px;
		border-radius: 3px;
		display: flex;
		align-items: center;
		transition:
			color 0.12s,
			opacity 0.12s;
	}
	:global(.od-clear-btn:hover:not(:disabled)) {
		color: var(--text);
	}
	:global(.od-clear-btn:disabled) {
		opacity: 0.25;
		cursor: not-allowed;
	}
	:global(.od-clear-btn svg) {
		width: 16px;
		height: 16px;
		fill: currentColor;
	}

	:global(.od-filter-toggle) {
		display: flex;
		align-items: center;
		gap: 4px;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 3px 10px;
		cursor: pointer;
		transition:
			border-color 0.1s,
			color 0.1s;
	}
	:global(.od-filter-toggle:hover) {
		color: var(--text);
		border-color: var(--border-mid);
	}
	:global(.od-filter-toggle--active) {
		color: var(--accent);
		border-color: var(--accent);
	}
	:global(.od-filter-badge) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: 8px;
		background: var(--accent);
		color: var(--bg);
		font-size: 0.6rem;
		font-weight: 700;
	}
	:global(.od-filter-panel) {
		position: relative;
		padding: 6px 8px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 6px;
	}
	:global(.od-filter-chips) {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding-right: 26px;
	}
	:global(.od-group-tag) {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--gcolor, var(--text-dimmer));
		background: transparent;
		border: 1px solid color-mix(in srgb, var(--gcolor, var(--border)) 40%, transparent);
		border-radius: 10px;
		padding: 2px 8px;
		cursor: pointer;
		white-space: nowrap;
		transition:
			background 0.12s,
			color 0.12s;
	}
	:global(.od-group-tag:hover) {
		background: color-mix(in srgb, var(--gcolor, var(--border)) 12%, transparent);
	}
	:global(.od-group-tag--active) {
		background: color-mix(in srgb, var(--gcolor, var(--border)) 18%, transparent);
		border-color: var(--gcolor, var(--border));
	}

	/* ── Scrollable body ─────────────────────────────────────────────────── */
	:global(.od-body) {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 10px 14px;
		min-height: 0;
	}
	:global(.od-body--detail) {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.od-loading,
	:global(.od-empty) {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-dimmer);
		text-align: center;
		padding: 2rem 1rem;
	}

	/* ── Tile grid ───────────────────────────────────────────────────────── */
	:global(.od-grid) {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap: 8px;
	}
	:global(.od-tile) {
		display: flex;
		flex-direction: row;
		align-items: stretch;
		text-align: left;
		background: var(--bg-control);
		border: 1px solid var(--border);
		border-radius: 6px;
		overflow: hidden;
		cursor: pointer;
		padding: 0;
		color: var(--text);
		font-family: var(--font-ui);
		transition:
			background 0.12s,
			border-color 0.12s;
	}
	:global(.od-tile:hover) {
		background: var(--bg-hover);
		border-color: var(--tcolor, var(--border-mid));
	}
	:global(.od-tile-stripe) {
		width: 4px;
		flex-shrink: 0;
		background: var(--tcolor, var(--text-accent));
	}
	:global(.od-tile-body) {
		padding: 6px 8px;
		flex: 1;
		min-width: 0;
	}
	:global(.od-tile-name) {
		font-size: 0.7rem;
		font-weight: 700;
		line-height: 1.3;
		color: var(--text);
	}
	:global(.od-tile-desc) {
		font-size: 0.6rem;
		line-height: 1.4;
		color: var(--text-dimmer);
		margin-top: 3px;
		/* 2-line clamp */
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	/* Resolver-oracle tiles (foe roll-tables): italic subtitle cues that
	   selecting one rolls immediately rather than opening a text table. */
	:global(.od-tile--roll .od-tile-desc) {
		font-style: italic;
	}

	/* ── Detail view ─────────────────────────────────────────────────────── */
	:global(.od-detail-desc) {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		font-style: italic;
		color: var(--text-muted);
		line-height: 1.55;
		margin: 0;
		padding-bottom: 4px;
		border-bottom: 1px solid var(--border);
	}

	:global(.od-table-wrap) {
		overflow-x: auto;
	}
	:global(.od-table-wrap .oracle-table) {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font-ui);
		font-size: 0.7rem;
	}
	:global(.od-table-wrap .oracle-table th) {
		background: var(--bg-control);
		color: var(--text-dimmer);
		font-weight: 700;
		font-size: 0.62rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 4px 8px;
		border-bottom: 2px solid var(--border);
		white-space: nowrap;
		text-align: left;
	}
	:global(.od-table-wrap .oracle-table td) {
		padding: 4px 8px;
		border-bottom: 1px solid var(--border);
		color: var(--text);
		vertical-align: top;
	}
	:global(.od-table-wrap .oracle-table tr:last-child td) {
		border-bottom: none;
	}
	:global(.od-table-wrap .oracle-table tr:hover td) {
		background: var(--bg-hover);
	}
	/* Active stat column highlight (delveDepths oracle) — color driven by --active-col-color */
	:global(.od-table-wrap .oracle-table .col-active) {
		background: color-mix(in srgb, var(--active-col-color, var(--text-accent)) 8%, transparent);
		color: var(--active-col-color, var(--text-accent)) !important;
		font-weight: 600;
	}

	/* Range column — monospaced, no wrap */
	:global(.od-table-wrap .oracle-table td:first-child) {
		font-variant-numeric: tabular-nums;
		color: var(--text-dimmer);
		white-space: nowrap;
		min-width: 3rem;
	}
	/* settlementName category cells */
	.od-table-wrap :global(.oracle-cat-range),
	:global(.od-table-wrap .oracle-cat-desc) {
		background: color-mix(in srgb, var(--text-accent) 5%, transparent);
		font-style: italic;
		color: var(--text-muted) !important;
	}

	/* ── Delve the Depths stat picker ───────────────────────────────────── */
	:global(.od-delve-stat-picker) {
		display: flex;
		gap: 6px;
		padding: 8px 0 4px;
		flex-shrink: 0;
	}
	:global(.od-delve-stat-btn) {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 4px 12px;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			background 0.12s,
			color 0.12s,
			border-color 0.12s;
	}
	:global(.od-delve-stat-btn:hover) {
		background: color-mix(in srgb, var(--stat-color, var(--text-accent)) 10%, transparent);
		border-color: var(--stat-color, var(--text-accent));
		color: var(--stat-color, var(--text-accent));
	}
	:global(.od-delve-stat-btn--active) {
		background: color-mix(in srgb, var(--stat-color, var(--text-accent)) 15%, transparent);
		border-color: var(--stat-color, var(--text-accent));
		color: var(--stat-color, var(--text-accent));
	}

	/* ── Roll footer ─────────────────────────────────────────────────────── */
	:global(.od-footer) {
		border-top: 1px solid var(--border);
		padding: 10px 14px;
		flex-shrink: 0;
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	:global(.od-cancel-btn) {
		padding: 6px 16px;
		font-size: 0.78rem;
	}
	:global(.od-roll-btn) {
		padding: 5px 20px;
		justify-content: center;
	}
</style>
