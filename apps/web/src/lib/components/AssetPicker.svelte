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
	import { getAssets, isAssetsLoading, findAsset } from '$lib/assetStore.svelte.js';
	import { firstPreconditionFailure, type Precondition } from '$lib/preconditions.js';

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

	const CATEGORIES: Array<AssetCategory | 'All'> = [
		'All', 'Combat Talent', 'Companion', 'Path', 'Ritual', 'Touched',
	];

	// ---------------------------------------------------------------------------
	// Filter state
	// ---------------------------------------------------------------------------
	let activeCategory  = $state<AssetCategory | 'All'>('All');
	let search          = $state('');
	let dialogEl        = $state<HTMLDialogElement | null>(null);
	let confirmDialogEl = $state<HTMLDialogElement | null>(null);
	let pendingAsset    = $state<AssetDefinition | null>(null);

	$effect(() => { if (dialogEl) dialogEl.showModal(); });
	$effect(() => {
		if (confirmDialogEl && pendingAsset) confirmDialogEl.showModal();
	});

	// ---------------------------------------------------------------------------
	// Precondition checking
	// ---------------------------------------------------------------------------

	/** Returns a human-readable failure reason, or null if OK to add. */
	function preconditionFailure(def: AssetDefinition): string | null {
		// Implicit rule: only one Touched asset allowed per character
		if (def.category === 'Touched') {
			const hasTouch = ownedIds.some(
				(id) => findAsset(id)?.category === 'Touched',
			);
			if (hasTouch) return 'You may only have one Touched asset';
		}

		// Data-driven preconditions — generic engine covers all keys
		return firstPreconditionFailure(
			def.preconditions as Precondition[] | undefined,
			characterData,
		);
	}

	// ---------------------------------------------------------------------------
	// Filtered asset list
	// ---------------------------------------------------------------------------
	const filtered = $derived(
		getAssets().filter((a) => {
			if (activeCategory !== 'All' && a.category !== activeCategory) return false;
			const q = search.trim().toLowerCase();
			if (q && !a.name.toLowerCase().includes(q) &&
				!(a.summary ?? '').toLowerCase().includes(q)) return false;
			return true;
		})
	);

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
	<!-- Header -->
	<div class="picker-header">
		<span class="picker-title">Choose an Asset</span>
		<button class="close-btn" onclick={onClose} aria-label="Close picker">✕</button>
	</div>

	<!-- Category tabs + search — flex-shrink: 0 so they never scroll away -->
	<div class="picker-controls">
		<div class="cat-tabs" role="tablist">
			{#each CATEGORIES as cat}
				{@const color = cat === 'All' ? 'var(--text-muted)' : CAT_COLOR[cat]}
				<button
					role="tab"
					class="cat-tab"
					class:active={activeCategory === cat}
					style:--cat-color={color}
					onclick={() => (activeCategory = cat)}
					aria-selected={activeCategory === cat}
				>{cat}</button>
			{/each}
		</div>
		<input
			class="search-input"
			type="search"
			bind:value={search}
			placeholder="Search by name or description…"
			aria-label="Search assets"
		/>
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

						{#if asset.preamble}
							<div class="tile-desc">{asset.preamble}</div>
						{:else if asset.summary}
							<div class="tile-desc">{asset.summary}</div>
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
     Add-confirm dialog — "Add X to your character?"
     ====================================================================== -->
{#if pendingAsset}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<dialog
		bind:this={confirmDialogEl}
		class="confirm-dialog"
		oncancel={cancelAdd}
	>
		<p class="confirm-msg">
			Add <strong>{pendingAsset.name}</strong> to your character?
		</p>
		<div class="confirm-btns">
			<button class="btn" onclick={cancelAdd}>Cancel</button>
			<button class="btn btn-primary" onclick={confirmAdd}>OK</button>
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

	/* ---- Header ---- */
	.picker-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 11px 16px 10px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.picker-title {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
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
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 9px 16px 8px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
		background: var(--bg-card);
	}

	.cat-tabs {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}

	.cat-tab {
		border: 1.5px solid transparent;
		border-radius: 12px;   /* pill shape */
		padding: 3px 11px;
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--text-muted);
		background: transparent;
		cursor: pointer;
		transition: color 0.12s, border-color 0.12s, background 0.12s;
		white-space: nowrap;
		line-height: 1.4;
	}
	.cat-tab:hover {
		color: var(--cat-color);
		border-color: color-mix(in srgb, var(--cat-color) 50%, transparent);
	}
	/* Active tab: solid coloured pill */
	.cat-tab.active {
		color: var(--bg-card);
		background: var(--cat-color);
		border-color: var(--cat-color);
		font-weight: 700;
	}

	.search-input {
		width: 100%;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		padding: 5px 9px;
	}

	/* ---- Scrollable body ---- */
	.picker-body {
		overflow-y: auto;
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
	   Add-confirm dialog
	   ================================================================ */
	.confirm-dialog {
		border: 1px solid var(--border-mid);
		border-radius: 7px;
		padding: 16px 18px 14px;
		background: var(--bg-card);
		color: var(--text);
		width: min(340px, calc(100vw - 2rem));
		box-shadow: 0 8px 32px #00000060;
		/* Explicit centering — overrides browser UA-stylesheet positioning */
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		margin: 0;
	}
	.confirm-dialog::backdrop {
		background: #00000030;
	}

	.confirm-msg {
		font-family: var(--font-ui);
		font-size: 0.88rem;
		margin: 0 0 14px;
		line-height: 1.45;
		color: var(--text);
	}
	.confirm-msg :global(strong) { color: var(--text); }

	.confirm-btns {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
	}

	.btn-primary {
		background: var(--text-accent);
		border-color: var(--text-accent);
		color: var(--bg-card);
		font-weight: 600;
	}
	.btn-primary:hover {
		opacity: 0.88;
	}
</style>
