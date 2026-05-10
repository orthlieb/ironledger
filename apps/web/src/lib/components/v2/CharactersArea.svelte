<script lang="ts">
	/**
	 * CharactersArea (v2 prototype) — Characters deck stage.
	 *
	 * Layout:
	 *   ┌─────────────────────────────────────────────────────┐
	 *   │ Header: "Characters"                                │
	 *   ├──────┬──────────────────────────────────────────────┤
	 *   │      │  Active card tab strip [Background|Core|Vows]│
	 *   │ Spine│  ┌────────────────────────────────────────┐  │
	 *   │ strip│  │  Active card content                   │  │
	 *   │ ───  │  │                                        │  │
	 *   │ char1│  └────────────────────────────────────────┘  │
	 *   │ char2│  Asset strip ▒▒▒ ▒▒▒ ▒▒▒                   │
	 *   └──────┴──────────────────────────────────────────────┘
	 *
	 * "Active character" is the front-of-deck. Click a spine to bring its deck
	 * to the front. Asset tabs are tucked under the bottom of the active card;
	 * clicking one opens the v1 AssetCard in a dismissible dialog.
	 */
	import { getCharacters, isCharacterLoading } from '$lib/characterStore.svelte.js';
	import { findAsset, isAssetsLoading }        from '$lib/assetStore.svelte.js';
	import { hydrateCharacter } from '$lib/character.js';
	import type { CharacterData, CharacterAsset } from '$lib/types.js';
	import AssetCard from '$lib/components/AssetCard.svelte';

	type CardKey = 'background' | 'core' | 'vows';
	const CARD_LABELS: { key: CardKey; label: string }[] = [
		{ key: 'background', label: 'Background' },
		{ key: 'core',       label: 'Core' },
		{ key: 'vows',       label: 'Vows' },
	];

	let activeCharId  = $state<string | null>(null);
	let activeCard    = $state<CardKey>('core');
	let dialogAssetId = $state<string | null>(null);
	let dialogEl      = $state<HTMLDialogElement | null>(null);

	const characters = $derived(getCharacters());
	const loading    = $derived(isCharacterLoading() || isAssetsLoading());

	// Auto-select the first character once data has loaded.
	$effect(() => {
		if (!activeCharId && characters.length > 0) {
			activeCharId = characters[0].id;
		}
	});

	const activeChar = $derived(characters.find(c => c.id === activeCharId));
	const activeData = $derived<CharacterData | null>(
		activeChar ? hydrateCharacter(activeChar.data) : null,
	);

	function selectChar(id: string) {
		activeCharId = id;
		activeCard = 'core';
		closeAssetDialog();
	}

	function openAssetDialog(id: string) {
		dialogAssetId = id;
		// Wait for the dialog node to mount, then showModal().
		queueMicrotask(() => dialogEl?.showModal());
	}

	function closeAssetDialog() {
		dialogEl?.close();
		dialogAssetId = null;
	}
</script>

<div class="ca-area">
	<!-- Header -->
	<header class="ca-header">
		<span class="ca-title">Characters</span>
		<span class="ca-count">{characters.length} {characters.length === 1 ? 'character' : 'characters'}</span>
	</header>

	{#if loading}
		<div class="ca-loading">Loading…</div>
	{:else if characters.length === 0}
		<div class="ca-empty">
			No characters yet. Use the original /home page to create one — this prototype is read-only for now.
		</div>
	{:else}
		<div class="ca-body">
			<!-- Spine strip (left) -->
			<nav class="ca-spines" aria-label="Character decks">
				{#each characters as char (char.id)}
					{@const cd = hydrateCharacter(char.data)}
					<button
						class="ca-spine"
						class:ca-spine--active={char.id === activeCharId}
						onclick={() => selectChar(char.id)}
						title={char.name}
					>
						<span class="ca-spine-name">{char.name}</span>
						<span class="ca-spine-meta">XP {cd.xp ?? 0}</span>
					</button>
				{/each}
			</nav>

			<!-- Active deck stage (right) -->
			<div class="ca-stage">
				{#if activeChar}
					<!-- Card tab strip -->
					<div class="ca-tabs" role="tablist">
						{#each CARD_LABELS as tab (tab.key)}
							<button
								role="tab"
								class="ca-tab"
								class:ca-tab--active={activeCard === tab.key}
								aria-selected={activeCard === tab.key}
								onclick={() => (activeCard = tab.key)}
							>{tab.label}</button>
						{/each}
					</div>

					{@const d = activeData!}
					<!-- Active card content -->
					<div class="ca-card" role="tabpanel">
						{#if activeCard === 'background'}
							<div class="ca-card-section">
								<h3 class="ca-card-name">{activeChar.name}</h3>
								{#if d.background?.trim()}
									<p class="ca-card-bg">{d.background}</p>
								{:else}
									<p class="ca-card-bg ca-card-bg--empty">No background yet.</p>
								{/if}
							</div>
						{:else if activeCard === 'core'}
							<div class="ca-card-section">
								<div class="ca-stats">
									<div class="ca-stat"><span class="ca-stat-label">Edge</span>  <span class="ca-stat-val">{d.edge}</span></div>
									<div class="ca-stat"><span class="ca-stat-label">Heart</span> <span class="ca-stat-val">{d.heart}</span></div>
									<div class="ca-stat"><span class="ca-stat-label">Iron</span>  <span class="ca-stat-val">{d.iron}</span></div>
									<div class="ca-stat"><span class="ca-stat-label">Shadow</span><span class="ca-stat-val">{d.shadow}</span></div>
									<div class="ca-stat"><span class="ca-stat-label">Wits</span>  <span class="ca-stat-val">{d.wits}</span></div>
								</div>

								<div class="ca-vitals">
									<div class="ca-vital"><span class="ca-vital-label">Health</span>  <span class="ca-vital-val"><strong>{d.health}</strong><span class="ca-vital-max">/5</span></span></div>
									<div class="ca-vital"><span class="ca-vital-label">Spirit</span>  <span class="ca-vital-val"><strong>{d.spirit}</strong><span class="ca-vital-max">/5</span></span></div>
									<div class="ca-vital"><span class="ca-vital-label">Supply</span>  <span class="ca-vital-val"><strong>{d.supply}</strong><span class="ca-vital-max">/5</span></span></div>
									<div class="ca-vital"><span class="ca-vital-label">Momentum</span><span class="ca-vital-val"><strong>{d.momentum}</strong><span class="ca-vital-max">/10</span></span></div>
								</div>

								<div class="ca-track-row">
									<span class="ca-track-label">Bonds</span>
									<span class="ca-track-val">{d.bonds ?? 0} / 40 ticks</span>
								</div>
							</div>
						{:else if activeCard === 'vows'}
							<div class="ca-card-section">
								{#if (d.vows ?? []).length === 0}
									<p class="ca-empty-mini">No vows.</p>
								{:else}
									<ul class="ca-vow-list">
										{#each d.vows ?? [] as vow}
											<li class="ca-vow">
												<span class="ca-vow-name">{vow.name || 'Unnamed Vow'}</span>
												<span class="ca-vow-rank">{vow.difficulty}</span>
												<span class="ca-vow-progress">{Math.floor((vow.ticks ?? 0) / 4)} / 10</span>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{/if}
					</div>

					<!-- Asset tabs — tucked under the bottom of the character card. -->
					<div class="ca-asset-tabs" aria-label="Assets">
						{#if (d.assets ?? []).length === 0}
							<span class="ca-asset-tabs-empty">No assets.</span>
						{:else}
							{#each d.assets ?? [] as a (a.assetId)}
								{@const def = findAsset(a.assetId)}
								<button
									class="ca-asset-tab"
									onclick={() => openAssetDialog(a.assetId)}
									title={def?.name ?? a.assetId}
								>
									<span class="ca-asset-tab-name">{def?.name ?? a.assetId}</span>
								</button>
							{/each}
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Asset card dialog — hosts the v1 AssetCard with full editing affordances.
     Mutations here flow to in-memory character state but aren't persisted to
     the API yet (prototype is read-mostly). -->
{#if activeChar && dialogAssetId}
	{@const arr = activeChar.data.assets as CharacterAsset[]}
	{@const idx = arr.findIndex(a => a.assetId === dialogAssetId)}
	{@const def = findAsset(dialogAssetId)}
	{#if idx >= 0 && def && activeData}
		<dialog
			bind:this={dialogEl}
			class="ca-asset-dialog"
			oncancel={closeAssetDialog}
			onclose={() => { dialogAssetId = null; }}
		>
			<header class="ca-asset-dialog-header">
				<span class="ca-asset-dialog-title">{def.name}</span>
				<button
					class="ca-asset-dialog-close"
					onclick={closeAssetDialog}
					aria-label="Close"
				>✕</button>
			</header>
			<div class="ca-asset-dialog-body">
				<AssetCard
					bind:asset={arr[idx]}
					definition={def}
					characterId={activeChar.id}
					characterName={activeChar.name}
					characterXp={activeData.xp ?? 0}
					bind:globalValues={activeChar.data.globalValues as Record<string, string>}
					onRemove={closeAssetDialog}
				/>
			</div>
		</dialog>
	{/if}
{/if}

<style>
	.ca-area {
		display:        flex;
		flex-direction: column;
		height:         100%;
		min-height:     0;
	}

	/* ── Header ───────────────────────────────────────── */
	.ca-header {
		display: flex;
		align-items: baseline;
		gap: 10px;
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-control);
		flex-shrink: 0;
	}
	.ca-title {
		font-family:    var(--font-display);
		font-size:      calc(0.82rem * var(--font-display-scale));
		font-weight:    var(--font-display-weight);
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color:          var(--text-accent);
	}
	.ca-count {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		color: var(--text-dimmer);
	}

	.ca-loading,
	.ca-empty {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		color: var(--text-muted);
		font-style: italic;
		padding: 20px;
		text-align: center;
	}

	/* ── Body: spines + stage ─────────────────────────── */
	.ca-body {
		display: grid;
		grid-template-columns: 130px 1fr;
		flex: 1;
		min-height: 0;
	}

	/* Spine strip */
	.ca-spines {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px;
		border-right: 1px solid var(--border);
		overflow-y: auto;
		background: var(--bg);
	}
	.ca-spine {
		all: unset;
		cursor: pointer;
		padding: 8px 9px;
		border: 1px solid var(--border);
		border-left: 3px solid var(--text-dimmer);
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--bg-card);
		transition: border-color 0.12s, background 0.12s;
	}
	.ca-spine:hover {
		border-color: var(--border-mid);
		background: var(--bg-hover);
	}
	.ca-spine--active {
		border-left-color: var(--text-accent);
		background: color-mix(in srgb, var(--text-accent) 8%, var(--bg-card));
	}
	.ca-spine-name {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ca-spine-meta {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		color: var(--text-dimmer);
	}

	/* Stage */
	.ca-stage {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
		overflow: auto;
		padding: 10px 12px;
	}

	.ca-tabs {
		display: flex;
		gap: 4px;
		margin-bottom: 8px;
		border-bottom: 1px solid var(--border);
	}
	.ca-tab {
		all: unset;
		cursor: pointer;
		padding: 6px 14px;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
		border: 1px solid transparent;
		border-bottom: none;
		border-radius: 4px 4px 0 0;
		transition: color 0.12s, background 0.12s;
		margin-bottom: -1px;
	}
	.ca-tab:hover { color: var(--text); }
	.ca-tab--active {
		color: var(--text-accent);
		background: var(--bg-card);
		border-color: var(--border);
	}

	/* Card content */
	.ca-card {
		flex: 1;
		min-height: 200px;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 0 6px 6px 6px;
		padding: 14px;
		overflow: auto;
	}
	.ca-card-section {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.ca-card-name {
		font-family:    var(--font-display);
		font-size:      calc(1rem * var(--font-display-scale));
		font-weight:    var(--font-display-weight);
		letter-spacing: 0.06em;
		text-transform: var(--font-display-transform);
		color:          var(--text-accent);
		margin: 0;
	}
	.ca-card-bg {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text);
		margin: 0;
		white-space: pre-wrap;
	}
	.ca-card-bg--empty {
		color: var(--text-dimmer);
		font-style: italic;
	}

	.ca-stats {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 8px;
	}
	.ca-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 8px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
	}
	.ca-stat-label {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.ca-stat-val {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text);
	}

	.ca-vitals {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
	}
	.ca-vital {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
	}
	.ca-vital-label {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		color: var(--text-muted);
	}
	.ca-vital-val {
		font-family: var(--font-display);
		font-size: 1rem;
		color: var(--text);
	}
	.ca-vital-val strong { font-weight: 700; }
	.ca-vital-max { color: var(--text-dimmer); font-size: 0.8em; }

	.ca-track-row {
		display: flex;
		justify-content: space-between;
		padding: 6px 8px;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
	}
	.ca-track-val { color: var(--text); }

	.ca-vow-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.ca-vow {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 10px;
		padding: 8px 10px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		font-family: var(--font-ui);
		font-size: 0.78rem;
	}
	.ca-vow-name { color: var(--text); }
	.ca-vow-rank {
		color: var(--text-muted);
		text-transform: capitalize;
		font-size: 0.7rem;
	}
	.ca-vow-progress { color: var(--text-dimmer); font-size: 0.7rem; }
	.ca-empty-mini {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-dimmer);
		font-style: italic;
	}

	/* ── Asset tabs (tucked under the bottom of the character card) ──
	   Visual metaphor: each asset is a card peeking out from below the
	   character card's bottom edge. The tabs share the card's background
	   and have a soft top-shadow that suggests they're tucked behind. */
	.ca-asset-tabs {
		display: flex;
		gap: 4px;
		padding: 0 10px;
		flex-wrap: wrap;
		/* Pull up so the top edges sit *under* the character card's bottom edge. */
		margin-top: -6px;
		position: relative;
		z-index: 0;
	}
	.ca-asset-tabs-empty {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-dimmer);
		font-style: italic;
		padding: 6px 10px;
	}
	.ca-asset-tab {
		all: unset;
		cursor: pointer;
		padding: 9px 14px 6px;          /* top padding hidden by overlap; bottom is visible */
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-top: none;               /* top edge hidden behind the card */
		border-radius: 0 0 6px 6px;     /* round only the bottom corners */
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--text-muted);
		box-shadow: 0 2px 4px #0000001a;
		transition: transform 0.12s, color 0.12s, background 0.12s, border-color 0.12s;
	}
	.ca-asset-tab:hover {
		color: var(--text);
		background: var(--bg-hover);
		border-color: var(--border-mid);
		transform: translateY(2px);     /* "pulls out" a hair on hover */
	}
	.ca-asset-tab-name {
		white-space: nowrap;
		max-width: 130px;
		overflow: hidden;
		text-overflow: ellipsis;
		display: inline-block;
		vertical-align: middle;
	}

	/* ── Asset detail dialog ── */
	.ca-asset-dialog {
		border: none;
		padding: 0;
		border-radius: 8px;
		background: var(--bg-card);
		color: var(--text);
		width: min(640px, calc(100vw - 2rem));
		max-height: calc(100vh - 4rem);
		box-shadow: 0 16px 48px #00000070, 0 0 0 1px var(--border-mid);
		outline: none;
	}
	.ca-asset-dialog::backdrop {
		background: #00000060;
		backdrop-filter: blur(1px);
	}
	.ca-asset-dialog[open] {
		display: flex;
		flex-direction: column;
	}
	.ca-asset-dialog-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-control);
		border-radius: 8px 8px 0 0;
		flex-shrink: 0;
	}
	.ca-asset-dialog-title {
		flex: 1;
		font-family:    var(--font-display);
		font-size:      calc(0.82rem * var(--font-display-scale));
		font-weight:    var(--font-display-weight);
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color:          var(--text-accent);
	}
	.ca-asset-dialog-close {
		all: unset;
		cursor: pointer;
		color: var(--text-dimmer);
		padding: 2px 6px;
		font-size: 0.9rem;
		line-height: 1;
		border-radius: 3px;
		transition: color 0.12s, background 0.12s;
	}
	.ca-asset-dialog-close:hover {
		color: var(--text);
		background: var(--bg-hover);
	}
	.ca-asset-dialog-body {
		padding: 12px 14px;
		overflow: auto;
		flex: 1;
		min-height: 0;
	}
</style>
