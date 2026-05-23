<script lang="ts">
	/**
	 * AssetPicker — modal dialog for browsing and adding assets to a character.
	 *
	 * Fixed-height dialog so it never jumps/resizes while filtering.
	 * Category tabs + search box filter the list.
	 * Tiles show precondition failures as disabled with tooltip.
	 * Clicking an eligible tile shows an "Add X?" confirm dialog.
	 */
	import type { AssetCategory, AssetDefinition, CharacterData } from '$lib/types.js';
	import clearFiltersSvg from '$icons/filter-circle-xmark-solid-full.svg?raw';
	import { getVisibleAssets, isAssetsLoading } from '$lib/assetStore.svelte.js';
	import { firstPreconditionFailure, type Precondition } from '$lib/preconditions.js';
	import { headingText } from '$lib/fontStore.svelte.js';
	import { draggable } from '$lib/actions/draggable.js';
	import { tooltip } from '$lib/actions/tooltip.js';
	import { assetIcon } from '$lib/iconRegistry.js';

	let {
		ownedIds       = [],
		characterData,
		onAdd,
		onClose,
	}: {
		ownedIds:      string[];
		characterData: CharacterData;
		onAdd:         (assetId: string) => void;
		onClose:       () => void;
	} = $props();

	// ---------------------------------------------------------------------------
	// Category colours — shared with AssetCard
	// ---------------------------------------------------------------------------
	export const CAT_COLOR: Record<string, string> = {
		'Combat Talent': 'var(--color-iron)',
		'Path':          'var(--color-edge)',
		'Companion':     'var(--color-heart)',
		'Ritual':        'var(--color-mana)',
		'Touched':       'var(--color-touched)',
	};

	
	// ---------------------------------------------------------------------------
	// Filter state
	// ---------------------------------------------------------------------------
	let activeCategories = $state(new Set<AssetCategory>());
	let filtersOpen      = $state(false);
	let search           = $state('');
	let dialogEl = $state<HTMLDialogElement | null>(null);

	$effect(() => { if (dialogEl) dialogEl.showModal(); });

	// ---------------------------------------------------------------------------
	// Precondition checking
	// ---------------------------------------------------------------------------

	/** Returns a human-readable failure reason, or null if OK to add. */
	function preconditionFailure(def: AssetDefinition): string | null {
		return firstPreconditionFailure(
			def.preconditions as Precondition[] | undefined,
			characterData,
		);
	}

	// ---------------------------------------------------------------------------
	// Filtered asset list
	// ---------------------------------------------------------------------------
	const hasActiveFilters = $derived(search.trim() !== '' || activeCategories.size > 0);

	const visibleAssets = $derived(getVisibleAssets());

	/** Category chips only include categories represented in the visible catalogue. */
	const visibleCategories = $derived(
		(Object.keys(CAT_COLOR) as AssetCategory[]).filter((cat) =>
			visibleAssets.some((a) => a.category === cat),
		),
	);

	const filtered = $derived(
		visibleAssets.filter((a) => {
			if (activeCategories.size > 0 && !activeCategories.has(a.category)) return false;
			const q = search.trim().toLowerCase();
			if (q && !a.name.toLowerCase().includes(q) &&
				!(a.summary ?? '').toLowerCase().includes(q)) return false;
			return true;
		})
	);

	function toggleCategory(cat: AssetCategory) {
		const next = new Set(activeCategories);
		if (next.has(cat)) next.delete(cat); else next.add(cat);
		activeCategories = next;
	}

	function clearFilters() {
		search = '';
		activeCategories = new Set();
		filtersOpen = false;
	}

	// ---------------------------------------------------------------------------
	// Add flow — click a tile to hand off to the parent's add dialog.
	// The parent (CharactersArea.handleAddAsset) constructs the editable
	// draft and opens AssetCard in add mode.
	// ---------------------------------------------------------------------------
	function tryAdd(def: AssetDefinition) {
		onAdd(def.id);
	}

	/** Strips markdown-style links [text](anything) → text, for tile descriptions. */
	function stripMdLinks(raw: string): string {
		return raw.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
	}
</script>

<!-- ======================================================================
     Main picker dialog — fixed height so it never bounces while filtering
     ====================================================================== -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialogEl}
	class="picker-dialog"
	oncancel={onClose}
>
	<!-- Header — mirrors OraclesDialog .od-header (draggable, with gripper) -->
	<div class="picker-header" use:draggable>
		<span class="drag-grip" aria-hidden="true">⠿</span>
		<span class="picker-title">{headingText('Choose an Asset')}</span>
		<button class="close-btn" onclick={onClose} aria-label="Close picker">✕</button>
	</div>

	<!-- Search row + filter toggle -->
	<div class="picker-controls">
		<div class="ap-search-row">
			<input
				class="search-input"
				type="search"
				bind:value={search}
				placeholder="Search by name or description…"
				aria-label="Search assets"
			/>
			<button
				class="ap-filter-toggle"
				class:ap-filter-toggle--active={activeCategories.size > 0}
				onclick={() => (filtersOpen = !filtersOpen)}
				aria-expanded={filtersOpen}
			>Filters{#if activeCategories.size > 0}&nbsp;<span class="ap-filter-badge">{activeCategories.size}</span>{/if} {filtersOpen ? '▲' : '▼'}</button>
		</div>
		{#if filtersOpen}
			<div class="ap-filter-panel">
				<div class="ap-filter-chips">
					{#each visibleCategories as cat}
						<button
							class="ap-filter-tag"
							class:active={activeCategories.has(cat)}
							style="--tag-color: {CAT_COLOR[cat]}"
							onclick={() => toggleCategory(cat)}
						>{cat}</button>
					{/each}
				</div>
				<button
					class="ap-clear-btn"
					onclick={clearFilters}
					disabled={!hasActiveFilters}
					use:tooltip={'Clear all filters'}
					aria-label="Clear filters"
				>{@html clearFiltersSvg}</button>
			</div>
		{/if}
	</div>

	<!-- Scrollable body — only this part scrolls -->
	<div class="picker-body">
		{#if isAssetsLoading()}
			<p class="picker-hint">Loading catalogue…</p>
		{:else if filtered.length === 0}
			<p class="picker-hint">No assets match your search.</p>
		{:else}
			<div class="pick-grid">
				{#each filtered as asset (asset.id)}
					{@const owned    = ownedIds.includes(asset.id)}
					{@const blocked  = preconditionFailure(asset)}
					{@const catColor = CAT_COLOR[asset.category] ?? 'var(--text-muted)'}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="pick-tile"
						class:pick-tile-owned={owned}
						class:pick-tile-blocked={!!blocked && !owned}
						style:--tile-color={catColor}
						use:tooltip={blocked && !owned ? blocked : ''}
						onclick={() => { if (!owned && !blocked) tryAdd(asset); }}
						onkeydown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !owned && !blocked) tryAdd(asset); }}
						tabindex={owned || !!blocked ? -1 : 0}
						role="button"
						aria-disabled={owned || !!blocked}
					>
						<!-- Category badge — top right, coloured -->
						<span class="tile-badge" style:background={catColor}>
							{asset.category}
						</span>

						<div class="tile-name">
							<span class="tile-name-icon" aria-hidden="true" style:color={catColor}>{@html assetIcon(asset)}</span>
							{asset.name}
						</div>

						{#if asset.summary}
							<div class="tile-desc">{stripMdLinks(asset.summary)}</div>
						{:else if asset.preamble}
							<div class="tile-desc">{stripMdLinks(asset.preamble)}</div>
						{/if}

						{#if owned}
							<div class="tile-acquired">Acquired</div>
						{:else if blocked}
							<div class="tile-req">{blocked}</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>
</dialog>

<style>
	/* ================================================================
	   Main picker dialog — fixed height, never resizes
	   ================================================================ */
	.picker-dialog {
		border: none;
		padding: 0;
		border-radius: 8px;
		background: var(--bg-card);
		color: var(--text);
		width: min(760px, calc(100vw - 2rem));
		/* Fixed height — content scrolls inside, dialog never bounces */
		height: min(82vh, 720px);
		display: flex;
		flex-direction: column;
		box-shadow: 0 16px 48px #00000070, 0 0 0 1px var(--border-mid);
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		outline: none;
		overflow: hidden;
	}

	.picker-dialog::backdrop {
		background: #00000055;
		backdrop-filter: blur(2px);
	}

	/* ---- Header — mirrors OraclesDialog .od-header style ---- */
	.picker-header {
		display:         flex;
		align-items:     center;
		gap:             8px;
		padding:         10px 14px;
		border-bottom:   1px solid var(--border);
		background:      var(--bg-control);
		border-radius:   10px 10px 0 0;
		flex-shrink:     0;
	}

	.picker-title {
		font-family:    var(--font-display);
		font-size:      calc(0.78rem * var(--font-display-scale));
		font-weight:    var(--font-display-weight);
		font-variant:   var(--font-display-variant);
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color:          var(--text-accent);
		flex:           1;
	}

	.close-btn {
		background: transparent;
		border: none;
		color: var(--text-dimmer);
		cursor: pointer;
		font-size: 0.9rem;
		line-height: 1;
		padding: 2px 5px;
		border-radius: 3px;
		font-family: var(--font-ui);
		transition: color 0.12s;
	}
	.close-btn:hover { color: var(--text); }

	/* ---- Controls: category tabs + search — pinned, never scrolls ---- */
	.picker-controls {
		display:       flex;
		flex-direction: column;
		gap:           6px;
		padding:       9px 16px 8px;
		border-bottom: 1px solid var(--border);
		flex-shrink:   0;
		background:    var(--bg-card);
	}

	.ap-search-row {
		display:     flex;
		align-items: center;
		gap:         6px;
	}

	.search-input {
		flex:        1;
		font-family: var(--font-ui);
		font-size:   0.82rem;
		padding:     5px 9px;
		min-width:   0;
	}

	.ap-filter-toggle {
		font-family:    var(--font-ui);
		font-size:      0.72rem;
		font-weight:    600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding:        3px 10px;
		border-radius:  12px;
		border:         1px solid var(--border);
		background:     transparent;
		color:          var(--text-dimmer);
		cursor:         pointer;
		transition:     border-color 0.1s, color 0.1s;
		display:        flex;
		align-items:    center;
		gap:            4px;
		flex-shrink:    0;
	}
	.ap-filter-toggle:hover { color: var(--text); border-color: var(--border-mid); }
	.ap-filter-toggle--active { color: var(--accent); border-color: var(--accent); }

	.ap-filter-badge {
		display:          inline-flex;
		align-items:      center;
		justify-content:  center;
		background:       var(--accent);
		color:            #fff;
		font-size:        0.6rem;
		font-weight:      700;
		width:            14px;
		height:           14px;
		border-radius:    50%;
	}

	.ap-filter-panel {
		position:      relative;
		padding:       6px 8px;
		background:    var(--bg-inset);
		border:        1px solid var(--border);
		border-radius: 6px;
	}
	.ap-filter-chips {
		display:       flex;
		flex-wrap:     wrap;
		gap:           4px;
		padding-right: 26px;
	}
	.ap-filter-tag {
		font-family:    var(--font-ui);
		font-size:      0.6rem;
		font-weight:    600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color:          var(--tag-color, var(--text-dimmer));
		background:     transparent;
		border:         1px solid color-mix(in srgb, var(--tag-color, var(--border)) 40%, transparent);
		border-radius:  10px;
		padding:        2px 8px;
		cursor:         pointer;
		white-space:    nowrap;
		transition:     background 0.12s, color 0.12s;
	}
	.ap-filter-tag:hover {
		background: color-mix(in srgb, var(--tag-color, var(--border)) 12%, transparent);
	}
	.ap-filter-tag.active {
		background:   color-mix(in srgb, var(--tag-color, var(--border)) 18%, transparent);
		border-color: var(--tag-color, var(--border));
	}
	.ap-clear-btn {
		position:      absolute;
		bottom:        6px;
		right:         6px;
		background:    transparent;
		border:        none;
		color:         var(--text-dimmer);
		cursor:        pointer;
		padding:       3px 4px;
		border-radius: 3px;
		display:       flex;
		align-items:   center;
		transition:    color 0.12s, opacity 0.12s;
	}
	.ap-clear-btn:hover:not(:disabled) { color: var(--text); }
	.ap-clear-btn:disabled { opacity: 0.25; cursor: not-allowed; }
	.ap-clear-btn :global(svg) { width: 16px; height: 16px; fill: currentColor; }

	/* ---- Scrollable body ---- */
	.picker-body {
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 12px 16px;
		flex: 1;
		min-height: 0;
	}

	.picker-hint {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		color: var(--text-dimmer);
		font-style: italic;
		text-align: center;
		padding: 2rem 0;
	}

	/* ---- Tile grid ---- */
	.pick-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
		gap: 8px;
	}

	.pick-tile {
		position: relative;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		/* Coloured top border matching the category */
		border-top: 3px solid var(--tile-color);
		border-radius: 5px;
		padding: 28px 9px 9px; /* top padding clears the badge */
		display: flex;
		flex-direction: column;
		gap: 5px;
		cursor: pointer;
		transition: border-color 0.12s, background 0.12s;
		outline: none;
	}
	.pick-tile:hover:not(.pick-tile-owned):not(.pick-tile-blocked) {
		border-color: var(--tile-color);
		background: color-mix(in srgb, var(--tile-color) 6%, var(--bg-inset));
	}
	.pick-tile:focus-visible {
		box-shadow: 0 0 0 2px var(--tile-color);
	}
	.pick-tile-owned {
		opacity: 0.45;
		cursor: default;
	}
	.pick-tile-blocked {
		opacity: 0.38;
		cursor: not-allowed;
	}

	/* Category badge — coloured pill, absolute top-right */
	.tile-badge {
		position:       absolute;
		top:            6px;
		right:          7px;
		font-family:    var(--font-ui);
		font-size:      0.58rem;
		font-weight:    700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color:          #fff;
		padding:        2px 6px;
		border-radius:  8px;
		white-space:    nowrap;
		line-height:    1.3;
	}
	.tile-name-icon {
		display:         inline-flex;
		align-items:     center;
		justify-content: center;
		width:           1em;
		height:          1em;
		flex-shrink:     0;
		vertical-align:  -0.12em;
		margin-right:    5px;
	}
	.tile-name-icon :global(svg) { width: 100%; height: 100%; fill: currentColor; }
	.tile-name-icon :global(svg path) { fill: currentColor; }

	.tile-name {
		font-family: var(--font-ui);
		font-size: 0.84rem;
		font-weight: 700;
		color: var(--text);
		/* leave room for the badge */
		padding-right: 4px;
	}

	.tile-desc {
		font-family: var(--font-ui);
		font-size: 0.71rem;
		color: var(--text-muted);
		line-height: 1.4;
		font-style: italic;
		flex: 1;
	}

	.tile-acquired {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--text-dimmer);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-top: auto;
	}

	.tile-req {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		color: var(--color-danger);
		font-style: italic;
		margin-top: auto;
	}
</style>
