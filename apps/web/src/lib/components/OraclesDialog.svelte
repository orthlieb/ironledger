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
		buildTableHtml,
		rollOracle,
	} from '$lib/oracleStore.svelte.js';
	import { headingText } from '$lib/fontStore.svelte.js';
	import { oracleCategoryIcon } from '$lib/iconRegistry.js';
	import { oracleCategoryMeta } from '$lib/extensionCategories.svelte.js';
	import { renderNote } from '$lib/markdown.js';
	import { appendLog, enrichOutcomeLinks } from '$lib/log.svelte.js';
	import { animateDice, DIE_BLACK, DIE_WHITE } from '$lib/dice.js';
	import { getActiveDiceCtx } from '$lib/diceContext.svelte.js';

	import { Dialog } from 'bits-ui';
	import DialogHeader from '$lib/components/DialogHeader.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';

	// ---------------------------------------------------------------------------
	// Internal state
	// ---------------------------------------------------------------------------
	let dialogOpen = $state(false);
	let searchInputEl = $state<HTMLInputElement | null>(null);
	let view = $state<'picker' | 'detail'>('picker');
	let selectedKey = $state<string | null>(null);
	let search = $state('');
	let activeCategories = $state(new Set<string>());
	let rolling = $state(false);
	let filtersOpen = $state(false);
	/** True when the dialog was opened directly on a specific oracle key — hides Back button. */
	let directLaunch = $state(false);
	/** Column key to highlight in a column-picker table (e.g. 'edge', 'shadow'). */
	let activeStat = $state<string | null>(null);
	/** Selected column key for a columnSelect/matrix picker — the generic
	 *  "chosen column" state (see `effectiveColumnKey`); defaults to 'edge'. */
	let selectedDelveStat = $state<string>('edge');
	/** Optional callback to auto-fill a field with the rolled plain-text value. */
	let _onFill: ((value: string) => void) | null = null;

	/** Reactive narrow-viewport flag (≤640px, matching the column-picker collapse
	 *  breakpoint) — drives the two-step table's single-column mobile layout. */
	let narrow = $state(false);
	$effect(() => {
		const mq = window.matchMedia('(max-width: 640px)');
		narrow = mq.matches;
		const onChange = (e: MediaQueryListEvent) => (narrow = e.matches);
		mq.addEventListener('change', onChange);
		return () => mq.removeEventListener('change', onChange);
	});

	// ---------------------------------------------------------------------------
	// Derived
	// ---------------------------------------------------------------------------
	// Detail view / lookups always use the unfiltered list (render-time resolution
	// for log click-through from disabled expansions).
	const allOracles = $derived(getOracles());
	const visibleOracles = $derived(getVisibleOracles());

	/** All thematic categories present across the visible oracles, sorted — the
	 *  filter chips. */
	const categories = $derived.by(() => {
		const set = new Set<string>();
		for (const o of visibleOracles) set.add(o.category ?? 'Other');
		return [...set].sort();
	});

	/** Oracle selected for the detail view. */
	const selectedOracle = $derived(
		selectedKey ? (allOracles.find((o) => o.key === selectedKey) ?? null) : null,
	);

	/** For a columnSelect oracle (e.g. Settlement Type), the currently-chosen
	 *  column key — `selectedDelveStat` when it's one of the oracle's columns,
	 *  else the first column. Reuses the delve stat state as the generic
	 *  "selected column". Null for non-column oracles. */
	const effectiveColumnKey = $derived.by(() => {
		const cols = selectedOracle?.columns;
		if (!cols?.length) return null;
		return cols.some((c) => c.key === selectedDelveStat) ? selectedDelveStat : cols[0].key;
	});

	/** Per-column accent palette for columnSelect/matrix pickers, cycled by column
	 *  index so each column reads distinctly. Drives Settlement: Type, Scale:
	 *  Magnitude, etc. */
	const PICKER_COLORS = [
		'var(--color-edge)',
		'var(--color-heart)',
		'var(--color-wits)',
		'var(--color-shadow)',
		'var(--color-health)',
		'var(--color-supply)',
		'var(--color-momentum)',
		'var(--color-spirit)',
		'var(--color-iron)',
	];
	/** Stat keys that carry a canonical accent colour (`--color-edge`, …). When a
	 *  column's key IS a stat (Delve the Depths: edge/shadow/wits), use that stat's
	 *  true colour instead of the index-cycled palette, so Shadow stays purple. */
	const STAT_KEYS = new Set(['edge', 'heart', 'iron', 'shadow', 'wits']);
	const pickerColor = (i: number, key?: string) =>
		key && STAT_KEYS.has(key)
			? `var(--color-${key})`
			: PICKER_COLORS[((i % PICKER_COLORS.length) + PICKER_COLORS.length) % PICKER_COLORS.length];

	/** Accent colour of the currently-active column (columnSelect/matrix). */
	const activeColColor = $derived.by(() => {
		const cols = selectedOracle?.columns;
		if (!cols?.length) return 'var(--text-accent)';
		const idx = cols.findIndex((c) => c.key === effectiveColumnKey);
		const j = idx < 0 ? 0 : idx;
		return pickerColor(j, cols[j]?.key);
	});

	/** Picker-grid order: category (alphabetical, matching the filter-chip order),
	 *  then display name. Numeric-aware so "Ironlander 1/2" sort naturally. */
	function byCategoryName(
		aCat: string | undefined,
		aName: string,
		bCat: string | undefined,
		bName: string,
	): number {
		return (
			(aCat ?? 'Other').localeCompare(bCat ?? 'Other') ||
			aName.localeCompare(bName, undefined, { numeric: true })
		);
	}

	/** Filtered list of oracles for the picker tile grid, sorted by category then name. */
	const filteredOracles = $derived(() => {
		const q = search.trim().toLowerCase();
		return visibleOracles
			.filter((o) => {
				const catMatch = activeCategories.size === 0 || activeCategories.has(o.category ?? 'Other');
				const textMatch =
					!q ||
					o.title.toLowerCase().includes(q) ||
					(o.description?.toLowerCase().includes(q) ?? false);
				return catMatch && textMatch;
			})
			.sort((a, b) => byCategoryName(a.category, a.title, b.category, b.title));
	});

	// ---------------------------------------------------------------------------
	// Category tint (filter chips + tile accents) — from the extension manifest.
	// Each extension declares its own colour on its oracleCategories entries;
	// unknown categories fall back to --text-accent.
	// ---------------------------------------------------------------------------
	function categoryColor(cat: string | undefined): string {
		return oracleCategoryMeta(cat)?.color ?? 'var(--text-accent)';
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
		activeCategories = new Set();
		loadOracles(); // idempotent — fetches once per session
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

		const o = allOracles.find((x) => x.key === key);
		const rollOpts =
			o?.tableType === 'columnSelect' || o?.tableType === 'matrix'
				? { stat: effectiveColumnKey ?? undefined }
				: undefined;
		const result = rollOracle(key, allOracles, rollOpts);

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
		appendLog(`Oracle ${result.title}`, html, entryId);
		if (fillFn && result.value) fillFn(result.value);
		rolling = false;
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------
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
					<FilterBar
						bind:search
						bind:active={activeCategories}
						bind:filtersOpen
						bind:inputEl={searchInputEl}
						placeholder="Search oracles…"
						categories={categories.map((c) => ({ key: c, label: c, color: categoryColor(c) }))}
					/>
				</div>

				<!-- Tile grid -->
				<div class="od-body">
					{#if allOracles.length === 0}
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
										style:--tcolor={categoryColor(oracle.category)}
										onclick={() => {
											selectedKey = oracle.key;
											view = 'detail';
											// Default-highlight the first column of a columnSelect/matrix oracle.
											if (
												(oracle.tableType === 'columnSelect' || oracle.tableType === 'matrix') &&
												oracle.columns?.length
											) {
												selectedDelveStat = oracle.columns[0].key;
												activeStat = oracle.columns[0].key;
											}
										}}
									>
										<div class="od-tile-stripe"></div>
										<div class="od-tile-body">
											<div class="od-tile-name-row">
												<span class="od-tile-icon" aria-hidden="true">
													{@html oracleCategoryIcon(oracle.category)}
												</span>
												<div class="od-tile-name">{oracle.title}</div>
											</div>
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
				<DialogHeader title={selectedOracle.title} detail>
					{#snippet leading()}
						<span
							class="od-header-icon"
							aria-hidden="true"
							style:--ccolor={categoryColor(selectedOracle.category)}
						>
							{@html oracleCategoryIcon(selectedOracle.category)}
						</span>
					{/snippet}
					{#snippet trailing()}
						{#if selectedOracle.category}
							<span
								class="od-category-badge"
								style:--ccolor={categoryColor(selectedOracle.category)}
							>
								{selectedOracle.category}
							</span>
						{/if}
					{/snippet}
				</DialogHeader>

				<!-- Detail body -->
				<div class="od-body od-body--detail">
					{#if selectedOracle.description}
						<!-- eslint-disable-next-line svelte/no-at-html-tags — renderNote escapes all text -->
						<div class="od-detail-desc">{@html renderNote(selectedOracle.description)}</div>
					{/if}

					{#if (selectedOracle.tableType === 'columnSelect' || selectedOracle.tableType === 'matrix') && selectedOracle.columns}
						<div class="od-delve-stat-picker">
							{#each selectedOracle.columns as col, i (col.key)}
								<button
									class="od-delve-stat-btn"
									class:od-delve-stat-btn--active={effectiveColumnKey === col.key}
									style:--stat-color={pickerColor(i, col.key)}
									onclick={() => {
										selectedDelveStat = col.key;
										activeStat = col.key;
									}}>{col.label}</button
								>
							{/each}
						</div>
					{/if}

					<div
						class="od-table-wrap"
						style:--active-col-color={selectedOracle.tableType === 'columnSelect' ||
						selectedOracle.tableType === 'matrix'
							? activeColColor
							: activeStat
								? `var(--color-${activeStat})`
								: 'var(--text-accent)'}
					>
						{@html buildTableHtml(
							selectedOracle.key,
							selectedOracle.data,
							selectedOracle.tableType === 'matrix'
								? {
										activeStat: effectiveColumnKey ?? undefined,
										columns: selectedOracle.columns,
										tableType: 'matrix',
									}
								: selectedOracle.tableType === 'columnSelect'
									? {
											activeStat: effectiveColumnKey ?? undefined,
											columns: selectedOracle.columns,
											tableType: 'columnSelect',
										}
									: selectedOracle.tableType === 'twoStep'
										? {
												outerLabel: selectedOracle.outerLabel,
												innerLabel: selectedOracle.innerLabel,
												narrow,
											}
										: selectedOracle.tableType === 'compound'
											? {
													tableType: 'compound',
												}
											: selectedOracle.tableType === 'prefixSuffix'
												? {
														tableType: 'prefixSuffix',
														// `narrow` drops the grid from three column groups to two on phones.
														narrow,
													}
												: // flat table: pass declared `columns` (labels) so multi-column
													// flat oracles render their extra columns; activeStat is still
													// forwarded for any stat-highlighted column.
													{
														activeStat: activeStat ?? undefined,
														columns: selectedOracle.columns,
														narrow,
													},
						)}
					</div>

					{#if selectedOracle.postamble}
						<!-- eslint-disable-next-line svelte/no-at-html-tags — renderNote escapes all text -->
						<div class="od-detail-postamble">{@html renderNote(selectedOracle.postamble)}</div>
					{/if}
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
					<button class="btn od-cancel-btn" onclick={close}>Close</button>
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
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}
	/* Drop to 2 columns on narrow / mobile widths so tiles stay legible. */
	@media (max-width: 560px) {
		:global(.od-grid) {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
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
	/* Name row — small category glyph inline before the title, tinted with the
	   category colour. Matches the asset/move picker tiles (icon next to the
	   header, not a full-height left column). */
	:global(.od-tile-name-row) {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}
	:global(.od-tile-icon) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 15px;
		height: 15px;
		flex-shrink: 0;
		color: var(--tcolor, var(--text-muted));
	}
	:global(.od-tile-icon svg) {
		width: 15px;
		height: 15px;
		fill: currentColor;
	}
	:global(.od-tile-name) {
		flex: 1;
		min-width: 0;
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

	/* Detail-header leading glyph — the category icon next to the oracle title,
	   tinted with the category colour (matches the asset/move card name icon). */
	:global(.od-header-icon) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		color: var(--ccolor, var(--text-accent));
	}
	:global(.od-header-icon svg) {
		width: 16px;
		height: 16px;
		fill: currentColor;
	}

	/* Detail-header trailing pill — the oracle category, tinted with the
	   category colour. Mirrors MovesDialog's `.md-category-badge`. */
	.od-category-badge {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ccolor, var(--text-dimmer));
		border: 1px solid color-mix(in srgb, var(--ccolor, var(--border)) 40%, transparent);
		border-radius: 10px;
		padding: 2px 7px;
		flex-shrink: 0;
		white-space: nowrap;
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	/* ── Detail view ─────────────────────────────────────────────────────── */
	/* Base text is roman so limited-markdown emphasis renders distinctly —
	   *italic* / _italic_ → <em>, **bold** → <strong>. (Previously the whole
	   block was font-style: italic, which swallowed *italic* markdown.) */
	:global(.od-detail-desc) {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text-muted);
		line-height: 1.55;
		margin: 0;
		padding-bottom: 4px;
		border-bottom: 1px solid var(--border);
	}

	.od-detail-postamble {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text-muted);
		line-height: 1.55;
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--border);
	}

	/* Block elements below come from {@html renderNote(…)}, so they carry no
	   Svelte scope hash — the whole descendant selector must be :global(). */
	:global(.od-detail-desc p),
	:global(.od-detail-postamble p) {
		margin: 0;
	}

	:global(.od-detail-desc p + p),
	:global(.od-detail-postamble p + p) {
		margin-top: 0.5em;
	}

	:global(.od-detail-desc ul),
	:global(.od-detail-desc ol),
	:global(.od-detail-postamble ul),
	:global(.od-detail-postamble ol) {
		margin: 0.25em 0;
		padding-left: 1.25em;
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

	/* Narrow screens: a column-picker oracle collapses to just its always-on
	   column (D100 for matrix, Result for columnSelect/delveDepths) + the active
	   picked column — the chips still switch which one shows. Shared `.od-pick-col`
	   across matrix / columnSelect / delveDepths, so all of them collapse alike. */
	@media (max-width: 640px) {
		:global(.od-table-wrap .od-pick-col:not(.col-active)) {
			display: none;
		}
		/* Collapsed = 2 columns; lock them 50/50 so switching pills doesn't resize
		   the layout ("dancing" columns). Scoped to picker tables via
		   :has(.od-pick-col) so single-column / twoStep tables are untouched.
		   Skip the lock when a Population column is present (Settlement: Type) —
		   that table keeps three always-on columns, so a natural layout is right. */
		:global(.od-table-wrap .oracle-table:has(.od-pick-col):not(:has(.oracle-pop-col))) {
			table-layout: fixed;
			width: 100%;
		}
		:global(.od-table-wrap .oracle-table:has(.od-pick-col):not(:has(.oracle-pop-col)) th),
		:global(.od-table-wrap .oracle-table:has(.od-pick-col):not(:has(.oracle-pop-col)) td) {
			width: 50%;
		}
	}

	/* Population column (Settlement: Type) — secondary info: dimmed, tabular,
	   no wrap. Only ever present on a table that opts in via `.oracle-pop-col`. */
	:global(.od-table-wrap .oracle-table .oracle-pop-col) {
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
		white-space: nowrap;
	}

	/* Roll-number (range) columns — dimmed + monospaced, no wrap. Marked with
	   `.oracle-range` on every range cell so multi-column layouts (2/3-column
	   tables, name tables, the Delve Depths / Settlement Type stat columns) all
	   dim consistently, not just the first column. */
	:global(.od-table-wrap .oracle-table td.oracle-range) {
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

	/* Compound oracle: each `[oracleKey]` blank rendered as its target oracle's
	   title (a filled-in-on-roll slot). */
	:global(.od-table-wrap .oracle-ref) {
		display: inline-block;
		padding: 0 5px;
		border-radius: 4px;
		background: color-mix(in srgb, var(--text-accent) 12%, transparent);
		color: var(--text-accent);
		font-weight: 600;
		font-size: 0.9em;
	}
	:global(.od-table-wrap .oracle-compound-single) {
		line-height: 1.9;
		font-family: var(--font-ui);
	}
	/* Repeat quantifier badge, e.g. [Label](roll:key?rollFrom=1&rollTo=3) → "×1–3". */
	:global(.od-table-wrap .oracle-ref-rep) {
		margin-left: 3px;
		font-size: 0.8em;
		font-weight: 600;
		color: var(--text-dimmer);
	}

	/* ── Delve the Depths stat picker ───────────────────────────────────── */
	:global(.od-delve-stat-picker) {
		display: flex;
		flex-wrap: wrap;
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
