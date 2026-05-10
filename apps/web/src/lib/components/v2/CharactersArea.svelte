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
	import AssetCard      from '$lib/components/AssetCard.svelte';
	import StatControl    from '$lib/components/StatControl.svelte';
	import ResourceTile   from '$lib/components/ResourceTile.svelte';
	import MomentumTile   from '$lib/components/MomentumTile.svelte';
	import iconHealth     from '$icons/icon-health.svg?raw';
	import iconSpirit     from '$icons/icon-spirit.svg?raw';
	import iconSupply     from '$icons/icon-supply.svg?raw';
	import iconStar       from '$icons/star-solid-full.svg?raw';

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

	// Ensure the active character's data has every CharacterData field, then expose
	// it as a typed live ref so <StatControl bind:value={d.edge}>, <ResourceTile
	// bind:value={d.health}>, etc., write through to the source object directly.
	// (The original hydrateCharacter() returns a copy via spread, which would
	// silently break two-way binding.)
	$effect(() => {
		if (activeChar) {
			activeChar.data = hydrateCharacter(activeChar.data) as unknown as Record<string, unknown>;
		}
	});
	const activeData = $derived<CharacterData | null>(
		activeChar ? (activeChar.data as unknown as CharacterData) : null,
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
								<!-- Stats — same StatControl tiles as v1, with the same color vars and stat-icon mapping. -->
								<div class="ca-stats-row">
									<StatControl
										label="Edge"   bind:value={d.edge}   color="var(--color-edge)"
										tooltip="Quickness, agility, and prowess in ranged combat"
									/>
									<StatControl
										label="Heart"  bind:value={d.heart}  color="var(--color-heart)"
										tooltip="Courage, willpower, empathy, sociability, and loyalty"
									/>
									<StatControl
										label="Iron"   bind:value={d.iron}   color="var(--color-iron)"
										tooltip="Physical strength, endurance, and prowess in close combat"
									/>
									<StatControl
										label="Shadow" bind:value={d.shadow} color="var(--color-shadow)"
										tooltip="Sneakiness, deceptiveness, and cunning"
									/>
									<StatControl
										label="Wits"   bind:value={d.wits}   color="var(--color-wits)"
										tooltip="Expertise, knowledge, and observation"
									/>
								</div>

								<!-- Vitals — Momentum + Health/Spirit/Supply + Experience. Spinners on every tile;
								     ResourceTile carries its own +/− buttons. XP lives here per the v2 layout
								     so it sits with the other tracked resources. -->
								<div class="ca-vitals-row">
									<MomentumTile
										bind:value={d.momentum}
										resetVal={2}
										maxVal={10}
										tooltipText="Your overall advantage or disadvantage on the quest. Build it up through good rolls and smart choices, then burn it at a crucial moment to force a better outcome."
									/>
									<ResourceTile
										label="Health"
										bind:value={d.health}
										color="var(--color-health)"
										max={5}
										icon={iconHealth}
										tooltip="Physical condition and readiness"
									/>
									<ResourceTile
										label="Spirit"
										bind:value={d.spirit}
										color="var(--color-spirit)"
										max={5}
										icon={iconSpirit}
										tooltip="Mental fortitude and morale"
									/>
									<ResourceTile
										label="Supply"
										bind:value={d.supply}
										color="var(--color-supply)"
										max={5}
										icon={iconSupply}
										tooltip="Available provisions and resources"
									/>
									<ResourceTile
										label="Experience"
										bind:value={d.xp}
										color="var(--color-xp)"
										max={30}
										icon={iconStar}
										tooltip="Accumulated experience that can be spent on assets and other enhancements."
									/>
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
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
		<dialog
			bind:this={dialogEl}
			class="ca-asset-dialog"
			oncancel={closeAssetDialog}
			onclose={() => { dialogAssetId = null; }}
			onclick={(e) => { if (e.target === dialogEl) closeAssetDialog(); }}
		>
			<!-- Dialog is a transparent shell — AssetCard renders with its own v1
			     header / body / footer styling so the popup looks identical to the
			     expanded card on the original /home page. Backdrop click + ESC dismiss. -->
			<AssetCard
				bind:asset={arr[idx]}
				definition={def}
				characterId={activeChar.id}
				characterName={activeChar.name}
				characterXp={activeData.xp ?? 0}
				bind:globalValues={activeChar.data.globalValues as Record<string, string>}
				onRemove={closeAssetDialog}
			/>
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

	.ca-stats-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.ca-stats-row > :global(*) { flex: 1; min-width: 80px; }

	.ca-vitals-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.ca-vitals-row > :global(*) { flex: 1; min-width: 130px; }

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

	/* ── Asset detail dialog ── transparent shell; the AssetCard inside owns
	   all visual structure (header, abilities, custom fields) so the popup
	   matches v1's expanded asset look exactly. */
	.ca-asset-dialog {
		border: none;
		padding: 0;
		background: transparent;
		color: var(--text);
		width: min(640px, calc(100vw - 2rem));
		max-height: calc(100vh - 4rem);
		overflow: visible;
		outline: none;
	}
	.ca-asset-dialog::backdrop {
		background: #00000060;
		backdrop-filter: blur(1px);
	}
</style>
