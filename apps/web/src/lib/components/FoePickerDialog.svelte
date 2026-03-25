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

	import type { FoeDef, FoeQuantity } from '$lib/types.js';
	import {
		loadFoes, getFoes, getFoeNatures, getFoeSources,
		foeSource, effectiveRank as calcEffectiveRank,
		FOE_RANKS, FOE_QUANTITIES, FOE_NATURE_COLORS,
	} from '$lib/foeStore.svelte.js';
	import clearFiltersSvg from '$icons/filter-circle-xmark-solid-full.svg?raw';

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
	let dialogEl   = $state<HTMLDialogElement | null>(null);
	let view       = $state<'picker' | 'confirm'>('picker');
	let confirmFoe = $state<FoeDef | null>(null);
	let quantity   = $state<FoeQuantity>('solo');
	let _mode      = $state<'encounter' | 'denizen'>('encounter');

	let search        = $state('');
	let activeNatures = $state(new Set<string>());
	let activeSources = $state(new Set<string>());

	const foes    = $derived(getFoes());
	const natures = $derived(getFoeNatures());
	const sources = $derived(getFoeSources());

	const rankAdj    = $derived(FOE_QUANTITIES.find((q) => q.value === quantity)?.rankAdj ?? 0);
	const effRank    = $derived(confirmFoe ? calcEffectiveRank(confirmFoe.rank, rankAdj) : 1);
	const rankInfo   = $derived(FOE_RANKS[effRank]);

	// ---------------------------------------------------------------------------
	// Filtering
	// ---------------------------------------------------------------------------
	const filtered = $derived(() => {
		const q = search.trim().toLowerCase();
		return foes.filter((f) => {
			if (activeNatures.size > 0 && !activeNatures.has(f.nature))  return false;
			if (activeSources.size > 0 && !activeSources.has(foeSource(f))) return false;
			if (q) {
				const nameMatch     = f.name.toLowerCase().includes(q);
				const featureMatch  = f.features.some((ft) => ft.toLowerCase().includes(q));
				if (!nameMatch && !featureMatch) return false;
			}
			return true;
		});
	});

	const hasActiveFilters = $derived(search.trim() !== '' || activeNatures.size > 0 || activeSources.size > 0);

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------
	export async function open(): Promise<void> {
		await loadFoes();
		_mode    = 'encounter';
		view     = 'picker';
		search   = '';
		activeNatures = new Set();
		activeSources = new Set();
		confirmFoe = null;
		quantity   = 'solo';
		dialogEl?.showModal();
	}

	/** Open in denizen-pick mode: clicking a foe returns just the name, no confirm step. */
	export async function openForDenizen(): Promise<void> {
		await loadFoes();
		_mode    = 'denizen';
		view     = 'picker';
		search   = '';
		activeNatures = new Set();
		activeSources = new Set();
		confirmFoe = null;
		quantity   = 'solo';
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
		if (next.has(n)) next.delete(n); else next.add(n);
		activeNatures = next;
	}

	function toggleSource(s: string) {
		const next = new Set(activeSources);
		if (next.has(s)) next.delete(s); else next.add(s);
		activeSources = next;
	}

	function clearFilters() {
		search        = '';
		activeNatures = new Set();
		activeSources = new Set();
	}

	function selectFoe(foe: FoeDef) {
		if (_mode === 'denizen') {
			dialogEl?.close();
			onDenizenPick?.(foe.name);
			return;
		}
		confirmFoe = foe;
		quantity   = 'solo';
		view       = 'confirm';
	}

	function goBack() {
		view = 'picker';
	}

	function confirm() {
		if (!confirmFoe) return;
		const qty = quantity;
		const er  = effRank;
		dialogEl?.close();
		onSelect(confirmFoe, qty, er);
	}

	function natureBorderColor(nature: string): string {
		return FOE_NATURE_COLORS[nature as keyof typeof FOE_NATURE_COLORS] ?? '#9ca3af';
	}

	function imageUrl(name: string): string {
		return `/foes/${encodeURIComponent(name)}.webp`;
	}
</script>

<dialog
	bind:this={dialogEl}
	class="foe-dialog"
	aria-label="Foe Picker"
>

	<!-- ===== PICKER VIEW ===== -->
	{#if view === 'picker'}
		<div class="fd-header">
			<div class="fd-header-row">
				<span class="fd-title">{_mode === 'denizen' ? 'Pick a Denizen' : 'Choose a Foe'}</span>
				<button class="fd-close-btn" onclick={close} aria-label="Close">✕</button>
			</div>
			<div class="fd-search-row">
				<input
					type="search"
					class="fd-search"
					placeholder="Search by name or feature…"
					bind:value={search}
					aria-label="Search foes"
				/>
				{#if hasActiveFilters}
					<button class="btn btn-icon fd-clear-btn" onclick={clearFilters} title="Clear all filters" aria-label="Clear filters">
						{@html clearFiltersSvg}
					</button>
				{/if}
			</div>

			<!-- Nature filters -->
			<div class="fd-filter-row">
				{#each natures as nature}
					<button
						class="fd-filter-tag"
						class:active={activeNatures.has(nature)}
						style="--tag-color: {FOE_NATURE_COLORS[nature]}"
						onclick={() => toggleNature(nature)}
					>{nature}</button>
				{/each}
			</div>

			<!-- Source filters -->
			<div class="fd-filter-row fd-filter-row--sources">
				{#each sources as src}
					<button
						class="fd-filter-tag fd-filter-tag--src"
						class:active={activeSources.has(src)}
						onclick={() => toggleSource(src)}
					>{src}</button>
				{/each}
			</div>
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
									src={imageUrl(foe.name)}
									alt={foe.name}
									onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
								/>
							</div>
							<div class="fd-tile-body">
								<span class="fd-tile-name">{foe.name}</span>
								<div class="fd-tile-badges">
									<span class="fd-badge" style="background: {natureBorderColor(foe.nature)}22; color: {natureBorderColor(foe.nature)}">{foe.nature}</span>
									<span class="fd-badge fd-badge--rank">{FOE_RANKS[foe.rank]?.label ?? foe.rank}</span>
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
		{@const natureColor  = natureBorderColor(confirmFoe.nature)}
		{@const baseRankInfo = FOE_RANKS[confirmFoe.rank]}

		<!-- Back bar -->
		<div class="fd-back-bar" style="--nature-color: {natureColor}">
			<button class="btn fd-back-btn" onclick={goBack}>← Back</button>
			<span class="fd-title">{confirmFoe.name}</span>
			<span class="fd-badge" style="background: {natureColor}22; color: {natureColor}">{confirmFoe.nature}</span>
			<span class="fd-badge fd-badge--rank">{baseRankInfo?.label ?? confirmFoe.rank}</span>
		</div>

		<!-- Scrollable body -->
		<div class="fd-confirm-scroll">

			<!-- ── Top row: portrait + quantity side by side ── -->
			<div class="fd-top-row">

				<!-- Square portrait -->
				<div class="fc-portrait-wrap">
					<img
						class="fc-portrait"
						src={imageUrl(confirmFoe.name)}
						alt={confirmFoe.name}
						onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
					/>
				</div>

				<!-- Quantity / rank selector -->
				<div class="fd-qty-section">
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
								<span class="fd-qty-desc">{qty.desc}</span>
							</label>
						{/each}
					</fieldset>

					<div class="fd-eff-rank">
						<span class="fd-eff-rank-label">Effective rank:</span>
						<span class="fd-eff-rank-value">{rankInfo?.label ?? '?'} ({effRank})</span>
						{#if rankAdj > 0}
							<span class="fd-eff-rank-note">Base {confirmFoe.rank} + {rankAdj}</span>
						{/if}
					</div>

					{#if rankInfo}
						<div class="fd-rank-info">
							Inflicts <strong>{rankInfo.harm}</strong> harm ·
							<strong>{rankInfo.progressPerHit}</strong> ticks per progress mark
						</div>
					{/if}
				</div>
			</div>

			<!-- ── Text body: description + sections ── -->
			{#if confirmFoe.description || confirmFoe.features.length > 0 || confirmFoe.drives.length > 0 || confirmFoe.tactics.length > 0}
				<div class="fc-body">
					{#if confirmFoe.description}
						<p class="fc-desc">{confirmFoe.description}</p>
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
			<button class="btn" onclick={goBack}>Cancel</button>
			<button class="btn btn-primary" onclick={confirm}>Add to Foes</button>
		</div>
	{/if}

</dialog>

<style>
	/* ── Dialog shell ───────────────────────────────────────────────────── */
	.foe-dialog {
		margin: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-card);
		color: var(--text);
		box-shadow: 0 16px 48px rgba(0,0,0,0.55);
		width: min(680px, calc(100vw - 2rem));
		height: min(720px, 90dvh);
		max-height: min(720px, 90dvh);
		/* Fixed top so height changes don't cause dancing */
		position: fixed;
		top: 6dvh;
		left: 50%;
		transform: translateX(-50%);
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

	/* ── Picker: header ─────────────────────────────────────────────────── */
	.fd-header {
		padding: 0.75rem 1rem 0.5rem;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.fd-header-row {
		display:     flex;
		align-items: center;
		gap:         8px;
	}

	.fd-title {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-accent);
		flex: 1;
	}

	.fd-close-btn {
		background:  transparent;
		border:      none;
		color:       var(--text-dimmer);
		font-size:   1rem;
		line-height: 1;
		cursor:      pointer;
		padding:     4px 6px;
		border-radius: 4px;
		flex-shrink: 0;
		min-width:   44px;
		min-height:  44px;
		display:     flex;
		align-items: center;
		justify-content: center;
		transition:  color 0.12s;
	}
	.fd-close-btn:hover { color: var(--text); }

	.fd-search-row {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.fd-search {
		flex: 1;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		padding: 5px 10px;
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
		width: 30px;
		height: 30px;
		padding: 5px;
		flex-shrink: 0;
	}
	.fd-clear-btn :global(svg) {
		width: 16px;
		height: 16px;
		fill: currentColor;
	}

	/* ── Filter tag rows ────────────────────────────────────────────────── */
	.fd-filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}

	.fd-filter-row--sources { margin-top: -2px; }

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
		transition: background 0.1s, color 0.1s, border-color 0.1s;
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
	.fd-filter-tag--src { --tag-color: var(--text-muted); }

	/* ── Tile grid ──────────────────────────────────────────────────────── */
	.fd-grid-wrap {
		flex: 1;
		overflow-y: auto;
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
		transition: border-color 0.1s, box-shadow 0.1s;
		display: flex;
		flex-direction: column;
	}
	.fd-tile:hover, .fd-tile:focus {
		border-color: var(--nature-color, #9ca3af);
		box-shadow: 0 2px 8px rgba(0,0,0,0.3);
		outline: none;
	}

	.fd-tile-img-wrap {
		width: 100%;
		aspect-ratio: 4/3;
		overflow: hidden;
		background: rgba(255,255,255,0.04);
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
		font-size: 0.78rem;
		font-weight: 700;
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
		padding: 1px 5px;
		border-radius: 3px;
	}
	.fd-badge--rank {
		background: rgba(255,255,255,0.08);
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
		gap: 0.6rem;
		padding: 0.6rem 1rem;
		border-bottom: 1px solid var(--border);
		border-top: 3px solid var(--nature-color, #9ca3af);
		flex-shrink: 0;
	}

	.fd-back-bar .fd-title { flex: 1; }
	.fd-back-btn { flex-shrink: 0; }

	/* ── Scrollable confirm body ─────────────────────────────────────── */
	.fd-confirm-scroll {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* ── Top row: portrait + quantity side by side ──────────────────── */
	.fd-top-row {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		flex-wrap: wrap; /* drops below on narrow screens */
	}

	.fc-portrait-wrap {
		flex-shrink: 0;
		width: 150px;
	}

	.fc-portrait {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: 6px;
		border: 1px solid var(--border-mid);
		display: block;
	}

	/* ── Text body: description + sections ──────────────────────────── */
	.fc-body {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg-inset);
	}

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

	/* ── Quantity section (right of portrait) ───────────────────────── */
	.fd-qty-section {
		flex: 1;
		min-width: 160px; /* wraps below portrait if too narrow */
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	/* ── Quantity selector ──────────────────────────────────────────────── */
	.fd-quantity-group {
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.5rem 0.75rem 0.75rem;
		margin: 0;
	}

	.fd-quantity-legend {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		padding: 0 4px;
	}

	.fd-qty-label {
		display: flex;
		align-items: baseline;
		gap: 6px;
		padding: 5px 6px;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.1s;
	}
	.fd-qty-label:hover { background: rgba(255,255,255,0.05); }
	.fd-qty-label.selected { background: rgba(255,255,255,0.08); }

	.fd-qty-label input[type="radio"] { flex-shrink: 0; accent-color: var(--text-accent); }

	.fd-qty-name {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--text);
		flex-shrink: 0;
	}

	.fd-qty-desc {
		font-family: var(--font-ui);
		font-size: 0.74rem;
		color: var(--text-dimmer);
	}

	/* ── Effective rank + harm info ─────────────────────────────────────── */
	.fd-eff-rank {
		display: flex;
		align-items: baseline;
		gap: 6px;
		font-family: var(--font-ui);
		font-size: 0.82rem;
	}

	.fd-eff-rank-label { color: var(--text-dimmer); }
	.fd-eff-rank-value { font-weight: 700; color: var(--text-accent); }
	.fd-eff-rank-note  { font-size: 0.72rem; color: var(--text-dimmer); }

	.fd-rank-info {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: #991b1b;
		padding: 4px 8px;
		background: rgba(239,68,68,0.07);
		border-radius: 4px;
		border: 1px solid rgba(239,68,68,0.2);
	}
</style>
