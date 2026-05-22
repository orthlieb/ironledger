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
	let dialogEl        = $state<HTMLDialogElement | null>(null);
	let confirmDialogEl = $state<HTMLDialogElement | null>(null);
	let pendingAsset    = $state<AssetDefinition | null>(null);

	let confirmDragX   = $state(0);
	let confirmDragY   = $state(0);
	let _cdDragging    = false;
	let _cdStartMouseX = 0;
	let _cdStartMouseY = 0;
	let _cdStartDragX  = 0;
	let _cdStartDragY  = 0;

	$effect(() => { if (dialogEl) dialogEl.showModal(); });
	$effect(() => {
		if (confirmDialogEl && pendingAsset) {
			confirmDragX = 0;
			confirmDragY = 0;
			confirmDialogEl.showModal();
		}
	});

	function startConfirmDrag(e: MouseEvent) {
		_cdDragging    = true;
		_cdStartMouseX = e.clientX;
		_cdStartMouseY = e.clientY;
		_cdStartDragX  = confirmDragX;
		_cdStartDragY  = confirmDragY;
		e.preventDefault();
		window.addEventListener('mousemove', onConfirmDragMove);
		window.addEventListener('mouseup',   onConfirmDragEnd);
	}

	function onConfirmDragMove(e: MouseEvent) {
		if (!_cdDragging) return;
		confirmDragX = _cdStartDragX + (e.clientX - _cdStartMouseX);
		confirmDragY = _cdStartDragY + (e.clientY - _cdStartMouseY);
	}

	function onConfirmDragEnd() {
		_cdDragging = false;
		window.removeEventListener('mousemove', onConfirmDragMove);
		window.removeEventListener('mouseup',   onConfirmDragEnd);
	}

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
	// Add flow
	// ---------------------------------------------------------------------------
	function tryAdd(def: AssetDefinition) {
		pendingAsset = def;
	}

	function confirmAdd() {
		if (pendingAsset) {
			onAdd(pendingAsset.id);
			confirmDialogEl?.close();
			pendingAsset = null;
		}
	}

	function cancelAdd() {
		confirmDialogEl?.close();
		pendingAsset = null;
	}

	// ---------------------------------------------------------------------------
	// Ability text renderer (mirrors AssetCard.formatText)
	// ---------------------------------------------------------------------------
	/** Strips markdown-style links [text](anything) → text, for plain-text contexts. */
	function stripMdLinks(raw: string): string {
		return raw.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
	}

	function formatText(raw: string): string {
		return raw
			.split('\n\n')
			.map((para) => {
				const lines = para.split('\n');
				if (lines.some((l) => /^\s*\*\s/.test(l))) {
					const items = lines
						.filter((l) => /^\s*\*\s/.test(l))
						.map((l) => `<li>${l.replace(/^\s*\*\s/, '').trim()}</li>`)
						.join('');
					return `<ul>${items}</ul>`;
				}
				return `<p>${para.trim()}</p>`;
			})
			.join('');
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
					title="Clear all filters"
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
						title={blocked && !owned ? blocked : undefined}
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

						<div class="tile-name">{asset.name}</div>

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

<!-- ======================================================================
     Asset detail dialog — mirrors an expanded AssetCard
     ====================================================================== -->
{#if pendingAsset}
	{@const catColor = CAT_COLOR[pendingAsset.category] ?? 'var(--text-muted)'}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<dialog
		bind:this={confirmDialogEl}
		class="confirm-dialog"
		style:--accent={catColor}
		style:transform="translate(calc(-50% + {confirmDragX}px), calc(-50% + {confirmDragY}px))"
		oncancel={cancelAdd}
	>
		<!-- Header: mirrors .asset-header from AssetCard; also serves as drag handle -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="asset-header" style="border-top: 3px solid {catColor}" onmousedown={startConfirmDrag}>
			<span class="drag-grip" aria-hidden="true">⠿</span>
			<div class="asset-name-group">
				<span class="asset-name">{pendingAsset.name}</span>
				<span class="asset-cat" style:color={catColor}>{pendingAsset.category}</span>
			</div>
			<span class="ability-tally">0/{pendingAsset.abilities.length}</span>
		</div>

		<!-- Body: mirrors .asset-body — scrollable, read-only -->
		<div class="asset-body">
			{#if pendingAsset.preamble}
				<p class="asset-preamble">{@html stripMdLinks(pendingAsset.preamble)}</p>
			{/if}

			<div class="abilities-list">
				{#each pendingAsset.abilities as ab}
					<div class="ability-row" class:ability-enabled={ab.enabled}>
						<input
							type="checkbox"
							class="ability-check"
							checked={ab.enabled}
							disabled
							aria-label={ab.enabled ? 'Unlocked by default' : 'Locked — costs 2 XP'}
						/>
						<div class="ability-text">
							{#if ab.name}
								<span class="ability-name">{ab.name}.</span>
							{/if}
							{@html formatText(ab.text)}
						</div>
					</div>
				{/each}
			</div>

			{#if pendingAsset.postamble}
				<p class="asset-postamble">{pendingAsset.postamble}</p>
			{/if}
		</div>

		<!-- Footer -->
		<div class="cd-footer">
			<button class="btn" onclick={cancelAdd}>Cancel</button>
			<button class="btn btn-primary" onclick={confirmAdd}>Add to Character</button>
		</div>
	</dialog>
{/if}

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
		position: absolute;
		top: 6px;
		right: 7px;
		font-family: var(--font-ui);
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: #fff;
		padding: 2px 6px;
		border-radius: 8px;
		white-space: nowrap;
		line-height: 1.3;
	}

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

	/* ================================================================
	   Asset detail dialog — mirrors expanded AssetCard.
	   No flex container — children flow naturally and the .asset-body
	   carries the scroll cap directly. A `display: flex` + `min-height: 0`
	   chain on a `<dialog>` collapses to a thin horizontal strip on iOS
	   Safari (same bug as #11/#12).
	   ================================================================ */
	.confirm-dialog {
		border: none;
		border-radius: 6px;
		padding: 0;
		background: var(--bg-inset);
		color: var(--text);
		width: min(460px, calc(100vw - 2rem));
		max-height: 82vh;
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		position: fixed;
		top: 50%;
		left: 50%;
		margin: 0;
		outline: none;
		overflow: hidden;
	}
	.confirm-dialog::backdrop {
		background: #00000050;
		backdrop-filter: blur(1px);
	}

	/* ── Mirrors AssetCard .asset-header ── */
	.asset-header {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 7px 10px;
		background: var(--bg-control);
		cursor: grab;
		user-select: none;
	}
	.asset-header:active { cursor: grabbing; }

	.asset-name-group {
		flex: 1;
		display: flex;
		align-items: baseline;
		gap: 8px;
		min-width: 0;
		overflow: hidden;
	}

	.asset-name {
		font-family: var(--font-ui);
		font-size: 0.86rem;
		font-weight: 700;
		letter-spacing: 0.03em;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.asset-cat {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		flex-shrink: 0;
		white-space: nowrap;
	}

	.ability-tally {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		color: var(--text-dimmer);
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
	}

	/* ── Mirrors AssetCard .asset-body ──
	   The dialog has no flex container, so cap the body's height directly
	   (dialog 82vh minus header + footer ≈ 6rem) and scroll it internally. */
	.asset-body {
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-height: calc(82vh - 6rem);
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.asset-preamble {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-style: italic;
		color: var(--text-muted);
		line-height: 1.4;
		margin: 0;
	}

	/* ── Mirrors AssetCard .abilities-list / .ability-row ── */
	.abilities-list {
		display: flex;
		flex-direction: column;
		gap: 7px;
	}

	.ability-row {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 6px 8px;
		border-radius: 4px;
		border: 1px solid var(--border);
		background: var(--bg);
		cursor: default;
	}

	.ability-check {
		flex-shrink: 0;
		margin-top: 2px;
		accent-color: var(--text-accent);
		cursor: default;
	}

	.ability-enabled {
		background: color-mix(in srgb, var(--text-accent) 6%, var(--bg));
		border-color: color-mix(in srgb, var(--text-accent) 30%, var(--border));
	}

	.ability-text {
		flex: 1;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
		line-height: 1.45;
	}

	.ability-text :global(p)           { margin: 0 0 4px; }
	.ability-text :global(p:last-child){ margin-bottom: 0; }
	.ability-text :global(ul)          { margin: 4px 0 0; padding-left: 1.2em; }
	.ability-text :global(li)          { margin-bottom: 2px; }
	.ability-text :global(a.move-link) { color: var(--text-accent); text-decoration: underline; }

	.ability-name {
		font-weight: 700;
		color: var(--text);
		margin-right: 2px;
	}

	.asset-postamble {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text-dimmer);
		font-style: italic;
		line-height: 1.45;
		margin: 0;
	}

	/* ── Footer ── */
	.cd-footer {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
		padding: 10px 12px;
		border-top: 1px solid var(--border);
		background: var(--bg-card);
	}

	.btn-primary {
		background: var(--text-accent);
		border-color: var(--text-accent);
		color: var(--bg-card);
		font-weight: 600;
	}
	.btn-primary:hover { opacity: 0.88; }
</style>
