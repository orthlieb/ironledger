<script lang="ts">
	/**
	 * AssetPicker — modal dialog for browsing and adding assets to a character.
	 *
	 * Fixed-height dialog so it never jumps/resizes while filtering.
	 * Category tabs + search box filter the list.
	 * Tiles show precondition failures as disabled with tooltip.
	 * Clicking an eligible tile shows an "Add X?" confirm dialog.
	 */
	import type { AssetCategory, AssetDefinition, AssetRollRow, CharacterData } from '$lib/types.js';
	import type { RollTable } from '@ironledger/shared';
	import clearFiltersSvg from '$icons/filter-circle-xmark-solid-full.svg?raw';
	import searchIconSvg from '$icons/magnifying-glass-solid-full.svg?raw';
	import { getVisibleAssets, isAssetsLoading, findAsset } from '$lib/assetStore.svelte.js';
	import { getVisibleRollTables, loadRollTables } from '$lib/rollTableStore.svelte.js';
	import { firstPreconditionFailure, type Precondition } from '$lib/preconditions.js';
	import { headingText } from '$lib/fontStore.svelte.js';
	import { Dialog } from 'bits-ui';
	import DialogHeader from '$lib/components/DialogHeader.svelte';
	import AssetRollDialog from '$lib/components/AssetRollDialog.svelte';
	import { tooltip } from '$lib/actions/tooltip.js';
	import { assetIcon } from '$lib/iconRegistry.js';

	let {
		ownedIds = [],
		characterData,
		onAdd,
		onClose,
	}: {
		ownedIds: string[];
		characterData: CharacterData;
		onAdd: (assetId: string) => void;
		onClose: () => void;
	} = $props();

	// ---------------------------------------------------------------------------
	// Category colours — shared with AssetCard
	// ---------------------------------------------------------------------------
	export const CAT_COLOR: Record<string, string> = {
		'Combat Talent': 'var(--color-iron)',
		Path: 'var(--color-edge)',
		Companion: 'var(--color-heart)',
		Ritual: 'var(--color-mana)',
		Touched: 'var(--color-touched)',
	};

	// ---------------------------------------------------------------------------
	// Filter state
	// ---------------------------------------------------------------------------
	let activeCategories = $state(new Set<AssetCategory>());
	let filtersOpen = $state(false);
	let search = $state('');
	// bits-ui Dialog open flag — parent gates render with `{#if picking}`
	// so we seed `true` and route any close (Escape, backdrop, X) back
	// through `onClose`. Search field gets focus on open per the
	// CLAUDE.md dialog focus rule.
	let dialogOpen = $state(true);
	let searchInputEl = $state<HTMLInputElement | null>(null);

	// ---------------------------------------------------------------------------
	// Precondition checking
	// ---------------------------------------------------------------------------

	/** Returns a human-readable failure reason, or null if OK to add. */
	function preconditionFailure(def: AssetDefinition): string | null {
		return firstPreconditionFailure(def.preconditions as Precondition[] | undefined, characterData);
	}

	/** Returns a human-readable conflict reason if the character already owns
	 *  another asset in the same exclusiveGroup (e.g. Touched), or null. The
	 *  add handler in CharactersArea enforces this too — picker-side disables
	 *  the tile up-front so the user can see why before clicking. */
	function exclusiveGroupConflict(def: AssetDefinition): string | null {
		if (!def.exclusiveGroup) return null;
		for (const ownedId of ownedIds) {
			if (ownedId === def.id) continue;
			const ownedDef = findAsset(ownedId);
			if (ownedDef?.exclusiveGroup === def.exclusiveGroup) {
				return `Already have ${ownedDef.name} — only one ${def.exclusiveGroup} asset allowed`;
			}
		}
		return null;
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
			if (q && !a.name.toLowerCase().includes(q) && !(a.summary ?? '').toLowerCase().includes(q))
				return false;
			return true;
		}),
	);

	function toggleCategory(cat: AssetCategory) {
		const next = new Set(activeCategories);
		if (next.has(cat)) next.delete(cat);
		else next.add(cat);
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

	// ── Prelude Event (resolver oracle → asset) ──────────────────────────────
	// A d100 asset roll-table (e.g. Lodestar's Prelude Event) surfaces here as a
	// "Roll Prelude" action, gated to its enabled expansion. Rolling opens the
	// shared AssetRollDialog (roll → asset detail + prelude narrative), and
	// "Add to Character" reuses the same `onAdd` purchase flow as a tile click.
	loadRollTables(); // idempotent — fetches the catalogue once per session
	let preludeRef = $state<{ open(): void; close(): void } | null>(null);
	let activePreludeTable = $state<RollTable | null>(null);

	/** Asset roll-tables whose source expansion is enabled. */
	const preludeTables = $derived(getVisibleRollTables().filter((t) => t.kind === 'asset'));
	const preludeTitle = $derived(activePreludeTable?.name ?? '');
	const preludeLogLabel = $derived(
		activePreludeTable ? `Oracle: ${activePreludeTable.name}` : 'Oracle',
	);
	const preludeRows = $derived<AssetRollRow[]>(
		activePreludeTable
			? activePreludeTable.entries.map((e) => ({
					low: e.low,
					high: e.high,
					ref: e.ref,
					category: e.category,
					text: e.text,
				}))
			: [],
	);

	function resolveAsset(ref: string): AssetDefinition | undefined {
		return findAsset(ref);
	}
	function openPrelude(table: RollTable): void {
		activePreludeTable = table;
		preludeRef?.open();
	}
</script>

<!-- ======================================================================
     Main picker dialog — fixed height so it never bounces while filtering
     ====================================================================== -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<Dialog.Root
	bind:open={dialogOpen}
	onOpenChange={(next) => {
		if (!next) onClose();
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="picker-overlay" />
		<Dialog.Content
			class="picker-dialog"
			onOpenAutoFocus={(e) => {
				e.preventDefault();
				setTimeout(() => searchInputEl?.focus(), 0);
			}}
		>
			<!-- Header — mirrors OraclesDialog .od-header (draggable, with gripper) -->
			<DialogHeader title={headingText('Choose an Asset')} onclose={onClose} />

			<!-- Search row + filter toggle -->
			<div class="picker-controls">
				<div class="ap-search-row">
					<div class="ap-search-field">
						<span class="ap-search-icon" aria-hidden="true">{@html searchIconSvg}</span>
						<input
							bind:this={searchInputEl}
							class="search-input"
							type="search"
							bind:value={search}
							placeholder="Search by name or description…"
							aria-label="Search assets"
						/>
					</div>
					<button
						class="ap-filter-toggle"
						class:ap-filter-toggle--active={activeCategories.size > 0}
						onclick={() => (filtersOpen = !filtersOpen)}
						aria-expanded={filtersOpen}
						>Filters{#if activeCategories.size > 0}&nbsp;<span class="ap-filter-badge"
								>{activeCategories.size}</span
							>{/if}
						{filtersOpen ? '▲' : '▼'}</button
					>
					{#if preludeTables.length > 0}
						<button
							class="ap-prelude-btn"
							onclick={() => openPrelude(preludeTables[0])}
							use:tooltip={'Roll a random asset with a prelude narrative'}
							>🎲 {preludeTables[0].name}</button
						>
					{/if}
				</div>
				{#if filtersOpen}
					<div class="ap-filter-panel">
						<div class="ap-filter-chips">
							{#each visibleCategories as cat}
								<button
									class="ap-filter-tag"
									class:active={activeCategories.has(cat)}
									style="--tag-color: {CAT_COLOR[cat]}"
									onclick={() => toggleCategory(cat)}>{cat}</button
								>
							{/each}
						</div>
						<button
							class="ap-clear-btn"
							onclick={clearFilters}
							disabled={!hasActiveFilters}
							use:tooltip={'Clear all filters'}
							aria-label="Clear filters">{@html clearFiltersSvg}</button
						>
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
							{@const owned = ownedIds.includes(asset.id)}
							{@const blocked = preconditionFailure(asset) ?? exclusiveGroupConflict(asset)}
							{@const catColor = CAT_COLOR[asset.category] ?? 'var(--text-muted)'}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="pick-tile"
								class:pick-tile-owned={owned}
								class:pick-tile-blocked={!!blocked && !owned}
								style:--tile-color={catColor}
								use:tooltip={blocked && !owned ? blocked : ''}
								onclick={() => {
									if (!owned && !blocked) tryAdd(asset);
								}}
								onkeydown={(e) => {
									if ((e.key === 'Enter' || e.key === ' ') && !owned && !blocked) tryAdd(asset);
								}}
								tabindex={owned || !!blocked ? -1 : 0}
								role="button"
								aria-disabled={owned || !!blocked}
							>
								<div class="tile-name-row">
									<span class="tile-name-icon" aria-hidden="true" style:color={catColor}
										>{@html assetIcon(asset)}</span
									>
									<span class="tile-name">{asset.name}</span>
									<span class="tile-badge" style:background={catColor}>{asset.category}</span>
								</div>

								{#if asset.summary}
									<div class="tile-desc">{stripMdLinks(asset.summary)}</div>
								{:else if asset.preamble}
									<div class="tile-desc">{stripMdLinks(asset.preamble)}</div>
								{/if}

								{#if owned}
									<div class="tile-acquired">Acquired</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Prelude Event handoff: rolling opens this on top of the picker; "Add to
     Character" routes through the same `onAdd` purchase flow as a tile click
     (which also closes this picker). -->
<AssetRollDialog
	bind:this={preludeRef}
	title={preludeTitle}
	logLabel={preludeLogLabel}
	rows={preludeRows}
	resolve={resolveAsset}
	onSelect={onAdd}
/>

<style>
	/* ================================================================
	   Main picker dialog — bits-ui Dialog, fixed height, never resizes.
	   Portals Content + Overlay to <body>; scope everything globally.
	   Overlay 80 / content 81 matches the modal z-index tier.
	   ================================================================ */
	:global(.picker-overlay) {
		position: fixed;
		inset: 0;
		background: #00000055;
		backdrop-filter: blur(2px);
		z-index: 80;
	}
	:global(.picker-dialog) {
		display: flex;
		flex-direction: column;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(760px, calc(100vw - 2rem));
		height: min(82vh, 720px);
		background: var(--bg-card);
		color: var(--text);
		border-radius: 8px;
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
		overflow: hidden;
		z-index: 81;
	}

	/* ---- Controls: category tabs + search — pinned, never scrolls ---- */
	:global(.picker-controls) {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 9px 16px 8px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
		background: var(--bg-card);
	}

	:global(.ap-search-row) {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	:global(.ap-search-field) {
		flex: 1;
		min-width: 0;
		position: relative;
		display: flex;
		align-items: center;
	}
	:global(.ap-search-icon) {
		position: absolute;
		left: 9px;
		width: 13px;
		height: 13px;
		display: inline-flex;
		pointer-events: none;
		color: var(--text-dimmer);
	}
	:global(.ap-search-icon svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}

	:global(.search-input) {
		flex: 1;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		padding: 5px 9px 5px 29px;
		min-width: 0;
	}

	:global(.ap-filter-toggle) {
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
		flex-shrink: 0;
	}
	:global(.ap-filter-toggle:hover) {
		color: var(--text);
		border-color: var(--border-mid);
	}
	/* Roll Prelude — same chip shape as the filter toggle, accent-tinted so it
	   reads as an action rather than a filter. Only shown when an asset
	   roll-table (e.g. Lodestar's Prelude Event) is enabled. */
	:global(.ap-prelude-btn) {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		padding: 3px 10px;
		border-radius: 12px;
		border: 1px solid var(--text-accent);
		background: color-mix(in srgb, var(--text-accent) 12%, transparent);
		color: var(--text-accent);
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
		transition:
			background 0.1s,
			border-color 0.1s;
	}
	:global(.ap-prelude-btn:hover) {
		background: color-mix(in srgb, var(--text-accent) 22%, transparent);
	}
	:global(.ap-filter-toggle--active) {
		color: var(--accent);
		border-color: var(--accent);
	}

	:global(.ap-filter-badge) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--accent);
		color: #fff;
		font-size: 0.6rem;
		font-weight: 700;
		width: 14px;
		height: 14px;
		border-radius: 50%;
	}

	:global(.ap-filter-panel) {
		position: relative;
		padding: 6px 8px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 6px;
	}
	:global(.ap-filter-chips) {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding-right: 26px;
	}
	:global(.ap-filter-tag) {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--tag-color, var(--text-dimmer));
		background: transparent;
		border: 1px solid color-mix(in srgb, var(--tag-color, var(--border)) 40%, transparent);
		border-radius: 10px;
		padding: 2px 8px;
		cursor: pointer;
		white-space: nowrap;
		transition:
			background 0.12s,
			color 0.12s;
	}
	:global(.ap-filter-tag:hover) {
		background: color-mix(in srgb, var(--tag-color, var(--border)) 12%, transparent);
	}
	:global(.ap-filter-tag.active) {
		background: color-mix(in srgb, var(--tag-color, var(--border)) 18%, transparent);
		border-color: var(--tag-color, var(--border));
	}
	:global(.ap-clear-btn) {
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
	:global(.ap-clear-btn:hover:not(:disabled)) {
		color: var(--text);
	}
	:global(.ap-clear-btn:disabled) {
		opacity: 0.25;
		cursor: not-allowed;
	}
	:global(.ap-clear-btn svg) {
		width: 16px;
		height: 16px;
		fill: currentColor;
	}

	/* ---- Scrollable body ---- */
	:global(.picker-body) {
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 12px 16px;
		flex: 1;
		min-height: 0;
	}

	:global(.picker-hint) {
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
		background: var(--bg-inset);
		border: 1px solid var(--border);
		/* Coloured top border matching the category */
		border-top: 3px solid var(--tile-color);
		border-radius: 5px;
		padding: 9px;
		display: flex;
		flex-direction: column;
		gap: 5px;
		cursor: pointer;
		transition:
			border-color 0.12s,
			background 0.12s;
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
	/* Name row — icon, name (grows to fill), badge anchored to the right. */
	:global(.tile-name-row) {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}
	:global(.tile-name-icon) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}
	:global(.tile-name-icon svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	:global(.tile-name-icon svg path) {
		fill: currentColor;
	}

	:global(.tile-name) {
		flex: 1;
		min-width: 0;
		font-family: var(--font-ui);
		font-size: 0.84rem;
		font-weight: 700;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	:global(.tile-badge) {
		flex-shrink: 0;
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

	:global(.tile-desc) {
		font-family: var(--font-ui);
		font-size: 0.71rem;
		color: var(--text-muted);
		line-height: 1.4;
		font-style: italic;
		flex: 1;
	}

	:global(.tile-acquired) {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--text-dimmer);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin-top: auto;
	}
</style>
