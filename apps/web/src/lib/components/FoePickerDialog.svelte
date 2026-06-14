<script lang="ts">
	/**
	 * FoePickerDialog — two-step modal for selecting a foe to add to combat.
	 *
	 * Step 1 (picker): search + nature/source filters + tile grid.
	 * Step 2 (confirm): portrait, quantity radio, effective rank, Add / Back.
	 *
	 * Usage:
	 *   <FoePickerDialog bind:this={foePickerRef} onSelect={handleFoeSelected} />
	 *   foePickerRef.open();
	 *
	 * onSelect is called with (foeDef, quantity, effectiveRank) when confirmed.
	 */

	import type { FoeDef, FoeQuantity, CatalogueSource } from '$lib/types.js';
	import {
		loadFoes,
		getFoes,
		getVisibleFoes,
		getFoeNatures,
		getVisibleFoeSources,
		foeSource,
		effectiveRank as calcEffectiveRank,
		resolveFoeDescription,
		RANK_COLORS,
		FOE_RANKS,
		FOE_QUANTITIES,
		FOE_NATURE_COLORS,
	} from '$lib/foeStore.svelte.js';
	import { sourceLabel } from '$lib/expansionStore.svelte.js';
	import { rankBadgeStyle } from '$lib/badgeStyles.js';
	import { headingText } from '$lib/fontStore.svelte.js';
	import { draggable } from '$lib/actions/draggable.js';
	import DialogHeader from '$lib/components/DialogHeader.svelte';
	import { tooltip } from '$lib/actions/tooltip.js';
	import { foePortraitUrl, UNKNOWN_FOE_PORTRAIT } from '$lib/foePortrait.js';
	import FoeImageCarousel from '$lib/components/FoeImageCarousel.svelte';
	import clearFiltersSvg from '$icons/filter-circle-xmark-solid-full.svg?raw';
	import searchIconSvg from '$icons/magnifying-glass-solid-full.svg?raw';
	import { foeIcon } from '$lib/iconRegistry.js';

	// ---------------------------------------------------------------------------
	// Props
	// ---------------------------------------------------------------------------
	let {
		onSelect,
		onDenizenPick,
	}: {
		onSelect: (foeDef: FoeDef, quantity: FoeQuantity, effectiveRank: number) => void;
		/** Called when a foe is picked in denizen mode (name only, no quantity). */
		onDenizenPick?: (foeName: string) => void;
	} = $props();

	// ---------------------------------------------------------------------------
	// Dialog state
	// ---------------------------------------------------------------------------
	let dialogEl = $state<HTMLDialogElement | null>(null);
	let view = $state<'picker' | 'confirm'>('picker');
	let confirmFoe = $state<FoeDef | null>(null);
	let quantity = $state<FoeQuantity>('solo');
	let _mode = $state<'encounter' | 'denizen'>('encounter');
	let _noBack = $state(false);

	let search = $state('');
	let filtersOpen = $state(false);
	let activeNatures = $state(new Set<string>());
	let activeSources = $state(new Set<CatalogueSource>());
	let activeRanks = $state(new Set<number>());

	// Pickers use getVisibleFoes (expansion-filtered); direct lookups use getFoes.
	const foes = $derived(getVisibleFoes());
	const natures = $derived(getFoeNatures());
	const sources = $derived(getVisibleFoeSources());

	const rankAdj = $derived(FOE_QUANTITIES.find((q) => q.value === quantity)?.rankAdj ?? 0);
	const effRank = $derived(confirmFoe ? calcEffectiveRank(confirmFoe.rank, rankAdj) : 1);
	const rankInfo = $derived(FOE_RANKS[effRank]);

	// ---------------------------------------------------------------------------
	// Filtering
	// ---------------------------------------------------------------------------
	const filtered = $derived(() => {
		const q = search.trim().toLowerCase();
		return foes.filter((f) => {
			if (activeNatures.size > 0 && !activeNatures.has(f.nature)) return false;
			if (activeSources.size > 0 && !activeSources.has(foeSource(f))) return false;
			if (activeRanks.size > 0 && !activeRanks.has(f.rank)) return false;
			if (q) {
				const nameMatch = f.name.toLowerCase().includes(q);
				const featureMatch = f.features.some((ft) => ft.toLowerCase().includes(q));
				if (!nameMatch && !featureMatch) return false;
			}
			return true;
		});
	});

	const hasActiveFilters = $derived(
		search.trim() !== '' ||
			activeNatures.size > 0 ||
			activeSources.size > 0 ||
			activeRanks.size > 0,
	);
	const activeFilterCount = $derived(activeNatures.size + activeSources.size + activeRanks.size);

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------
	export async function open(): Promise<void> {
		await loadFoes();
		_mode = 'encounter';
		_noBack = false;
		view = 'picker';
		search = '';
		filtersOpen = false;
		activeNatures = new Set();
		activeSources = new Set();
		activeRanks = new Set();
		confirmFoe = null;
		quantity = 'solo';
		dialogEl?.showModal();
	}

	/** Open in denizen-pick mode: clicking a foe returns just the name, no confirm step. */
	export async function openForDenizen(): Promise<void> {
		await loadFoes();
		_mode = 'denizen';
		view = 'picker';
		search = '';
		filtersOpen = false;
		activeNatures = new Set();
		activeSources = new Set();
		activeRanks = new Set();
		confirmFoe = null;
		quantity = 'solo';
		dialogEl?.showModal();
	}

	/** Open directly to the confirm view for a foe matched by name (for denizen roll results). */
	export async function openWithFoe(foeName: string): Promise<void> {
		await loadFoes();
		const match = getFoes().find((f) => f.name.toLowerCase() === foeName.toLowerCase());
		if (!match) return;
		_mode = 'encounter';
		_noBack = true;
		quantity = 'solo';
		confirmFoe = match;
		view = 'confirm';
		dialogEl?.showModal();
	}

	export function close(): void {
		dialogEl?.close();
	}

	// ---------------------------------------------------------------------------
	// Handlers
	// ---------------------------------------------------------------------------
	function toggleNature(n: string) {
		const next = new Set(activeNatures);
		if (next.has(n)) next.delete(n);
		else next.add(n);
		activeNatures = next;
	}

	function toggleSource(s: CatalogueSource) {
		const next = new Set(activeSources);
		if (next.has(s)) next.delete(s);
		else next.add(s);
		activeSources = next;
	}

	function clearFilters() {
		search = '';
		activeNatures = new Set();
		activeSources = new Set();
		activeRanks = new Set();
	}

	function toggleRank(r: number) {
		const next = new Set(activeRanks);
		if (next.has(r)) next.delete(r);
		else next.add(r);
		activeRanks = next;
	}

	function selectFoe(foe: FoeDef) {
		if (_mode === 'denizen') {
			dialogEl?.close();
			onDenizenPick?.(foe.name);
			return;
		}
		confirmFoe = foe;
		quantity = 'solo';
		view = 'confirm';
	}

	function goBack() {
		view = 'picker';
	}

	function confirm() {
		if (!confirmFoe) return;
		const qty = quantity;
		const er = effRank;
		dialogEl?.close();
		onSelect(confirmFoe, qty, er);
	}

	function natureBorderColor(nature: string): string {
		return FOE_NATURE_COLORS[nature as keyof typeof FOE_NATURE_COLORS] ?? '#7A9AB8';
	}

	// Grid tiles show just the primary image (index 0) — alternates are
	// only cycled in the confirm view carousel.
	function imageUrl(foe: { name: string; images?: string[] }): string {
		return foePortraitUrl(foe.name, foe.images);
	}
</script>

<dialog bind:this={dialogEl} class="foe-dialog" aria-label="Foe Picker">
	<!-- ===== PICKER VIEW ===== -->
	{#if view === 'picker'}
		<DialogHeader
			title={headingText(_mode === 'denizen' ? 'Pick a Denizen' : 'Choose a Foe')}
			onclose={close}
			radius="8px 8px 0 0"
		/>

		<div class="fd-controls">
			<div class="fd-search-row">
				<div class="fd-search-field">
					<span class="fd-search-icon" aria-hidden="true">{@html searchIconSvg}</span>
					<input
						type="search"
						class="fd-search"
						placeholder="Search by name or feature…"
						bind:value={search}
						aria-label="Search foes"
					/>
				</div>
				<button
					class="fd-filter-toggle"
					class:has-filters={activeFilterCount > 0}
					onclick={() => (filtersOpen = !filtersOpen)}
					aria-expanded={filtersOpen}
					>Filters{#if activeFilterCount > 0}&nbsp;<span class="fd-filter-badge"
							>{activeFilterCount}</span
						>{/if}
					{filtersOpen ? '▲' : '▼'}</button
				>
			</div>

			{#if filtersOpen}
				<div class="fd-filter-panel">
					<!-- Nature -->
					<div class="fd-filter-group">
						<span class="fd-filter-group-label">Nature</span>
						<div class="fd-filter-chips">
							{#each natures as nature}
								<button
									class="fd-filter-tag"
									class:active={activeNatures.has(nature)}
									style="--tag-color: {FOE_NATURE_COLORS[nature]}"
									onclick={() => toggleNature(nature)}>{nature}</button
								>
							{/each}
						</div>
					</div>
					<!-- Source -->
					<div class="fd-filter-group">
						<span class="fd-filter-group-label">Source</span>
						<div class="fd-filter-chips">
							{#each sources as src}
								<button
									class="fd-filter-tag fd-filter-tag--src"
									class:active={activeSources.has(src)}
									onclick={() => toggleSource(src)}>{sourceLabel(src)}</button
								>
							{/each}
						</div>
					</div>
					<!-- Rank -->
					<div class="fd-filter-group">
						<span class="fd-filter-group-label">Rank</span>
						<div class="fd-filter-chips">
							{#each Object.entries(FOE_RANKS) as [rankNum, rankDef]}
								{@const rc = RANK_COLORS[Number(rankNum)]}
								<button
									class="fd-filter-tag fd-filter-tag--rank"
									class:active={activeRanks.has(Number(rankNum))}
									style="--tag-bg:{rc.bg}; --tag-text:{rc.text}"
									onclick={() => toggleRank(Number(rankNum))}>{rankDef.label}</button
								>
							{/each}
						</div>
					</div>
					<button
						class="fd-clear-btn"
						onclick={clearFilters}
						disabled={!hasActiveFilters}
						use:tooltip={'Clear all filters'}
						aria-label="Clear filters">{@html clearFiltersSvg}</button
					>
				</div>
			{/if}
		</div>

		<div class="fd-grid-wrap">
			{#if filtered().length === 0}
				<div class="fd-empty">No foes match your filters.</div>
			{:else}
				<div class="fd-grid">
					{#each filtered() as foe (foe.id)}
						<!-- svelte-ignore a11y_interactive_supports_focus -->
						<div
							class="fd-tile"
							role="button"
							style="--nature-color: {natureBorderColor(foe.nature)}"
							onclick={() => selectFoe(foe)}
							onkeydown={(e) => e.key === 'Enter' && selectFoe(foe)}
							tabindex="0"
						>
							<div class="fd-tile-img-wrap">
								<img
									class="fd-tile-img"
									src={imageUrl(foe)}
									alt={foe.name}
									onerror={(e) => {
										(e.currentTarget as HTMLImageElement).src = UNKNOWN_FOE_PORTRAIT;
									}}
								/>
							</div>
							<div class="fd-tile-body">
								<span class="fd-tile-name-row">
									<span
										class="fd-tile-name-icon"
										aria-hidden="true"
										style:color={natureBorderColor(foe.nature)}>{@html foeIcon(foe)}</span
									>
									<span class="fd-tile-name">{foe.name}</span>
								</span>
								<div class="fd-tile-badges">
									<span
										class="fd-badge"
										style="background: {natureBorderColor(foe.nature)}22; color: {natureBorderColor(
											foe.nature,
										)}">{foe.nature}</span
									>
									<span class="fd-badge fd-badge--rank" style={rankBadgeStyle(foe.rank)}
										>{FOE_RANKS[foe.rank]?.label ?? foe.rank}</span
									>
								</div>
								{#if foe.features.length > 0}
									<div class="fd-tile-features">
										{foe.features.slice(0, 3).join(' · ')}
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- ===== CONFIRM VIEW ===== -->
	{:else if view === 'confirm' && confirmFoe}
		{@const natureColor = natureBorderColor(confirmFoe.nature)}
		{@const baseRankInfo = FOE_RANKS[confirmFoe.rank]}
		{@const resolvedDesc = resolveFoeDescription(confirmFoe)}

		<!-- Back bar -->
		<div class="fd-back-bar" style="--nature-color: {natureColor}" use:draggable>
			<span class="drag-grip" aria-hidden="true">⠿</span>
			<span class="fd-title">{headingText(confirmFoe.name)}</span>
		</div>

		<!-- Scrollable body -->
		<div class="fd-confirm-scroll">
			<!-- Top row: portrait + quantity/pills -->
			<div class="fd-confirm-top">
				<div class="fc-portrait-wrap">
					<FoeImageCarousel
						name={confirmFoe.name}
						images={confirmFoe.images}
						alt={confirmFoe.name}
						class="fc-portrait"
					/>
				</div>

				<div class="fd-qty-top">
					<fieldset class="fd-quantity-group">
						<legend class="fd-quantity-legend">Quantity</legend>
						{#each FOE_QUANTITIES as qty}
							<label class="fd-qty-label" class:selected={quantity === qty.value}>
								<input
									type="radio"
									name="foe-quantity"
									value={qty.value}
									checked={quantity === qty.value}
									onchange={() => (quantity = qty.value)}
								/>
								<span class="fd-qty-name">{qty.label}</span>
							</label>
						{/each}
					</fieldset>

					{#if rankInfo}
						{@const qtyDef = FOE_QUANTITIES.find((q) => q.value === quantity)}
						<div class="fd-confirm-pills">
							<span class="fd-badge" style="background: {natureColor}22; color: {natureColor}"
								>{confirmFoe.nature}</span
							>
							<span class="fd-badge fd-badge--rank" style={rankBadgeStyle(effRank)}
								>{rankInfo.label}</span
							>
							<span class="fd-stat-pill fd-stat-pill--harm">Harm: {rankInfo.harm}</span>
							<span class="fd-stat-pill fd-stat-pill--progress"
								>Progress: {rankInfo.progressPerHit}</span
							>
							<span class="fd-stat-pill fd-stat-pill--qty">{qtyDef?.label ?? quantity}</span>
						</div>
					{/if}
				</div>
			</div>

			<!-- Bottom: description + features/drives/tactics, always full width -->
			{#if resolvedDesc || confirmFoe.features.length > 0 || confirmFoe.drives.length > 0 || confirmFoe.tactics.length > 0}
				<div class="fd-confirm-bottom">
					{#if resolvedDesc}
						<p class="fc-desc" style="white-space: pre-line">{resolvedDesc}</p>
					{/if}
					{#if confirmFoe.features.length > 0}
						<div class="fc-section">
							<span class="fc-section-label">Features</span>
							<ul class="fc-list">
								{#each confirmFoe.features as feat}<li>{feat}</li>{/each}
							</ul>
						</div>
					{/if}
					{#if confirmFoe.drives.length > 0}
						<div class="fc-section">
							<span class="fc-section-label">Drives</span>
							<ul class="fc-list">
								{#each confirmFoe.drives as d}<li>{d}</li>{/each}
							</ul>
						</div>
					{/if}
					{#if confirmFoe.tactics.length > 0}
						<div class="fc-section">
							<span class="fc-section-label">Tactics</span>
							<ul class="fc-list">
								{#each confirmFoe.tactics as t}<li>{t}</li>{/each}
							</ul>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<div class="fd-footer">
			{#if !_noBack}
				<button class="btn back-btn" onclick={goBack} style="margin-right: auto">Back</button>
			{/if}
			<button class="btn" onclick={close}>Cancel</button>
			<button class="btn btn-primary" onclick={confirm}>Add to Foes</button>
		</div>
	{/if}
</dialog>

<style>
	/* ── Dialog shell ───────────────────────────────────────────────────── */
	.foe-dialog {
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-card);
		color: var(--text);
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
		/* Centre via top/left + transform; `inset: 0; margin: auto` collapses
		   the dialog to a thin line on iOS Safari when combined with an open-
		   state `display: flex` container. */
		position: fixed;
		top: 50%;
		left: 50%;
		margin: 0;
		transform: translate(-50%, -50%);
		width: min(640px, calc(100vw - 1rem));
		/* Definite height — fit-content + max-height collapses the flex:1 body
		   to near-zero on mobile (dialog only shows header + search bar). vh
		   (not dvh) for broader iOS Safari reliability. */
		height: min(85vh, 720px);
		overflow: hidden;
	}

	.foe-dialog[open] {
		display: flex;
		flex-direction: column;
	}

	.foe-dialog::backdrop {
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(2px);
	}

	/* ── Picker: header — mirrors AssetPicker .picker-header ────────────── */
	.fd-controls {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 9px 14px 8px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
		background: var(--bg-card);
	}

	.fd-title {
		font-family: var(--font-display);
		font-size: calc(0.78rem * var(--font-display-scale));
		font-weight: var(--font-display-weight);
		font-variant: var(--font-display-variant);
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color: var(--text-accent);
		flex: 1;
	}

	.fd-search-row {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.fd-search-field {
		flex: 1;
		min-width: 0;
		position: relative;
		display: flex;
		align-items: center;
	}
	.fd-search-icon {
		position: absolute;
		left: 9px;
		width: 13px;
		height: 13px;
		display: inline-flex;
		pointer-events: none;
		color: var(--text-dimmer);
	}
	.fd-search-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}

	.fd-search {
		flex: 1;
		min-width: 0;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		padding: 5px 10px 5px 29px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text);
	}
	.fd-search:focus {
		outline: none;
		border-color: var(--focus-ring);
		box-shadow: 0 0 0 2px var(--accent-glow);
	}

	.fd-clear-btn {
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
	.fd-clear-btn:hover:not(:disabled) {
		color: var(--text);
	}
	.fd-clear-btn:disabled {
		opacity: 0.25;
		cursor: not-allowed;
	}
	.fd-clear-btn :global(svg) {
		width: 16px;
		height: 16px;
		fill: currentColor;
	}

	/* ── Filter toggle + panel ──────────────────────────────────────────── */

	.fd-filter-toggle {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 3px 10px;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-dimmer);
		cursor: pointer;
		transition:
			border-color 0.1s,
			color 0.1s;
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.fd-filter-toggle:hover,
	.fd-filter-toggle[aria-expanded='true'] {
		border-color: var(--text-muted);
		color: var(--text-muted);
	}
	.fd-filter-toggle.has-filters {
		border-color: var(--focus-ring);
		color: var(--text);
	}

	.fd-filter-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: 8px;
		background: var(--focus-ring);
		color: var(--bg-card);
		font-size: 0.65rem;
		font-weight: 700;
		line-height: 1;
	}

	.fd-filter-panel {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 32px 8px 10px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 6px;
	}

	.fd-filter-group {
		display: flex;
		align-items: baseline;
		gap: 8px;
		min-width: 0;
	}

	.fd-filter-group-label {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		flex-shrink: 0;
		width: 3.5rem;
	}

	.fd-filter-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		flex: 1;
	}

	.fd-filter-tag {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 3px 8px;
		border-radius: 12px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-dimmer);
		cursor: pointer;
		transition:
			background 0.1s,
			color 0.1s,
			border-color 0.1s;
	}
	.fd-tile-name-row {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}
	.fd-tile-name-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}
	.fd-tile-name-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.fd-tile-name-icon :global(svg path) {
		fill: currentColor;
	}
	.fd-filter-tag:hover {
		border-color: var(--tag-color, var(--text-dimmer));
		color: var(--tag-color, var(--text-dimmer));
	}
	.fd-filter-tag.active {
		background: color-mix(in srgb, var(--tag-color, #9ca3af) 20%, transparent);
		border-color: var(--tag-color, #9ca3af);
		color: var(--tag-color, #9ca3af);
	}
	.fd-filter-tag--src {
		--tag-color: var(--text-muted);
	}

	/* Rank chiclets — plain outline when inactive (like nature pills);
	   tinted bg + rank hue text when active (matching tile badges) */
	.fd-filter-tag--rank.active {
		background: color-mix(in srgb, var(--tag-bg) 13%, transparent);
		border-color: color-mix(in srgb, var(--tag-bg) 35%, transparent);
		color: var(--tag-bg);
	}

	/* ── Tile grid ──────────────────────────────────────────────────────── */
	.fd-grid-wrap {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		min-height: 0;
		padding: 0.75rem 1rem;
	}

	.fd-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 8px;
	}

	.fd-tile {
		border: 1px solid var(--border);
		border-left: 4px solid var(--nature-color, #9ca3af);
		border-radius: 5px;
		background: var(--bg-card);
		cursor: pointer;
		overflow: hidden;
		transition:
			border-color 0.1s,
			box-shadow 0.1s;
		display: flex;
		flex-direction: column;
	}
	.fd-tile:hover,
	.fd-tile:focus {
		border-color: var(--nature-color, #9ca3af);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		outline: none;
	}

	.fd-tile-img-wrap {
		width: 100%;
		aspect-ratio: 4/3;
		overflow: hidden;
		background: rgba(255, 255, 255, 0.04);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.fd-tile-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.fd-tile-body {
		padding: 6px 8px 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.fd-tile-name {
		font-family: var(--font-display);
		font-size: calc(0.78rem * var(--font-display-scale));
		font-weight: var(--font-display-weight);
		font-variant: var(--font-display-variant);
		letter-spacing: 0.04em;
		color: var(--text);
		line-clamp: 1;
		-webkit-line-clamp: 1;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.fd-tile-badges {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}

	.fd-tile-features {
		font-family: var(--font-ui);
		font-size: 0.64rem;
		color: var(--text-dimmer);
		line-clamp: 2;
		-webkit-line-clamp: 2;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* ── Badges ─────────────────────────────────────────────────────────── */
	.fd-badge {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: 10px;
		border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
	}
	.fd-badge--rank {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-muted);
	}

	/* ── Empty state ────────────────────────────────────────────────────── */
	.fd-empty {
		text-align: center;
		padding: 3rem 1rem;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		font-style: italic;
		color: var(--text-dimmer);
	}

	/* ── Footer ─────────────────────────────────────────────────────────── */
	.fd-footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 0.6rem 1rem;
		border-top: 1px solid var(--border);
		flex-shrink: 0;
	}

	/* ── Confirm view: back bar ─────────────────────────────────────── */
	.fd-back-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		border-top: 3px solid var(--nature-color, #9ca3af);
		background: var(--bg-control);
		border-radius: 8px 8px 0 0;
		flex-shrink: 0;
	}

	.fd-back-bar .fd-title {
		flex: 1;
	}

	/* ── Scrollable confirm body ─────────────────────────────────────── */
	.fd-confirm-scroll {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		min-height: 0;
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* ── Confirm scroll contents ────────────────────────────────────── */
	.fd-confirm-scroll {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* Top row: single column on mobile, two columns on desktop */
	.fd-confirm-top {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	@media (min-width: 520px) {
		.fd-confirm-top {
			flex-direction: row;
			align-items: flex-start;
			gap: 0.85rem;
		}
		.fc-portrait-wrap {
			flex: 0 0 45%;
			max-width: 45%;
		}
		.fd-qty-top {
			flex: 1;
		}
	}

	.fc-portrait-wrap {
		width: 100%;
	}

	:global(.fc-portrait) {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: 6px;
		border: 1px solid var(--border-mid);
		display: block;
	}

	/* Bottom section: always full width */
	.fd-confirm-bottom {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	/* ── Right col: quantity + pills ─────────────────────────────────── */

	.fc-desc {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		line-height: 1.55;
		color: var(--text-muted);
		margin: 0;
	}

	.fc-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.fc-section-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}

	.fc-list {
		margin: 0;
		padding-left: 1.2em;
		list-style: disc;
	}
	.fc-list li {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
		margin-bottom: 1px;
	}

	.fd-qty-top {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-width: 0;
	}

	/* ── Quantity selector ──────────────────────────────────────────────── */
	.fd-quantity-group {
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.35rem 0.6rem 0.5rem;
		margin: 0;
	}

	.fd-quantity-legend {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		padding: 0 4px;
	}

	.fd-qty-label {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 4px;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.1s;
	}
	.fd-qty-label:hover {
		background: rgba(255, 255, 255, 0.05);
	}
	.fd-qty-label.selected {
		background: rgba(255, 255, 255, 0.08);
	}

	.fd-qty-label input[type='radio'] {
		flex-shrink: 0;
		accent-color: var(--text-accent);
	}

	.fd-qty-name {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text);
	}

	/* ── Confirm pills row (below quantity group) ────────────────────────── */
	.fd-confirm-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}

	.fd-stat-pill {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: 10px;
	}
	.fd-stat-pill--harm {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
		border: 1px solid rgba(239, 68, 68, 0.25);
	}
	.fd-stat-pill--progress {
		background: rgba(59, 130, 246, 0.1);
		color: #60a5fa;
		border: 1px solid rgba(59, 130, 246, 0.25);
	}
	.fd-stat-pill--qty {
		background: rgba(255, 255, 255, 0.08);
		color: var(--text-muted);
		border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
	}
</style>
